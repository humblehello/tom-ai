// cache-bust: 4
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

// ── Web search helper ────────────────────────────────────────────────────────
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

// ── Gmail thread helper ──────────────────────────────────────────────────────
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

// ── Recent shared events extractor ───────────────────────────────────────────
function extractRecentSharedEvents(sharedEvents: any[], maxAgeDays: number = 365): string {
  if (!Array.isArray(sharedEvents) || sharedEvents.length === 0) return "";
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const recent = sharedEvents
    .filter((e: any) => {
      const t = new Date(e.date).getTime();
      return !isNaN(t) && t >= cutoff;
    })
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  if (recent.length === 0) return "";
  return recent
    .map((e: any) => {
      const d = new Date(e.date);
      const monthYear = d.toLocaleString("en-US", { month: "short", year: "numeric" });
      return `${monthYear}: ${e.title || e.type || "meeting"}`;
    })
    .join("; ");
}

// ── Intelligence summarizer — pulls personal facts out of the JSON blob ─────
function summarizeIntelligence(intelligence: any): string {
  if (!intelligence) return "";
  const bits: string[] = [];

  const family = intelligence.family;
  if (family?.kids?.length) {
    const kidCount = family.kids.length;
    bits.push(`has ${kidCount} ${kidCount === 1 ? "child" : "kids"}`);
  }
  if (family?.partner) bits.push(`partner: ${family.partner}`);

  const pets = intelligence.pets;
  if (Array.isArray(pets) && pets.length > 0) {
    const petBits = pets.map((p: any) => p.name ? `${p.type || "pet"} named ${p.name}` : p.type).filter(Boolean);
    if (petBits.length) bits.push(`pets: ${petBits.join(", ")}`);
  }

  const sports = intelligence.sports;
  if (sports?.teams?.length) bits.push(`fan of: ${sports.teams.join(", ")}`);
  if (sports?.plays?.length) bits.push(`plays: ${sports.plays.join(", ")}`);

  const interests = intelligence.interests;
  if (interests?.travel?.length) bits.push(`recently traveled to: ${interests.travel.join(", ")}`);
  if (interests?.books?.length) bits.push(`reading: ${interests.books.slice(0, 3).join(", ")}`);
  if (interests?.cars?.length) bits.push(`drives: ${interests.cars.join(", ")}`);

  const civic = intelligence.civic;
  if (civic?.nonprofits?.length) bits.push(`involved with: ${civic.nonprofits.join(", ")}`);

  const linkedin = intelligence.linkedin;
  if (linkedin?.enrichment?.narrative_summary) {
    bits.push(`Background: ${linkedin.enrichment.narrative_summary.slice(0, 400)}`);
  }
  if (linkedin?.enrichment?.education?.length) {
    const schools = linkedin.enrichment.education.map((e: any) => e.school).filter(Boolean);
    if (schools.length) bits.push(`studied at: ${schools.join(", ")}`);
  }
  if (linkedin?.enrichment?.affiliations?.length) {
    bits.push(`affiliations: ${linkedin.enrichment.affiliations.join(", ")}`);
  }

  return bits.join(" | ");
}

// ── Tag summarizer — high-confidence facts ──────────────────────────────────
function summarizeTags(tags: any[]): string {
  if (!Array.isArray(tags) || tags.length === 0) return "";
  return tags
    .filter((t: any) => t.confidence >= 80)
    .map((t: any) => t.value)
    .filter(Boolean)
    .slice(0, 8)
    .join("; ");
}

// ── Context richness scoring (0–100) ────────────────────────────────────────
interface ContextScore {
  score: number;
  reasons: string[];
}
function scoreContext(parts: {
  keyContext?: string;
  intelligenceSummary?: string;
  tagsSummary?: string;
  topicsTheyCareAbout?: string[];
  topics?: string[];
  recentEvents?: string;
  recentThread?: string;
  webSearch?: string;
  notes?: string;
  notesContext?: string;
  metWhere?: string;
}): ContextScore {
  let score = 0;
  const reasons: string[] = [];

  if (parts.keyContext && parts.keyContext.length > 30) { score += 20; reasons.push("key_context"); }
  if (parts.intelligenceSummary && parts.intelligenceSummary.length > 30) { score += 25; reasons.push("intelligence"); }
  if (parts.tagsSummary && parts.tagsSummary.length > 20) { score += 15; reasons.push("tags"); }
  if (parts.topicsTheyCareAbout && parts.topicsTheyCareAbout.length >= 4) { score += 25; reasons.push("topics_they_care_about_rich"); }
else if (parts.topicsTheyCareAbout && parts.topicsTheyCareAbout.length >= 2) { score += 18; reasons.push("topics_they_care_about"); }
  if (parts.topics && parts.topics.length >= 3) { score += 5; reasons.push("topics"); }
  if (parts.recentEvents && parts.recentEvents.length > 10) { score += 10; reasons.push("shared_events"); }
  if (parts.recentThread && parts.recentThread.length > 50) { score += 15; reasons.push("recent_email"); }
  if (parts.webSearch && parts.webSearch.length > 100) { score += 10; reasons.push("web_search"); }
  if (parts.notes && parts.notes.length > 50) { score += 5; reasons.push("notes"); }
  if (parts.notesContext && parts.notesContext.length > 50) { score += 5; reasons.push("notes_context"); }
  if (parts.metWhere) { score += 3; reasons.push("met_where"); }

  return { score: Math.min(score, 100), reasons };
}

// ── Angle prompts ────────────────────────────────────────────────────────────
const ANGLE_PROMPTS: Record<string, string> = {
  casual: "Casual catch-up. Reference at least one specific fact about them if context allows.",
  curious: "Ask one specific question grounded in something you actually know about them.",
  recent_event: "Reference a recent shared event, recent email, or recent news naturally — but only if context provides one.",
  quick_hi: "Ultra-brief reconnection. One specific reference if available, otherwise just a warm hello.",
};
const DEFAULT_ANGLE = "casual";

function variationInstruction(seed: number): string {
  const styles = [
    "Lead with the specific fact, then ask the question.",
    "Open with a question grounded in what you know.",
    "Reference the specific thing first, casually.",
    "Keep it short — under 30 words if you can.",
    "Make it feel off-the-cuff but specific.",
  ];
  return styles[seed % styles.length];
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── User + plan setup ─────────────────────────────────────────────────────
  const { data: userData } = await supabase
    .from("tom_users")
    .select("name, interests, journal_context, card_profile")
    .eq("id", userId)
    .maybeSingle();
  const userName = userData?.name?.split(" ")[0] || "the user";
  const userInterests: string[] = userData?.interests || [];
  const cardProfile = userData?.card_profile || {};
  const cardSignoff = cardProfile.signoff || userName;

  const { data: planData } = await supabase
    .from("tom_users")
    .select("plan, ai_drafts_used, ai_drafts_reset_at, trial_ends_at, stripe_subscription_id")
    .eq("id", userId)
    .single();

  let plan: Plan = (planData?.plan || "free") as Plan;
  const trialExpired = planData?.trial_ends_at && new Date(planData.trial_ends_at) < new Date();
  const hasSubscription = !!planData?.stripe_subscription_id;
  if (plan === "trial" && trialExpired && !hasSubscription) plan = "free";

  const draftLimit = DRAFT_LIMITS[plan];
  const resetDays = DRAFT_RESET_DAYS[plan];
  const draftsUsed = planData?.ai_drafts_used || 0;
  const resetAt = planData?.ai_drafts_reset_at ? new Date(planData.ai_drafts_reset_at) : null;
  if (resetAt && resetAt < new Date()) {
    await supabase.from("tom_users").update({
      ai_drafts_used: 0,
      ai_drafts_reset_at: new Date(Date.now() + resetDays * 24 * 60 * 60 * 1000).toISOString(),
    }).eq("id", userId);
  }
  if (draftsUsed >= draftLimit) {
    return NextResponse.json({
      error: "draft_limit_reached", limit: draftLimit, plan,
      reset_at: planData?.ai_drafts_reset_at || null,
    }, { status: 402 });
  }
  await supabase.from("tom_users").update({ ai_drafts_used: draftsUsed + 1 }).eq("id", userId);

  // ── Request parse ─────────────────────────────────────────────────────────
  const {
    contact_name, relationship_type, relationship_health, key_context: bodyKeyContext,
    days_since_contact, contact_id, occasion, angle, variation_seed, card_tone_override,
  } = await req.json();

  const firstName = contact_name?.split(" ")[0] || contact_name;
  const activeAngle = angle && ANGLE_PROMPTS[angle] ? angle : DEFAULT_ANGLE;
  const activeVariationSeed = typeof variation_seed === "number" ? variation_seed : Math.floor(Math.random() * 1000);
  const cardTone = card_tone_override || cardProfile.tone || "casual";

  // ── Pull EVERYTHING about the contact ─────────────────────────────────────
  let contactRow: any = null;
  if (contact_id) {
    const { data } = await supabase
      .from("tom_contacts")
      .select(`
        full_name, email, company, job_title, industry,
        key_context, notes, notes_context, relationship_context,
        topics, topics_they_care_about, tags, intelligence, journal_signals,
        shared_events, met_where, communication_style, best_channel,
        last_purchase_at, last_purchase_notes, apollo_enriched_at,
        company_description, seniority
      `)
      .eq("id", contact_id)
      .eq("user_id", userId)
      .maybeSingle();
    contactRow = data;
  }

  // Build summarized inputs
  const keyContext = contactRow?.key_context || bodyKeyContext || "";
  const intelligenceSummary = summarizeIntelligence(contactRow?.intelligence);
  const tagsSummary = summarizeTags(contactRow?.tags || []);
  const topicsTheyCareAbout: string[] = contactRow?.topics_they_care_about || [];
  const topics: string[] = contactRow?.topics || [];
  const recentEvents = extractRecentSharedEvents(contactRow?.shared_events || [], 365);
  const contactEmail = contactRow?.email || "";
  const contactCompany = contactRow?.company || "";
  const contactJobTitle = contactRow?.job_title || "";
  const metWhere = contactRow?.met_where || "";
  const notes = contactRow?.notes || "";
  const notesContext = contactRow?.notes_context || "";
  const communicationStyle = contactRow?.communication_style || "";
  const lastPurchaseNotes = contactRow?.last_purchase_notes || "";

  // Journal signals — fresh + high-confidence
  let journalContext = "";
  if (contactRow?.journal_signals?.length) {
    const sorted = [...contactRow.journal_signals].sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const best = sorted.find((s: any) => {
      const ageDays = (Date.now() - new Date(s.date).getTime()) / (1000 * 60 * 60 * 24);
      return s.confidence >= 70 && ageDays <= 365;
    });
    if (best?.notes) journalContext = best.notes;
  }

  // Trigger background enrichment refresh if stale
  const daysSinceEnrich = contactRow?.apollo_enriched_at
    ? Math.floor((Date.now() - new Date(contactRow.apollo_enriched_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  if (daysSinceEnrich > 30 && contactEmail) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/contacts/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `tom_session=${userId}` },
      body: JSON.stringify({ contact_id }),
    }).catch(() => {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CARD MESSAGES (unchanged from before — not the focus of this fix)
  // ══════════════════════════════════════════════════════════════════════════
  if (occasion) {
    const cardPrompt = `Write a short handwritten card message FROM ${cardSignoff} TO ${firstName} for a "${occasion}" card.

RULES:
- Start with "${firstName}," on the first line
- 1-2 sentences, warm and genuine
- End with a sign-off on its own line: "${cardSignoff}"
- Use proper capitalization and punctuation
- Natural, human, conversational — no corporate language
- Do not reference emails, news, work context unless directly relevant to the occasion
${keyContext ? `- Personal context: ${keyContext}` : ""}
${journalContext ? `- Journal notes: ${journalContext}` : ""}
- Relationship: ${relationship_type?.replace(/_/g, " ") || "contact"}
- Tone: ${cardTone}
- Format: "${firstName},\\n[message]\\n${cardSignoff}"

Return ONLY valid JSON: {"message": "message here", "subject": "card"}`;

    let cardRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      cardRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 300, temperature: 1.0, messages: [{ role: "user", content: cardPrompt }] }),
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
      return NextResponse.json({ message: fallbackMessage, subject: "card", confidence: 0.3 });
    }
    const cardData = await cardRes.json();
    const cardRaw = cardData.content?.[0]?.text?.trim() || "{}";
    try {
      const cleaned = cardRaw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ message: parsed.message || fallbackMessage, subject: parsed.subject || "card", confidence: 0.7 });
    } catch {
      const messageMatch = cardRaw.match(/"message"\s*:\s*"([^"]+)"/);
      if (messageMatch) {
        return NextResponse.json({ message: messageMatch[1].replace(/\\n/g, "\n"), subject: "card", confidence: 0.7 });
      }
      return NextResponse.json({ message: fallbackMessage, subject: "card", confidence: 0.3 });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EMAIL DRAFTS — TWO-MODE LOGIC
  // ══════════════════════════════════════════════════════════════════════════

  // Pull dynamic context (web search + recent thread) in parallel
  const enrichmentPromises: Promise<string>[] = [];

  if (contactCompany || contact_name) {
    const query = contactCompany
      ? `${contact_name} ${contactCompany} recent news announcements 2026`
      : `${contact_name} recent news 2026`;
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

  const [companyNews, recentThread] = await Promise.all(enrichmentPromises);

  // Validate web search — current-year markers OR clear event verbs
  const hasUsefulWebSearch = companyNews && companyNews.length > 100 && (
    companyNews.toLowerCase().includes("2026") ||
    /\b(launch|raised|hired|promoted|acquired|announced|appointed|opened|closed)\b/i.test(companyNews)
  );
  const webSearchContext = hasUsefulWebSearch ? companyNews : "";

  // ── Score the context ─────────────────────────────────────────────────────
  const { score, reasons } = scoreContext({
    keyContext,
    intelligenceSummary,
    tagsSummary,
    topicsTheyCareAbout,
    topics,
    recentEvents,
    recentThread,
    webSearch: webSearchContext,
    notes,
    notesContext,
    metWhere,
  });

  // Lowered 2026-05-10: 60 was too strict — contacts with strong intelligence
  // signals (e.g. known new baby) should go personal even without other context.
  const PERSONAL_THRESHOLD = 35;
  const isPersonalMode = score >= PERSONAL_THRESHOLD;

  // ── LOW-CONFIDENCE PATH: honest fallback ──────────────────────────────────
  if (!isPersonalMode) {
    // Don't even call Claude when we don't have enough — generate a clean simple message deterministically.
    // Avoids any phrasing that centers the writer's inner state ("you've been on my mind", "thinking of you")
    // since those land creepy when context is thin.
    const lowConfMessages = [
      `${firstName}, hope all is well with you. I know life gets busy and time moves fast, but I wanted to check in and see how things have been going for you lately. Let’s find time to catch up soon when schedules calm down a bit.`,
       `Hey ${firstName} — checking in to see how things are going. Hope all is well.`,
        `Hey ${firstName} — just wanted to reach out and say I hope you’re doing well. Feels like it’s been a minute since we last connected, and I’d genuinely love to hear what’s new in your world whenever you have some time.`,
      `${firstName}, it's been a while. Hope your year is going well — would love to catch up soon.`,
      `Hey ${firstName} — you crossed my mind today and I realized it’s been way too long since we last caught up. Hope life’s treating you well and things are moving in a good direction on your end. Would love to reconnect sometime soon.`,
      `Hey ${firstName}, hope you're doing well. Let's grab coffee or jump on a call sometime soon.`,
      `${firstName} — just wanted to check in. How's everything going?`,
      `Hey ${firstName}, hope all is well on your end. Let me know if you're around to catch up sometime.`,
    ];
    const message = lowConfMessages[activeVariationSeed % lowConfMessages.length];
    return NextResponse.json({
      message,
      subject: "Hey",
      confidence: score / 100,
      mode: "generic",
      missing_context: true,
      score_reasons: reasons,
      hint: "Add notes, journal entries, or let enrichment run to unlock personalized drafts for this contact.",
    });
  }

  // ── HIGH-CONFIDENCE PATH: personal mode ───────────────────────────────────
  const angleInstruction = ANGLE_PROMPTS[activeAngle];

  // Build a structured FACTS block — Claude reads from this instead of inferring
  const factsBlock: string[] = [];
  if (keyContext) factsBlock.push(`KEY RELATIONSHIP CONTEXT: ${keyContext}`);
  if (intelligenceSummary) factsBlock.push(`PERSONAL FACTS: ${intelligenceSummary}`);
  if (tagsSummary) factsBlock.push(`TAGS (high-confidence): ${tagsSummary}`);
  // PRIMARY: topics_they_care_about — the highest-signal field for personalization
if (topicsTheyCareAbout.length) {
  factsBlock.push(`★ WHAT THEY CARE ABOUT (this is your richest signal — anchor on one of these whenever possible):\n${topicsTheyCareAbout.map((t: string) => `  • ${t}`).join("\n")}`);
}
if (topics.length) factsBlock.push(`TOPICS DISCUSSED IN THE PAST: ${topics.slice(0, 8).join(", ")}`);
  if (contactJobTitle && contactCompany) factsBlock.push(`ROLE: ${contactJobTitle} at ${contactCompany}`);
  else if (contactCompany) factsBlock.push(`COMPANY: ${contactCompany}`);
  if (metWhere) factsBlock.push(`HOW WE MET: ${metWhere}`);
  if (recentEvents) factsBlock.push(`RECENT SHARED EVENTS: ${recentEvents}`);
  if (notesContext) factsBlock.push(`DETAILED NOTES: ${notesContext.slice(0, 600)}`);
  else if (notes) factsBlock.push(`NOTES: ${notes.slice(0, 600)}`);
  if (journalContext) factsBlock.push(`JOURNAL: ${journalContext}`);
  if (communicationStyle) factsBlock.push(`COMMUNICATION STYLE: ${communicationStyle}`);
  if (lastPurchaseNotes) factsBlock.push(`PURCHASE HISTORY: ${lastPurchaseNotes}`);
  if (recentThread) factsBlock.push(`RECENT EMAIL THREAD (last 90 days):\n${recentThread}`);
  if (webSearchContext) factsBlock.push(`RECENT NEWS (web search — only reference if clearly relevant):\n${webSearchContext}`);

  const timeAway = days_since_contact < 999
    ? `${days_since_contact} days since last contact`
    : "haven't been in touch in a long time";

  const prompt = `You are drafting a short, warm personal checkin email FROM ${userName} TO ${firstName}. This is a "haven't talked in a while, just wanted to see how you're doing" message — not an outreach pitch, not a follow-up. ${userName} has no agenda. They're just genuinely checking in on someone they care about.

=== FACTS YOU KNOW ABOUT ${firstName.toUpperCase()} ===
${factsBlock.join("\n\n")}

=== RELATIONSHIP ===
${relationship_type?.replace(/_/g, " ") || "contact"} · ${timeAway}

=== ANGLE ===
${angleInstruction}

=== VARIATION GUIDANCE ===
${variationInstruction(activeVariationSeed)}

=== HARD REQUIREMENTS ===
1. Anchor the message in at least ONE specific fact from the facts block above. The anchor is what makes it feel personal — without it, the message is just words.
2. PREFERRED ANCHOR: when "★ WHAT THEY CARE ABOUT" exists, draw from it first. Those topics are what energizes this person — referencing one creates the warmest opening.
3. The anchor must point OUTWARD — to a thing, event, place, project, person they love, or topic — NEVER inward to YOUR emotional state about them.
4. 2-4 sentences max. Direct. Human. Conversational.
5. Pick a SINGLE genuine anchor — don't try to mention three things.
6. NEVER fabricate. Only reference facts that are explicitly listed above.
7. BANNED phrases (these are creepy, weirdly intimate, or pure corporate cliché — never use any of them):
   - "you've been on my mind", "you crossed my mind", "you popped into my head", "I was thinking about you"
   - "miss your face", "miss you" (unless very close family)
   - "touching base", "circling back", "reaching out" (corporate clichés — but "checking in" is fine and warm)
   - "just wanted to", "just thought I'd" (vague filler)
   - "I've been meaning to" (sounds guilty/transactional)
8. ENCOURAGED PHRASES (these are warm checkin language — use freely when natural):
   - "checking in to see how you're doing"
   - "hope all is well"
   - "hope you're doing well"
   - "it's been a while"
   - "would love to catch up"
   - "let's grab coffee/lunch sometime"
9. Greeting style: "Hey ${firstName}," or "${firstName} —" both work. Casual openings encouraged.
10. Use proper capitalization and punctuation.
11. Tone: warm, casual, like textin

=== OUTPUT ===
Return ONLY valid JSON, no markdown:
{"message": "message text", "subject": "subject (4 words max, proper capitalization)"}`;

  const personalFallback = `Hey ${firstName} — just wanted to check in and see how you're doing. Hope all is well, would love to catch up soon.`;
  const subjectFallback = `Checking in`;

  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", // Sonnet for personal mode — we want better instruction following
          max_tokens: 1000,
          temperature: 0.9,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.status !== 529) break;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }

    if (!res || !res.ok) {
      return NextResponse.json({
        message: personalFallback, subject: subjectFallback,
        confidence: score / 100, mode: "personal", error: "api_failed",
      });
    }

    const rawBody = await res.text();
    const data = JSON.parse(rawBody);
    const raw = data.content?.[0]?.text?.trim() || "{}";

    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({
        message: parsed.message || personalFallback,
        subject: parsed.subject || subjectFallback,
        confidence: score / 100,
        mode: "personal",
        score_reasons: reasons,
      });
    } catch {
      const messageMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
      const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/);
      if (messageMatch) {
        return NextResponse.json({
          message: messageMatch[1],
          subject: subjectMatch?.[1] || subjectFallback,
          confidence: score / 100,
          mode: "personal",
          score_reasons: reasons,
        });
      }
      return NextResponse.json({
        message: personalFallback, subject: subjectFallback,
        confidence: score / 100, mode: "personal",
      });
    }
  } catch {
    return NextResponse.json({
      message: personalFallback, subject: subjectFallback,
      confidence: score / 100, mode: "personal",
    });
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