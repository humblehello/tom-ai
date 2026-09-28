import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { emailAssignmentDecision, normalizeEmail } from "../../../lib/contactFieldPolicy";
import { findContactsWithEmail } from "../../../lib/contactWrite";
import { applyGoogleToExisting, createFromGoogle, loadContactById, loadContactByResource } from "../../../lib/googleContactSync";
import { getValidAccessToken } from "../../../lib/google";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

async function approveOneGooglePending(userId: string, c: any): Promise<"approved" | "skipped"> {
  const owners = c.email ? await findContactsWithEmail(supabase, userId, c.email) : [];
  const decision = emailAssignmentDecision({
    incomingEmail: c.email,
    incomingName: c.full_name,
    incomingResource: c.google_resource_name,
    owners,
  });
  if (decision === "reject") return "skipped";

  let accessToken = "";
  try {
    accessToken = await getValidAccessToken(userId);
  } catch {
    accessToken = "";
  }

  const incoming = {
    full_name: c.full_name,
    email: normalizeEmail(c.email),
    phone: c.phone,
    company: c.company,
    job_title: c.job_title,
    home_address: c.home_address,
    birthday: c.birthday,
  };
  const phonesArray = c.phone ? [{ number: c.phone, type: "cell", primary: true }] : [];

  if (decision === "same_person" && owners[0]) {
    const { data: linked } = await loadContactById(supabase, userId, owners[0].id);
    if (!linked) return "skipped";
    if (linked.google_resource_name && linked.google_resource_name !== c.google_resource_name) return "skipped";
    await applyGoogleToExisting(
      supabase, userId, accessToken, linked, c.google_resource_name, incoming,
      c.all_emails || [], c.all_phones || [], phonesArray, null
    );
    return "approved";
  }

  const { data: existing } = c.google_resource_name
    ? await loadContactByResource(supabase, userId, c.google_resource_name)
    : { data: null };
  if (existing) {
    await applyGoogleToExisting(
      supabase, userId, accessToken, existing, c.google_resource_name, incoming,
      c.all_emails || [], c.all_phones || [], phonesArray, null
    );
    return "approved";
  }

  const created = await createFromGoogle(supabase, userId, c.google_resource_name, {
    full_name: c.full_name,
    email: normalizeEmail(c.email),
    phone: c.phone,
    all_emails: c.all_emails,
    all_phones: c.all_phones,
    company: c.company,
    job_title: c.job_title,
    home_address: c.home_address,
    birthday: c.birthday,
    last_synced_at: new Date().toISOString(),
  });
  return created.contactId ? "approved" : "skipped";
}

// GET — fetch pending contacts + count
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: contacts, count } = await supabase
    .from("google_pending_contacts")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ contacts: contacts || [], count: count || 0 });
}

// POST — approve one, approve all, or dismiss one
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, id } = await req.json();

  if (action === "approve_all") {
    const { data: pending } = await supabase
      .from("google_pending_contacts")
      .select("*")
      .eq("user_id", userId);

    let approved = 0;
    let skipped = 0;
    for (const c of pending || []) {
      const result = await approveOneGooglePending(userId, c);
      if (result === "approved") {
        approved++;
        await supabase.from("google_pending_contacts").delete().eq("id", c.id).eq("user_id", userId);
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, approved, skipped });
  }

  if (action === "approve" && id) {
    const { data: c } = await supabase
      .from("google_pending_contacts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (c) {
      const result = await approveOneGooglePending(userId, c);
      if (result !== "approved") {
        return NextResponse.json({
          ok: false,
          error: "That email already belongs to a different person, so this contact was not imported.",
        }, { status: 409 });
      }
      await supabase.from("google_pending_contacts").delete().eq("id", id);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss" && id) {
    await supabase.from("google_pending_contacts").delete().eq("id", id).eq("user_id", userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE — dismiss all pending
export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("google_pending_contacts").delete().eq("user_id", userId);
  return NextResponse.json({ ok: true });
}