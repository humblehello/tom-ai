import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/app/lib/google";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── Claude classifier ─────────────────────────────────────────────────────────
async function classifyBounce(body: string): Promise<{
  category: "hard_bounce" | "soft_departure" | "ooo" | "unknown";
  reason: string;
}> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Classify this email bounce or auto-reply into exactly one category:

- hard_bounce: the email address is permanently invalid. Signals: "user unknown", "mailbox not found", "no such address", "address rejected", "recipient does not exist", "550 5.1.1", "550 5.1.10".
- soft_departure: the person has left the company or the inbox is unmonitored but valid. Signals: "no longer with the company", "has left", "out of the business", "this inbox is unmonitored", "forwarded to successor".
- ooo: temporary out-of-office, vacation, parental leave, traveling, on leave, or slow to respond. The person still works there and will return. Signals: "I am out of the office", "on vacation", "will return on", "limited access to email", "maternity/paternity leave".
- unknown: cannot be confidently classified.

Critical: err on the side of "ooo" or "unknown" when uncertain. Never classify as hard_bounce unless the message is clearly a permanent delivery failure.

Email content:
${body.slice(0, 1500)}

Return ONLY valid JSON: {"category": "hard_bounce|soft_departure|ooo|unknown", "reason": "one sentence explanation"}`,
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { category: "unknown", reason: "Could not classify" };
  }
}

// ── Extract the bounced email from Gmail message headers ─────────────────────
function extractBouncedEmail(headers: any[], userEmail: string | null): string | null {
  // Prefer X-Failed-Recipients — this is the authoritative header for bounces
  const xFailed = headers.find((h: any) => h.name === "X-Failed-Recipients")?.value;
  if (xFailed) {
    const match = xFailed.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (match) return match[0].toLowerCase();
  }

  // Fall back to Final-Recipient (RFC 3464 standard for DSN)
  const finalRecipient = headers.find((h: any) => h.name === "Final-Recipient")?.value;
  if (finalRecipient) {
    const match = finalRecipient.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (match) return match[0].toLowerCase();
  }

  // Last resort: parse from "To" header, but exclude the user's own address
  // and known daemon addresses
  const to = headers.find((h: any) => h.name === "To")?.value || "";
  const matches = to.match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
  for (const email of matches) {
    const lower = email.toLowerCase();
    if (lower === userEmail?.toLowerCase()) continue;
    if (lower.includes("daemon")) continue;
    if (lower.includes("postmaster")) continue;
    if (lower.includes("noreply") || lower.includes("no-reply")) continue;
    return lower;
  }

  return null;
}

// ── Extract original subject to correlate back to send logs ──────────────────
function extractOriginalSubject(bodyText: string): string | null {
  // DSN bounces typically include the original subject in the body
  const match = bodyText.match(/Subject:\s*(.+?)(?:\r?\n)/i);
  if (match) return match[1].trim().slice(0, 200);
  return null;
}

// ── Correlate a bounce back to a send log ────────────────────────────────────
async function correlateSource(
  userId: string,
  bouncedEmail: string,
  originalSubject: string | null
): Promise<{ source_type: string; source_id: string | null }> {
  // Check verification_sends first (most time-sensitive)
  try {
    const { data: verif } = await supabase
      .from("verification_sends")
      .select("id")
      .eq("user_id", userId)
      .eq("recipient_email", bouncedEmail)
      .gte("sent_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verif?.id) return { source_type: "verification", source_id: verif.id };
  } catch {}

  // Check campaign events
  try {
    const { data: campaign } = await supabase
      .from("campaign_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "sent")
      .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (campaign?.id) return { source_type: "campaign", source_id: campaign.id };
  } catch {}

  return { source_type: "unknown", source_id: null };
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // Allow Inngest to invoke with a user id in the header
  const userId =
    req.headers.get("x-inngest-user-id") || (await getUserId());
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const accessToken = await getValidAccessToken(userId);

    // Get the user's own email for "to" filtering
    const { data: user } = await supabase
      .from("tom_users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const userEmail = user?.email || null;

    // Broader Gmail query — catches more bounce sources (corporate daemons,
    // postmaster variants, common bounce subjects)
    const query = encodeURIComponent(
      'newer_than:7d (from:mailer-daemon OR from:postmaster OR subject:"Undeliverable" OR subject:"Delivery Status Notification" OR subject:"Mail Delivery Failed" OR subject:"returned mail" OR subject:"Delivery has failed")'
    );
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({
        processed: 0,
        hard_bounces: 0,
        departures: 0,
        ooo_skipped: 0,
        already_processed: 0,
      });
    }

    // Dedup against previously-processed messages
    const messageIds = messages.map((m: any) => m.id);
    const { data: existingEvents } = await supabase
      .from("email_bounce_events")
      .select("gmail_message_id")
      .in("gmail_message_id", messageIds);
    const alreadyProcessed = new Set((existingEvents || []).map((e: any) => e.gmail_message_id));

    let hardBounces = 0;
    let departures = 0;
    let oooSkipped = 0;
    let processed = 0;

    for (const msg of messages) {
      // Skip if already seen
      if (alreadyProcessed.has(msg.id)) continue;

      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];

        const bouncedEmail = extractBouncedEmail(headers, userEmail);
        if (!bouncedEmail) continue;

        const extractBody = (part: any): string => {
          if (!part) return "";
          if (part.mimeType === "text/plain" && part.body?.data) {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          }
          if (part.parts) return part.parts.map(extractBody).join("\n");
          return "";
        };
        const bodyText = extractBody(msgData.payload);
        const originalSubject = extractOriginalSubject(bodyText);

        // Classify
        const classification = await classifyBounce(bodyText);
        processed++;

        // Find the contact
        const { data: contacts } = await supabase
          .from("tom_contacts")
          .select("id, full_name, email, all_emails")
          .eq("user_id", userId)
          .or(`email.eq.${bouncedEmail},all_emails.cs.["${bouncedEmail}"]`)
          .limit(1);
        const contact = contacts?.[0];

        // Correlate to source
        const { source_type, source_id } = await correlateSource(
          userId,
          bouncedEmail,
          originalSubject
        );

        // Always log the event (even for OOO, even for contacts we don't have)
        await supabase.from("email_bounce_events").insert({
          user_id: userId,
          contact_id: contact?.id || null,
          bounced_email: bouncedEmail,
          category: classification.category,
          reason: classification.reason,
          gmail_message_id: msg.id,
          original_subject: originalSubject,
          source_type,
          source_id,
        });

        // OOO: log but take no further action
        if (classification.category === "ooo") {
          oooSkipped++;
          continue;
        }

        // No contact found: event is logged, nothing more to do
        if (!contact) continue;

        if (classification.category === "hard_bounce") {
          // Auto-remove the bad email, promote fallback if it was primary
          const allEmails = (contact.all_emails || []).filter(
            (e: string) => e.toLowerCase() !== bouncedEmail
          );
          const newPrimaryEmail =
            contact.email?.toLowerCase() === bouncedEmail
              ? allEmails[0] || null
              : contact.email;

          await supabase
            .from("tom_contacts")
            .update({
              email: newPrimaryEmail,
              all_emails: allEmails,
              email_status: "invalid",
              email_bounce_reason: classification.reason,
              email_bounced_at: new Date().toISOString(),
            })
            .eq("id", contact.id)
            .eq("user_id", userId);

          hardBounces++;
        } else if (classification.category === "soft_departure") {
          // Flag for review — don't remove the email, user may want to contact
          // a replacement at the same company
          await supabase
            .from("tom_contacts")
            .update({
              email_status: "departed",
              email_bounce_reason: classification.reason,
              email_bounced_at: new Date().toISOString(),
            })
            .eq("id", contact.id)
            .eq("user_id", userId);

          departures++;
        }
      } catch (e) {
        console.error("Error processing bounce message:", e);
        continue;
      }
    }

    return NextResponse.json({
      processed,
      hard_bounces: hardBounces,
      departures,
      ooo_skipped: oooSkipped,
      already_processed: alreadyProcessed.size,
    });
  } catch (e: any) {
    console.error("Bounce scan error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}