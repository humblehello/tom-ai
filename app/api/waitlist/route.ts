import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getHumbleHelloAccessToken } from "@/app/lib/google";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAIL = "tom@humblehello.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email?.trim().toLowerCase();
    const firstName = body.first_name?.trim() || null;
    const useCase = body.use_case?.trim() || null;

    if (!email || !email.includes("@") || email.length > 255) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const { error } = await supabase.from("waitlist").insert({
      email,
      first_name: firstName,
      use_case: useCase,
      source: "homepage",
      status: "pending",
    });

    // Duplicate email — treat as success
    if (error && error.code === "23505") {
      return NextResponse.json({ success: true });
    }

    if (error) {
      console.error("[waitlist] insert error:", error);
      return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
    }

    // Notify admin — fire-and-forget, don't block response
    notifyAdmin(email, firstName, useCase).catch(err => {
      console.error("[waitlist] notify failed:", err);
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[waitlist] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function notifyAdmin(email: string, firstName: string | null, useCase: string | null) {
  console.log("[waitlist] getting access token...");
  const accessToken = await getHumbleHelloAccessToken();
  console.log("[waitlist] got access token, length:", accessToken?.length);

  const subject = `New waitlist signup: ${firstName || email}`;
  const body = `Someone joined the Humble Hello waitlist:

Email: ${email}
Name: ${firstName || "(not provided)"}
Use case: ${useCase || "(not provided)"}

To approve:
1. Add this email to Google Cloud Console → APIs & Services → OAuth consent screen → Test Users
2. Reply to them at ${email}: "You're in. Sign up at humblehello.com"

Or mark approved in Supabase:
UPDATE waitlist SET status = 'approved', approved_at = now() WHERE email = '${email}';
`;

  const raw = [
    `To: Tom <${ADMIN_EMAIL}>`,
    `From: Humble Hello <tom@humblehello.com>`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join("\r\n");

 const sendGmail = async () => {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail send returned ${res.status}: ${errText}`);
    }
  };

  // Retry once on transient network errors (ECONNRESET, etc.)
  try {
    await sendGmail();
  } catch (err: any) {
    console.warn("[waitlist] gmail send attempt 1 failed, retrying:", err.message);
    await new Promise(r => setTimeout(r, 500));
    await sendGmail();
  }

  console.log("[waitlist] notify sent to admin for:", email);
}