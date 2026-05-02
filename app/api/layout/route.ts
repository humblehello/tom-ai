import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_LAYOUT = ["needs", "people", "day", "pipeline", "budget", "handled", "world"];

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
  if (!userId) return NextResponse.json({ layout: DEFAULT_LAYOUT });

  const { data } = await supabase
    .from("user_layout")
    .select("layout")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({ layout: data?.layout || DEFAULT_LAYOUT });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { layout } = await req.json();

  await supabase
    .from("user_layout")
    .upsert({ user_id: userId, layout, updated_at: new Date().toISOString() },
      { onConflict: "user_id" });

  return NextResponse.json({ ok: true });
}