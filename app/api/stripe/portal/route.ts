import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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

  const stripe = getStripe();
  const supabase = getSupabase();

  const { data: user } = await supabase
    .from("tom_users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
  });

  return NextResponse.json({ url: session.url });
}