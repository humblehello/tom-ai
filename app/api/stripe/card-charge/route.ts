import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  });
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const stripe = getStripe();

  const { data: user } = await supabase
    .from("tom_users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ has_payment_method: false });
  }

  const paymentMethods = await stripe.paymentMethods.list({
    customer: user.stripe_customer_id,
    type: "card",
  });

  const pm = paymentMethods.data[0];
  return NextResponse.json({
    has_payment_method: paymentMethods.data.length > 0,
    last4: pm?.card?.last4,
    brand: pm?.card?.brand,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const stripe = getStripe();

  const { contact_name, occasion } = await req.json();

  const { data: user } = await supabase
    .from("tom_users")
    .select("stripe_customer_id, email, name")
    .eq("id", userId)
    .single();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: "no_payment_method", needs_setup: true }, { status: 402 });
  }

  const paymentMethods = await stripe.paymentMethods.list({
    customer: user.stripe_customer_id,
    type: "card",
  });

  if (!paymentMethods.data.length) {
    return NextResponse.json({ error: "no_payment_method", needs_setup: true }, { status: 402 });
  }

  const paymentMethod = paymentMethods.data[0];

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 475,
      currency: "usd",
      customer: user.stripe_customer_id,
      payment_method: paymentMethod.id,
      confirm: true,
      off_session: true,
      description: `Humble Hello card — ${occasion} for ${contact_name}`,
      metadata: { user_id: userId, contact_name, occasion },
    });

    if (paymentIntent.status === "succeeded") {
      return NextResponse.json({ ok: true, charge_id: paymentIntent.id });
    } else {
      return NextResponse.json({ error: "charge_failed", status: paymentIntent.status }, { status: 402 });
    }
  } catch (e: any) {
    if (e.code === "authentication_required") {
      return NextResponse.json({ error: "authentication_required" }, { status: 402 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}