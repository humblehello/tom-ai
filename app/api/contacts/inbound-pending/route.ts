import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { findContactsByEmail, insertDecision } from "../../../lib/contact-dedupe";

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

  const { data, error, count } = await supabase
    .from("inbound_pending_contacts")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message, contacts: [], count: 0 }, { status: 200 });
  return NextResponse.json({ contacts: data || [], count: count || 0 });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const id = body.id as string | undefined;

  if (action === "dismiss" && id) {
    await supabase.from("inbound_pending_contacts").delete().eq("id", id).eq("user_id", userId);
    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss_reason" && body.reason) {
    await supabase
      .from("inbound_pending_contacts")
      .delete()
      .eq("user_id", userId)
      .eq("reason", body.reason);
    return NextResponse.json({ ok: true });
  }

  if (action === "approve" && id) {
    const { data: row } = await supabase
      .from("inbound_pending_contacts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = await findContactsByEmail(supabase, userId, row.email);
    if (insertDecision(existing) === "skip") {
      await supabase.from("inbound_pending_contacts").delete().eq("id", id).eq("user_id", userId);
      return NextResponse.json({ ok: true, already_saved: true });
    }

    const { error } = await supabase.from("tom_contacts").insert({
      user_id: userId,
      full_name: row.full_name,
      email: row.email,
      last_synced_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("inbound_pending_contacts").delete().eq("id", id).eq("user_id", userId);
    return NextResponse.json({ ok: true, created: true, google_created: false });
  }

  return NextResponse.json({ error: "Use action approve or dismiss" }, { status: 400 });
}
