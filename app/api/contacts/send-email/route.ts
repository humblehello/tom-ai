import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../../lib/google";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contact_id, contact_email, contact_name, subject, body } = await req.json();
  if (!contact_email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const { data: user } = await supabase
    .from("tom_users")
    .select("name, email")
    .eq("id", userId)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const accessToken = await getValidAccessToken(userId);

  const raw = [
    `To: ${contact_name ? `${contact_name} <${contact_email}>` : contact_email}`,
    `From: ${user.name} <${user.email}>`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join("\r\n");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Gmail send error:", err);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }

  // Update last_emailed_at
  if (contact_id) {
    await supabase
      .from("tom_contacts")
      .update({ 
        last_emailed_at: new Date().toISOString(),
        last_meaningful_touch_at: new Date().toISOString(),
      })
      .eq("id", contact_id)
      .eq("user_id", userId);
  }

  return NextResponse.json({ success: true });
}