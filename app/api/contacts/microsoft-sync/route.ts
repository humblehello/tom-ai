import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { syncMicrosoftContacts, flattenGraphContact, deleteMicrosoftContact } from "../../../lib/microsoft/contacts";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// GET — pull from Outlook into the pending staging table
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: user } = await supabase
      .from("tom_users")
      .select("microsoft_contacts_delta_link")
      .eq("id", userId)
      .single();

    const { upserted, deleted, newDeltaLink } = await syncMicrosoftContacts(
      userId,
      user?.microsoft_contacts_delta_link ?? null
    );

    // Stage new/changed contacts in pending table for user approval
    if (upserted.length > 0) {
      const rows = upserted.map((c: any) => ({
        user_id: userId,
        ...flattenGraphContact(c),
      }));

      await supabase
        .from("microsoft_pending_contacts")
        .upsert(rows, { onConflict: "user_id,microsoft_contact_id" });
    }

    // Hard-deleted contacts in Outlook → also remove from HH
    if (deleted.length > 0) {
      await supabase
        .from("tom_contacts")
        .delete()
        .eq("user_id", userId)
        .in("microsoft_contact_id", deleted);

      await supabase
        .from("microsoft_pending_contacts")
        .delete()
        .eq("user_id", userId)
        .in("microsoft_contact_id", deleted);
    }

    if (newDeltaLink) {
      await supabase
        .from("tom_users")
        .update({
          microsoft_contacts_delta_link: newDeltaLink,
          microsoft_contacts_last_synced_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    return NextResponse.json({
      ok: true,
      synced: upserted.length,
      deleted: deleted.length,
    });
  } catch (e: any) {
    console.error("Microsoft sync error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — delete a single contact from both HH and Outlook
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  try {
    const { data: contact } = await supabase
      .from("tom_contacts")
      .select("microsoft_contact_id")
      .eq("id", contactId)
      .eq("user_id", userId)
      .single();

    if (contact?.microsoft_contact_id) {
      try {
        await deleteMicrosoftContact(userId, contact.microsoft_contact_id);
      } catch (e) {
        console.error("Outlook delete failed:", e);
      }
    }

    await supabase.from("tom_contacts").delete().eq("id", contactId).eq("user_id", userId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}