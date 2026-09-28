import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { updateGoogleContact, createGoogleContact } from "../../../lib/googleContacts";
import { isBlockedEmail } from "@/app/lib/contact-blocklist";
import { fillBlankFields } from "../../../lib/contactFieldPolicy";
import { emailTakenBySomeoneElse, insertContact, updateContact } from "../../../lib/contactWrite";

// Local-part blocklist moved to app/lib/contact-blocklist.ts (substring match, 2026-05-10)
// Domain blocklist kept inline — these are sending-infrastructure domains, not local-part keywords
const BLOCKED_DOMAIN_PATTERNS = [
  "mailchimp.com", "sendgrid.net", "constantcontact.com",
  "hubspot.com", "klaviyo.com", "marketo.com", "pardot.com",
  "amazonses.com", "mailgun.com", "salesforce.com",
];

function isBlockedSender(email: string): boolean {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  const atIndex = lower.indexOf("@");
  if (atIndex === -1) return true;
  const local = lower.slice(0, atIndex);
  const domain = lower.slice(atIndex + 1);

  // Local-part keyword check (substring match via shared helper)
  if (isBlockedEmail(lower)) return true;

  // Block known marketing/transactional domains
  if (BLOCKED_DOMAIN_PATTERNS.some(d => domain.includes(d))) return true;

  // Block purely numeric local parts
  if (/^\d+$/.test(local)) return true;

  return false;
}

function hasFirstAndLastName(name: string): boolean {
  if (!name) return false;
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && parts[0].length > 1 && parts[1].length > 1;
}

function isWithinThreeYears(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  return date > threeYearsAgo;
}

function extractEmailAddress(str: string): string | null {
  const match = str?.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  try {
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
      .select("access_token, refresh_token")
      .eq("id", effectiveUserId)
      .single();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ── Step 1: Fetch sent + received emails ──
    const [inboxRes, sentRes] = await Promise.all([
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:inbox", {
        headers: { Authorization: `Bearer ${user.access_token}` }
      }),
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:sent", {
        headers: { Authorization: `Bearer ${user.access_token}` }
      }),
    ]);

    const [inboxData, sentData] = await Promise.all([
      inboxRes.json(),
      sentRes.json(),
    ]);

    const allMessages = [
      ...(inboxData.messages || []).map((m: any) => ({ ...m, folder: "inbox" })),
      ...(sentData.messages || []).map((m: any) => ({ ...m, folder: "sent" })),
    ];

    if (allMessages.length === 0) {
      return NextResponse.json({ success: true, processed: 0, updates: 0 });
    }

    // ── Step 2: Fetch email details ──
    const emailDetails = await Promise.all(
      allMessages.slice(0, 150).map(async (msg: any) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${user.access_token}` } }
        );
        const data = await res.json();
        const headers = data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
        const from = headers.find((h: any) => h.name === "From")?.value || "";
        const to = headers.find((h: any) => h.name === "To")?.value || "";
        const date = headers.find((h: any) => h.name === "Date")?.value || "";

        const extractBody = (part: any): string => {
          if (!part) return "";
          if (part.mimeType === "text/plain" && part.body?.data) {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          }
          if (part.parts) return part.parts.map(extractBody).join("\n");
          return "";
        };

        // Only take the first ~800 chars of body to avoid pulling in
        // quoted replies and other people's signatures
        const fullBody = extractBody(data.payload);
        const firstReplyBreak = fullBody.search(/\n[-_]{3,}|\nOn .+ wrote:|\n>+\s/);
        const bodySnippet = firstReplyBreak > 0
          ? fullBody.slice(0, Math.min(firstReplyBreak, 800))
          : fullBody.slice(0, 800);

        return {
          subject,
          from,
          to,
          date,
          folder: msg.folder,
          // Only include the top of the email — not the quoted thread
          body: bodySnippet,
          // Track the primary sender email for phone attribution
          primary_sender_email: extractEmailAddress(from),
        };
      })
    );

    // ── Step 3: Build two-way contact map ──
    const receivedFrom = new Set<string>();
    const sentTo = new Set<string>();
    const emailDates: Record<string, string> = {};
    const emailCounts: Record<string, number> = {};

    for (const email of emailDetails) {
      if (email.folder === "inbox") {
        const addr = extractEmailAddress(email.from);
        if (addr) {
          receivedFrom.add(addr);
          emailDates[addr] = email.date;
          emailCounts[addr] = (emailCounts[addr] || 0) + 1;
        }
      } else {
        const addr = extractEmailAddress(email.to);
        if (addr) {
          sentTo.add(addr);
          emailDates[addr] = email.date;
          emailCounts[addr] = (emailCounts[addr] || 0) + 1;
        }
      }
    }

    const twoWayEmails = new Set(
      [...receivedFrom].filter(e => sentTo.has(e))
    );

    // ── Step 4: Use Claude to extract + score contacts ──
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are a contact information extractor for a personal AI assistant.

Analyze these emails and extract contact information ONLY for real people (not automated systems, marketing, or bots).

CRITICAL PHONE NUMBER RULES:
- Only extract a phone number if it appears in the email signature of the person in the FROM field
- NEVER extract a phone number from a quoted reply, forwarded message, or another person's signature
- NEVER assign a phone number to someone just because it appeared in the email thread
- If you are not 100% certain the phone belongs to the FROM person's own signature, leave phone as null
- Company main line numbers (like a front desk or office number) should NOT be assigned to an individual

For each real person found, extract:
- full_name (must have first AND last name, skip if only one name)
- email (must match the FROM address exactly)
- phone (ONLY from their own signature in this specific email, null if uncertain)
- address (street, city, state, zip, country — only if in their own signature)
- is_real_person (true/false)
- source_email_from
- source_subject

Additional rules:
- SKIP anyone without both first AND last name
- SKIP noreply, marketing, newsletter, automated senders
- SKIP if is_real_person is false
- Only include people where you are confident this is a genuine human relationship

Return ONLY a JSON array, no markdown, no explanation.
Example: [{"full_name":"John Smith","email":"john@acme.com","phone":"317-555-1234","address":{"streetAddress":"123 Main St","city":"Indianapolis","state":"IN","zip":"46204","country":"US"},"is_real_person":true,"source_email_from":"John Smith <john@acme.com>","source_subject":"Meeting tomorrow"}]

If no valid contacts found, return [].

Emails:
${emailDetails.map((e, i) => `
--- Email ${i + 1} (${e.folder}) ---
From: ${e.from}
To: ${e.to}
Date: ${e.date}
Subject: ${e.subject}
Body (top of email only, quoted replies removed):
${e.body}
`).join("\n")}`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "[]";

    let extracted: any[] = [];
    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      extracted = JSON.parse(clean);
    } catch {
      return NextResponse.json({ success: true, processed: emailDetails.length, updates: 0, error: "Parse failed" });
    }

    extracted = extracted.filter(p => p.is_real_person === true);

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return NextResponse.json({ success: true, processed: emailDetails.length, updates: 0, contacts_found: 0 });
    }

    // ── Step 5: Check existing contacts for deletion suggestions ──
    const { data: allContacts } = await supabase
      .from("tom_contacts")
      .select("id, full_name, email, last_emailed_at, deletion_suggested")
      .eq("user_id", effectiveUserId);

    let deletionSuggestions = 0;

    for (const contact of allContacts || []) {
      if (!contact.email) continue;
      const lastEmailed = contact.last_emailed_at;
      const isStale = !lastEmailed || !isWithinThreeYears(lastEmailed);

      if (isStale && !contact.deletion_suggested) {
        await supabase
          .from("tom_contacts")
          .update({
            deletion_suggested: true,
            deletion_reason: `No email contact in over 3 years (last: ${lastEmailed || "never"})`,
          })
          .eq("id", contact.id);

        await supabase.from("tom_contact_updates").insert({
          user_id: effectiveUserId,
          contact_id: contact.id,
          contact_name: contact.full_name,
          field_updated: "deletion_suggested",
          old_value: "active",
          new_value: "suggested_for_deletion",
          source: "email_scrape",
          email_subject: null,
          email_from: null,
        });

        deletionSuggestions++;
      }
    }

    // ── Step 6: Match and update/create contacts ──
    let updateCount = 0;
    let newCount = 0;

    for (const person of extracted) {
      if (!person.email || !person.full_name) continue;
      if (!hasFirstAndLastName(person.full_name)) continue;
      if (isBlockedSender(person.email)) continue;

      const personEmail = person.email.toLowerCase();
      const lastEmailDate = emailDates[personEmail] || new Date().toISOString();
      const emailCount = emailCounts[personEmail] || 1;

      // ── Phone validation: only trust phone if it came from this person's own email ──
      // Check that at least one email in our set had this person as the FROM sender
      const personWasSender = emailDetails.some(e => e.primary_sender_email === personEmail);
      const trustedPhone = personWasSender ? person.phone : null;

      // Match only on email. A same-name fallback was attaching one person's
      // signature phone and email onto a different person.
      const { data: emailMatches } = await supabase
        .from("tom_contacts")
        .select("*")
        .eq("user_id", effectiveUserId)
        .ilike("email", personEmail)
        .limit(2);
      if ((emailMatches || []).length > 1) continue;
      const contact = emailMatches?.[0] || null;

      if (!contact) {
        // ── New contact — must pass ALL quality gates ──
        const isTwoWay = twoWayEmails.has(personEmail);
        const isFrequent = emailCount >= 2;
        const isClean = !isBlockedSender(personEmail);

        if (!isTwoWay || !isFrequent || !isClean) continue;
        const emailDecision = await emailTakenBySomeoneElse(
          supabase,
          effectiveUserId,
          personEmail,
          null,
          person.full_name
        );
        if (emailDecision !== "allow") continue;

        const { data: newContact } = await insertContact(
          supabase,
          {
            user_id: effectiveUserId,
            google_contact_id: `email_scrape_${Date.now()}_${Math.random()}`,
            full_name: person.full_name,
            email: personEmail,
            phone: trustedPhone || null,  // only set if we trust the attribution
            home_address: person.address || null,
            last_emailed_at: lastEmailDate,
            email_count: emailCount,
            last_synced_at: new Date().toISOString(),
            field_provenance: fillBlankFields(null, {
              email: personEmail,
              phone: trustedPhone,
              home_address: person.address,
              full_name: person.full_name,
            }, ["email", "phone", "home_address", "full_name"], "scrape").field_provenance,
          },
          { returning: true }
        );

        if (newContact) {
          const googleResourceName = await createGoogleContact(user.access_token, {
            full_name: person.full_name,
            email: personEmail,
            phone: trustedPhone,
            address: person.address,
          });

          if (googleResourceName) {
            await supabase
              .from("tom_contacts")
              .update({ google_contact_id: googleResourceName })
              .eq("id", newContact.id);
          }

          await supabase.from("tom_contact_updates").insert({
            user_id: effectiveUserId,
            contact_id: newContact.id,
            contact_name: person.full_name,
            field_updated: "new_contact",
            old_value: null,
            new_value: personEmail,
            source: "email_scrape",
            email_subject: person.source_subject,
            email_from: person.source_email_from,
          });

          newCount++;
        }
        continue;
      }

      // ── Existing contact — enrich missing fields only ──
      const logs: any[] = [];
      const filled = fillBlankFields(
        contact,
        {
          phone: trustedPhone,
          home_address: personWasSender && person.address?.streetAddress ? person.address : null,
        },
        ["phone", "home_address"],
        "scrape"
      );
      if (filled.phone) logs.push({ field_updated: "phone", old_value: null, new_value: filled.phone });
      if (filled.home_address) {
        logs.push({
          field_updated: "home_address",
          old_value: contact.home_address ? JSON.stringify(contact.home_address) : null,
          new_value: JSON.stringify(filled.home_address),
        });
      }

      const updates: Record<string, any> = { ...filled };

      updates.last_emailed_at = lastEmailDate;
      updates.email_count = (contact.email_count || 0) + emailCount;
      updates.last_synced_at = new Date().toISOString();

      if (isWithinThreeYears(lastEmailDate) && contact.deletion_suggested) {
        updates.deletion_suggested = false;
        updates.deletion_reason = null;
        logs.push({
          field_updated: "deletion_suggested",
          old_value: "suggested_for_deletion",
          new_value: "active",
        });
      }

      await updateContact(supabase, contact.id, effectiveUserId, updates);

      if (
        user.access_token &&
        contact.google_contact_id &&
        !contact.google_contact_id.startsWith("email_scrape_")
      ) {
        await updateGoogleContact(user.access_token, contact.google_contact_id, {
          phone: updates.phone,
          address: updates.home_address,
        });
      }

      for (const log of logs) {
        await supabase.from("tom_contact_updates").insert({
          user_id: effectiveUserId,
          contact_id: contact.id,
          contact_name: contact.full_name,
          ...log,
          source: "email_scrape",
          email_subject: person.source_subject,
          email_from: person.source_email_from,
        });
      }

      if (Object.keys(updates).length > 2) updateCount++;
    }

    return NextResponse.json({
      success: true,
      processed: emailDetails.length,
      contacts_found: extracted.length,
      updates: updateCount,
      new_contacts: newCount,
      deletion_suggestions: deletionSuggestions,
    });

  } catch (err: any) {
    console.error("Scrape error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}