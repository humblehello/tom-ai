import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCalendarEvents(accessToken: string) {
  const now = new Date().toISOString();
  const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${weekLater}&singleEvents=true&orderBy=startTime&maxResults=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.items || [];
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("tom_session")?.value;

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: user } = await supabase
  .from("tom_users")
  .select("name")
  .eq("id", userId)
  .single();

if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

const { getValidAccessToken } = await import("../../lib/google");
const accessToken = await getValidAccessToken(userId);
const events = await getCalendarEvents(accessToken);

    const prompt = `You are Humble Hello, a proactive intelligent relationship operating platform. Analyze these upcoming calendar events and suggest 3-5 specific actions the user should take.

User: ${user.name}
Upcoming events (next 7 days):
${JSON.stringify(events.map((e: any) => ({
  title: e.summary,
  start: e.start?.dateTime || e.start?.date,
  end: e.end?.dateTime || e.end?.date,
  location: e.location,
  attendees: e.attendees?.map((a: any) => a.email),
})), null, 2)}

Return a JSON array of suggestions. Each suggestion should have:
- id: unique string
- type: one of "transport", "gift", "followup", "reminder", "order"
- title: short action title (max 8 words)
- description: why Humble Hello suggests this (1-2 sentences)
- urgency: "high", "medium", or "low"
- event: the related event title

Return ONLY valid JSON, no markdown, no explanation.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || "[]";
    const suggestions = JSON.parse(raw);

    return NextResponse.json({ suggestions, events: events.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}