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

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const stripe = getStripe();

  const { data: user } = await supabase
    .from("tom_users")
    .select("stripe_customer_id, email, name")
    .eq("id", userId)
    .single();

  let customerId = user?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email,
      name: user?.name,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
    await supabase.from("tom_users")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
  });

  return NextResponse.json({
    client_secret: setupIntent.client_secret,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
}