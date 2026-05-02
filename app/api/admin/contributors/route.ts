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

  const { data: users } = await supabase
    .from("tom_users")
    .select("id, name, email, network_opt_in, network_opt_in_at")
    .eq("network_opt_in", true)
    .order("network_opt_in_at", { ascending: false });

  const contributors = await Promise.all((users || []).map(async u => {
    const { count } = await supabase
      .from("network_contributions")
      .select("id", { count: "exact", head: true })
      .eq("contributed_by_user_id", u.id);
    return { ...u, contribution_count: count || 0 };
  }));

  return NextResponse.json({ contributors });
}