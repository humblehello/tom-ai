import { NextRequest, NextResponse } from "next/server";
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

// Server-side price ID mapping — never trust client-supplied price IDs
function resolvePriceId(tier: string, billing: string): string | null {
  const map: Record<string, string> = {
    "pro:monthly":     "price_1TIV6aBupCCDyTTUIPt6qUNv",
    "pro:annual":      "price_1TIV6aBupCCDyTTUSrebjytb",
    "growth:monthly":  "price_1TIV72BupCCDyTTUx6VzkCYb",
    "growth:annual":   "price_1TIV7sBupCCDyTTUD4StSWU0",
  };
  return map[`${tier}:${billing}`] ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept tier + billing instead of price_id (safer)
  const body = await req.json();
  const tier = String(body.tier || "");      // "pro" | "growth"
  const billing = String(body.billing || ""); // "monthly" | "annual"

  if (!["pro", "growth"].includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  if (!["monthly", "annual"].includes(billing)) {
    return NextResponse.json({ error: "Invalid billing" }, { status: 400 });
  }

  const priceId = resolvePriceId(tier, billing);
  if (!priceId) {
    return NextResponse.json({ error: "Price not found" }, { status: 400 });
  }

  // Load user
  const { data: user } = await supabase
    .from("tom_users")
    .select("email, name, stripe_customer_id, trial_used_at, plan")
    .eq("id", userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Dynamic import to avoid build-time issues
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Get or create Stripe customer
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    await supabase.from("tom_users")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  // Trial eligibility — Growth only, never trialed before
  // Two checks: (1) our DB flag (fast), (2) Stripe subscription history (source of truth)
  let eligibleForTrial = false;
  if (tier === "growth" && !user.trial_used_at) {
    // Confirm with Stripe — has this customer ever had any subscription before?
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
    });
    eligibleForTrial = subs.data.length === 0;
  }

  // Build subscription_data
  const subscriptionData: any = {
    metadata: { supabase_user_id: userId, tier },
  };
  if (eligibleForTrial) {
    subscriptionData.trial_period_days = 7;
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    subscription_data: subscriptionData,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgrade=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/plans`,
    metadata: { supabase_user_id: userId, tier, billing },
  });

  return NextResponse.json({
    url: session.url,
    trial_applied: eligibleForTrial,
  });
}