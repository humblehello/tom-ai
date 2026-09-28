import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { emailAssignmentDecision, fillBlankFields, normalizeEmail } from "../../../lib/contactFieldPolicy";
import { emailTakenBySomeoneElse, findContactsWithEmail, insertContact, selectContacts, updateContact } from "../../../lib/contactWrite";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

const MICROSOFT_FIELDS = ["full_name", "first_name", "last_name", "email", "phone", "company", "job_title", "birthday", "notes"] as const;

async function approveOneMicrosoftPending(userId: string, c: any): Promise<"approved" | "skipped"> {
  const { data: existing } = await selectContacts(
    supabase,
    "id, full_name, email, phone, company, job_title, birthday, notes, microsoft_contact_id",
    (query) => query.eq("user_id", userId).eq("microsoft_contact_id", c.microsoft_contact_id).maybeSingle()
  );

  const incoming = {
    full_name: c.full_name,
    first_name: c.first_name,
    last_name: c.last_name,
    email: normalizeEmail(c.email),
    phone: c.phone,
    company: c.company,
    job_title: c.job_title,
    birthday: c.birthday,
    notes: c.notes,
  };

  if (existing) {
    const patch = fillBlankFields(existing, incoming, MICROSOFT_FIELDS, "microsoft");
    if (patch.email) {
      const decision = await emailTakenBySomeoneElse(supabase, userId, patch.email, existing.id, existing.full_name);
      if (decision === "reject") delete patch.email;
    }
    patch.microsoft_etag = c.microsoft_etag;
    patch.microsoft_last_synced_at = new Date().toISOString();
    await updateContact(supabase, existing.id, userId, patch);
    return "approved";
  }

  const owners = c.email ? await findContactsWithEmail(supabase, userId, c.email) : [];
  const decision = emailAssignmentDecision({
    incomingEmail: c.email,
    incomingName: c.full_name,
    owners,
  });
  if (decision === "reject") return "skipped";

  if (decision === "same_person" && owners[0]) {
    const { data: linked } = await selectContacts(
      supabase,
      "id, full_name, email, phone, company, job_title, birthday, notes",
      (query) => query.eq("user_id", userId).eq("id", owners[0].id).maybeSingle()
    );
    if (!linked) return "skipped";
    const patch = fillBlankFields(linked, incoming, MICROSOFT_FIELDS, "microsoft");
    patch.microsoft_contact_id = c.microsoft_contact_id;
    patch.microsoft_etag = c.microsoft_etag;
    patch.microsoft_last_synced_at = new Date().toISOString();
    await updateContact(supabase, linked.id, userId, patch);
    return "approved";
  }

  const row = {
    user_id: userId,
    ...incoming,
    all_emails: c.all_emails,
    microsoft_contact_id: c.microsoft_contact_id,
    microsoft_etag: c.microsoft_etag,
    microsoft_last_synced_at: new Date().toISOString(),
    field_provenance: fillBlankFields(null, incoming, MICROSOFT_FIELDS, "microsoft").field_provenance,
  };
  const { error } = await insertContact(supabase, row);
  return error ? "skipped" : "approved";
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: contacts, count } = await supabase
    .from("microsoft_pending_contacts")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ contacts: contacts || [], count: count || 0 });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, id } = await req.json();

  if (action === "approve_all") {
    const { data: pending } = await supabase
      .from("microsoft_pending_contacts")
      .select("*")
      .eq("user_id", userId);

    let approved = 0;
    let skipped = 0;
    for (const c of pending || []) {
      const result = await approveOneMicrosoftPending(userId, c);
      if (result === "approved") {
        approved++;
        await supabase.from("microsoft_pending_contacts").delete().eq("id", c.id).eq("user_id", userId);
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, approved, skipped });
  }

  if (action === "approve" && id) {
    const { data: c } = await supabase
      .from("microsoft_pending_contacts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (c) {
      const result = await approveOneMicrosoftPending(userId, c);
      if (result !== "approved") {
        return NextResponse.json({
          ok: false,
          error: "That email already belongs to a different person, so this contact was not imported.",
        }, { status: 409 });
      }
      await supabase.from("microsoft_pending_contacts").delete().eq("id", id);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss" && id) {
    await supabase.from("microsoft_pending_contacts").delete().eq("id", id).eq("user_id", userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("microsoft_pending_contacts").delete().eq("user_id", userId);
  return NextResponse.json({ ok: true });
}