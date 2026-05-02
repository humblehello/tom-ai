import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { price_id } = await req.json();
  if (!price_id) return NextResponse.json({ error: "Missing price_id" }, { status: 400 });

  const { data: user } = await supabase
    .from("tom_users")
    .select("email, name, stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Dynamically import Stripe to avoid build issues
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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: price_id, quantity: 1 }],
    mode: "subscription",
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgrade=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    metadata: { supabase_user_id: userId },
  });

  return NextResponse.json({ url: session.url });
}