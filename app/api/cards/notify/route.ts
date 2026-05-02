import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { user_email, user_name, contact_name, occasion, message, days_until } = await req.json();

  if (!user_email) return NextResponse.json({ ok: true });

  const firstName = user_name?.split(" ")[0] || "there";
  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  const emailBody = `Hi ${firstName},

Humble Hello has drafted a ${occasion} card for ${contact_name} — their birthday is in ${days_until} days.

Here's the draft message:
"${message}"

You have until ${days_until - 13} days before their birthday to approve or skip this card.

Review and approve here: ${approvalUrl}

— Humble Hello`;

  // Send via Gmail API using user's own token
  const { data: userData } = await supabase
    .from("tom_users")
    .select("id")
    .eq("email", user_email)
    .single();

  if (!userData) return NextResponse.json({ ok: true });

  const { getValidAccessToken } = await import("@/app/lib/google");
  const accessToken = await getValidAccessToken(userData.id);

  const raw = [
    `To: ${user_email}`,
    `Subject: Card approval needed — ${contact_name}'s ${occasion}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    emailBody,
  ].join("\r\n");

  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
  });

  return NextResponse.json({ ok: true });
}