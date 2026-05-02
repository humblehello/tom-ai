import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  const { data } = await supabase
    .from("tom_users")
    .select("*")
    .eq("id", session)
    .single();
  return data;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(user);
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
 const allowed = [
    "name", "timezone", "home_city", "home_address", "home_address_text", "favorite_cities",
    "onboarding_complete", "card_profile", "legal", "interests", "buckets",
    "welcome_email_sent_at", "welcome_card_sent_at", "journal_context",
    "network_opt_in", "network_opt_in_at", "network_consent_version",
    "network_share_personal_signals", "network_share_pi_profile",
    "ccpa_do_not_sell", "ccpa_opt_out_at",
  ];
  const updates: any = {};
  allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
  updates.updated_at = new Date().toISOString();

  await supabase.from("tom_users").update(updates).eq("id", user.id);

  return NextResponse.json({ ok: true });
}