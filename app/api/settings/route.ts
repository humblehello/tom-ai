import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
  verification_sends_paused: false,
};

async function getUserId() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  const supabase = getSupabase();
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

  const supabase = getSupabase();

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

  const supabase = getSupabase();

  const body = await req.json();

  // Settings that live in user_settings table
  const userSettingsAllowed = [
    "auto_order_threshold", "approval_threshold",
    "notify_email", "notify_sms", "notify_push", "phone_number",
    "food_preferences", "dietary_restrictions", "gift_style",
    "snooze_days", "network_opt_in",
    "card_purchase_threshold", "gift_purchase_threshold",
    "purchase_card_auto_send", "purchase_gift_auto_send",
    "verification_sends_paused",
  ];

  const userSettingsUpdates: any = {};
  userSettingsAllowed.forEach(k => {
    if (body[k] !== undefined) userSettingsUpdates[k] = body[k];
  });

  // Settings that live on tom_users (provider routing, etc.)
  const tomUsersAllowed = ["primary_email_provider"];
  const tomUsersUpdates: any = {};
  tomUsersAllowed.forEach(k => {
    if (body[k] !== undefined) tomUsersUpdates[k] = body[k];
  });

  // Update user_settings if any settings-table fields were sent
  if (Object.keys(userSettingsUpdates).length > 0) {
    userSettingsUpdates.updated_at = new Date().toISOString();
    const result = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, ...userSettingsUpdates }, { onConflict: "user_id" });
    console.log("SETTINGS SAVE (user_settings):", JSON.stringify({ userId, updates: userSettingsUpdates, error: result.error }));
  }

  // Update tom_users if any user-table fields were sent
  if (Object.keys(tomUsersUpdates).length > 0) {
    // Validate primary_email_provider value
    if (tomUsersUpdates.primary_email_provider &&
        !["google", "microsoft"].includes(tomUsersUpdates.primary_email_provider)) {
      return NextResponse.json(
        { error: "Invalid primary_email_provider" },
        { status: 400 }
      );
    }
    const result = await supabase
      .from("tom_users")
      .update(tomUsersUpdates)
      .eq("id", userId);
    console.log("SETTINGS SAVE (tom_users):", JSON.stringify({ userId, updates: tomUsersUpdates, error: result.error }));
  }

  return NextResponse.json({ ok: true });
}