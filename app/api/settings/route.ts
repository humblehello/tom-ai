import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULTS = {
  auto_order_threshold: 10,
  approval_threshold: 50,
  notify_email: true,
  notify_sms: false,
  notify_push: false,
  phone_number: "",
  food_preferences: [],
  dietary_restrictions: [],
  gift_style: "thoughtful",
  snooze_days: 5,
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

  let { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!settings) {
    const { data: newSettings } = await supabase
      .from("user_settings")
      .insert({ user_id: userId, ...DEFAULTS })
      .select()
      .single();
    settings = newSettings;
  }

  return NextResponse.json(
    settings || { ...DEFAULTS },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = [
    "auto_order_threshold", "approval_threshold",
    "notify_email", "notify_sms", "notify_push", "phone_number",
    "food_preferences", "dietary_restrictions", "gift_style",
    "snooze_days", "network_opt_in",
    "card_purchase_threshold", "gift_purchase_threshold",
    "purchase_card_auto_send", "purchase_gift_auto_send",
  ];
  const updates: any = { updated_at: new Date().toISOString() };
  allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });

const result = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });

  console.log("SETTINGS SAVE:", JSON.stringify({ userId, updates, error: result.error }));

  return NextResponse.json({ ok: true });
}