import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULTS = {
  gift_weekly_limit: 150,
  grocery_weekly_limit: 200,
};

async function getUserId() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  const { data } = await supabase
    .from("tom_users")
    .select("id")
    .eq("id", session)
    .single();
  return data?.id || null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get or create budget row
  let { data: budget } = await supabase
    .from("user_budgets")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!budget) {
    const { data: newBudget } = await supabase
      .from("user_budgets")
      .insert({ user_id: userId, ...DEFAULTS, week_start_date: getWeekStart() })
      .select()
      .single();
    budget = newBudget;
  }

  // Reset if new week
  const weekStart = getWeekStart();
  if (budget.week_start_date !== weekStart) {
    await supabase
      .from("user_budgets")
      .update({ gift_spent_this_week: 0, grocery_spent_this_week: 0, week_start_date: weekStart })
      .eq("user_id", userId);
    budget.gift_spent_this_week = 0;
    budget.grocery_spent_this_week = 0;
  }

  // Calculate real gift spend from tom_orders this week
  const { data: orders } = await supabase
    .from("tom_orders")
    .select("price, type")
    .eq("user_id", userId)
    .gte("created_at", weekStart);

  let giftSpent = 0;
  let grocerySpent = 0;
  (orders || []).forEach((o: any) => {
    if (o.type === "grocery") grocerySpent += o.price || 0;
    else giftSpent += o.price || 0;
  });

  return NextResponse.json({
    gift_weekly_limit: budget.gift_weekly_limit,
    grocery_weekly_limit: budget.grocery_weekly_limit,
    gift_spent: Math.round(giftSpent),
    grocery_spent: Math.round(grocerySpent),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gift_weekly_limit, grocery_weekly_limit } = await req.json();

  await supabase
    .from("user_budgets")
    .upsert({
      user_id: userId,
      gift_weekly_limit,
      grocery_weekly_limit,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  return NextResponse.json({ ok: true });
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}