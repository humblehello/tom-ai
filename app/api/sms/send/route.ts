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

  const { to, body, contact_id } = await req.json();
  if (!to || !body) return NextResponse.json({ error: "Missing to or body" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_API_KEY}:${process.env.TWILIO_API_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          To: to,
          MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
          Body: body,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("Twilio error:", data);
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    // Update last_emailed_at on the contact
    if (contact_id) {
      await supabase
        .from("tom_contacts")
        .update({ last_emailed_at: new Date().toISOString() })
        .eq("id", contact_id)
        .eq("user_id", userId);
    }

    return NextResponse.json({ success: true, sid: data.sid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}