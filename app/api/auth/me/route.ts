import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();

  const { data } = await supabase
    .from("tom_users")
    .select("id, name, email, timezone, home_city, card_profile, plan, trial_ends_at, stripe_subscription_id, refresh_token, google_account_email, microsoft_refresh_token, microsoft_account_email, primary_email_provider")
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

  return NextResponse.json({
    ...data,
    effective_plan: effectivePlan,
    trial_expired: trialExpired,
    trial_ends_at: data.trial_ends_at,
  }, { headers: { "Cache-Control": "no-store" } });
}