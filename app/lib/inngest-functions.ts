import { inngest } from "./inngest";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken, getHumbleHelloAccessToken } from "./google";
import { scoreAllContacts } from "./relationship-scorer";
import { createClickTrackingUrl } from "./campaign-tracking";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

/**
 * Parse a birthday string in any common format and return { month, day }.
 * Handles: "1985-11-29", "11-29", "11/29/1985", "November 29", "Nov 29",
 *          "November 29, 1985", "29 November", "29 Nov 1985", etc.
 * Returns null if parsing fails.
 */
function parseBirthday(birthday: string | null | undefined): { month: number; day: number } | null {
  if (!birthday || typeof birthday !== "string") return null;
  const s = birthday.trim();
  if (!s) return null;

  // Try dashed numeric: 1985-11-29, 11-29-1985, 11-29
  const dashParts = s.split("-").map((p) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2 && dashParts.every((p) => /^\d+$/.test(p))) {
    const nums = dashParts.map((p) => parseInt(p, 10));
    if (nums[0] > 1900 && nums.length === 3) return { month: nums[1], day: nums[2] };
    if (nums.length === 3 && nums[2] > 1900) return { month: nums[0], day: nums[1] };
    if (nums.length === 2) return { month: nums[0], day: nums[1] };
  }

  // Try US slashed: 11/29/1985 or 11/29
  const slashParts = s.split("/").map((p) => p.trim()).filter(Boolean);
  if (slashParts.length >= 2 && slashParts.every((p) => /^\d+$/.test(p))) {
    const nums = slashParts.map((p) => parseInt(p, 10));
    return { month: nums[0], day: nums[1] };
  }

  // Try month-name: "November 29", "Nov 29", "29 November"
  const months: { [k: string]: number } = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
    sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const tokens = s.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let month: number | null = null;
  let day: number | null = null;
  for (const tok of tokens) {
    if (month === null && months[tok] !== undefined) month = months[tok];
    else if (day === null && /^\d{1,2}$/.test(tok)) {
      const n = parseInt(tok, 10);
      if (n >= 1 && n <= 31) day = n;
    }
  }
  if (month !== null && day !== null) return { month, day };

  return null;
}

// ── GMAIL BACKFILL ────────────────────────────────────────────────────────────
export const gmailBackfill = inngest.createFunction(
  { id: "gmail-backfill", name: "Gmail History Backfill", triggers: [{ event: "tom/gmail.backfill" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;

    const done = await step.run("check-complete", async () => {
      const { data } = await supabase
        .from("tom_users")
        .select("gmail_backfill_complete")
        .eq("id", userId)
        .single();
      return Boolean(data?.gmail_backfill_complete);
    });

    if (done) return { skipped: true };

    // Loop through all pages until done
    let cursorInbox: string | null = null;
    let cursorSent: string | null = null;
    let folder = "sent";
    let totalProcessed = 0;
    let totalMatched = 0;
    let page = 0;
    let isDone = false;

    while (!isDone && page < 200) {
      const result = await step.run(`backfill-page-${page}`, async () => {
        const res = await fetch(`${APP_URL}/api/gmail-backfill`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `tom_session=${userId}`,
          },
          body: JSON.stringify({
            cursor_inbox: cursorInbox,
            cursor_sent: cursorSent,
            folder,
          }),
        });
        return res.json();
      });

      totalProcessed += result.processed || 0;
      totalMatched += result.matched || 0;
      cursorInbox = result.next_cursor_inbox || null;
      cursorSent = result.next_cursor_sent || null;
      folder = result.next_folder || folder;
      isDone = result.done || false;
      page++;

      if (!isDone) {
        // Small delay between pages to avoid Gmail rate limits
        await step.sleep("page-delay", "2s");
      }
    }

    return { userId, totalProcessed, totalMatched, done: isDone };
  }
);
// ── APOLLO ENRICHMENT ─────────────────────────────────────────────────────────
export const apolloEnrich = inngest.createFunction(
  { id: "apollo-enrich", name: "Apollo Contact Enrichment", triggers: [{ event: "tom/apollo.enrich" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;

    const contacts = await step.run("get-contacts", async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, email")
        .eq("user_id", userId)
        .not("email", "is", null)
        .gt("relationship_strength", 5)
        .or(`apollo_enriched_at.is.null,apollo_enriched_at.lt.${thirtyDaysAgo}`)
        .order("relationship_strength", { ascending: false })
        .limit(100);
      return (data || []) as { id: string; email: string }[];
    });

    const BATCH = 10;
    for (let i = 0; i < contacts.length; i += BATCH) {
      const batch = contacts.slice(i, i + BATCH);
      await step.run(`enrich-batch-${i}`, async () => {
        for (const contact of batch) {
          await fetch(`${APP_URL}/api/contacts/enrich`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
            body: JSON.stringify({ contact_id: contact.id }),
          });
          await new Promise(r => setTimeout(r, 300));
        }
        return { done: batch.length };
      });
    }

    return { userId, enriched: contacts.length };
  }
);

// ── EMAIL SCAN ────────────────────────────────────────────────────────────────
export const emailScan = inngest.createFunction(
  { id: "email-scan", name: "Email Content Scanner", triggers: [{ event: "tom/emails.scan" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;
    await step.run("scan", async () => {
      await fetch(`${APP_URL}/api/contacts/scan-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
        body: JSON.stringify({ batch_size: 30, user_id: userId }),
      });
      return { ok: true };
    });
    return { userId, status: "done" };
  }
);

// ── INTELLIGENCE ──────────────────────────────────────────────────────────────
export const intelligenceExtract = inngest.createFunction(
  { id: "intelligence-extract", name: "Intelligence Extractor", triggers: [{ event: "tom/intelligence.extract" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;
    await step.run("extract", async () => {
      await fetch(`${APP_URL}/api/contacts/intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
        body: JSON.stringify({ batch_size: 30 }),
      });
      return { ok: true };
    });
    await step.run("classify-relationships", async () => {
      await fetch(`${APP_URL}/api/contacts/enrich-signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
        body: JSON.stringify({ mode: "classify", batch_size: 10, user_id: userId }),
      });
      return { ok: true };
    });
    return { userId, status: "done" };
  }
);

// ── SIGNATURES ────────────────────────────────────────────────────────────────
export const signatureParse = inngest.createFunction(
  { id: "signature-parse", name: "Email Signature Parser", triggers: [{ event: "tom/signatures.parse" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;
    await step.run("parse", async () => {
      await fetch(`${APP_URL}/api/contacts/enrich-signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
        body: JSON.stringify({ mode: "signatures", batch_size: 50, user_id: userId }),
      });
      return { ok: true };
    });
    return { userId, status: "done" };
  }
);

// ── CALENDAR ──────────────────────────────────────────────────────────────────
export const calendarEnrich = inngest.createFunction(
  { id: "calendar-enrich", name: "Calendar Enrichment", triggers: [{ event: "tom/calendar.enrich" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;
    await step.run("enrich", async () => {
      await fetch(`${APP_URL}/api/contacts/enrich-signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
        body: JSON.stringify({ mode: "calendar", batch_size: 200, user_id: userId }),
      });
      return { ok: true };
    });
    return { userId, status: "done" };
  }
);

// ── SCORING ───────────────────────────────────────────────────────────────────
export const contactsScore = inngest.createFunction(
  { id: "contacts-score", name: "Contact Scorer", triggers: [{ event: "tom/contacts.score" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;
    await step.run("score", async () => { await scoreAllContacts(userId); return { ok: true }; });
    await step.run("clean", async () => { await supabase.rpc("auto_clean_contacts", { p_user_id: userId }); return { ok: true }; });
    await step.run("merge", async () => { await supabase.rpc("merge_duplicate_contacts", { p_user_id: userId }); return { ok: true }; });
    await step.run("auto-merge", async () => {
      const res = await fetch(`${APP_URL}/api/contacts/auto-merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
      });
      return res.json();
    });
    return { userId, status: "done" };
  }
);

// ── GOOGLE SYNC ───────────────────────────────────────────────────────────────
export const contactsSync = inngest.createFunction(
  { id: "contacts-sync", name: "Google Contacts Sync", triggers: [{ event: "tom/contacts.sync" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;

    await step.run("sync", async () => {
      const res = await fetch(`${APP_URL}/api/contacts/google-sync?secret=${process.env.CRON_SECRET}&userId=${userId}`);
      const d = await res.json();
      return { synced: d.synced || 0 };
    });

    await step.run("deletions", async () => {
      const accessToken = await getValidAccessToken(userId);
      const { data: deleted } = await supabase
        .from("tom_deleted_contacts")
        .select("id, google_resource_name")
        .eq("user_id", userId)
        .limit(200);

      if (!deleted?.length) return { deleted: 0 };

      const ids: string[] = [];
      for (const c of deleted) {
        if (c.google_resource_name) {
          await fetch(`https://people.googleapis.com/v1/${c.google_resource_name}:deleteContact`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
        ids.push(c.id);
        await new Promise(r => setTimeout(r, 500));
      }
      if (ids.length > 0) await supabase.from("tom_deleted_contacts").delete().in("id", ids);
      return { deleted: ids.length };
    });

    return { userId, status: "done" };
  }
);

// ── ONBOARDING COMPLETE ───────────────────────────────────────────────────────
export const onboardingComplete = inngest.createFunction(
  { id: "onboarding-complete", name: "Onboarding Complete", triggers: [{ event: "tom/onboarding.complete" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;

    // ── Step 1: Send welcome email (delayed 5 Min) ───────────────────────
    await step.sleep("welcome-email-delay", "5m");
    await step.run("send-welcome-email", async () => {
      const { data: user } = await supabase
        .from("tom_users")
        .select("email, name, welcome_email_sent_at")
        .eq("id", userId)
        .single();

      if (!user?.email || user.welcome_email_sent_at) return { skipped: true };

      const accessToken = await getHumbleHelloAccessToken();
      const firstName = user.name?.split(" ")[0] || "there";
      const subject = `Welcome to Humble Hello, ${firstName}`;

      const body = `Hi ${firstName},

Most people say relationships matter. Very few actually do anything about it.

You just fixed that.

Here's the truth: the people who win in business and in life aren't smarter or luckier. They just stay in touch better. They are present. They show interest in others. They remember. They follow through. That's it. That's the whole game.

I built Humble Hello because of two reasons. 1. I could never keep my contact's info updated, and 2. Friends I loved. Business relationships I valued. People who mattered — quietly slipping away because I didn't have an easy way to stay in touch. So I built one. And business and friendships have never been better!

Humble Hello is already running in the background:

  • Your inbox and calendar are being scanned to build your contact list
  • Your Core 5 are flagged as your highest-priority relationships
  • Your cards & gift profile is configured and ready for you to send 
  • Contacts you've gone cold with are being identified

Your one job right now: Send 3 messages to contacts in your engage section today.

The people who engage 3 contacts a day don't just feel better about their relationships — they see more inbound, more referrals, more opportunities. Every time. Without exception.

The ROI on staying in touch is infinite. You don't need more contacts. You need to actually show up for the ones you have.

Let's go!

Tom Rector
Founder, Humble Hello
humblehello.com

P.S. — I read every reply personally. If you have feedback, a feature idea, or a story about a relationship Humble Hello helped you reconnect — I want to hear it. Hit reply and tell me.`;

      const raw = [
        `To: ${user.name} <${user.email}>`,
        `From: Tom Rector <tom@humblehello.com>`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
      ].join("\r\n");

      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
      });

      await supabase
        .from("tom_users")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("id", userId);

      return { sent: true, to: user.email };
    });

    // ── Step 2: Send welcome card ──────────────────────────────────────────
    await step.run("send-welcome-card", async () => {
      const { data: user } = await supabase
        .from("tom_users")
        .select("name, card_profile, welcome_card_sent_at")
        .eq("id", userId)
        .single();

      if (user?.welcome_card_sent_at) return { skipped: true };

      // Get self contact for home address
      const { data: selfContact } = await supabase
        .from("tom_contacts")
        .select("home_address, full_name")
        .eq("user_id", userId)
        .eq("is_self", true)
        .maybeSingle();

      const address = selfContact?.home_address;
      if (!address?.streetAddress || !address?.city || !address?.region || !address?.postalCode) {
        return { skipped: true, reason: "No home address on file" };
      }

      const cardProfile = user?.card_profile || {};
      const signoff = cardProfile.signoff || user?.name?.split(" ")[0] || "Your Humble Hello Team";
      const firstName = user?.name?.split(" ")[0] || "there";

      const message = `${firstName},

I just wanted to personally thank you for signing up for Humble Hello. It means more than you know that you trust us to play a small part in bettering your relationships. This is something I care deeply about — and I'm grateful you're here.

Welcome to Humble Hello.

Tom Rector`;

      // Send via Handwrytten
      const handwrytten = await fetch("https://api.handwrytten.com/v1/orders/singleStepOrder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.HANDWRYTTEN_API_KEY!,
        },
        body: JSON.stringify({
          message,
          font: "Executive Adam",
          card_id: cardProfile.card_id || 322201,
          recipient: {
            name: selfContact?.full_name || user?.name,
            address1: address.streetAddress,
            city: address.city,
            state: address.region,
            zip: address.postalCode,
            country: address.country || "US",
          },
          sender: {
            name: "Humble Hello",
            address1: "1 Virginia Avenue",
            city: "Indianapolis",
            state: "IN",
            zip: "46204",
            country: "US",
          },
        }),
      });

      if (!handwrytten.ok) {
        const err = await handwrytten.text();
        console.error("Handwrytten welcome card error:", err);
        return { skipped: true, reason: "Handwrytten error", detail: err };
      }

      await supabase
        .from("tom_users")
        .update({ welcome_card_sent_at: new Date().toISOString() })
        .eq("id", userId);

      return { sent: true };
    });

    // ── Step 3: Day 4 email ────────────────────────────────────────────────
    await step.sleep("day4-delay", "4d");
    await step.run("send-day4-email", async () => {
      const { data: user } = await supabase
        .from("tom_users")
        .select("email, name")
        .eq("id", userId)
        .single();
      if (!user?.email) return { skipped: true };
      const firstName = user.name?.split(" ")[0] || "there";
      const accessToken = await getHumbleHelloAccessToken();
      const raw = [
        `To: ${user.name} <${user.email}>`,
        `From: Tom Rector <tom@humblehello.com>`,
        `Subject: Are you seeing results?`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `${firstName},

By now, you should be getting replies.

Old conversations restarting. People you haven't talked to in a while responding like no time passed.

This is exactly what happened to me. Once I started, the responses came fast — honestly faster than I could keep up with. That's a good problem, and we're already building more into the platform to help manage it.

But none of that matters if you stop.

Momentum is everything here.

The people who win with this don't overthink it — they just keep showing up.

Stay consistent and this compounds quickly.

Don't break the streak — and keep me posted on how it's going.

Tom
Humble Hello
humblehello.com`,
      ].join("\r\n");
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
      });
      return { sent: true };
    });

    // ── Step 4: Day 10 email ───────────────────────────────────────────────
    await step.sleep("day10-delay", "6d"); // 4d already elapsed, 6 more = day 10
    await step.run("send-day10-email", async () => {
      const { data: user } = await supabase
        .from("tom_users")
        .select("email, name")
        .eq("id", userId)
        .single();
      if (!user?.email) return { skipped: true };
      const firstName = user.name?.split(" ")[0] || "there";
      const accessToken = await getHumbleHelloAccessToken();
      const raw = [
        `To: ${user.name} <${user.email}>`,
        `From: Tom Rector <tom@humblehello.com>`,
        `Subject: Should you keep going?`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `${firstName},

Your trial is wrapping up.

You've seen what happens when you actually stay in touch — replies come back, conversations restart, things move.

Now the question is simple:

Is it a bad idea to keep that going?

Because the alternative is what most people do — they stop. And everything they just started fades again.

One thing that changed everything for me was journaling after interactions. Just a few notes — and suddenly I knew who mattered, what was going on in their world, and when to follow up.

Humble Hello builds on that:

  • Your journal feeds AI that automatically maps your 15 / 50 / 150
  • So you're always focused on the right people without thinking about it

Let me ask you this:

What happens to your relationships if you stop now?

And what happens if you don't?

No pressure either way. If it's not worth it, you'll know.

But if it is — keep it running.

Tom
Humble Hello
humblehello.com`,
      ].join("\r\n");
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
      });
      return { sent: true };
    });

    // ── Step 5: Day 20 email ───────────────────────────────────────────────
    await step.sleep("day20-delay", "10d"); // 10d already elapsed, 10 more = day 20
    await step.run("send-day20-email", async () => {
      const { data: user } = await supabase
        .from("tom_users")
        .select("email, name")
        .eq("id", userId)
        .single();
      if (!user?.email) return { skipped: true };
      const firstName = user.name?.split(" ")[0] || "there";
      const accessToken = await getHumbleHelloAccessToken();
      const raw = [
        `To: ${user.name} <${user.email}>`,
        `From: Tom Rector <tom@humblehello.com>`,
        `Subject: Quick check — are you still in it?`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `${firstName},

Most people fall off around now.

Not because this stops working — because they stop.

Quick question: are you still sending 3 a day?

If yes, you're probably noticing something — people respond more when the timing feels right.

That's not luck.

Humble Hello is constantly updating your network in the background:

  • Verification emails keep contact info fresh
  • AI enrichment updates roles, companies, and real-world changes
  • So when you reach out, it actually lands

I had someone reply to me after years — turned out they had just changed roles two weeks prior. I didn't know that manually. The system did.

That's the edge.

Open your Hopper. Send 3 today.

Stay in the game.

— Tom
Humble Hello
humblehello.com`,
      ].join("\r\n");
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
      });
      return { sent: true };
    });

    // ── Step 6: Day 45 email ───────────────────────────────────────────────
    await step.sleep("day45-delay", "25d"); // 20d already elapsed, 25 more = day 45
    await step.run("send-day45-email", async () => {
      const { data: user } = await supabase
        .from("tom_users")
        .select("email, name")
        .eq("id", userId)
        .single();
      if (!user?.email) return { skipped: true };
      const firstName = user.name?.split(" ")[0] || "there";
      const accessToken = await getHumbleHelloAccessToken();
      const raw = [
        `To: ${user.name} <${user.email}>`,
        `From: Tom Rector <tom@humblehello.com>`,
        `Subject: This is where it compounds`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `${firstName},

If you've stayed consistent, you've felt it by now.

More replies. Warmer conversations. People leaning in.

This is where most people hit a ceiling — not because it stops working, but because they try to manage it all manually again.

That's the trap.

A couple things I use now that changed the game:

  • The Chrome Extension — see relationship strength and context right where you work (LinkedIn, email, etc.)
  • Campaigns — when I want to reach a group (clients, partners, friends), I can send personalized messages at scale without losing the human feel

Because at some point, it's not about reaching out. It's about doing it consistently without dropping the ball.

I built Humble Hello to solve a problem I had — then I had a bigger problem: too many people responding.

This is how you handle that.

If you've made it this far, don't slow down now.

This is where it starts paying off.

— Tom
Humble Hello
humblehello.com

P.S. — Hit reply. Tell me what's compounding for you. Your stories are what keep me building.`,
      ].join("\r\n");
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
      });
      return { sent: true };
    });

    return { userId, status: "done" };
  }
);

// ── SCHEDULED EMAILS ──────────────────────────────────────────────────────────
export const scheduledEmailSend = inngest.createFunction(
  { id: "scheduled-emails", name: "Scheduled Email Sender", triggers: [{ event: "tom/scheduled.emails" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;

    const scheduled = await step.run("get-scheduled", async () => {
      const { data } = await supabase
        .from("tom_scheduled_emails")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "scheduled")
        .lte("scheduled_for", new Date().toISOString())
        .limit(10);
      return (data || []) as any[];
    });

    if (scheduled.length === 0) return { sent: 0 };

    for (const email of scheduled) {
      await step.run(`send-${email.id}`, async () => {
        const { sendUserEmail } = await import("./email-provider");

        let status: "sent" | "failed" = "failed";
        try {
          const recipient = email.contact_name
            ? `${email.contact_name} <${email.contact_email}>`
            : email.contact_email;

          await sendUserEmail({
            userId,
            to: recipient,
            subject: email.subject,
            text: email.body,
          });
          status = "sent";
        } catch (e) {
          console.error(`Scheduled email send failed for ${email.id}:`, e);
        }

        await supabase
          .from("tom_scheduled_emails")
          .update({ status, sent_at: status === "sent" ? new Date().toISOString() : null })
          .eq("id", email.id);

        if (status === "sent" && email.contact_id) {
          await supabase
            .from("tom_contacts")
            .update({ last_emailed_at: new Date().toISOString() })
            .eq("id", email.contact_id)
            .eq("user_id", userId);
        }
        return { status };
      });
    }

    return { userId, sent: scheduled.length };
  }
);

// ── GOOGLE CONTACTS BACKFILL ──────────────────────────────────────────────────
export const googleBackfill = inngest.createFunction(
  { id: "google-backfill", name: "Google Contacts Backfill", timeouts: { finish: "2h" }, triggers: [{ event: "tom/google.backfill" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;

    // Get ALL contacts missing google_resource_name
    const contacts = await step.run("get-all-missing-contacts", async () => {
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, full_name, email, phone, company, job_title, home_address")
        .eq("user_id", userId)
        .or("google_resource_name.is.null,google_resource_name.like.email_scrape_%,google_resource_name.like.manual_%")
        .not("full_name", "is", null)
        .range(0, 9999);
      return (data || []) as any[];
    });

    if (contacts.length === 0) {
      return { userId, pushed: 0, message: "All contacts already synced to Google" };
    }

    let pushed = 0;
    let failed = 0;
    const CHUNK = 50;

    for (let i = 0; i < contacts.length; i += CHUNK) {
      const chunk = contacts.slice(i, i + CHUNK);
      await step.run(`push-chunk-${i}`, async () => {
        const { createGoogleContact } = await import("./googleContacts");
        const accessToken = await getValidAccessToken(userId);

        for (const contact of chunk) {
          if (!contact.full_name?.trim()) continue;
          try {
            const resourceName = await createGoogleContact(accessToken, {
              full_name: contact.full_name,
              email: contact.email,
              phone: contact.phone,
              address: contact.home_address,
              company: contact.company,
              job_title: contact.job_title,
            });
            if (resourceName) {
              await supabase
                .from("tom_contacts")
                .update({ google_resource_name: resourceName })
                .eq("id", contact.id)
                .eq("user_id", userId);
              pushed++;
            } else {
              failed++;
            }
          } catch (e) {
            console.error("Backfill failed for contact:", contact.id, e);
            failed++;
          }
          // 1.5s delay between contacts to avoid Google rate limits
          await new Promise(r => setTimeout(r, 200));
        }
        return { chunk_done: chunk.length };
      });

// No sleep needed — per-contact delay handles rate limiting
    }

    return { userId, pushed, failed, total: contacts.length };
  }
);
// ── AUTO MERGE ────────────────────────────────────────────────────────────────
export const autoMerge = inngest.createFunction(
  { id: "auto-merge", name: "Auto Merge Duplicates", triggers: [{ event: "tom/contacts.auto-merge" }] },
  async ({ event, step }: any) => {
    const userId = event.data.userId as string;
    const result = await step.run("auto-merge", async () => {
      const res = await fetch(`${APP_URL}/api/contacts/merge-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
        body: JSON.stringify({ action: "auto_resolve" }),
      });
      return res.json();
    });
    return { userId, ...result };
  }
);

// ── HOPPER IMPORT ─────────────────────────────────────────────────────────────
async function saveContactDirect(contact: any, userId: string): Promise<"imported" | "skipped" | "error"> {
  if (!contact.full_name?.trim()) return "skipped";
  try {
    if (contact.email) {
      const { data: existing } = await supabase
        .from("tom_contacts")
        .select("id, phone, company, job_title, birthday, home_address")
        .eq("user_id", userId)
        .ilike("email", contact.email.trim())
        .maybeSingle();
      if (existing) {
        const patch: any = {};
        if (!existing.phone && contact.phone) patch.phone = contact.phone;
        if (!existing.company && contact.company) patch.company = contact.company;
        if (!existing.job_title && contact.job_title) patch.job_title = contact.job_title;
        if (!existing.birthday && contact.birthday) patch.birthday = contact.birthday;
        if (!existing.home_address && contact.home_address) patch.home_address = contact.home_address;
        if (Object.keys(patch).length > 0) {
          await supabase.from("tom_contacts").update(patch).eq("id", existing.id).eq("user_id", userId);
          return "imported";
        }
        return "skipped";
      }
    } else {
      const { data: existing } = await supabase
        .from("tom_contacts")
        .select("id")
        .eq("user_id", userId)
        .ilike("full_name", contact.full_name.trim())
        .maybeSingle();
      if (existing) return "skipped";
    }
    const { error } = await supabase.from("tom_contacts").insert({
      user_id: userId,
      full_name: contact.full_name.trim(),
      email: contact.email?.toLowerCase().trim() || null,
      phone: contact.phone || null,
      company: contact.company || null,
      job_title: contact.job_title || null,
      notes: contact.notes || null,
      birthday: contact.birthday || null,
      home_address: contact.home_address || null,
      last_synced_at: new Date().toISOString(),
    });
    if (error) return "error";
    return "imported";
  } catch {
    return "error";
  }
}
export const hopperImport = inngest.createFunction(
  { id: "hopper-import", name: "Hopper Import", triggers: [{ event: "tom/hopper.import" }] },
  async ({ event, step }: any) => {
    const { userId, contacts: rawContacts, fileBase64, fileName } = event.data;

    // Parse Excel file if sent as base64
    let contacts = rawContacts || [];
    if (fileBase64 && fileName) {
      contacts = await step.run("parse-file", async () => {
        const XLSX = require("xlsx");
        const buffer = Buffer.from(fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const parsed: any[] = [];
        for (const row of rows) {
          const firstName = String(row["First Name"] || row["Given Name"] || "");
          const lastName = String(row["Last Name"] || row["Family Name"] || "");
          const fullName = (row["Name"] || `${firstName} ${lastName}`).trim();
          const email = String(row["E-mail 1 - Value"] || row["E-mail"] || row["Email"] || "").toLowerCase().trim();
          const phone = String(row["Phone 1 - Value"] || row["Phone"] || "");
          const company = String(row["Organization Name"] || row["Organization 1 - Name"] || row["Company"] || "");
          const jobTitle = String(row["Organization Title"] || row["Organization 1 - Title"] || row["Job Title"] || "");
          const street = String(row["Address 1 - Street"] || "");
          const city = String(row["Address 1 - City"] || "");
          const region = String(row["Address 1 - Region"] || "");
          const postalCode = String(row["Address 1 - Postal Code"] || "");
          const country = String(row["Address 1 - Country"] || "");
          const birthday = String(row["Birthday"] || "");
          if (!fullName && !email) continue;
          parsed.push({
            full_name: fullName || email,
            email: email || null,
            phone: phone || null,
            company: company || null,
            job_title: jobTitle || null,
            birthday: birthday || null,
            home_address: (city || street) ? { streetAddress: street, city, region, postalCode, country } : null,
          });
        }
        return parsed;
      });
    }
    const CHUNK = 50;
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < contacts.length; i += CHUNK) {
      const chunk = contacts.slice(i, i + CHUNK);
      const results = await step.run(`import-chunk-${i}`, async () => {
        let imp = 0, skip = 0;
        for (const contact of chunk) {
          const result = await saveContactDirect(contact, userId);
          if (result === "imported") imp++;
          else skip++;
        }
        return { imp, skip };
      });
      imported += results.imp;
      skipped += results.skip;
    }

    return { imported, skipped, total: contacts.length };
  }
);
// ── CARD BIRTHDAY SCANNER ─────────────────────────────────────────────────────
export const cardBirthdayScanner = inngest.createFunction(
  { id: "card-birthday-scanner", name: "Card Birthday Scanner", triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }: any) => {
    await step.run("scan-all-users", async () => {
      const { data: users } = await supabase
        .from("tom_users")
        .select("id, card_profile, email, name")
        .not("google_access_token", "is", null);

      for (const user of users || []) {
        const cardProfile = user.card_profile || {};
        const triggers = cardProfile.triggers || ["birthday"];
        if (!triggers.includes("birthday")) continue;

        const autoSendThresholds: number[] = cardProfile.auto_send_thresholds || [cardProfile.auto_send_threshold] || [2];
        const autoSendEnabled = cardProfile.auto_send_enabled || false;

        const { data: contacts } = await supabase
          .from("tom_contacts")
          .select("id, full_name, dunbar_tier, home_address, birthday")
          .eq("user_id", user.id)
          .not("birthday", "is", null);

        for (const contact of contacts || []) {
          if (!contact.birthday) continue;

          const parsed = parseBirthday(contact.birthday);
          if (!parsed) {
            console.warn(`[card-birthday-scanner] could not parse birthday for ${contact.full_name}: ${contact.birthday}`);
            continue;
          }

          const today = new Date();
          const { month, day } = parsed;
          const thisYear = new Date(today.getFullYear(), month - 1, day);
          if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
          const daysUntil = Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntil !== 20) continue;

          const { data: existing } = await supabase
            .from("card_approvals")
            .select("id")
            .eq("user_id", user.id)
            .eq("contact_id", contact.id)
            .eq("occasion", "Birthday")
            .gte("created_at", `${today.getFullYear()}-01-01`)
            .maybeSingle();

          if (existing) continue;

          const tier = contact.dunbar_tier || 5;
          const insideThreshold = autoSendThresholds.includes(tier) || autoSendThresholds.some((t: number) => tier <= t);
          const shouldAutoSend = insideThreshold && autoSendEnabled;

          const draftRes = await fetch(`${APP_URL}/api/relationships/draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: `tom_session=${user.id}` },
            body: JSON.stringify({ contact_name: contact.full_name, occasion: "Birthday", relationship_type: "contact", days_since_contact: 0 }),
          });
          const draft = await draftRes.json();
          const message = draft.message || `Wishing you a wonderful birthday!`;

          if (shouldAutoSend && contact.home_address) {
            await supabase.from("card_approvals").insert({
              user_id: user.id, contact_id: contact.id, contact_name: contact.full_name,
              occasion: "Birthday", message, card_type: "handwrytten", status: "auto_pending",
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });
          } else {
            await supabase.from("card_approvals").insert({
              user_id: user.id, contact_id: contact.id, contact_name: contact.full_name,
              occasion: "Birthday", message, card_type: "handwrytten", status: "pending",
              expires_at: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString(),
            });
            await fetch(`${APP_URL}/api/cards/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: user.id, user_email: user.email, user_name: user.name, contact_name: contact.full_name, occasion: "Birthday", message, days_until: daysUntil }),
            });
          }
        }
      }
      return { ok: true };
    });
  }
);

// ── CARD AUTO-SENDER ──────────────────────────────────────────────────────────
export const cardAutoSender = inngest.createFunction(
  { id: "card-auto-sender", name: "Card Auto Sender", triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }: any) => {
    await step.run("send-auto-pending", async () => {
      const { data: users } = await supabase
        .from("tom_users")
        .select("id, card_profile, name")
        .not("google_access_token", "is", null);

      for (const user of users || []) {
        const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: pending } = await supabase
          .from("card_approvals")
          .select("*, tom_contacts(home_address)")
          .eq("user_id", user.id)
          .eq("status", "auto_pending")
          .gte("created_at", sevenDaysAgo)
          .lte("created_at", sixDaysAgo);

        for (const approval of pending || []) {
          const address = (approval as any).tom_contacts?.home_address;
          if (!address) continue;

          await fetch(`${APP_URL}/api/cards/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: `tom_session=${user.id}` },
            body: JSON.stringify({ contact_id: approval.contact_id, contact_name: approval.contact_name, occasion: approval.occasion, message: approval.message, address, trigger_type: "auto_birthday", requires_approval: false }),
          });

          await supabase.from("card_approvals")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", approval.id);
        }
      }
      return { ok: true };
    });
  }
);
// ── CARD APPROVAL TIMEOUT ─────────────────────────────────────────────────────
export const cardApprovalTimeout = inngest.createFunction(
  { id: "card-approval-timeout", name: "Card Approval Timeout", triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }: any) => {
    await step.run("expire-approvals", async () => {
      const now = new Date().toISOString();
      const { data: expired } = await supabase
        .from("card_approvals")
        .select("id, contact_name, occasion")
        .in("status", ["pending", "auto_pending"])
        .lt("expires_at", now);

      if (!expired?.length) return { expired: 0 };

      await supabase.from("card_approvals")
        .update({ status: "expired" })
        .in("id", expired.map(e => e.id));

      console.log(`Expired ${expired.length} card approvals`);
      return { expired: expired.length };
    });
  }
);
// ── LIFE EVENT CARD TRIGGER ───────────────────────────────────────────────────
export const lifeEventCardTrigger = inngest.createFunction(
  { id: "life-event-card-trigger", name: "Life Event Card Trigger", triggers: [{ event: "tom/life-event.detected" }] },
  async ({ event, step }: any) => {
    const { user_id, contact_id, contact_name, event_type, raw_signal, life_event_id } = event.data;

    const contact = await step.run("get-contact", async () => {
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, full_name, home_address, work_address, relationship_type, key_context, relationship_tag")
        .eq("id", contact_id)
        .eq("user_id", user_id)
        .single();
      return data;
    });

    if (!contact) return { skipped: "contact not found" };

    const address = contact.home_address || contact.work_address;
    if (!address?.streetAddress || !address?.city || !address?.region) {
      return { skipped: "no address on file", contact_name };
    }

    if (life_event_id) {
      const { data: existing } = await supabase
        .from("life_events")
        .select("card_queued")
        .eq("id", life_event_id)
        .single();
      if (existing?.card_queued) return { skipped: "card already queued" };
    }

    const cardMessage = await step.run("draft-card", async () => {
      const eventLabel = event_type.replace(/_/g, " ");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
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
            content: `Write a warm, personal handwritten card message for ${contact.full_name} who just had a life event: ${eventLabel}.

Context: ${contact.key_context || "a valued contact"}
Relationship: ${contact.relationship_tag || contact.relationship_type || "friend"}
What happened: ${raw_signal || eventLabel}

Rules:
- 2-4 sentences max (handwritten card)
- Warm and genuine, not generic
- Reference the specific event naturally
- No sign-off name, no emojis

Return ONLY the card message text.`,
          }],
        }),
      });
      const data = await res.json();
      return data.content?.[0]?.text || `Heard the wonderful news and just had to reach out — so happy for you!`;
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const approval = await step.run("queue-approval", async () => {
      const { data } = await supabase
        .from("card_approvals")
        .insert({
          user_id,
          contact_id,
          contact_name,
          occasion: event_type.replace(/_/g, " "),
          message: cardMessage,
          address: contact.home_address || null,
          work_address: contact.work_address || null,
          status: "pending",
          type: "card",
          trigger_type: "life_event",
          life_event_id: life_event_id || null,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      return data;
    });

    if (life_event_id) {
      await step.run("mark-queued", async () => {
        await supabase
          .from("life_events")
          .update({ card_queued: true, card_approval_id: approval?.id })
          .eq("id", life_event_id);
      });
    }

    return { success: true, contact_name, event_type, approval_id: approval?.id };
  }
);

export const bounceScan = inngest.createFunction(
  { id: "bounce-scan", name: "Daily Bounce Scan", triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }: any) => {
    await step.run("scan-bounces-all-users", async () => {
      const { data } = await supabase
        .from("tom_users")
        .select("id")
        .not("google_access_token", "is", null);

      const userIds = (data || []).map((u: any) => u.id);

      for (const userId of userIds) {
        try {
          await fetch(`${APP_URL}/api/contacts/bounce-scan`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-inngest-user-id": userId,
            },
          });
        } catch (e) {
          console.error(`Bounce scan failed for user ${userId}:`, e);
        }
      }

      return { users_scanned: userIds.length };
    });
  }
);
// ── NETWORK CONTRIBUTION ──────────────────────────────────────────────────────
export const networkContribution = inngest.createFunction(
  { id: "network-contribution", name: "Network Contribution", triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }: any) => {

    // Get all opted-in users
    const users = await step.run("get-opted-in-users", async () => {
      const { data } = await supabase
        .from("tom_users")
        .select("id, network_opt_in, network_consent_version, network_share_personal_signals, network_share_pi_profile, access_token")
        .eq("network_opt_in", true)
        .not("access_token", "is", null);
      return data || [];
    });

    if (!users.length) return { contributed: 0 };

    let totalContributed = 0;

    for (const user of users) {
      const contributed = await step.run(`contribute-user-${user.id}`, async () => {
        // Get this user's contacts
    const { data: contacts } = await supabase
          .from("tom_contacts")
          .select(`
            id, full_name, first_name, last_name,
            email, all_emails, phone, phones,
            home_address, work_address,
            company, job_title, industry, seniority, linkedin_url, twitter_url,
            birthday, topics, tags, intelligence,
            communication_style, best_channel, best_time,
            pi_profile, relationship_type
          `)
          .eq("user_id", user.id)
          .eq("is_self", false)
          .not("full_name", "is", null)
          .not("email", "is", null)
          .limit(500);
        if (!contacts?.length) return 0;

        let count = 0;

        for (const contact of contacts) {
          // Check suppression list first
          const { data: suppressed } = await supabase
            .from("network_suppression")
            .select("id")
            .eq("email", contact.email)
            .eq("processed", true)
            .maybeSingle();

          if (suppressed) continue;

          // Build emails array
          const emails = (contact.all_emails || [contact.email])
            .filter(Boolean)
            .map((e: string) => ({ email: e, type: "unknown", verified: true, last_seen: new Date().toISOString() }));

          // Build phones array
          const phones = contact.phones?.length
            ? contact.phones.map((p: any) => ({ number: p.number, type: p.type, verified: true, last_seen: new Date().toISOString() }))
            : contact.phone
            ? [{ number: contact.phone, type: "unknown", verified: true, last_seen: new Date().toISOString() }]
            : [];

          // Fields always contributed
          const networkData: any = {
            full_name: contact.full_name,
            first_name: contact.first_name || contact.full_name?.split(" ")[0],
            last_name: contact.last_name || contact.full_name?.split(" ").slice(1).join(" "),
            emails,
            phones,
            home_address: contact.home_address || null,
            work_address: contact.work_address || null,
            company: contact.company || null,
            job_title: contact.job_title || null,
            industry: contact.industry || null,
            seniority: contact.seniority || null,
            linkedin_url: contact.linkedin_url || null,
            twitter_url: contact.twitter_url || null,
            birthday: contact.birthday || null,
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const fieldsContributed = ["email", "phone", "home_address", "work_address", "company", "job_title", "birthday"];

          // Personal signals — only if user opted in
          if (user.network_share_personal_signals) {
            const intel = contact.intelligence || {};
            networkData.interests = contact.topics || [];
            networkData.sports_teams = intel.sports?.teams || [];
            networkData.pets = intel.pets || [];
            networkData.family = intel.family || null;
            networkData.education = intel.education || null;
            networkData.hobbies = intel.interests?.hobbies || [];
            networkData.communication_style = contact.communication_style || null;
            networkData.best_channel = contact.best_channel || null;
            networkData.best_time = contact.best_time || null;
            fieldsContributed.push("personal_signals");
          }

          // PI profile — only if user opted in
          if (user.network_share_pi_profile && contact.pi_profile) {
            networkData.pi_profile = contact.pi_profile;
            fieldsContributed.push("pi_profile");
          }

          // Try to find existing network contact by email
          const emailList = emails.map((e: any) => e.email);
          let existingId: string | null = null;

          for (const email of emailList) {
            const { data: existing } = await supabase
              .from("network_contacts")
              .select("id, contributor_count, confidence_score")
              .filter("emails", "cs", JSON.stringify([{ email }]))
              .maybeSingle();

            if (existing) {
              existingId = existing.id;

              // Update existing — increment confidence
              const newScore = Math.min(95, (existing.confidence_score || 50) + 5);
              await supabase
                .from("network_contacts")
                .update({
                  ...networkData,
                  contributor_count: (existing.contributor_count || 1) + 1,
                  confidence_score: newScore,
                  consent_version: user.network_consent_version || "1.0",
                })
                .eq("id", existingId);

              break;
            }
          }

          if (!existingId) {
            // Insert new network contact
            const { data: inserted } = await supabase
              .from("network_contacts")
              .insert({
                ...networkData,
                contributor_count: 1,
                confidence_score: 50,
                consent_version: user.network_consent_version || "1.0",
                data_sources: ["humble_hello"],
              })
              .select("id")
              .single();

            existingId = inserted?.id;
          }

          // Record contribution
          if (existingId) {
            await supabase.from("network_contributions").insert({
              network_contact_id: existingId,
              contributed_by_user_id: user.id,
              fields_contributed: fieldsContributed,
              contribution_type: "update",
              consent_version: user.network_consent_version || "1.0",
            });
            count++;
          }
        }

        return count;
      });

      totalContributed += contributed;
    }

    return { users: users.length, contributed: totalContributed };
  }
);

 // ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Calculates staggered send times for the day.
 * Spreads N sends between 7am–3pm in the user's timezone,
 * with small random jitter to avoid robotic patterns.
 */
function buildSendSchedule(count: number, userTimezone: string): Date[] {
  const START_HOUR = 7;   // 7am
  const END_HOUR = 15;    // 3pm
  const WINDOW_MINUTES = (END_HOUR - START_HOUR) * 60; // 480 min

  const now = new Date();

  // Get today's 7am in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: userTimezone,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find(p => p.type === "day")!.value);

  // 7am local time expressed as UTC Date
  const localStart = new Date(Date.UTC(year, month, day, START_HOUR, 0, 0));
  const tzOffset = localStart.getTime() - new Date(`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(START_HOUR).padStart(2,"0")}:00:00`).getTime();
  const windowStart = new Date(localStart.getTime() - tzOffset);

  const interval = Math.floor(WINDOW_MINUTES / Math.max(count, 1));
  const times: Date[] = [];

  for (let i = 0; i < count; i++) {
    const jitterMinutes = Math.floor(Math.random() * 8) - 4; // ±4 min jitter
    const minutesOffset = (i * interval) + jitterMinutes;
    const sendTime = new Date(windowStart.getTime() + minutesOffset * 60 * 1000);

    // Never send before windowStart or after 3pm
    const clampedTime = new Date(
      Math.min(
        Math.max(sendTime.getTime(), windowStart.getTime()),
        windowStart.getTime() + WINDOW_MINUTES * 60 * 1000
      )
    );

    // If the time has already passed today, send as soon as possible
    times.push(clampedTime < now ? new Date(now.getTime() + (i + 1) * 60 * 1000) : clampedTime);
  }

  return times;
}

/**
 * Injects open pixel + wraps links with click tracking.
 * Plain text emails get an appended pixel URL only.
 */
async function injectTracking(
  body: string,
  enrollmentId: string,
  isHtml: boolean
): Promise<string> {
  const { createOpenTrackingUrl, createClickTrackingUrl } = await import("./campaign-tracking");

  if (!isHtml) {
    // Plain text — just append pixel as invisible image hint (some clients render)
    const pixelUrl = await createOpenTrackingUrl(enrollmentId);
    return `${body}\n\n<img src="${pixelUrl}" width="1" height="1" style="display:none" alt=""/>`;
  }

  // Replace links
  const linkRegex = /href="(https?:\/\/[^"]+)"/g;
  const matches = [...body.matchAll(linkRegex)];
  const replacements: { original: string; tracked: string }[] = [];

  for (const match of matches) {
    const original = match[1];
    if (!original.includes("/t/") && !original.includes("/o/")) {
      const tracked = await createClickTrackingUrl(enrollmentId, original);
      replacements.push({ original, tracked });
    }
  }

  let result = body;
  for (const { original, tracked } of replacements) {
    result = result.replaceAll(`href="${original}"`, `href="${tracked}"`);
  }

  const pixelUrl = await createOpenTrackingUrl(enrollmentId);
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt=""/>`;
  result = result.includes("</body>")
    ? result.replace("</body>", `${pixel}</body>`)
    : result + pixel;

  return result;
}

/**
 * Evaluates an if/else branch condition against the enrollment's event history.
 */
async function evaluateBranchCondition(
  condition: string,
  enrollmentId: string
): Promise<boolean> {
  const { data: events } = await supabase
    .from("campaign_events")
    .select("event_type")
    .eq("enrollment_id", enrollmentId);

  const types = new Set((events || []).map((e: any) => e.event_type));

  switch (condition) {
    case "opened":       return types.has("open");
    case "not_opened":   return !types.has("open");
    case "clicked":      return types.has("click");
    case "not_clicked":  return !types.has("click");
    case "replied":      return types.has("reply");
    case "not_replied":  return !types.has("reply");
    default:             return false;
  }
}

// ── MAIN FUNCTION ─────────────────────────────────────────────────────────────

export const campaignSender = inngest.createFunction(
  {
    id: "campaign-sender",
    name: "Campaign Sender",
    triggers: [
      { cron: "0 13 * * 1-5" }, // 8am ET (1pm UTC), weekdays
      { event: "tom/campaign.send.now" }, // on-demand trigger on launch
    ],
  },
  async ({ step }: any) => {

    // ── Step 1: Load all active campaigns ─────────────────────────────────
    const activeCampaigns = await step.run("load-active-campaigns", async () => {
      const { data } = await supabase
        .from("campaigns")
        .select(`
          id, user_id, name, status,
          reply_behavior,
          tom_users!inner (
            id, name, email, timezone,
            stripe_price_id
          )
        `)
        .eq("status", "active");

      // Filter to Growth tier only
      // TODO: re-enable Growth tier gating before launch
      // const GROWTH_PRICE_IDS = [
      //   process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
      //   process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
      // ].filter(Boolean);

      return data || [];
    });

    if (!activeCampaigns.length) return { processed: 0, message: "No active campaigns" };

    // Check if we're within the send window (7am–3pm ET)
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hourET = nowET.getHours();
    if (hourET < 7 || hourET >= 20) {
      return { processed: 0, message: "Outside send window (7am–3pm ET)" };
    }

    let totalSent = 0;
    let totalFailed = 0;

    // ── Step 2: Process each campaign ─────────────────────────────────────
    for (const campaign of activeCampaigns) {
      const user = campaign.tom_users;
      const timezone = user.timezone || "America/Indianapolis";

      const result = await step.run(`process-campaign-${campaign.id}`, async () => {
        // Check how many emails already sent today for this campaign
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { count: sentToday } = await supabase
          .from("campaign_events")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("event_type", "email_sent")
          .gte("created_at", todayStart.toISOString());

        const remainingToday = 25 - (sentToday || 0);
        if (remainingToday <= 0) {
          return { sent: 0, skipped: 0, reason: "daily cap reached" };
        }

            // Fix: re-query excluding opted out properly
        const { data: activeEnrollments } = await supabase
          .from("campaign_enrollments")
          .select(`
            id, contact_id, current_step_id, status, next_send_at,
            tom_contacts (
              id, full_name, email, first_name
            )
          `)
          .eq("campaign_id", campaign.id)
          .eq("status", "active")
          .is("opted_out_at", null)
          .lte("next_send_at", new Date().toISOString())
          .limit(remainingToday);

        if (!activeEnrollments?.length) {
          return { sent: 0, skipped: 0, reason: "no due enrollments" };
        }

        // Build staggered send schedule for today
        const sendTimes = buildSendSchedule(activeEnrollments.length, timezone);

        // Load all steps for this campaign once
        const { data: allSteps } = await supabase
          .from("campaign_steps")
          .select("*")
          .eq("campaign_id", campaign.id)
          .order("step_order", { ascending: true });

        const steps = allSteps || [];

        // Load user record for signature (sendUserEmail handles auth internally)
const { data: userRecord } = await supabase
  .from("tom_users")
  .select("name, email, gmail_signature")
  .eq("id", user.id)
  .single();

        let sent = 0;
        let skipped = 0;

        for (let i = 0; i < activeEnrollments.length; i++) {
          const enrollment = activeEnrollments[i];
          const contact = (enrollment as any).tom_contacts;

          const contactEmail = contact.email;
          if (!contactEmail) { skipped++; continue; }

          // Find current step
          const currentStep = steps.find((s: any) => s.id === enrollment.current_step_id)
            || steps[0];

          if (!currentStep) { skipped++; continue; }

          const scheduledAt = sendTimes[i];

          // Process the step
          switch (currentStep.step_type) {

            case "send_email": {
  const firstName = contact.full_name?.split(" ")[0] || "there";

  // Personalize subject + body
  const subject = (currentStep.subject || "")
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{full_name\}\}/g, contact.full_name || "");

  const bodyText = (currentStep.body || "")
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{full_name\}\}/g, contact.full_name || "");

  // Convert plain text to minimal HTML paragraphs
  const bodyHtml = bodyText
    .split(/\n\n+/)
    .map((p: string) => `<p style="margin:0 0 16px 0;line-height:1.6;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  // Signature
  const signature = userRecord?.gmail_signature || "";
  const signatureHtml = signature
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:13px;color:#666;">${signature.replace(/\n/g, "<br>")}</div>`
    : "";

  // Tracking
  const { createOpenTrackingUrl: openUrl, createClickTrackingUrl: clickUrl } = await import("./campaign-tracking");
  const pixelUrl = await openUrl(enrollment.id);
  const optOutUrl = `${APP_URL}/optout/${enrollment.id}`;

  // Wrap links with click tracking
  let trackedBodyHtml = bodyHtml;
  for (const match of [...bodyHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)]) {
    const original = match[1];
    if (!original.includes('/t/') && !original.includes('/o/') && !original.includes('optout')) {
      try {
        const tracked = await clickUrl(enrollment.id, original);
        trackedBodyHtml = trackedBodyHtml.replace(`href="${original}"`, `href="${tracked}"`);
      } catch {}
    }
  }

  // Footer
  const footerHtml = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;line-height:1.6;">Sent via <a href="https://humblehello.com" style="color:#999;">Humble Hello</a> &nbsp;&middot;&nbsp; <a href="${optOutUrl}" style="color:#999;">Opt out of this campaign</a></div><img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  // Full HTML email
  const htmlEmail = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:32px 24px;font-size:15px;color:#1a1a1a;line-height:1.6;">${trackedBodyHtml}${signatureHtml}${footerHtml}</div></body></html>`;

  // Respect stagger time
  const msUntilSend = scheduledAt.getTime() - Date.now();
  if (msUntilSend > 0) {
    await new Promise(r => setTimeout(r, Math.min(msUntilSend, 60_000)));
  }

  // Send via the user's primary email provider (Google or Microsoft)
  const { sendUserEmail } = await import("./email-provider");
  const recipient = `${contact.full_name} <${contactEmail}>`;

  let sendOk = false;
  let sendError = "";
  try {
    await sendUserEmail({
      userId: user.id,
      to: recipient,
      subject,
      text: bodyText,
      html: htmlEmail,
    });
    sendOk = true;
  } catch (e: any) {
    sendError = e?.message || String(e);
    console.error(`[campaign-sender] send failed for enrollment ${enrollment.id}:`, sendError);
  }

  if (sendOk) {
    // Log send event
    await supabase.from("campaign_events").insert({
      campaign_id: campaign.id,
      enrollment_id: enrollment.id,
      contact_id: contact.id,
      step_id: currentStep.id,
      event_type: "email_sent",
      metadata: { subject, scheduled_at: scheduledAt.toISOString() },
    });

    // Advance to next step
    const nextStep = steps.find((s: any) => s.step_order === currentStep.step_order + 1);
    await supabase
      .from("campaign_enrollments")
      .update({
        current_step_id: nextStep?.id || null,
        next_send_at: nextStep ? new Date().toISOString() : null,
        status: nextStep ? "active" : "completed",
        completed_at: nextStep ? null : new Date().toISOString(),
      })
      .eq("id", enrollment.id);

    sent++;
  } else {
    await supabase.from("campaign_events").insert({
      campaign_id: campaign.id,
      enrollment_id: enrollment.id,
      contact_id: contact.id,
      step_id: currentStep.id,
      event_type: "email_failed",
      metadata: { error: sendError },
    });

    skipped++;
  }
  break;
}

            case "wait": {
              const days = currentStep.wait_days || 1;
              const nextSendAt = new Date();
              nextSendAt.setDate(nextSendAt.getDate() + days);

              const nextStep = steps.find((s: any) => s.step_order === currentStep.step_order + 1);

              await supabase
                .from("campaign_enrollments")
                .update({
                  current_step_id: nextStep?.id || enrollment.current_step_id,
                  next_send_at: nextSendAt.toISOString(),
                })
                .eq("id", enrollment.id);

              break;
            }

            case "send_card": {
              const address = await supabase
                .from("tom_contacts")
                .select("home_address, work_address")
                .eq("id", contact.id)
                .single();

              const addr = address.data?.home_address || address.data?.work_address;
              if (addr?.streetAddress && addr?.city && addr?.region && addr?.postalCode) {
                // Read card fields from the columns directly (not from a config blob)
                const cardConfig = {
                  occasion: currentStep.card_occasion,
                  message: currentStep.card_message,
                  card_id: currentStep.card_id,
                };

                // Budget check
                const CARD_COST = 4.75;
                const { data: campData } = await supabase
                  .from("campaigns")
                  .select("card_budget, no_budget_cap")
                  .eq("id", campaign.id)
                  .single();

                const budgetCap = campData?.card_budget;
                const noBudgetCap = campData?.no_budget_cap;

                if (!noBudgetCap && budgetCap) {
                  const { count: cardsSent } = await supabase
                    .from("campaign_events")
                    .select("id", { count: "exact", head: true })
                    .eq("campaign_id", campaign.id)
                    .eq("event_type", "card_sent");

                  const spent = (cardsSent || 0) * CARD_COST;
                  if (spent + CARD_COST > budgetCap) {
                    await supabase.from("campaign_events").insert({
                      campaign_id: campaign.id,
                      enrollment_id: enrollment.id,
                      contact_id: contact.id,
                      step_id: currentStep.id,
                      event_type: "card_skipped",
                      metadata: { reason: "budget_reached", budget: budgetCap, spent },
                    });
                    const nextStepB = steps.find((s: any) => s.step_order === currentStep.step_order + 1);
                    await supabase.from("campaign_enrollments").update({
                      current_step_id: nextStepB?.id || null,
                      next_send_at: nextStepB ? new Date().toISOString() : null,
                      status: nextStepB ? "active" : "completed",
                      completed_at: nextStepB ? null : new Date().toISOString(),
                    }).eq("id", enrollment.id);
                    break;
                  }
                }

                // Personalize card with AI using contact context
                let message = (cardConfig.message || "Thinking of you!")
                  .replace(/\{\{first_name\}\}/g, contact.first_name || contact.full_name?.split(" ")[0] || "there");

                try {
                  const { data: contactDetail } = await supabase
                    .from("tom_contacts")
                    .select("key_context, topics, intelligence, relationship_type, met_where")
                    .eq("id", contact.id)
                    .single();

                  if (contactDetail?.key_context || contactDetail?.topics?.length) {
                    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
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
                          content: `Personalize this handwritten card message for ${contact.full_name}.\n\nTemplate: "${message}"\nOccasion: ${cardConfig.occasion || "Thinking of you"}\nWhat we know: ${contactDetail?.key_context || ""}\nInterests: ${(contactDetail?.topics || []).join(", ")}\nRelationship: ${contactDetail?.relationship_type || "contact"}\nMet where: ${contactDetail?.met_where || ""}\n\nRewrite to feel more personal and specific. Reference something real if it fits naturally. 2-3 sentences, warm, genuine. No sign-off. Return ONLY the card message text.`,
                        }],
                      }),
                    });
                    const aiData = await aiRes.json();
                    const personalized = aiData.content?.[0]?.text?.trim();
                    if (personalized) message = personalized;
                  }
                } catch (e) {
                  console.error("[campaign-sender] card personalization failed:", e);
                }

                await fetch(`${APP_URL}/api/cards/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Cookie: `tom_session=${user.id}` },
                  body: JSON.stringify({
                    contact_id: contact.id,
                    contact_name: contact.full_name,
                    occasion: cardConfig.occasion || "Campaign",
                    message,
                    address: addr,
                    card_id: cardConfig.card_id || null,
                    trigger_type: "campaign",
                    requires_approval: false,
                  }),
                });

                await supabase.from("campaign_events").insert({
                  campaign_id: campaign.id,
                  enrollment_id: enrollment.id,
                  contact_id: contact.id,
                  step_id: currentStep.id,
                  event_type: "card_sent",
                  metadata: { occasion: cardConfig.occasion },
                });
              } else {
                // No valid address — log skip so we can see why
                await supabase.from("campaign_events").insert({
                  campaign_id: campaign.id,
                  enrollment_id: enrollment.id,
                  contact_id: contact.id,
                  step_id: currentStep.id,
                  event_type: "card_skipped",
                  metadata: { reason: "no valid address" },
                });
              }

              // Advance
              const nextStep = steps.find((s: any) => s.step_order === currentStep.step_order + 1);
              await supabase
                .from("campaign_enrollments")
                .update({
                  current_step_id: nextStep?.id || null,
                  next_send_at: nextStep ? new Date().toISOString() : null,
                  status: nextStep ? "active" : "completed",
                  completed_at: nextStep ? null : new Date().toISOString(),
                })
                .eq("id", enrollment.id);

              break;
            }

            case "send_gift": {
              // Placeholder — log and advance
              await supabase.from("campaign_events").insert({
                campaign_id: campaign.id,
                enrollment_id: enrollment.id,
                contact_id: contact.id,
                step_id: currentStep.id,
                event_type: "gift_skipped",
                metadata: { reason: "gifts not yet implemented" },
              });

              const nextStep = steps.find((s: any) => s.step_order === currentStep.step_order + 1);
              await supabase
                .from("campaign_enrollments")
                .update({
                  current_step_id: nextStep?.id || null,
                  next_send_at: nextStep ? new Date().toISOString() : null,
                  status: nextStep ? "active" : "completed",
                })
                .eq("id", enrollment.id);
              break;
            }

            case "branch": {
              const condition = currentStep.branch_condition || "opened";
              const matched = await evaluateBranchCondition(condition, enrollment.id);

              const nextStepId = matched
                ? currentStep.branch_true_step_id
                : currentStep.branch_false_step_id;

              const nextStep = steps.find((s: any) => s.id === nextStepId)
                || steps.find((s: any) => s.step_order === currentStep.step_order + 1);

              await supabase
                .from("campaign_enrollments")
                .update({
                  current_step_id: nextStep?.id || null,
                  next_send_at: new Date().toISOString(),
                  status: nextStep ? "active" : "completed",
                })
                .eq("id", enrollment.id);

              break;
            }

            case "end": {
              await supabase
                .from("campaign_enrollments")
                .update({
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  current_step_id: null,
                })
                .eq("id", enrollment.id);

              await supabase.from("campaign_events").insert({
                campaign_id: campaign.id,
                enrollment_id: enrollment.id,
                contact_id: contact.id,
                step_id: currentStep.id,
                event_type: "sequence_completed",
                metadata: {},
              });
              break;
            }
          }
        }

        // Check if campaign is fully complete (all enrollments done)
        const { count: remaining } = await supabase
          .from("campaign_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "active");

        if ((remaining || 0) === 0) {
          await supabase
            .from("campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", campaign.id);
        }

        return { sent, skipped };
      });

      totalSent += result.sent || 0;
      totalFailed += result.skipped || 0;
    }

    return {
      campaigns_processed: activeCampaigns.length,
      total_sent: totalSent,
      total_failed: totalFailed,
    };
  }
);

// ── CAMPAIGN ENROLL ───────────────────────────────────────────────────────────
// Triggered when a campaign is launched — enrolls all contacts from audiences

export const campaignEnroll = inngest.createFunction(
  {
    id: "campaign-enroll",
    name: "Campaign Enroll Contacts",
    triggers: [{ event: "tom/campaign.launch" }],
  },
  async ({ event, step }: any) => {
    const { campaign_id, user_id } = event.data;

    // Load campaign + audiences
    const campaign = await step.run("load-campaign", async () => {
      const { data } = await supabase
        .from("campaigns")
        .select(`
          id, user_id, status,
          campaign_audiences (
            audience_id,
            audiences (
              id,
              audience_contacts ( contact_id )
            )
          )
        `)
        .eq("id", campaign_id)
        .eq("user_id", user_id)
        .single();
      return data;
    });

    if (!campaign) {
      return { skipped: true, reason: "campaign not found" };
    }

    // Collect all contact IDs across audiences — deduplicated
    const allContactIds: string[] = [];
    const seen = new Set<string>();

    for (const ca of campaign.campaign_audiences || []) {
      for (const ac of ca.audiences?.audience_contacts || []) {
        if (!seen.has(ac.contact_id)) {
          seen.add(ac.contact_id);
          allContactIds.push(ac.contact_id);
        }
      }
    }

    // Enforce 250 contact cap
    const contactIds = allContactIds.slice(0, 250);

    if (!contactIds.length) {
      return { enrolled: 0, reason: "no contacts in audiences" };
    }

    // Get first step
    const { data: firstStep } = await supabase
      .from("campaign_steps")
      .select("id")
      .eq("campaign_id", campaign_id)
      .order("step_order", { ascending: true })
      .limit(1)
      .single();

    if (!firstStep) {
      return { enrolled: 0, reason: "no steps defined" };
    }

    // Check for existing enrollments (avoid re-enrolling)
    const { data: existing } = await supabase
      .from("campaign_enrollments")
      .select("contact_id")
      .eq("campaign_id", campaign_id)
      .in("contact_id", contactIds);

    const alreadyEnrolled = new Set((existing || []).map((e: any) => e.contact_id));
    const toEnroll = contactIds.filter(id => !alreadyEnrolled.has(id));

    if (!toEnroll.length) {
      return { enrolled: 0, reason: "all contacts already enrolled" };
    }

    // Insert enrollments in chunks
    const CHUNK = 50;
    let enrolled = 0;

    for (let i = 0; i < toEnroll.length; i += CHUNK) {
      const chunk = toEnroll.slice(i, i + CHUNK);
      await step.run(`enroll-chunk-${i}`, async () => {
        const rows = chunk.map((contact_id: string) => ({
          campaign_id,
          contact_id,
          user_id,
          status: "active",
          current_step_id: firstStep.id,
          next_send_at: new Date().toISOString(), // ready to send immediately
          enrolled_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("campaign_enrollments")
          .insert(rows);

        if (error) console.error("[campaign-enroll] insert error:", error);
        return { chunk_enrolled: chunk.length };
      });
      enrolled += chunk.length;
    }

    return { campaign_id, enrolled, total_contacts: contactIds.length };
  }
);

// ── CAMPAIGN OPT-OUT ──────────────────────────────────────────────────────────
// Called from the opt-out link in email footer

export const campaignOptOut = inngest.createFunction(
  {
    id: "campaign-opt-out",
    name: "Campaign Opt Out",
    triggers: [{ event: "tom/campaign.optout" }],
  },
  async ({ event, step }: any) => {
    const { enrollment_id, scope } = event.data;
    // scope = "campaign" | "all"

    await step.run("process-optout", async () => {
      const { data: enrollment } = await supabase
        .from("campaign_enrollments")
        .select("id, campaign_id, contact_id, user_id")
        .eq("id", enrollment_id)
        .single();

      if (!enrollment) return { skipped: true };

      // Mark enrollment as opted out
      await supabase
        .from("campaign_enrollments")
        .update({
          status: "opted_out",
          opted_out_at: new Date().toISOString(),
          opted_out_type: scope,
        })
        .eq("id", enrollment_id);

      // Log event
      await supabase.from("campaign_events").insert({
        campaign_id: enrollment.campaign_id,
        enrollment_id,
        contact_id: enrollment.contact_id,
        event_type: "opt_out",
        metadata: { scope },
      });

      // If scope = "all", flag the contact globally
      if (scope === "all") {
        await supabase
          .from("tom_contacts")
          .update({
            campaign_opt_out: true,
            campaign_opt_out_at: new Date().toISOString(),
          })
          .eq("id", enrollment.contact_id)
          .eq("user_id", enrollment.user_id);
      }

      return { opted_out: true, scope };
    });

    return { enrollment_id, scope };
  }
);
// ── TIER SNAPSHOT ─────────────────────────────────────────────────────────────
// Nightly backup of tier/bucket state so we can restore if something wipes it.
// Runs at 6am ET (11am UTC) — BEFORE the 8am scorer, so we capture yesterday's
// good state before the scorer has a chance to modify anything.
export const tierSnapshot = inngest.createFunction(
  { id: "tier-snapshot", name: "Tier State Snapshot", triggers: [{ cron: "0 11 * * *" }] },
  async ({ step }: any) => {
    await step.run("snapshot-all-users", async () => {
      const { data: users } = await supabase
        .from("tom_users")
        .select("id")
        .not("google_access_token", "is", null);

      const results: any[] = [];
      for (const user of users || []) {
        try {
          const { data, error } = await supabase.rpc("snapshot_tier_state", { p_user_id: user.id });
          if (error) {
            console.error(`[tier-snapshot] failed for user ${user.id}:`, error);
          } else {
            results.push({ user_id: user.id, ...data });
          }
        } catch (e) {
          console.error(`[tier-snapshot] exception for user ${user.id}:`, e);
        }
      }
      return { users: users?.length || 0, results };
    });
  }
);
// ─────────────────────────────────────────────────────────────────────────────
// MICROSOFT 365 / OUTLOOK INTEGRATION
// Mirrors Google scan/sync functions for users on Microsoft as their primary
// email provider.
// ─────────────────────────────────────────────────────────────────────────────

// ── MICROSOFT MAIL SCAN ──────────────────────────────────────────────────────
export const microsoftMailScan = inngest.createFunction(
  {
    id: "microsoft-mail-scan",
    name: "Microsoft Mail Scan",
    triggers: [
      { event: "tom/microsoft.mail.scan" },
      { cron: "*/15 * * * *" },
    ],
  },
  async ({ event, step }: any) => {
    const { scanMicrosoftMail } = await import("./microsoft/mail");

    const userIds = await step.run("resolve-users", async () => {
      if (event.data?.userId) return [event.data.userId as string];
      const { data } = await supabase
        .from("tom_users")
        .select("id")
        .not("microsoft_refresh_token", "is", null);
      return (data ?? []).map((u: any) => u.id);
    });

    let totalScanned = 0;

    for (const userId of userIds) {
      const result = await step.run(`scan-${userId}`, async () => {
        const { data: user } = await supabase
          .from("tom_users")
          .select("microsoft_messages_delta_link")
          .eq("id", userId)
          .single();

        const { messages, newDeltaLink } = await scanMicrosoftMail(
          userId,
          user?.microsoft_messages_delta_link ?? null
        );

        if (newDeltaLink) {
          await supabase
            .from("tom_users")
            .update({
              microsoft_messages_delta_link: newDeltaLink,
              microsoft_mail_last_synced_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }

        if (messages.length > 0) {
          await inngest.send(
            messages.map((m: any) => ({
              name: "tom/microsoft.mail.message.received",
              data: { userId, messageId: m.id, message: m },
            }))
          );
        }

        return { userId, count: messages.length };
      });

      totalScanned += result.count;
    }

    return { users: userIds.length, messages: totalScanned };
  }
);

// ── MICROSOFT CONTACTS SYNC ──────────────────────────────────────────────────
export const microsoftContactsSync = inngest.createFunction(
  {
    id: "microsoft-contacts-sync",
    name: "Microsoft Contacts Sync",
    triggers: [
      { event: "tom/microsoft.contacts.sync" },
      { cron: "0 */6 * * *" },
    ],
  },
  async ({ event, step }: any) => {
    const { syncMicrosoftContacts, flattenGraphContact } = await import(
      "./microsoft/contacts"
    );

    const userIds = await step.run("resolve-users", async () => {
      if (event.data?.userId) return [event.data.userId as string];
      const { data } = await supabase
        .from("tom_users")
        .select("id")
        .not("microsoft_refresh_token", "is", null);
      return (data ?? []).map((u: any) => u.id);
    });

    const results: Array<{ userId: string; upserted: number; deleted: number }> = [];

    for (const userId of userIds) {
      const result = await step.run(`sync-${userId}`, async () => {
        const { data: user } = await supabase
          .from("tom_users")
          .select("microsoft_contacts_delta_link")
          .eq("id", userId)
          .single();

        const { upserted, deleted, newDeltaLink } = await syncMicrosoftContacts(
          userId,
          user?.microsoft_contacts_delta_link ?? null
        );

        if (upserted.length > 0) {
          const rows = upserted.map((c: any) => ({
            user_id: userId,
            ...flattenGraphContact(c),
            microsoft_last_synced_at: new Date().toISOString(),
          }));

          await supabase
            .from("tom_contacts")
            .upsert(rows, { onConflict: "user_id,microsoft_contact_id" });
        }

        if (deleted.length > 0) {
          await supabase
            .from("tom_contacts")
            .delete()
            .eq("user_id", userId)
            .in("microsoft_contact_id", deleted);
        }

        if (newDeltaLink) {
          await supabase
            .from("tom_users")
            .update({
              microsoft_contacts_delta_link: newDeltaLink,
              microsoft_contacts_last_synced_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }

        return {
          userId,
          upserted: upserted.length,
          deleted: deleted.length,
        };
      });

      results.push(result);
    }

    return { results };
  }
);

// ── MICROSOFT CALENDAR SCAN ──────────────────────────────────────────────────
export const microsoftCalendarScan = inngest.createFunction(
  {
    id: "microsoft-calendar-scan",
    name: "Microsoft Calendar Scan",
    triggers: [
      { event: "tom/microsoft.calendar.scan" },
      { cron: "0 */4 * * *" },
    ],
  },
  async ({ event, step }: any) => {
    const { scanMicrosoftCalendar, extractAttendeeEmails } = await import(
      "./microsoft/calendar"
    );

    const userIds = await step.run("resolve-users", async () => {
      if (event.data?.userId) return [event.data.userId as string];
      const { data } = await supabase
        .from("tom_users")
        .select("id")
        .not("microsoft_refresh_token", "is", null);
      return (data ?? []).map((u: any) => u.id);
    });

    let totalEvents = 0;

    for (const userId of userIds) {
      const result = await step.run(`scan-${userId}`, async () => {
        const { data: user } = await supabase
          .from("tom_users")
          .select("microsoft_events_delta_link")
          .eq("id", userId)
          .single();

        const { events, deleted, newDeltaLink } = await scanMicrosoftCalendar(
          userId,
          user?.microsoft_events_delta_link ?? null
        );

        if (newDeltaLink) {
          await supabase
            .from("tom_users")
            .update({
              microsoft_events_delta_link: newDeltaLink,
              microsoft_calendar_last_synced_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }

        if (events.length > 0) {
          await inngest.send(
            events
              .filter((e: any) => !e.isCancelled)
              .map((e: any) => ({
                name: "tom/microsoft.calendar.event.observed",
                data: {
                  userId,
                  eventId: e.id,
                  attendees: extractAttendeeEmails(e),
                  event: e,
                },
              }))
          );
        }

        return { userId, events: events.length, deleted: deleted.length };
      });

      totalEvents += result.events;
    }

    return { users: userIds.length, events: totalEvents };
  }
);