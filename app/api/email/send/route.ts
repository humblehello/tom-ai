import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../../lib/google";

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

  const { contact_id, contact_email, contact_name, subject, body } = await req.json();

  if (!contact_email || !subject || !body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(userId);

    const { data: user } = await supabase
      .from("tom_users")
      .select("name, email")
      .eq("id", userId)
      .single();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Fetch Gmail signature
    let signature = "";
    try {
      const sigRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(user.email)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const sigData = await sigRes.json();
      if (sigData.signature) {
        signature = sigData.signature; // Keep as HTML
      }
    } catch {
      // Signature fetch failed — send without it
    }

    // Build RFC 2822 email
    // Convert plain text body to HTML paragraphs
  const htmlBody = body
      .split("\n")
      .map((line: string) => line.trim() ? `<p style="margin:0 0 8px 0;">${line}</p>` : "<br>")
      .join("\n");

    const htmlEmail = signature
      ? `${htmlBody}<br><br>-- <br>${signature}`
      : htmlBody;

    const boundary = "boundary_" + Date.now();
    const emailLines = [
      `To: ${contact_name ? `${contact_name} <${contact_email}>` : contact_email}`,
      `From: ${user.name} <${user.email}>`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      `<!DOCTYPE html><html><body style="font-family: sans-serif; font-size: 14px; color: #333;">${htmlEmail}</body></html>`,
      ``,
      `--${boundary}--`,
    ].join("\r\n");

    const encoded = Buffer.from(emailLines).toString("base64url");

    const gmailRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!gmailRes.ok) {
      const err = await gmailRes.json();
      console.error("Gmail send error:", err);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    // Update last_reached_out_at on contact
    if (contact_id) {
     await supabase
        .from("tom_contacts")
        .update({
          last_reached_out_at: new Date().toISOString(),
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