import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { canAccess, type Feature, type Plan } from "@/app/lib/plan";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────
// Server-side feature gate. Checks the user's plan and either:
//   - Returns null (allowed) — caller proceeds normally
//   - Returns a 403 NextResponse — caller should return it directly
//
// Usage at the top of any route handler:
//
//   const block = await checkFeature("campaigns");
//   if (block) return block;
//   // ... proceed with handler logic
// ─────────────────────────────────────────────────────────────────────

export async function checkFeature(
  feature: Feature
): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: user } = await supabase
    .from("tom_users")
    .select("plan, trial_ends_at, stripe_subscription_id")
    .eq("id", userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Compute effective plan (mirror logic from /api/plan and /api/auth/me)
  let plan: Plan = (user.plan || "free") as Plan;
  const trialExpired =
    user.trial_ends_at && new Date(user.trial_ends_at) < new Date();
  const hasSubscription = !!user.stripe_subscription_id;
  if (plan === "trial" && trialExpired && !hasSubscription) {
    plan = "free";
  }

  if (canAccess(plan, feature)) {
    return null; // allowed
  }

  return NextResponse.json(
    {
      error: "feature_not_in_plan",
      feature,
      current_plan: plan,
      message: `This feature requires an upgrade.`,
    },
    { status: 403 }
  );
}