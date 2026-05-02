import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendUserEmail } from "@/app/lib/email-provider";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

  // Look up the user by email so we know whose mailbox to send through
  const supabase = getSupabase();
  const { data: userData } = await supabase
    .from("tom_users")
    .select("id")
    .eq("email", user_email)
    .single();

  if (!userData) return NextResponse.json({ ok: true });

  try {
    await sendUserEmail({
      userId: userData.id,
      to: user_email,
      subject: `Card approval needed — ${contact_name}'s ${occasion}`,
      text: emailBody,
    });
  } catch (e: any) {
    console.error("Card notify send error:", e);
    // Non-fatal — return ok so the upstream caller doesn't retry
  }

  return NextResponse.json({ ok: true });
}