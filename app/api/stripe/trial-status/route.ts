import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    // Not signed in — they're a visitor; visitor CTAs handle this.
    return NextResponse.json({
      eligible_for_growth_trial: false,
      reason: "not_signed_in",
    });
  }

  const { data: user } = await supabase
    .from("tom_users")
    .select("plan, trial_used_at, stripe_customer_id, subscription_status")
    .eq("id", userId)
    .single();

  if (!user) {
    return NextResponse.json({
      eligible_for_growth_trial: false,
      reason: "user_not_found",
    });
  }

  // Already on a paid plan — not eligible (would be a downgrade-then-trial scam)
  if (user.plan === "pro" || user.plan === "growth") {
    return NextResponse.json({
      eligible_for_growth_trial: false,
      reason: "already_on_paid_plan",
    });
  }

  // Already used a trial — not eligible
  if (user.trial_used_at) {
    return NextResponse.json({
      eligible_for_growth_trial: false,
      reason: "trial_already_used",
    });
  }

  // No Stripe customer yet → never had any subscription → eligible
  if (!user.stripe_customer_id) {
    return NextResponse.json({
      eligible_for_growth_trial: true,
      reason: "fresh_account",
    });
  }

  // Has a Stripe customer — confirm with Stripe that no prior subscription exists
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const subs = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status: "all",
      limit: 1,
    });

    if (subs.data.length === 0) {
      return NextResponse.json({
        eligible_for_growth_trial: true,
        reason: "no_prior_subscriptions",
      });
    } else {
      // They've subscribed before. Mark our DB flag for next time (cache).
      await supabase
        .from("tom_users")
        .update({ trial_used_at: new Date().toISOString() })
        .eq("id", userId);
      return NextResponse.json({
        eligible_for_growth_trial: false,
        reason: "stripe_subscription_history_exists",
      });
    }
  } catch (err) {
    console.error("[trial-status] Stripe error:", err);
    // Fail closed — if we can't verify with Stripe, deny the trial
    return NextResponse.json({
      eligible_for_growth_trial: false,
      reason: "stripe_check_failed",
    });
  }
}