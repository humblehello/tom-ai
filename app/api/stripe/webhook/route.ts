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
    return { plan: "growth", limit: 5000, drafts: -1 };
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

    // ── Checkout completed (new subscription) ─────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      if (!userId) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = subscription.items.data[0].price.id;
      const { plan, limit } = getPlanFromPriceId(priceId);

      // Detect if subscription is in trial
      const isTrialing = subscription.status === "trialing";
      const periodEnd = (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000).toISOString()
        : null;

      const updates: any = {
        plan,
        stripe_subscription_id: subscription.id,
        plan_contact_limit: limit,
        plan_updated_at: new Date().toISOString(),
        subscription_status: subscription.status,
        subscription_cancel_at_period_end: subscription.cancel_at_period_end || false,
        subscription_period_end: periodEnd,
        ai_drafts_used: 0,
        ai_drafts_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // If subscription is trialing, mark trial_used_at NOW (so they can't trial again later)
      if (isTrialing) {
        updates.trial_used_at = new Date().toISOString();
        updates.trial_ends_at = (subscription as any).trial_end
          ? new Date((subscription as any).trial_end * 1000).toISOString()
          : null;
      } else {
        // Non-trial = converted to paid immediately or trial-ineligible flow
        updates.trial_ends_at = null;
      }

      await supabase.from("tom_users").update(updates).eq("id", userId);
      break;
    }

    // ── Subscription updated (renewal, plan change, cancel-at-period-end) ─
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      const priceId = subscription.items.data[0].price.id;
      const { plan, limit } = getPlanFromPriceId(priceId);
      const status = subscription.status;
      const periodEnd = (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000).toISOString()
        : null;

      // Active or trialing → user has access at this plan tier
      if (status === "active" || status === "trialing") {
        const updates: any = {
          plan,
          plan_contact_limit: limit,
          plan_updated_at: new Date().toISOString(),
          subscription_status: status,
          subscription_cancel_at_period_end: subscription.cancel_at_period_end || false,
          subscription_period_end: periodEnd,
        };

        if (status === "trialing") {
          updates.trial_used_at = new Date().toISOString();
          updates.trial_ends_at = (subscription as any).trial_end
            ? new Date((subscription as any).trial_end * 1000).toISOString()
            : null;
        }

        await supabase.from("tom_users").update(updates).eq("id", userId);
      }
      break;
    }

    // ── Subscription fully ended (period elapsed after cancel, or trial ended) ─
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      if (!userId) break;

      await supabase.from("tom_users").update({
        plan: "free",
        stripe_subscription_id: null,
        plan_contact_limit: 1000,
        plan_updated_at: new Date().toISOString(),
        subscription_status: "canceled",
        subscription_cancel_at_period_end: false,
        subscription_period_end: null,
        trial_ends_at: null,
        // NOTE: trial_used_at stays set so they can't trial again
      }).eq("id", userId);
      break;
    }

    // ── Payment failed (card declined etc.) ────────────────────────────────
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
          subscription_status: "past_due",
        }).eq("id", user.id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}