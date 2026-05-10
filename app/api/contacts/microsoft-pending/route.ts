import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
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

    for (const c of pending || []) {
      await supabase.from("tom_contacts").upsert({
        user_id: userId,
        full_name: c.full_name,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        all_emails: c.all_emails,
        phone: c.phone,
        company: c.company,
        job_title: c.job_title,
        birthday: c.birthday,
        notes: c.notes,
        microsoft_contact_id: c.microsoft_contact_id,
        microsoft_etag: c.microsoft_etag,
        microsoft_last_synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,microsoft_contact_id" });
    }

    await supabase.from("microsoft_pending_contacts").delete().eq("user_id", userId);
    return NextResponse.json({ ok: true, approved: pending?.length || 0 });
  }

  if (action === "approve" && id) {
    const { data: c } = await supabase
      .from("microsoft_pending_contacts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (c) {
      await supabase.from("tom_contacts").upsert({
        user_id: userId,
        full_name: c.full_name,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        all_emails: c.all_emails,
        phone: c.phone,
        company: c.company,
        job_title: c.job_title,
        birthday: c.birthday,
        notes: c.notes,
        microsoft_contact_id: c.microsoft_contact_id,
        microsoft_etag: c.microsoft_etag,
        microsoft_last_synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,microsoft_contact_id" });

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