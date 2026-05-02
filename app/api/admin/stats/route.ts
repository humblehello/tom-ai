import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ADMIN_USER_ID = "c82b7211-354f-4bfe-b44f-c03f4b3f50c3";

async function checkAdmin() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  return userId === ADMIN_USER_ID;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [contacts, contributions, users, suppression] = await Promise.all([
    supabase.from("network_contacts").select("id", { count: "exact", head: true }),
    supabase.from("network_contributions").select("id", { count: "exact", head: true }),
    supabase.from("tom_users").select("id", { count: "exact", head: true }).eq("network_opt_in", true),
    supabase.from("network_suppression").select("id", { count: "exact", head: true }).eq("processed", false),
  ]);

  return NextResponse.json({
    network_contacts: contacts.count || 0,
    total_contributions: contributions.count || 0,
    opted_in_users: users.count || 0,
    suppression_pending: suppression.count || 0,
  });
}