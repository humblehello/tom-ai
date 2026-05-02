import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("tom_users")
    .select("plan, trial_ends_at, ai_drafts_used, ai_drafts_reset_at, plan_contact_limit, stripe_customer_id, stripe_subscription_id")
    .eq("id", userId)
    .single();

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const trialExpired = trialEndsAt ? now > trialEndsAt : false;
  const hasSubscription = !!data.stripe_subscription_id;

  let effectivePlan = data.plan || "free";
  if (effectivePlan === "trial" && trialExpired && !hasSubscription) {
    effectivePlan = "free";
    await supabase.from("tom_users").update({ plan: "free" }).eq("id", userId);
  }

  const contactLimit = effectivePlan === "free" ? 1000 : effectivePlan === "pro" ? 5000 : 999999;
  const draftLimit = effectivePlan === "free" ? 100 : effectivePlan === "pro" ? 250 : 999999;
  const trialDaysLeft = trialEndsAt && !trialExpired
    ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return NextResponse.json({
    plan: data.plan,
    effective_plan: effectivePlan,
    trial_expired: trialExpired,
    trial_ends_at: data.trial_ends_at,
    trial_days_left: trialDaysLeft,
    ai_drafts_used: data.ai_drafts_used || 0,
    draft_limit: draftLimit,
    contact_limit: contactLimit,
    has_subscription: hasSubscription,
  }, { headers: { "Cache-Control": "no-store" } });
}