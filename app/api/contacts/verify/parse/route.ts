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

  // Extract email body — defined at function scope so the bounce handler
  // and the regular reply handler can both use it.
  const extractBody = (part: any): string => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    if (part.parts) return part.parts.map(extractBody).join("\n");
    return "";
  };

  // Get pending verifications sent in last 30 days

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

// Search Gmail for any recent inbox messages — we'll match by sender against
// pendingVerifications below, so no need to filter by subject (which would
// miss 11 of the 12 rotating subject variants).
const gmailRes = await fetch(
  `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:inbox newer_than:30d`,
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

    // ── BOUNCE DETECTION ─────────────────────────────────────────────────────
    // Bounce DSNs come from mailer-daemon@*, postmaster@*, or have specific subjects.
    // RFC 3464 requires the bounced recipient in the body as "Final-Recipient: rfc822;<email>"
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
    const isBounceSender = /mailer-daemon|postmaster|^bounce/i.test(senderEmail) ||
                           /mailer-daemon|postmaster/i.test(from.toLowerCase());
    const isBounceSubject = /delivery (status|failure|notification)|undeliverable|returned mail|failure notice|mail delivery failed/i.test(subject);

    if (isBounceSender || isBounceSubject) {
      // Pull the body to extract the bounced recipient + bounce class
      const bounceBody = extractBody(data.payload);

      // Try to find the original recipient via RFC 3464 "Final-Recipient" header
      const finalRecipMatch = bounceBody.match(/Final-Recipient:\s*(?:rfc822|smtp);\s*([^\s\r\n;,]+)/i);
      // Fallback: look for the original recipient in common bounce body patterns
      const fallbackRecipMatch = bounceBody.match(/(?:to|recipient|address):\s*<?([\w.-]+@[\w.-]+\.[a-z]{2,})>?/i);
      const bouncedEmailRaw = (finalRecipMatch?.[1] || fallbackRecipMatch?.[1] || "").trim().toLowerCase();
      const bouncedEmail = bouncedEmailRaw.replace(/^<|>$/g, "");

      if (!bouncedEmail) continue; // Couldn't parse the bounce — skip it

      // Detect hard vs soft bounce. Hard bounces have status code 5.x.x or 550.
      // Soft bounces have 4.x.x or 450.
      const isHardBounce = /\b5\.\d+\.\d+\b|\b550\b|mailbox (does not exist|unavailable)|user unknown|no such (user|mailbox)|address rejected|invalid recipient/i.test(bounceBody);
      const isSoftBounce = !isHardBounce && /\b4\.\d+\.\d+\b|\b4\d{2}\b|temporarily|try again|mailbox full|over quota|deferred/i.test(bounceBody);

      // Find the contact this bounce is about
      const bouncedVerification = pendingVerifications.find(
        v => v.contact_email?.toLowerCase() === bouncedEmail
      );
      if (!bouncedVerification) continue;

      const contact = bouncedVerification.tom_contacts;
      if (!contact) continue;

      const currentAttempts = contact.verification_attempts || 0;
      const SOFT_BOUNCE_THRESHOLD = 3;

      const shouldClear = isHardBounce || (isSoftBounce && currentAttempts >= SOFT_BOUNCE_THRESHOLD);

      if (shouldClear) {
        // Apply rule: demote from all_emails only if it's the only email.
        // If alternates exist, promote next valid one to primary.
        const allEmails: string[] = Array.isArray(contact.all_emails) ? contact.all_emails : [];
        const remainingEmails = allEmails.filter(e => e?.toLowerCase() !== bouncedEmail);

        const contactUpdates: Record<string, any> = {
          email_bounced_at: new Date().toISOString(),
          email_bounce_reason: isHardBounce ? "hard_bounce" : "soft_bounce_max_retries",
          email_status: "invalid",
        };

        if (remainingEmails.length > 0) {
          // Alternates exist — promote next one to primary, drop the bounced one
          contactUpdates.email = remainingEmails[0];
          contactUpdates.all_emails = remainingEmails;
          contactUpdates.email_status = "active"; // Reset status since we have a working email
          contactUpdates.email_bounced_at = null; // Reset bounce on new primary
          contactUpdates.email_bounce_reason = null;
        } else {
          // No alternates — clear the email field, keep the contact
          contactUpdates.email = null;
          contactUpdates.all_emails = [];
        }

        await supabase
          .from("tom_contacts")
          .update(contactUpdates)
          .eq("id", contact.id);

        // Mark the verification as bounced
        await supabase
          .from("tom_verifications")
          .update({
            status: "bounced",
            responded_at: new Date().toISOString(),
            response_type: isHardBounce ? "hard_bounce" : "soft_bounce_final",
          })
          .eq("id", bouncedVerification.id);

        console.log(`[bounce] cleared email for ${contact.full_name} (${bouncedEmail}) — ${isHardBounce ? "hard" : "soft after retries"}`);
      } else if (isSoftBounce) {
        // Soft bounce, but we haven't hit max retries yet — just log it
        await supabase
          .from("tom_contacts")
          .update({
            verification_attempts: currentAttempts, // No change to attempts (next attempt will increment)
            email_bounce_reason: `soft_bounce_attempt_${currentAttempts}`,
          })
          .eq("id", contact.id);

        console.log(`[bounce] soft bounce for ${contact.full_name} (attempt ${currentAttempts}/${SOFT_BOUNCE_THRESHOLD}) — will retry`);
      }

      processed++;
      continue; // Don't try to process this as a normal reply
    }
    // ── END BOUNCE DETECTION ─────────────────────────────────────────────────

    // Find matching pending verification (existing reply-handling logic)
    const verification = pendingVerifications.find(
      v => v.contact_email?.toLowerCase() === senderEmail
    );
    if (!verification) continue;

    // Extract email body
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