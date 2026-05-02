import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { sendUserEmail } from "../../../lib/email-provider";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contact_id, contact_email, contact_name, subject, body } = await req.json();
  if (!contact_email) return NextResponse.json({ error: "No email" }, { status: 400 });

  try {
    const recipient = contact_name
      ? `${contact_name} <${contact_email}>`
      : contact_email;

    await sendUserEmail({
      userId,
      to: recipient,
      subject,
      text: body,
    });

    // Update last_emailed_at
    if (contact_id) {
      const supabase = getSupabase();
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
  } catch (e: any) {
    console.error("Email send error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}