// app/lib/verificationSafety.ts
//
// Guards verification sends against bounce spikes. Call this before
// ANY verification email send — if it returns { paused: true }, do not
// send and either queue for retry or surface a warning to the user.
//
// Usage in a verification send route:
//
//   import { checkVerificationSafety } from "@/app/lib/verificationSafety";
//
//   const safety = await checkVerificationSafety(userId);
//   if (safety.paused) {
//     return NextResponse.json(
//       { error: "paused_due_to_bounces", reason: safety.reason, until: safety.until },
//       { status: 423 }
//     );
//   }

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Safety thresholds ───────────────────────────────────────────────────────
// Tunable. Conservative defaults — fail safe, not fast.
const HARD_BOUNCES_24H_PAUSE_THRESHOLD = 5;   // 5+ hard bounces in 24h → pause for 24h
const HARD_BOUNCES_1H_PAUSE_THRESHOLD = 3;    // 3+ hard bounces in 1h → pause for 6h
const PAUSE_DURATION_MS_24H = 24 * 60 * 60 * 1000;
const PAUSE_DURATION_MS_6H = 6 * 60 * 60 * 1000;

export interface SafetyResult {
  paused: boolean;
  reason?: string;
  until?: string;            // ISO timestamp when pause lifts
  bounces_1h?: number;
  bounces_24h?: number;
}

export async function checkVerificationSafety(
  userId: string
): Promise<SafetyResult> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Count hard bounces in the last hour and last 24h. We intentionally
  // count hard bounces only — soft departures and OOO should not trigger
  // a pause, since they don't indicate list quality issues.
  const { data: recentBounces } = await supabase
    .from("email_bounce_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("category", "hard_bounce")
    .gte("created_at", oneDayAgo);

  const bounces24h = (recentBounces || []).length;
  const bounces1h = (recentBounces || []).filter(
    (b: any) => b.created_at >= oneHourAgo
  ).length;

  if (bounces1h >= HARD_BOUNCES_1H_PAUSE_THRESHOLD) {
    return {
      paused: true,
      reason: `${bounces1h} hard bounces in the last hour. Verification sends paused for 6 hours.`,
      until: new Date(now + PAUSE_DURATION_MS_6H).toISOString(),
      bounces_1h: bounces1h,
      bounces_24h: bounces24h,
    };
  }

  if (bounces24h >= HARD_BOUNCES_24H_PAUSE_THRESHOLD) {
    return {
      paused: true,
      reason: `${bounces24h} hard bounces in the last 24 hours. Verification sends paused for 24 hours.`,
      until: new Date(now + PAUSE_DURATION_MS_24H).toISOString(),
      bounces_1h: bounces1h,
      bounces_24h: bounces24h,
    };
  }

  return {
    paused: false,
    bounces_1h: bounces1h,
    bounces_24h: bounces24h,
  };
}

// Convenience helper — returns a bounce summary for a user, intended for
// the Settings or Admin UI. Not required for the safety loop.
export async function getBounceStats(userId: string): Promise<{
  last_24h: number;
  last_7d: number;
  flagged_contacts: number;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: last24h }, { count: last7d }, { count: flagged }] =
    await Promise.all([
      supabase
        .from("email_bounce_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("category", "hard_bounce")
        .gte("created_at", oneDayAgo),
      supabase
        .from("email_bounce_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("category", "hard_bounce")
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("tom_contacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("email_status", "is", null),
    ]);

  return {
    last_24h: last24h || 0,
    last_7d: last7d || 0,
    flagged_contacts: flagged || 0,
  };
}