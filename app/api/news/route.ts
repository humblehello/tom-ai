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

  const { data: user } = await supabase
    .from("tom_users")
    .select("home_city")
    .eq("id", userId)
    .single();

  const homeCity = user?.home_city || "Indianapolis, IN";
  const cityName = homeCity.split(",")[0].trim();

  const { data: events } = await supabase
    .from("detected_events")
    .select("title")
    .eq("user_id", userId)
    .eq("event_type", "meeting_brief")
    .gte("detected_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  const meetingContext = events?.[0]?.title?.replace("Meeting brief: ", "") || "";

  const prompt = `Search for and return 4 current news items as JSON. Return ONLY a JSON array, no other text.

Search for:
1. ${meetingContext ? `Recent news about "${meetingContext}" company or people` : `Business news today`}
2. Local news in ${cityName} today
3. Top financial/market news today  
4. Top world news headline today

Return this exact format:
[
{"tag":"MEETING","color":"#bf5c38","bg":"#f2d5c8","title":"headline here","sub":"source · timeframe","url":"https://..."},
  {"tag":"LOCAL","color":"#2a6496","bg":"#d0e0f0","title":"headline here","sub":"source · timeframe","url":"https://..."},
  {"tag":"MARKET","color":"#b8922a","bg":"#f0e0b0","title":"headline here","sub":"source · timeframe","url":"https://..."},
  {"tag":"WORLD","color":"#6b5c9e","bg":"#e5dff5","title":"headline here","sub":"source · timeframe","url":"https://..."}
]

Keep titles under 80 characters. Return only the JSON array.`;

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
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
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
    console.error("News fetch failed:", e);
    return NextResponse.json({ items: [] });
  }
}