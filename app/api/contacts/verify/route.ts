import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { buildVerificationEmail } from "../../../lib/email-template";
import { sendUserEmail } from "../../../lib/email-provider";

const DAILY_SEND_LIMIT = 20;
const DAILY_COLD_LIMIT = 5;
const SEND_DELAY_MS = 10000;

// Sequence timing
const ATTEMPT_2_WAIT_DAYS = 25;
const ATTEMPT_3_WAIT_DAYS = 90;
const LOCK_AFTER_VERIFIED_MONTHS = 18;
const REENROLL_AFTER_MONTHS = 12;
const MAX_ATTEMPTS = 3;

const EMAIL_SUBJECTS = [
  "Verifying Contact Info",
  "Verifying Contact Details",
  "Can you confirm contact details?",
  "Do I have your correct contact info?",
  "Making Sure I Have Your Most Up To Date Info",
  "Confirm your contact info?",
  "Quick check - Do I have your contact info right?",
  "Is your contact info current?",
];

const EMAIL_SUBJECTS_ATTEMPT_2 = [
  "Following up on my contact info request",
  "Just checking in — do I have your info right?",
  "One more check on your contact details",
  "Still hoping to confirm your info",
];

const EMAIL_OPENERS = [
  "I'm using Humble Hello to do a quick cleanup on my contacts and want to make sure I've got your info right. Would you mind taking 30 seconds to confirm or fix it?",
  "I'm updating my contact records using Humble Hello, and want to be sure I've got the right details for you. Can you take 30 seconds to confirm?",
  "I'm using Humble Hello to make sure my contacts are clean and accurate — can you take 30 seconds to confirm your details?",
  "I'm using Humble Hello to take a fresh look at how I stay connected — can you take 30 seconds to confirm your contact details so I get it right?",
  "I want to make sure I have your contact details right — can you take 30 seconds to confirm?",
  "I might have outdated info for you — can you take 30 seconds to confirm or fix it?",
  "I realized I might be working off old info for you — can you take 30 seconds to make sure I've got it right?",
];

const EMAIL_OPENERS_ATTEMPT_2 = [
  "I sent a quick note a few weeks ago about confirming your contact info — I still want to make sure I have it right. Would you mind taking 30 seconds?",
  "Following up on my earlier request — I just want to make sure I have your most current details. Takes about 30 seconds.",
  "I know you're busy, but I'd love to make sure I have your current info. Just 30 seconds if you have a moment.",
];

function getRandomSubject(attempt: number): string {
  const subjects = attempt >= 2 ? EMAIL_SUBJECTS_ATTEMPT_2 : EMAIL_SUBJECTS;
  return subjects[Math.floor(Math.random() * subjects.length)];
}

function getRandomOpener(attempt: number): string {
  const openers = attempt >= 2 ? EMAIL_OPENERS_ATTEMPT_2 : EMAIL_OPENERS;
  return openers[Math.floor(Math.random() * openers.length)];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isEligibleForVerification(contact: any): { eligible: boolean; reason?: string } {
  const now = new Date();

  if (contact.verified_at) {
    const verifiedAt = new Date(contact.verified_at);
    const monthsSinceVerified = (now.getTime() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceVerified < LOCK_AFTER_VERIFIED_MONTHS) {
      return { eligible: false, reason: `verified ${Math.floor(monthsSinceVerified)} months ago` };
    }
  }

  if (contact.verification_next_eligible_at) {
    const nextEligible = new Date(contact.verification_next_eligible_at);
    if (nextEligible > now) {
      return { eligible: false, reason: `next eligible ${nextEligible.toLocaleDateString()}` };
    }
  }

  if ((contact.verification_attempts || 0) >= MAX_ATTEMPTS) {
    if (contact.verification_sequence_reset_at) {
      const resetAt = new Date(contact.verification_sequence_reset_at);
      if (resetAt > now) {
        return { eligible: false, reason: "sequence complete — re-enrolls in 12 months" };
      }
    } else {
      return { eligible: false, reason: "max attempts reached" };
    }
  }

  return { eligible: true };
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value || cookieStore.get("tom_user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { contactIds, draftOnly = false, batch_size } = body;

  const { data: user } = await supabase
    .from("tom_users")
    .select("name, email")
    .eq("id", userId)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check daily quota
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: sentToday } = await supabase
    .from("tom_verifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "sent")
    .gte("sent_at", todayStart.toISOString());

  const remainingQuota = DAILY_SEND_LIMIT - (sentToday || 0);

  if (remainingQuota <= 0) {
    return NextResponse.json({
      success: true, sent: 0, drafted: 0,
      message: `Daily limit of ${DAILY_SEND_LIMIT} emails reached. Try again tomorrow.`,
    });
  }

  // Count cold-contact sends today (separate sub-cap to protect domain reputation)
  const { count: coldSentToday } = await supabase
    .from("tom_verifications")
    .select("*, tom_contacts!inner(email_count)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "sent")
    .gte("sent_at", todayStart.toISOString())
    .or("email_count.is.null,email_count.eq.0", { foreignTable: "tom_contacts" });

  let remainingColdQuota = DAILY_COLD_LIMIT - (coldSentToday || 0);

  // Get contacts to verify
  let contacts: any[] = [];

  if (contactIds?.length > 0) {
    const { data } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .in("id", contactIds)
      .not("email", "is", null);
    contacts = data || [];
  } else {
    const now = new Date();
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - LOCK_AFTER_VERIFIED_MONTHS);

    const { data } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .not("email", "is", null)
      .or(`verified_at.is.null,verified_at.lt.${eighteenMonthsAgo.toISOString()}`)
      .or(`verification_next_eligible_at.is.null,verification_next_eligible_at.lt.${now.toISOString()}`)
      .lt("verification_attempts", MAX_ATTEMPTS)
      .limit(200);

    const shuffled = (data || []).sort(() => Math.random() - 0.5);
    const targetCount = Math.min(batch_size || remainingQuota, remainingQuota);
    contacts = shuffled.slice(0, targetCount * 3);
  }

  if (!contacts?.length) {
    return NextResponse.json({ success: true, sent: 0, drafted: 0, message: "No contacts need verification" });
  }

  let sent = 0;
  let drafted = 0;
  let skipped = 0;
  const drafts: any[] = [];
  const skipReasons: { contact_id: string; contact_name: string; reason?: string }[] = [];

  const senderFirstName = user.name?.split(" ")[0] || "there";
  const senderFullName = user.name || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://humblehello.com";

  const targetSendCount = Math.min(batch_size || remainingQuota, remainingQuota);

  for (const contact of contacts) {
    if (sent >= targetSendCount) break;

    const { eligible, reason } = isEligibleForVerification(contact);
    if (!eligible) {
      skipped++;
      skipReasons.push({ contact_id: contact.id, contact_name: contact.full_name, reason });
      continue;
    }

    const attemptNumber = contact.verification_attempts || 0;
    if (attemptNumber >= MAX_ATTEMPTS && contact.verification_sequence_reset_at) {
      const resetAt = new Date(contact.verification_sequence_reset_at);
      if (resetAt <= new Date()) {
        await supabase.from("tom_contacts").update({
          verification_attempts: 0,
          verification_sequence_reset_at: null,
          verification_next_eligible_at: null,
        }).eq("id", contact.id);
      }
    }

    const currentAttempt = (contact.verification_attempts || 0) + 1;
    const token = crypto.randomBytes(32).toString("hex");
    const verifyUrl = `${appUrl}/verify/${token}`;
    const isCold = !contact.email_count || contact.email_count < 1;

    if (isCold && remainingColdQuota <= 0) {
      skipped++;
      skipReasons.push({
        contact_id: contact.id,
        contact_name: contact.full_name,
        reason: `cold-contact daily limit reached (${DAILY_COLD_LIMIT}/day) — try again tomorrow`,
      });
      continue;
    }

    const shouldAutoSend = !draftOnly;
    const contactFirstName = contact.full_name?.split(" ")[0] || "there";
    const emailSubject = getRandomSubject(currentAttempt);
    const emailOpener = getRandomOpener(currentAttempt);

    const nextEligible = new Date();
    if (currentAttempt === 1) {
      nextEligible.setDate(nextEligible.getDate() + ATTEMPT_2_WAIT_DAYS);
    } else if (currentAttempt === 2) {
      nextEligible.setDate(nextEligible.getDate() + ATTEMPT_3_WAIT_DAYS);
    }

    const sequenceResetAt = currentAttempt >= MAX_ATTEMPTS
      ? new Date(Date.now() + REENROLL_AFTER_MONTHS * 30 * 24 * 60 * 60 * 1000)
      : null;

    const htmlBody = buildVerificationEmail({
      contactFirstName,
      senderFirstName,
      senderFullName,
      verifyUrl,
      appUrl,
      contact,
      opener: emailOpener,
    });

    const textBody = `Hi ${contactFirstName},

${emailOpener}

${verifyUrl}

You'll be able to review and update:
- Home & work address
- Mobile number
- Birthday
- Title & company

If you'd rather be removed from my list entirely, there's an option for that too.

Thank you!

${senderFirstName}

--
Sent via Humble Hello (${appUrl})`;

    await supabase.from("tom_verifications").insert({
      user_id: userId,
      contact_id: contact.id,
      contact_name: contact.full_name,
      contact_email: contact.email,
      token,
      status: shouldAutoSend ? "sent" : "draft",
      attempt_number: currentAttempt,
    });

    if (shouldAutoSend) {
      let sendOk = false;
      try {
        await sendUserEmail({
          userId,
          to: `${contact.full_name} <${contact.email}>`,
          subject: emailSubject,
          text: textBody,
          html: htmlBody,
          fromName: user.name || undefined,
        });
        sendOk = true;
      } catch (err) {
        console.error(`Verification send failed for contact ${contact.id}:`, err);
      }

      if (sendOk) {
        await supabase
          .from("tom_contacts")
          .update({
            verification_sent_at: new Date().toISOString(),
            verification_attempts: currentAttempt,
            verification_status: "pending",
            verification_next_eligible_at: currentAttempt < MAX_ATTEMPTS ? nextEligible.toISOString() : null,
            verification_sequence_reset_at: sequenceResetAt?.toISOString() || null,
          })
          .eq("id", contact.id);

        sent++;
        if (isCold) remainingColdQuota--;
        if (sent < remainingQuota) await sleep(SEND_DELAY_MS);
      }
    } else {
      drafts.push({
        contact_name: contact.full_name,
        contact_email: contact.email,
        subject: emailSubject,
        body: textBody,
        token,
        verify_url: verifyUrl,
      });
      drafted++;
    }
  }

  let message: string | undefined;
  if (sent > 0) {
    message = `Sent ${sent} emails · ${remainingQuota - sent} remaining today`;
  } else if (skipReasons.length === 1) {
    const r = skipReasons[0];
    message = `Skipped ${r.contact_name}: ${r.reason || "not eligible right now"}`;
  } else if (skipReasons.length > 1) {
    message = `Skipped ${skipReasons.length} contacts (most recent: ${skipReasons[0].reason})`;
  }

  return NextResponse.json({
    success: true,
    sent,
    drafted,
    skipped,
    remaining_quota_today: remainingQuota - sent,
    drafts: drafts.slice(0, 5),
    skip_reasons: skipReasons,
    message,
  });
}