import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  return session;
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await supabase.from("user_reflections").insert({ ...body, user_id: userId });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("user_reflections").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ reflections: data || [] });
}