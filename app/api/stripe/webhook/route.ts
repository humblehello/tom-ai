import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getPlanFromPriceId(priceId: string): { plan: string; limit: number; drafts: number } {
  const proMonthly = process.env.STRIPE_PRO_MONTHLY;
  const proAnnual = process.env.STRIPE_PRO_ANNUAL;
  const growthMonthly = process.env.STRIPE_GROWTH_MONTHLY;
  const growthAnnual = process.env.STRIPE_GROWTH_ANNUAL;

  if (priceId === proMonthly || priceId === proAnnual) {
    return { plan: "pro", limit: 2500, drafts: 250 };
  }
  if (priceId === growthMonthly || priceId === growthAnnual) {
    return { plan: "growth", limit: 5000, drafts: -1 }; // -1 = unlimited
  }
  return { plan: "free", limit: 1000, drafts: 100 };
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const supabase = getSupabase();

  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("Webhook signature error:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      if (!userId) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = subscription.items.data[0].price.id;
      const { plan, limit } = getPlanFromPriceId(priceId);

      await supabase.from("tom_users").update({
        plan,
        stripe_subscription_id: subscription.id,
        plan_contact_limit: limit,
        plan_updated_at: new Date().toISOString(),
        trial_ends_at: null,
        ai_drafts_used: 0,
        ai_drafts_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq("id", userId);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      const priceId = subscription.items.data[0].price.id;
      const { plan, limit } = getPlanFromPriceId(priceId);
      const status = subscription.status;

      if (status === "active" || status === "trialing") {
        await supabase.from("tom_users").update({
          plan,
          plan_contact_limit: limit,
          plan_updated_at: new Date().toISOString(),
        }).eq("id", userId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      await supabase.from("tom_users").update({
        plan: "free",
        stripe_subscription_id: null,
        plan_contact_limit: 1000,
        plan_updated_at: new Date().toISOString(),
      }).eq("id", userId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const { data: user } = await supabase
        .from("tom_users")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (user) {
        await supabase.from("tom_users").update({
          plan: "free",
          plan_contact_limit: 1000,
        }).eq("id", user.id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}