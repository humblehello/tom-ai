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

  const { contact_a_id, contact_b_id, contact_a_name, contact_b_name } = await req.json();

 try {
  await supabase.from("tom_intros").insert({
    user_id: userId,
    contact_a_id,
    contact_b_id,
    contact_a_name,
    contact_b_name,
    introduced_at: new Date().toISOString(),
  });
} catch (_) {}

  return NextResponse.json({ success: true });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await supabase
    .from("tom_intros")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  return NextResponse.json({ count: count || 0 });
}