import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

async function getEmailThreads(accessToken: string) {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!data.messages) return [];

  const messages = await Promise.all(
    data.messages.slice(0, 10).map(async (msg: any) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || "";
      return {
        id: msg.id,
        from: get("From"),
        subject: get("Subject"),
        date: get("Date"),
        snippet: msgData.snippet || "",
      };
    })
  );

  return messages;
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const cookieStore = await cookies();
    const userId = cookieStore.get("tom_session")?.value;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: user } = await supabase
      .from("tom_users")
      .select("name")
      .eq("id", userId)
      .single();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { getValidAccessToken } = await import("../../lib/google");
    const accessToken = await getValidAccessToken(userId);
    const emails = await getEmailThreads(accessToken);

    const prompt = `You are Tom, an AI life assistant. Analyze these recent emails and extract useful signals for gift-giving, relationship management, and proactive actions.

Recent emails:
${JSON.stringify(emails, null, 2)}

Extract and return a JSON object with:
{
  "people": [
    {
      "name": "person's name",
      "email": "their email",
      "signals": ["list of signals like 'loves coffee', 'just had a baby', 'closed big deal'"],
      "sentiment": "positive" | "neutral" | "needs_attention",
      "suggested_action": "what Tom should do for this person"
    }
  ],
  "urgent_followups": [
    {
      "person": "name",
      "reason": "why they need a followup",
      "days_since_contact": number
    }
  ],
  "gift_opportunities": [
    {
      "person": "name",
      "occasion": "what triggered this",
      "urgency": "high" | "medium" | "low"
    }
  ]
}

Return ONLY valid JSON, no markdown.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || "{}";
    const insights = JSON.parse(raw);

    return NextResponse.json({ insights, email_count: emails.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to read Gmail" }, { status: 500 });
  }
}