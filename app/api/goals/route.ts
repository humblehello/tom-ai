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

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: goals } = await supabase
    .from("user_goals")
    .select("*, goal_checkins(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  return NextResponse.json({ goals: goals || [] });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goals, goal, checkin } = await req.json();

  if (goals) {
    const inserts = goals.map((g: any) => ({ ...g, user_id: userId }));
    await supabase.from("user_goals").insert(inserts);
    return NextResponse.json({ ok: true });
  }

  if (goal) {
    const { data } = await supabase
      .from("user_goals")
      .insert({ ...goal, user_id: userId })
      .select("id")
      .single();
    return NextResponse.json({ ok: true, id: data?.id });
  }

  if (checkin) {
    await supabase.from("goal_checkins").insert({ ...checkin, user_id: userId });
    await supabase.from("user_goals")
      .update({ last_activity_at: new Date().toISOString(), streak_days: checkin.streak_days })
      .eq("id", checkin.goal_id)
      .eq("user_id", userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...updates } = await req.json();
  await supabase.from("user_goals").update(updates).eq("id", id).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await supabase.from("user_goals")
    .update({ status: "paused" })
    .eq("id", id)
    .eq("user_id", userId);
  return NextResponse.json({ ok: true });
}