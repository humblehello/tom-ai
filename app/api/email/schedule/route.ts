import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contact_id, contact_email, contact_name, subject, body, scheduled_for } = await req.json();

  if (!contact_email || !subject || !body || !scheduled_for) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tom_scheduled_emails")
    .insert({
      user_id: userId,
      contact_id: contact_id || null,
      contact_name: contact_name || null,
      contact_email,
      subject,
      body,
      scheduled_for,
      status: "scheduled",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, scheduled_email: data });
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("tom_scheduled_emails")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .order("scheduled_for", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ scheduled_emails: data });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await supabase
    .from("tom_scheduled_emails")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", userId);

  return NextResponse.json({ success: true });
}