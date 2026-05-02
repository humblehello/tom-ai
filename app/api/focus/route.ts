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

  // Get personal goals only
  const { data: goals } = await supabase
    .from("user_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("goal_type", "personal")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (!goals || goals.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Get today's calendar events for context
  const { data: user } = await supabase
    .from("tom_users")
    .select("name")
    .eq("id", userId)
    .single();

  const { data: events } = await supabase
    .from("detected_events")
    .select("title, description")
    .eq("user_id", userId)
    .gte("detected_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(5);

  const calendarContext = events?.map(e => e.title).join(", ") || "no meetings detected";
  const goalsList = goals.map(g => g.title).join("\n- ");

  const prompt = `You are Humble Hello, a personal intelligent relationship platform. Generate a daily micro-action for each of the following personal goals. Be specific, encouraging, and brief.

Today's calendar context: ${calendarContext}

Personal goals:
- ${goalsList}

Rules:
- For language learning goals (Spanish, French, etc): provide a word of the day with pronunciation and definition
- For reading goals: suggest a specific page count that fits in the day
- For exercise goals: suggest a specific time window based on calendar gaps
- For meditation goals: suggest a specific brief duration
- For writing goals: connect to the Daily Pulse journal they already have
- For public speaking: connect to any meetings today
- For finance goals: suggest one small specific action
- For sensitive goals (drinking less, etc): be quietly encouraging, no specific action required
- Keep each micro-action under 15 words
- Be warm but not cheesy

Return ONLY a JSON array, no markdown:
[
  {"goal": "exact goal title", "action": "specific micro-action or word of the day", "type": "word|action|encouragement"},
  ...
]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("") || "[]";

    const clean = text.replace(/```json|```/g, "").trim();
    const items = JSON.parse(clean);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("Focus fetch failed:", e);
    // Fallback — return goals without micro-actions
    return NextResponse.json({
      items: goals.map(g => ({
        goal: g.title,
        action: "Keep going — every step counts.",
        type: "encouragement",
      })),
    });
  }
}