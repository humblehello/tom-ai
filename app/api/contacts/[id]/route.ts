import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { deleteGoogleContact, updateGoogleContact } from "../../../lib/googleContacts";
import { getValidAccessToken } from "../../../lib/google";
import { logSyncEvent, summarizeFieldsForAudit } from "../../../lib/syncAudit";
import { markFieldsSynced } from "../../../lib/contactFieldPolicy";
import { selectContacts, updateContact, withHumanStamp } from "../../../lib/contactWrite";

type RouteParams = { params: Promise<{ id: string }> };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: contact }, { data: user }] = await Promise.all([
    supabase.from("tom_contacts").select("*").eq("id", id).eq("user_id", userId).single(),
    supabase.from("tom_users").select("access_token").eq("id", userId).single(),
  ]);

  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  if (contact?.google_contact_id && !contact.google_contact_id.startsWith("email_scrape_") && user?.access_token) {
    let deleteSuccess = false;
    let deleteError: string | null = null;
    try {
      deleteSuccess = await deleteGoogleContact(user.access_token, contact.google_contact_id);
      if (!deleteSuccess) deleteError = "deleteGoogleContact returned false";
    } catch (e: any) {
      deleteError = e?.message || String(e);
    }

    await logSyncEvent({
      user_id: userId,
      contact_id: contact.id,
      contact_name: contact.full_name,
      contact_email: contact.email,
      google_resource_name: contact.google_contact_id,
      operation: "delete",
      fields_changed: null,
      success: deleteSuccess,
      error_message: deleteError,
    });
  }

  const { error } = await supabase
    .from("tom_contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clean up life events for deleted contact
  await supabase
    .from("life_events")
    .delete()
    .eq("contact_id", id)
    .eq("user_id", userId);

  // Record deletion for blocklist guard
  if (contact.email) {
    const { recordContactDeletion } = await import("../../../lib/contactGuard");
    await recordContactDeletion(userId, contact.email, contact.full_name);
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Strip fields that should never be client-writable
  const {
    id: _id,
    user_id: _uid,
    created_at: _ca,
    google_resource_name: _grn,
    field_provenance: _prov,
    ...updates
  } = body;

  const { data: existingRow } = await selectContacts(supabase, "field_provenance", (query) =>
    query.eq("id", id).eq("user_id", userId).maybeSingle()
  );

  // Stamp the edit as human so a later Google pull cannot silently undo it.
  const stamped = withHumanStamp(existingRow?.field_provenance, updates);
  stamped.tom_ai_updated_at = new Date().toISOString();

  // Save to Supabase first
  const { data, error } = await updateContact(supabase, id, userId, stamped, { returning: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Sync back to Google Contacts (with audit logging) ─────────────────────
  try {
    const contact = data;
    const googleResourceName = contact?.google_resource_name;

    if (
      googleResourceName &&
      !googleResourceName.startsWith("email_scrape_") &&
      !googleResourceName.startsWith("manual_")
    ) {
      const accessToken = await getValidAccessToken(userId);

      const googleUpdates: Record<string, any> = {};

      if (updates.full_name !== undefined) googleUpdates.full_name = updates.full_name;
      if (updates.phone !== undefined) googleUpdates.phone = updates.phone;
      if (updates.email !== undefined) googleUpdates.email = updates.email;
      if (updates.company !== undefined) googleUpdates.company = updates.company;
      if (updates.job_title !== undefined) googleUpdates.job_title = updates.job_title;
      if (updates.birthday !== undefined) googleUpdates.birthday = updates.birthday;
      if (updates.notes !== undefined) googleUpdates.notes = updates.notes;
      if (updates.key_context !== undefined) googleUpdates.key_context = updates.key_context;
      if (updates.home_address !== undefined) googleUpdates.address = updates.home_address;
      if (updates.work_address !== undefined) googleUpdates.work_address = updates.work_address;

      if (Object.keys(googleUpdates).length > 0) {
        let syncSuccess = false;
        let syncError: string | null = null;

        try {
          const result = await updateGoogleContact(accessToken, googleResourceName, googleUpdates);
          syncSuccess = result.success;
          if (!result.success) syncError = result.error || "unknown failure";
        } catch (e: any) {
          syncError = e?.message || String(e);
        }

        await logSyncEvent({
          user_id: userId,
          contact_id: contact.id,
          contact_name: contact.full_name,
          contact_email: contact.email,
          google_resource_name: googleResourceName,
          operation: "update",
          fields_changed: summarizeFieldsForAudit(googleUpdates),
          success: syncSuccess,
          error_message: syncError,
        });

        if (syncSuccess) {
          const syncedValues: Record<string, any> = {};
          if (googleUpdates.full_name !== undefined) syncedValues.full_name = googleUpdates.full_name;
          if (googleUpdates.email !== undefined) syncedValues.email = googleUpdates.email;
          if (googleUpdates.phone !== undefined) syncedValues.phone = googleUpdates.phone;
          if (googleUpdates.company !== undefined) syncedValues.company = googleUpdates.company;
          if (googleUpdates.job_title !== undefined) syncedValues.job_title = googleUpdates.job_title;
          if (googleUpdates.birthday !== undefined) syncedValues.birthday = googleUpdates.birthday;
          if (googleUpdates.notes !== undefined) syncedValues.notes = googleUpdates.notes;
          if (googleUpdates.key_context !== undefined) syncedValues.key_context = googleUpdates.key_context;
          if (googleUpdates.address !== undefined) syncedValues.home_address = googleUpdates.address;
          if (googleUpdates.work_address !== undefined) syncedValues.work_address = googleUpdates.work_address;
          await updateContact(supabase, contact.id, userId, {
            field_provenance: markFieldsSynced(contact.field_provenance, Object.keys(syncedValues), syncedValues),
          });
        }
      }
    }
  } catch (e: any) {
    console.error("Google sync error on PATCH:", e);
    await logSyncEvent({
      user_id: userId,
      contact_id: data?.id,
      contact_name: data?.full_name,
      contact_email: data?.email,
      google_resource_name: data?.google_resource_name,
      operation: "update",
      fields_changed: null,
      success: false,
      error_message: e?.message || String(e),
    });
  }

  return NextResponse.json({ contact: data });
}