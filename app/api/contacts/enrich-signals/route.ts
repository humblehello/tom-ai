import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../../lib/google";
import { createGoogleContact } from "../../../lib/googleContacts";
import { contactImportGuard } from "../../../lib/contactGuard";
import { isBlockedEmail } from "@/app/lib/contact-blocklist";
import { fillBlankFields } from "../../../lib/contactFieldPolicy";
import { emailTakenBySomeoneElse, insertContact, selectContacts, updateContact } from "../../../lib/contactWrite";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(req: NextRequest): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("tom_session")?.value;
  if (cookie) return cookie;
  const body = await req.json().catch(() => ({}));
  return body.user_id || null;
}

function decodeBase64(data: string): string {
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); }
  catch { return ""; }
}

function extractTextFromPayload(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) { for (const part of payload.parts) { const t = extractTextFromPayload(part); if (t) return t; } }
  return "";
}

// ── Parse signature from email body ─────────────────────────────────────────
function extractSignature(body: string): string {
  // Signatures typically appear after -- or blank line near end
  const lines = body.split("\n");
  const sigMarkers = ["--", "___", "Best,", "Best regards,", "Thanks,", "Sincerely,", "Cheers,", "Regards,", "Thanks!", "Thank you,", "Sent from"];
  let sigStart = -1;
  for (let i = Math.max(0, lines.length - 20); i < lines.length; i++) {
    const line = lines[i].trim();
    if (sigMarkers.some(m => line === m || line.startsWith(m))) { sigStart = i; break; }
  }
  if (sigStart === -1) sigStart = Math.max(0, lines.length - 8);
  return lines.slice(sigStart).join("\n").slice(0, 500);
}

function parseSignatureData(sig: string, existingContact: any): Partial<any> {
  const updates: any = {};

  // Phone: various formats
  const phoneMatch = sig.match(/(?:(?:Phone|Tel|Mobile|Cell|M|P|Ph)[:\s.]*)?(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i);
  if (phoneMatch && !existingContact.phone) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length === 10) updates.phone = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    else if (digits.length === 11 && digits[0] === "1") updates.phone = `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }

  // LinkedIn URL
  const linkedinMatch = sig.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch && !existingContact.linkedin_url) {
    updates.linkedin_url = `https://${linkedinMatch[0]}`;
  }

  // Twitter
  const twitterMatch = sig.match(/(?:twitter\.com|x\.com)\/[\w]+/i);
  if (twitterMatch && !existingContact.twitter_url) {
    updates.twitter_url = `https://${twitterMatch[0]}`;
  }

  // Job title — look for lines that look like titles (2-5 words, title case, no @ symbol)
  if (!existingContact.job_title) {
    const lines = sig.split("\n").map(l => l.trim()).filter(l => l.length > 2 && l.length < 60 && !l.includes("@") && !l.match(/\d{3}/));
    const titlePatterns = /(CEO|CTO|CFO|COO|VP|Director|Manager|President|Founder|Partner|Principal|Engineer|Developer|Designer|Consultant|Analyst|Executive|Officer|Head of|Lead)/i;
    const titleLine = lines.find(l => titlePatterns.test(l));
    if (titleLine) updates.job_title = titleLine.slice(0, 80);
  }

  // Company — line after title often
  if (!existingContact.company && updates.job_title) {
    const lines = sig.split("\n").map(l => l.trim()).filter(l => l.length > 2 && l.length < 60 && !l.includes("@"));
    const titleIdx = lines.findIndex(l => l === updates.job_title);
    if (titleIdx >= 0 && titleIdx < lines.length - 1) {
      const candidate = lines[titleIdx + 1];
      if (candidate && !candidate.match(/\d{3}/) && !candidate.match(/linkedin|twitter|http/i)) {
        updates.company = candidate.slice(0, 80);
      }
    }
  }

  return updates;
}

// ── Process signatures for N contacts ────────────────────────────────────────
async function processSignatures(userId: string, batchSize: number) {
  const accessToken = await getValidAccessToken(userId);
  const { data: userData } = await supabase.from("tom_users").select("email").eq("id", userId).single();
  const ownEmail = userData?.email?.toLowerCase() || "";

  // Pick contacts with emails, not yet signature-scanned, prioritize by email count
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: contacts } = await selectContacts(
    supabase,
    "id, email, phone, job_title, company, linkedin_url, twitter_url",
    (query) =>
      query
        .eq("user_id", userId)
        .not("email", "is", null)
        .or(`signature_scanned_at.is.null,signature_scanned_at.lt.${sevenDaysAgo}`)
        .order("email_count", { ascending: false })
        .limit(batchSize)
  );

  let updated = 0;
  for (const contact of contacts || []) {
    try {
      // Fetch last 3 emails from this contact
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", `from:${contact.email}`);
      url.searchParams.set("maxResults", "3");
      const listRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      const listData = await listRes.json();
// ── Create new contacts from recent incoming emails ───────────────────────

      if (!listData.messages?.length) {
        await supabase.from("tom_contacts").update({ signature_scanned_at: new Date().toISOString() }).eq("id", contact.id).eq("user_id", userId);
        continue;
      }

      let bestSig = "";
      for (const msg of listData.messages.slice(0, 3)) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const msgData = await msgRes.json();
        const body = extractTextFromPayload(msgData.payload);
        if (body) {
          const sig = extractSignature(body);
          if (sig.length > bestSig.length) bestSig = sig;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      const parsed = parseSignatureData(bestSig, contact);
      const filled = fillBlankFields(
        contact,
        parsed,
        ["phone", "linkedin_url", "twitter_url", "job_title", "company"],
        "scrape"
      );
      const updatePayload: any = { signature_scanned_at: new Date().toISOString(), ...filled };

      await updateContact(supabase, contact.id, userId, updatePayload);
      if (Object.keys(filled).some((key) => key !== "field_provenance")) updated++;

      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`Signature scan error for ${contact.id}:`, e);
    }
  }

  return { scanned: contacts?.length || 0, updated };
}
async function createContactsFromInbox(userId: string, accessToken: string) {
  const { data: userData } = await supabase
    .from("tom_users")
    .select("email")
    .eq("id", userId)
    .single();
  const ownEmail = userData?.email?.toLowerCase() || "";

  // Get last 50 emails received in last 30 days
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=after:${thirtyDaysAgo} -from:me -from:noreply -from:no-reply -from:notifications -from:newsletter`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  if (!listData.messages?.length) return { created: 0 };

  let created = 0;

  for (const msg of listData.messages.slice(0, 50)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const fromHeader = headers.find((h: any) => h.name === "From")?.value || "";

      // Parse "Name <email>" or just "email"
      const emailMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
      if (!emailMatch) continue;
      const email = emailMatch[1].toLowerCase().trim();
       if (!email || email.includes(ownEmail)) continue;
      // Local-part blocklist moved to app/lib/contact-blocklist.ts (substring match)
      if (isBlockedEmail(email)) continue;

      // Domain-level blocklists kept inline (these are sending-infrastructure domains, not local-part keywords)
      const JUNK_DOMAIN_PREFIXES = ["mail.","email.","send.","msg.","ifly.","em.","t.","notify.","notification.","engagement.","welcome.","e-exclusive.","card.","business.","reply."];
      const JUNK_SENDING_DOMAINS = ["substack.com","mailchimp.com","sendgrid.net","constantcontact.com","amazonses.com","shadow.outlook.com","mindbodyonline.com","pacers-mail.com","fyxer.com"];
      const domain = email.split("@")[1] || "";
      if (JUNK_SENDING_DOMAINS.some(j => domain === j)) continue;
      if (JUNK_DOMAIN_PREFIXES.some(j => domain.startsWith(j))) continue;

      const nameMatch = fromHeader.match(/^"?([^"<]+)"?\s*</);
      const fullName = nameMatch ? nameMatch[1].trim() : email.split("@")[0];

      // One email, one person. A failed maybeSingle (already duplicated) must not create another.
      const emailDecision = await emailTakenBySomeoneElse(supabase, userId, email, null, fullName);
      if (emailDecision !== "allow") continue;

      // Run blocklist + deleted guard
      const guard = await contactImportGuard(userId, email, fullName, "inbox_scan", { from: fromHeader });
      if (guard !== "allow") continue;

      // Get email body to extract signature
      const fullMsgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const fullMsg = await fullMsgRes.json();
      const body = extractTextFromPayload(fullMsg.payload);
      const sig = extractSignature(body);
      const sigData = parseSignatureData(sig, {});

      // Create the contact
      const scrapedRow = {
        full_name: sigData.full_name || fullName,
        email: email,
        phone: sigData.phone || null,
        job_title: sigData.job_title || null,
        company: sigData.company || null,
        linkedin_url: sigData.linkedin_url || null,
      };
      const { data: newContact } = await insertContact(
        supabase,
        {
          user_id: userId,
          ...scrapedRow,
          signature_scanned_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
          field_provenance: fillBlankFields(
            null,
            scrapedRow,
            ["full_name", "email", "phone", "job_title", "company", "linkedin_url"],
            "scrape"
          ).field_provenance,
        },
        { returning: true }
      );

      if (newContact) {
        // Also create in Google Contacts
        try {
          const gToken = accessToken;
          const resourceName = await createGoogleContact(gToken, {
            full_name: newContact.full_name,
            email: newContact.email,
            phone: newContact.phone,
            company: newContact.company,
            job_title: newContact.job_title,
          });
          if (resourceName) {
            await supabase
              .from("tom_contacts")
              .update({ google_resource_name: resourceName })
              .eq("id", newContact.id);
          }
        } catch {}
        created++;
      }

      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error("Inbox scan error:", e);
    }
  }

  return { created };
}
// ── Process Google Calendar for shared events ─────────────────────────────────
async function processCalendar(userId: string, batchSize: number) {
  const accessToken = await getValidAccessToken(userId);

  // Fetch calendar events from last 2 years
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const calUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  calUrl.searchParams.set("timeMin", twoYearsAgo);
  calUrl.searchParams.set("timeMax", now);
  calUrl.searchParams.set("maxResults", "500");
  calUrl.searchParams.set("singleEvents", "true");
  calUrl.searchParams.set("orderBy", "startTime");

  const calRes = await fetch(calUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const calData = await calRes.json();

  if (!calData.items?.length) return { events_processed: 0, contacts_updated: 0 };

  // Build map: email -> events they appeared in
  const emailEventMap: Record<string, any[]> = {};

  for (const event of calData.items) {
    if (!event.attendees?.length) continue;
    const attendees = event.attendees.filter((a: any) => !a.self && a.email);

    for (const attendee of attendees) {
      const email = attendee.email.toLowerCase();
      if (!emailEventMap[email]) emailEventMap[email] = [];
      emailEventMap[email].push({
        title: event.summary || "Meeting",
        date: event.start?.dateTime || event.start?.date,
        type: categorizeEvent(event.summary || ""),
        attendee_count: event.attendees.length,
      });
    }
  }

  // Now update contacts with their shared events
  let contactsUpdated = 0;
  const emails = Object.keys(emailEventMap).slice(0, batchSize);

  for (const email of emails) {
    const { data: contact } = await supabase
      .from("tom_contacts")
      .select("id, shared_events, calendar_intimacy_score")
      .eq("user_id", userId)
      .eq("email", email)
      .single();

    if (!contact) continue;

    const events = emailEventMap[email];
    // Sort by date desc, keep last 20
    const sorted = events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);

    // Intimacy score: more meetings = stronger relationship
    const intimacyScore = Math.min(100, events.length * 5 + (events.filter(e => e.attendee_count <= 3).length * 10));

    await supabase
      .from("tom_contacts")
      .update({
        shared_events: sorted,
        calendar_intimacy_score: intimacyScore,
        calendar_scanned_at: new Date().toISOString(),
      })
      .eq("id", contact.id)
      .eq("user_id", userId);

    contactsUpdated++;
  }

  return { events_processed: calData.items.length, contacts_updated: contactsUpdated };
}

function categorizeEvent(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("1:1") || t.includes("1on1") || t.includes("one on one")) return "1on1";
  if (t.includes("lunch") || t.includes("dinner") || t.includes("coffee") || t.includes("drinks")) return "social";
  if (t.includes("interview")) return "interview";
  if (t.includes("review") || t.includes("feedback")) return "review";
  if (t.includes("standup") || t.includes("sync") || t.includes("check-in")) return "team_sync";
  if (t.includes("intro") || t.includes("meet")) return "intro";
  return "meeting";
}

// ── Claude content classifier ─────────────────────────────────────────────────
// Runs on contacts with 5+ emails — detects tone, intimacy, relationship type
async function classifyContactRelationships(userId: string, batchSize: number) {
  const accessToken = await getValidAccessToken(userId);

  // Only run on contacts with 5+ emails, not yet classified or classified >30 days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, email_count, relationship_type, relationship_override, journal_classified, tier_override")
    .eq("user_id", userId)
    .not("email", "is", null)
    .gte("email_count", 5)
    .eq("relationship_override", false)
    .or(`relationship_classified_at.is.null,relationship_classified_at.lt.${thirtyDaysAgo}`)
    .order("email_count", { ascending: false })
    .limit(batchSize);

  if (!contacts?.length) return { classified: 0 };

  let classified = 0;

  for (const contact of contacts) {
    // Skip if journal has already locked this contact
    if (contact.tier_override && contact.journal_classified) continue;

    try {
      // Fetch 10 most recent emails from this contact
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${contact.email}&maxResults=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();
      if (!listData.messages?.length) continue;

      const emailTexts: string[] = [];
      for (const msg of listData.messages.slice(0, 10)) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();
        const text = extractTextFromPayload(msgData.payload);
        if (text) emailTexts.push(text.slice(0, 500)); // cap per email
        await new Promise(r => setTimeout(r, 100));
      }

      if (!emailTexts.length) continue;

      const emailSample = emailTexts.join("\n---\n").slice(0, 4000);

      // Run Claude classifier
      const classifyRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Analyze these emails from ${contact.full_name} and classify the relationship.

EMAILS:
${emailSample}

Return ONLY a JSON object with no markdown:
{
  "relationship_type": "close_friend|friend|family|trusted_colleague|client|colleague|acquaintance|vendor",
  "tone": "very_informal|informal|mixed|formal|very_formal",
  "intimacy_score": 1-10,
  "is_transactional": true|false,
  "confidence": 0-100,
  "signals": ["uses_first_name", "asks_about_family", "shares_personal_news", "only_transactional", "humor", "vulnerability", "project_focused"]
}

RULES:
- very_informal + asks_about_family + personal_news = close_friend or family
- formal + project_focused + no_personal = colleague or vendor
- mixed = trusted_colleague or client
- is_transactional = true if emails are primarily about tasks, projects, or business with no personal warmth
- intimacy_score 1-3 = transactional, 4-6 = professional relationship, 7-10 = personal/close`,
          }],
        }),
      });

      const classifyData = await classifyRes.json();
      const rawText = classifyData.content?.[0]?.text || "{}";
      const clean = rawText.replace(/```json|```/g, "").trim();

      let result: any;
      try { result = JSON.parse(clean); } catch { continue; }

      if (!result.relationship_type) continue;

      // Build update payload
      const update: any = {
        relationship_type: result.relationship_type,
        tone: result.tone,
        intimacy_score: result.intimacy_score,
        relationship_confidence: result.confidence / 100,
        relationship_classified_at: new Date().toISOString(),
      };

      // Queue for approval if confidence < 70
      if (result.confidence < 70) {
        update.needs_relationship_approval = true;
      }

      await supabase
        .from("tom_contacts")
        .update(update)
        .eq("id", contact.id)
        .eq("user_id", userId);

      classified++;
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.error(`Classifier error for ${contact.id}:`, e);
    }
  }

  return { classified };
}

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let body: any = {};
  try { body = await req.json(); } catch {}
  userId = body.user_id || null;
  if (!userId) {
    const cookieStore = await cookies();
    userId = cookieStore.get("tom_session")?.value || null;
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = body.mode || "all"; // "signatures" | "calendar" | "classify" | "all"
  const batchSize = body.batch_size || 30;

  const results: any = {};

  if (mode === "signatures" || mode === "all") {
    try {
      const accessToken = await getValidAccessToken(userId);
      const newContacts = await createContactsFromInbox(userId, accessToken);
      results.signatures = await processSignatures(userId, batchSize);
      results.new_from_inbox = newContacts;
    } catch (e: any) {
      results.signatures = { error: e.message };
    }
  }

  if (mode === "calendar" || mode === "all") {
    try {
      results.calendar = await processCalendar(userId, batchSize);
    } catch (e: any) {
      results.calendar = { error: e.message };
    }
  }

  if (mode === "classify" || mode === "all") {
    try {
      results.classify = await classifyContactRelationships(userId, Math.min(batchSize, 10));
    } catch (e: any) {
      results.classify = { error: e.message };
    }
  }

  return NextResponse.json({ success: true, ...results });
}