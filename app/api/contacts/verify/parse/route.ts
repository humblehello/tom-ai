import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { updateGoogleContact, deleteGoogleContact } from "../../../../lib/googleContacts";

const OPT_OUT_PHRASES = [
  "remove me", "don't know you", "do not know you", "i don't know you",
  "delete me", "unsubscribe", "who are you", "wrong person",
  "remove my info", "delete my info", "stop emailing", "leave me alone",
  "not interested", "please remove",
];

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value || cookieStore.get("tom_user_id")?.value;
  const body = await req.json().catch(() => ({}));
  const effectiveUserId = userId || body.userId;

  if (!effectiveUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("tom_users")
    .select("access_token")
    .eq("id", effectiveUserId)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Get pending verifications sent in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: pendingVerifications } = await supabase
    .from("tom_verifications")
    .select("*, tom_contacts(*)")
    .eq("user_id", effectiveUserId)
    .eq("status", "sent")
    .gte("sent_at", thirtyDaysAgo.toISOString());

  if (!pendingVerifications?.length) {
    return NextResponse.json({ success: true, parsed: 0 });
  }

  // Search Gmail for replies to verification emails
  const gmailRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=subject:"is your contact info up to date" in:inbox`,
    { headers: { Authorization: `Bearer ${user.access_token}` } }
  );
  const gmailData = await gmailRes.json();
  const messages = gmailData.messages || [];

  if (messages.length === 0) {
    return NextResponse.json({ success: true, parsed: 0 });
  }

  let processed = 0;
  let optedOut = 0;
  let updated = 0;

  for (const msg of messages.slice(0, 20)) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${user.access_token}` } }
    );
    const data = await res.json();
    const headers = data.payload?.headers || [];
    const from = headers.find((h: any) => h.name === "From")?.value || "";

    // Extract sender email
    const emailMatch = from.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
    if (!emailMatch) continue;
    const senderEmail = emailMatch[0].toLowerCase();

    // Find matching pending verification
    const verification = pendingVerifications.find(
      v => v.contact_email?.toLowerCase() === senderEmail
    );
    if (!verification) continue;

    // Extract email body
    const extractBody = (part: any): string => {
      if (!part) return "";
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.parts) return part.parts.map(extractBody).join("\n");
      return "";
    };

    const bodyText = extractBody(data.payload).toLowerCase();

    // Check for opt-out
    const isOptOut = OPT_OUT_PHRASES.some(phrase => bodyText.includes(phrase));

    if (isOptOut) {
      const contact = verification.tom_contacts;

      // Delete from Google Contacts
      if (contact.google_contact_id && !contact.google_contact_id.startsWith("email_scrape_")) {
        await deleteGoogleContact(user.access_token, contact.google_contact_id);
      }

      // Delete from Supabase
      await supabase.from("tom_contacts").delete().eq("id", contact.id);

      // Update verification status
      await supabase
        .from("tom_verifications")
        .update({
          status: "opted_out",
          responded_at: new Date().toISOString(),
          response_type: "opt_out_email",
        })
        .eq("id", verification.id);

      optedOut++;
    } else {
      // Use Claude to extract updated info from the reply
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `Extract updated contact information from this email reply. Return ONLY a JSON object with any fields mentioned. Fields: home_address (with streetAddress, city, state, zip), work_address, phone, birthday, title, company. Only include fields explicitly mentioned. Return {} if nothing clear.

Email: ${bodyText.slice(0, 1000)}`,
          }],
        }),
      });

      const claudeData = await claudeRes.json();
      const rawText = claudeData.content?.[0]?.text || "{}";

      let extractedUpdates: any = {};
      try {
        extractedUpdates = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        extractedUpdates = {};
      }

      if (Object.keys(extractedUpdates).length > 0) {
        const contact = verification.tom_contacts;
        const contactUpdates: Record<string, any> = {
          verified_at: new Date().toISOString(),
          verification_status: "verified",
        };

        if (extractedUpdates.home_address?.streetAddress) contactUpdates.home_address = extractedUpdates.home_address;
        if (extractedUpdates.work_address?.streetAddress) contactUpdates.work_address = extractedUpdates.work_address;
        if (extractedUpdates.phone) contactUpdates.phone = extractedUpdates.phone;
        if (extractedUpdates.birthday) contactUpdates.birthday = extractedUpdates.birthday;
        if (extractedUpdates.title) contactUpdates.title = extractedUpdates.title;
        if (extractedUpdates.company) contactUpdates.company = extractedUpdates.company;

        // Update Supabase
        await supabase.from("tom_contacts").update(contactUpdates).eq("id", contact.id);

        // Update Google Contacts
        if (contact.google_contact_id && !contact.google_contact_id.startsWith("email_scrape_")) {
          await updateGoogleContact(user.access_token, contact.google_contact_id, {
            phone: extractedUpdates.phone,
            address: extractedUpdates.home_address,
          });
        }

        // Mark verification complete
        await supabase
          .from("tom_verifications")
          .update({
            status: "completed",
            responded_at: new Date().toISOString(),
            response_type: "email_reply",
            updated_fields: extractedUpdates,
          })
          .eq("id", verification.id);

        updated++;
      }
    }

    processed++;
  }

  return NextResponse.json({ success: true, parsed: processed, opted_out: optedOut, updated });
}