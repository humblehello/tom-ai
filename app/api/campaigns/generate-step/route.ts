import { NextRequest, NextResponse } from "next/server";
import { checkFeature } from "@/app/lib/requireFeature";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("campaigns");
  if (block) return block;
  
  const { step_type, goal, position, total_steps, occasion } = await request.json();

  if (!goal?.trim()) return NextResponse.json({ error: "Goal required" }, { status: 400 });

  const isEmail = step_type === "send_email";
  const isCard = step_type === "send_card";

  const stepContext = position === 0
    ? "This is the first message in the sequence."
    : position === total_steps - 2
    ? "This is the final message in the sequence."
    : `This is step ${position + 1} of ${total_steps} in the sequence.`;

  let prompt = "";

  if (isEmail) {
    prompt = `You are writing a highly personal, human email template for a relationship-focused outreach campaign.

Campaign goal: ${goal}
${stepContext}

Write a short, warm, personal email that:
- Feels like it was written by a real person, not a company
- Is plain text, conversational, no bullet points or formatting
- Is 3-5 sentences max — brevity is key
- Uses {{first_name}} for personalization
- Can optionally use {{company}} or {{job_title}} if it makes sense
- Has a natural, human subject line (not salesy)
- Does NOT have a sign-off name (the Gmail signature will be added automatically)
- Does NOT mention Humble Hello or any software

Return a JSON object with exactly these two fields:
{
  "subject": "the subject line",
  "body": "the email body"
}

Return ONLY the JSON object, no other text.`;
  } else if (isCard) {
    prompt = `You are writing a short handwritten card message for a relationship-focused outreach campaign.

Campaign goal: ${goal}
Occasion: ${occasion || "Thinking of you"}
${stepContext}

Write a warm, genuine card message that:
- Is 2-3 sentences max (this is handwritten, space is limited)
- Feels personal and human, not corporate
- Uses {{first_name}} at the start
- Does NOT have a sign-off (that's added separately)
- References the occasion naturally if appropriate

Return ONLY the card message text, nothing else.`;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();

  // Surface Anthropic errors instead of silently returning empty
  if (!res.ok || data.error) {
    console.error("[generate-step] Anthropic error:", data);
    return NextResponse.json({
      error: data.error?.message || "AI generation failed",
      detail: data,
    }, { status: 500 });
  }

  const text = data.content?.[0]?.text || "";

  if (!text) {
    console.error("[generate-step] empty text from Anthropic:", data);
    return NextResponse.json({ error: "Empty response from AI", detail: data }, { status: 500 });
  }

  if (isEmail) {
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      return NextResponse.json({ subject: parsed.subject || "", body: parsed.body || "" });
    } catch {
      return NextResponse.json({ subject: "", body: text });
    }
  }

  return NextResponse.json({ message: text.trim() });
}