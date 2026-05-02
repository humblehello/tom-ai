// cache-bust: 3
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../../lib/google";
import { DRAFT_LIMITS, DRAFT_RESET_DAYS, type Plan } from "@/app/lib/plan";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── Web search helper ─────────────────────────────────────────────────────────
async function searchWithClaude(query: string): Promise<string> {
  try {
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
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search for: ${query}. Return only the most relevant facts in 3-4 sentences. Be concise and factual.`,
        }],
      }),
    });
    const data = await res.json();
    const text = (data.content || [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join(" ")
      .trim();
    return text.slice(0, 600);
  } catch {
    return "";
  }
}

// ── Gmail thread helper — WITH RECENCY FILTER ────────────────────────────────
async function fetchRecentThread(
  accessToken: string,
  contactEmail: string,
  maxAgeDays: number = 90
): Promise<string> {
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&q=${encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    const messages = listData.messages || [];
    if (messages.length === 0) return "";

    const details = await Promise.all(
      messages.map(async (msg: any) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return res.json();
      })
    );

    const threads: string[] = [];
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    for (const msg of details) {
      const headers = msg.payload?.headers || [];
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
      const date = headers.find((h: any) => h.name === "Date")?.value || "";

      // RECENCY FILTER — drop threads older than the cutoff
      const msgDate = new Date(date).getTime();
      if (isNaN(msgDate) || msgDate < cutoff) continue;

      const extractBody = (part: any): string => {
        if (!part) return "";
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) return part.parts.map(extractBody).join("\n");
        return "";
      };

      const fullBody = extractBody(msg.payload);
      const replyBreak = fullBody.search(/\nOn .+ wrote:|\n[-_]{3,}|\n>+\s/);
      const body = replyBreak > 0
        ? fullBody.slice(0, Math.min(replyBreak, 400))
        : fullBody.slice(0, 400);

      if (body.trim()) {
        threads.push(`[${date}] From: ${from} | Subject: ${subject}\n${body.trim()}`);
      }
    }

    return threads.join("\n\n---\n\n").slice(0, 1200);
  } catch {
    return "";
  }
}

// ── Context quality filter ────────────────────────────────────────────────────
function isContextFresh(dateStr: string | undefined, maxDaysOld: number): boolean {
  if (!dateStr) return false;
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return false;
  const ageDays = (Date.now() - then) / (1000 * 60 * 60 * 24);
  return ageDays <= maxDaysOld;
}

// ── Angle prompts — each produces a meaningfully different message type ──────
const ANGLE_PROMPTS: Record<string, string> = {
  casual: "Write a casual, low-key catch-up. Short and warm, no specifics. The vibe: 'thinking of you, how's life.' Do not reference work, projects, or any specific context — this is a pure human reconnection.",

  curious: "Ask one genuine, open question about how they're doing or what they're focused on. Curious tone. No small talk. Get straight to the question.",

  recent_event: "If there's clearly recent, specific, relevant context (email thread from the last 60 days, or web search news from 2026), reference it naturally. If not, do not force it — write a simple warm reconnection instead.",

  quick_hi: "Ultra-brief. One or two short sentences. The shortest possible 'hey, thinking of you' message. No questions required. Not a check-in, just presence.",
};

const DEFAULT_ANGLE = "casual";

// ── Variation instruction — added to every prompt to force meaningful difference on regenerate
function variationInstruction(variationSeed: number): string {
  const styles = [
    "Start with a reflection about them, not an update about you.",
    "Lead with a question. Skip the intro.",
    "Make it conversational and slightly playful.",
    "Keep it under 25 words total.",
    "Open with an observation or genuine curiosity.",
    "Be understated. Warm but low-key.",
    "Start with 'hey' or similar casual greeting (but not cliché phrases).",
    "Make it feel written in 10 seconds, off-the-cuff.",
  ];
  return styles[variationSeed % styles.length];
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData } = await supabase
    .from("tom_users")
    .select("name, interests, journal_context, card_profile")
    .eq("id", userId)
    .maybeSingle();
  const userName = userData?.name?.split(" ")[0] || "the user";
  const userInterests: string[] = userData?.interests || [];
  const userJournalContext: string = userData?.journal_context || "";
  const cardProfile = userData?.card_profile || {};
  const cardSignoff = cardProfile.signoff || userName;
  const { data: planData } = await supabase
    .from("tom_users")
    .select("plan, ai_drafts_used, ai_drafts_reset_at, trial_ends_at, stripe_subscription_id")
    .eq("id", userId)
    .single();

  // Effective plan resolution: expired trial users with no subscription drop to free
  let plan: Plan = (planData?.plan || "free") as Plan;
  const trialExpired = planData?.trial_ends_at && new Date(planData.trial_ends_at) < new Date();
  const hasSubscription = !!planData?.stripe_subscription_id;
  if (plan === "trial" && trialExpired && !hasSubscription) {
    plan = "free";
  }

  // Pull limits from centralized plan config (single source of truth)
  const draftLimit = DRAFT_LIMITS[plan];
  const resetDays = DRAFT_RESET_DAYS[plan];
  const draftsUsed = planData?.ai_drafts_used || 0;

  // Reset counter if window has elapsed
  const resetAt = planData?.ai_drafts_reset_at ? new Date(planData.ai_drafts_reset_at) : null;
  if (resetAt && resetAt < new Date()) {
    await supabase.from("tom_users").update({
      ai_drafts_used: 0,
      ai_drafts_reset_at: new Date(Date.now() + resetDays * 24 * 60 * 60 * 1000).toISOString(),
    }).eq("id", userId);
  }

  // Block if cap reached (999999 = effectively unlimited)
  if (draftsUsed >= draftLimit) {
    return NextResponse.json({
      error: "draft_limit_reached",
      limit: draftLimit,
      plan,
      reset_at: planData?.ai_drafts_reset_at || null,
    }, { status: 402 });
  }

  await supabase.from("tom_users")
    .update({ ai_drafts_used: draftsUsed + 1 })
    .eq("id", userId);

  const {
    contact_name,
    relationship_type,
    relationship_health,
    key_context,
    days_since_contact,
    next_action,
    contact_id,
    occasion,
    angle,
    variation_seed,
    card_tone_override,
  } = await req.json();

  const firstName = contact_name?.split(" ")[0] || contact_name;
  const activeAngle = angle && ANGLE_PROMPTS[angle] ? angle : DEFAULT_ANGLE;
  const activeVariationSeed = typeof variation_seed === "number" ? variation_seed : Math.floor(Math.random() * 1000);
  const cardTone = card_tone_override || cardProfile.tone || "casual";

  let journalContext = "";
  let sharedHistory = "";
  let contactTopics: string[] = [];
  let contactCompany = "";
  let contactEmail = "";

  if (contact_id) {
    const { data: contact } = await supabase
      .from("tom_contacts")
      .select("journal_signals, topics, notes, company, job_title, email, industry, company_description, company_size, seniority, funding_stage, technologies, apollo_enriched_at")
      .eq("id", contact_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (contact) {
      // JOURNAL SIGNALS — only use if recent (≤ 180 days) AND high-confidence (≥ 70)
      const signals = contact.journal_signals || [];
      if (signals.length > 0) {
        const sorted = [...signals].sort((a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const best = sorted.find(
          (s: any) => s.confidence >= 70 && isContextFresh(s.date, 180)
        );
        if (best) {
          if (best.notes) journalContext = best.notes;
          if (best.how_they_met) sharedHistory = best.how_they_met;
          if (best.shared_history?.length) sharedHistory += " " + best.shared_history.join(", ");
        }
      }
      contactTopics = contact.topics || [];
      contactCompany = contact.company || "";
      contactEmail = contact.email || "";

      const daysSinceEnrich = contact.apollo_enriched_at
        ? Math.floor((Date.now() - new Date(contact.apollo_enriched_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (daysSinceEnrich > 30 && contactEmail) {
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/contacts/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
          body: JSON.stringify({ contact_id }),
        }).catch(() => {});
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CARD MESSAGES
  // ══════════════════════════════════════════════════════════════════════════
  if (occasion) {
    const cardPrompt = `Write a short handwritten card message FROM ${cardSignoff} TO ${firstName} for a "${occasion}" card.

RULES:
- Start with "${firstName}," on the first line
- 1-2 sentences, warm and genuine
- End with a sign-off on its own line: "${cardSignoff}"
- Use proper capitalization and punctuation
- Natural, human, conversational
- No corporate language, nothing templated
- Do not reference emails, news, work context, or anything outside the occasion
${key_context ? `- Personal context you can draw from: ${key_context}` : ""}
${journalContext ? `- Journal notes: ${journalContext}` : ""}
- Relationship: ${relationship_type?.replace(/_/g, " ") || "contact"}
- Tone: ${cardTone}
- Variation guidance: ${variationInstruction(activeVariationSeed)}
- Format: "${firstName},\\n[message]\\n${cardSignoff}"

${occasion === "Happy Birthday" || occasion === "Birthday" ? `EXAMPLES (do NOT copy — these show tone only):
"${firstName}, wishing you a wonderful birthday. Hope it's a great one.\\n${cardSignoff}"
"${firstName}, happy birthday! Hope you're celebrating another trip around the sun.\\n${cardSignoff}"` : ""}
${occasion === "Thank you" || occasion === "Thank You" ? `EXAMPLES:
"${firstName}, seriously — thank you. It meant more than you know.\\n${cardSignoff}"
"${firstName}, you didn't have to do that, but I'm glad you did.\\n${cardSignoff}"` : ""}
${occasion === "Congratulations" ? `EXAMPLES:
"${firstName}, you did it! Couldn't be more excited for you.\\n${cardSignoff}"
"${firstName}, huge congrats. So well deserved.\\n${cardSignoff}"` : ""}
${occasion === "Thinking of you" || occasion === "Thinking of You" ? `EXAMPLES:
"${firstName}, just thought of you and wanted to say hey. Hope life is good.\\n${cardSignoff}"
"${firstName}, you crossed my mind today. Hope everything's going well.\\n${cardSignoff}"` : ""}
${occasion === "Just because" || occasion === "Just Because" ? `EXAMPLES:
"${firstName}, no reason — just wanted to say I appreciate you.\\n${cardSignoff}"
"${firstName}, one of the good ones. Just wanted you to know.\\n${cardSignoff}"` : ""}

Return ONLY valid JSON: {"message": "message here", "subject": "card"}`;

    let cardRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      cardRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          temperature: 1.0,
          messages: [{ role: "user", content: cardPrompt }],
        }),
      });
      if (cardRes.status !== 529) break;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }

    const occasionFallbacks: Record<string, string> = {
      "Happy Birthday": `${firstName}, wishing you a wonderful birthday. Hope it's a great one.\n${cardSignoff}`,
      "Birthday": `${firstName}, wishing you a wonderful birthday. Hope it's a great one.\n${cardSignoff}`,
      "Thank you": `${firstName}, just wanted to say a real thank you. It meant a lot.\n${cardSignoff}`,
      "Thank You": `${firstName}, just wanted to say a real thank you. It meant a lot.\n${cardSignoff}`,
      "Congratulations": `${firstName}, huge congratulations. So well deserved.\n${cardSignoff}`,
      "Thinking of you": `${firstName}, you've been on my mind. Hope everything is going well.\n${cardSignoff}`,
      "Thinking of You": `${firstName}, you've been on my mind. Hope everything is going well.\n${cardSignoff}`,
      "Just because": `${firstName}, no big reason — just wanted to say I appreciate you.\n${cardSignoff}`,
      "Just Because": `${firstName}, no big reason — just wanted to say I appreciate you.\n${cardSignoff}`,
      "Other": `${firstName}, thinking of you and wanted to reach out.\n${cardSignoff}`,
    };
    const fallbackMessage = occasionFallbacks[occasion] || `${firstName}, thinking of you.\n${cardSignoff}`;

    if (!cardRes || !cardRes.ok) {
      console.error("Anthropic API error on card:", cardRes?.status);
      return NextResponse.json({ message: fallbackMessage, subject: "card" });
    }

    const cardData = await cardRes.json();
    const cardRaw = cardData.content?.[0]?.text?.trim() || "{}";
    try {
      const cleaned = cardRaw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({
        message: parsed.message || fallbackMessage,
        subject: parsed.subject || "card",
      });
    } catch {
      const messageMatch = cardRaw.match(/"message"\s*:\s*"([^"]+)"/);
      if (messageMatch) {
        return NextResponse.json({
          message: messageMatch[1].replace(/\\n/g, "\n"),
          subject: "card",
        });
      }
      return NextResponse.json({ message: fallbackMessage, subject: "card" });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EMAIL DRAFTS
  // ══════════════════════════════════════════════════════════════════════════

  const enrichmentPromises: Promise<string>[] = [];

  if (contactCompany || contact_name) {
    const query = contactCompany
      ? `${contact_name} ${contactCompany} recent news announcements 2026`
      : `${contact_name} recent news 2026`;
    enrichmentPromises.push(searchWithClaude(query));
  } else {
    enrichmentPromises.push(Promise.resolve(""));
  }

  if (contactTopics.length > 0 || contactCompany) {
    const query = contactTopics.length > 0
      ? `${contactTopics.slice(0, 2).join(" ")} industry trends news 2026`
      : `${contactCompany} industry trends 2026`;
    enrichmentPromises.push(searchWithClaude(query));
  } else {
    enrichmentPromises.push(Promise.resolve(""));
  }

  if (contactEmail) {
    enrichmentPromises.push(
      getValidAccessToken(userId)
        .then(token => fetchRecentThread(token, contactEmail, 90))
        .catch(() => "")
    );
  } else {
    enrichmentPromises.push(Promise.resolve(""));
  }

  const [companyNews, industryTrends, recentThread] = await Promise.all(enrichmentPromises);

  // Tier 1 context — filtered by freshness
  const tier1Context = [
    recentThread ? `RECENT EMAIL THREAD (last 90 days):\n${recentThread}` : null,
    journalContext ? `JOURNAL NOTES (recent, high-confidence):\n${journalContext}` : null,
    key_context && days_since_contact < 365 ? `RELATIONSHIP CONTEXT:\n${key_context}` : null,
  ].filter(Boolean).join("\n\n");

  const tier2Context = contactTopics.length > 0 && days_since_contact < 365
    ? `THEIR INTERESTS/TOPICS (use to ask a specific question if nothing else applies):\n${contactTopics.join(", ")}`
    : "";

  // Web search — require current-year markers OR clear event verbs
  const hasUsefulWebSearch = companyNews && companyNews.length > 100 && (
    companyNews.toLowerCase().includes("2026") ||
    companyNews.toLowerCase().includes("launch") ||
    companyNews.toLowerCase().includes("raised") ||
    companyNews.toLowerCase().includes("hired") ||
    companyNews.toLowerCase().includes("promoted") ||
    companyNews.toLowerCase().includes("acquired") ||
    companyNews.toLowerCase().includes("announced")
  );

  // Kill web search if relationship gap is >6 months
  const tier3Context = hasUsefulWebSearch && days_since_contact < 180
    ? `WEB SEARCH (only reference if it's clearly recent, specific, and would naturally come up — otherwise ignore entirely):\n${companyNews}`
    : "";

  const timeAway = days_since_contact < 999
    ? `${days_since_contact} days since last contact`
    : "haven't been in touch in a long time";

  const angleInstruction = ANGLE_PROMPTS[activeAngle];

  const prompt = `You are drafting a short personal outreach email FROM ${userName} TO ${firstName}.

=== DRAFT ANGLE ===
${angleInstruction}

=== VARIATION GUIDANCE ===
${variationInstruction(activeVariationSeed)}

=== RELATIONSHIP ===
Relationship: ${relationship_type?.replace(/_/g, " ") || "contact"}
${contactCompany ? `Works at: ${contactCompany}` : ""}
Time since last contact: ${timeAway}

=== CONTEXT (use only what's fresh) ===
${tier1Context || "No direct recent context available — write something simple and warm."}

${tier2Context}

${tier3Context}

${userInterests.length > 0 && days_since_contact < 365 ? `WHAT WE KNOW ABOUT THE SENDER:
${userInterests.length > 0 ? `Interests: ${userInterests.join(", ")}` : ""}

Use ONLY if there's a natural, genuine connection. Never force it.` : ""}

=== STRICT RULES ===
1. 2-3 sentences max. Short. Human. Direct.
2. If context is limited, write SHORTER, not longer.
3. NEVER reference anything not explicitly in the context above. No invented memories, events, trips.
4. NEVER use these phrases: "hope you're well", "touching base", "checking in", "reaching out", "hope this finds you", "just wanted to", "been meaning to reach out", "I was thinking of you", "it's been a while", "we lost touch", "I was reviewing my contacts", "miss your face", "feels like forever", "been ages", "it's been too long".
5. Do NOT start with their name or any greeting. Start mid-thought.
6. Tone: casual and warm. Never corporate, never salesy.
7. NEVER assume how they felt about something.
8. Never ask more than one question.
9. Use proper capitalization and punctuation.

=== OUTPUT ===
Return ONLY valid JSON, no markdown:
{"message": "message here", "subject": "subject here (4 words max, proper capitalization)"}`;

  const emailFallback = `Been thinking about what you're up to lately — how's everything going?`;
  const subjectFallback = `Quick hello`;

  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          temperature: 1.0,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.status !== 529) break;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }

    const rawBody = await res!.text();
    const data = JSON.parse(rawBody);
    const raw = data.content?.[0]?.text?.trim() || "{}";

    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({
        message: parsed.message || emailFallback,
        subject: parsed.subject || subjectFallback,
      });
    } catch {
      const messageMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
      const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/);
      if (messageMatch) {
        return NextResponse.json({
          message: messageMatch[1],
          subject: subjectMatch?.[1] || subjectFallback,
        });
      }
      return NextResponse.json({ message: emailFallback, subject: subjectFallback });
    }
  } catch {
    return NextResponse.json({ message: emailFallback, subject: subjectFallback });
  }
}

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { contact_id } = await req.json();
  if (!contact_id) return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
  await supabase
    .from("tom_contacts")
    .update({ last_reached_out_at: new Date().toISOString() })
    .eq("id", contact_id)
    .eq("user_id", userId);
  return NextResponse.json({ success: true });
}