import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getValidAccessToken } from "../../../lib/google";
import { createGoogleContact, updateGoogleContact } from "../../../lib/googleContacts";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const ANALYSIS_VERSION = "v6-adaptive-lens";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────
// /api/extension/contact-save
//
// Unified endpoint that handles both create-new and update-existing.
// Consumes 1 credit if it has to run analysis itself.
// Always runs enrichment (no extra credit).
// ─────────────────────────────────────────────────────────────────────

type Plan = "free" | "pro" | "growth";

const PLAN_CAPS: Record<Plan, { monthly: number; daily: number | null }> = {
  free:   { monthly: 5,   daily: null },
  pro:    { monthly: 50,  daily: 30 },
  growth: { monthly: 200, daily: 30 },
};

// ── Helpers ──────────────────────────────────────────────────────────

function extractLinkedInUsername(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "";
  const cleaned = url.toLowerCase().trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/$/, "");
  const match = cleaned.match(/linkedin\.com\/(?:in|pub)\/([^\/]+)/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

function canonicalLinkedInUrl(username: string): string {
  if (!username) return "";
  return `https://www.linkedin.com/in/${username}/`;
}

function normalizeForCompare(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return "";
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripSlugSuffix(slug: string): string {
  return slug.replace(/-[a-z0-9]{6,}$/i, "");
}

function inferSeniority(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|cpo|chief\s|founder|co-founder|owner|partner|managing director|md\b|president)\b/.test(t)) return "C-Suite";
  if (/\b(vp|vice president|svp|evp|head of)\b/.test(t)) return "VP";
  if (/\bdirector\b/.test(t)) return "Director";
  if (/\b(senior manager|principal|staff|lead)\b/.test(t)) return "Senior";
  if (/\bmanager\b/.test(t)) return "Manager";
  if (/\b(senior|sr\.?)\b/.test(t)) return "Senior IC";
  if (/\b(junior|jr\.?|associate|coordinator|assistant|intern)\b/.test(t)) return "Junior";
  return "IC";
}

// ── Match contact (same logic as analyze route) ──────────────────────

async function findExistingContact(
  userId: string,
  linkedinUrl: string,
  name: string,
  email: string | null,
  company: string | null
) {
  const username = extractLinkedInUsername(linkedinUrl);
  const usernameNormalized = normalizeForCompare(username);

  if (username) {
    const { data: byUrl } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%/in/${username}%`)
      .limit(1);
    if (byUrl && byUrl.length > 0) return byUrl[0];

    const { data: byPub } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%/pub/${username}%`)
      .limit(1);
    if (byPub && byPub.length > 0) return byPub[0];
  }

  if (usernameNormalized) {
    const { data: allWithUrl } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .not("linkedin_url", "is", null);

    if (allWithUrl && allWithUrl.length > 0) {
      const candidates = allWithUrl.filter((c) => {
        const dbSlug = extractLinkedInUsername(c.linkedin_url);
        const dbNormalized = normalizeForCompare(dbSlug);
        const dbStripped = normalizeForCompare(stripSlugSuffix(dbSlug));
        return dbNormalized === usernameNormalized || dbStripped === usernameNormalized;
      });
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) {
        const targetName = normalizeForCompare(name);
        const nameMatch = candidates.find((c) => normalizeForCompare(c.full_name) === targetName);
        if (nameMatch) return nameMatch;
      }
    }
  }

  if (email) {
    const { data: byEmail } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .ilike("email", email.trim())
      .limit(1);
    if (byEmail && byEmail.length > 0) return byEmail[0];
  }

  if (name && company) {
    const { data: byNameCompany } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .ilike("full_name", name)
      .ilike("company", company)
      .limit(1);
    if (byNameCompany && byNameCompany.length > 0) return byNameCompany[0];
  }

  if (name && name.split(/\s+/).length >= 2) {
    const { data: byName } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("user_id", userId)
      .ilike("full_name", name)
      .is("linkedin_url", null)
      .limit(2);
    if (byName && byName.length === 1) return byName[0];
  }

  return null;
}

// ── Cap enforcement ──────────────────────────────────────────────────

async function getUsage(userId: string) {
  const { data: user } = await supabase
    .from("tom_users")
    .select("plan")
    .eq("id", userId)
    .single();

  const plan = ((user?.plan || "free").toLowerCase()) as Plan;
  const caps = PLAN_CAPS[plan] || PLAN_CAPS.free;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count: monthlyCount } = await supabase
    .from("relationship_index_credits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count: dailyCount } = await supabase
    .from("relationship_index_credits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", dayStart.toISOString());

  return {
    monthly_used: monthlyCount || 0,
    monthly_cap: caps.monthly,
    daily_used: dailyCount || 0,
    daily_cap: caps.daily,
    plan,
  };
}

function checkCaps(usage: any): { ok: boolean; reason?: "monthly" | "daily"; detail?: string } {
  if (usage.daily_cap !== null && usage.daily_used >= usage.daily_cap) {
    return {
      ok: false,
      reason: "daily",
      detail: `Daily limit reached (${usage.daily_used}/${usage.daily_cap}). Try again tomorrow.`,
    };
  }
  if (usage.monthly_used >= usage.monthly_cap) {
    return {
      ok: false,
      reason: "monthly",
      detail: `Monthly limit reached (${usage.monthly_used}/${usage.monthly_cap}).`,
    };
  }
  return { ok: true };
}

async function consumeCredit(
  userId: string,
  contactId: string | null,
  linkedinUrl: string | null
): Promise<boolean> {
  const { error } = await supabase.from("relationship_index_credits").insert({
    user_id: userId,
    consumed_at: new Date().toISOString(),
    contact_id: contactId,
    linkedin_url: linkedinUrl,
    cached: false,
  });
  if (error) {
    console.error("[contact-save:consumeCredit] FAILED:", error);
    return false;
  }
  return true;
}

// ── Archetype mapping ────────────────────────────────────────────────

function mapBigFiveToArchetype(bigFive: any) {
  const c = bigFive.conscientiousness?.score || 50;
  const e = bigFive.extraversion?.score || 50;
  const o = bigFive.openness?.score || 50;
  const a = bigFive.agreeableness?.score || 50;

  let name: string;
  if (c >= 60 && e >= 60) name = "Driver";
  else if (c >= 60 && e < 60) name = "Analyst";
  else if (c < 60 && e >= 60) name = "Connector";
  else name = "Observer";

  const descriptors: string[] = [];
  if (name === "Driver") descriptors.push("Bold");
  if (name === "Analyst") descriptors.push("Methodical");
  if (name === "Connector") descriptors.push("Energetic");
  if (name === "Observer") descriptors.push("Reserved");
  if (o >= 70) descriptors.push("Curious");
  else if (o <= 40) descriptors.push("Practical");
  if (a >= 70) descriptors.push("Warm");
  else if (a <= 40) descriptors.push("Direct");

  return { name, descriptors: descriptors.slice(0, 3), quadrant: { x: e, y: c } };
}

// ── Claude prompts ──────────────────────────────────────────────────

function buildAnalysisPrompt(): string {
  return `You are a behavioral analyst writing for relationship-driven sellers and connectors. Read LinkedIn profiles and produce concise, actionable communication guidance grounded in the Big Five personality model.

# Boundaries
- Use Big Five trait names only: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.
- Do NOT use proprietary assessment terminology from any commercial vendor.
- Use only these archetype names: Driver, Analyst, Connector, Observer.

# Lens
- "executive": C-suite/VP/Director/Owner/Founder. ROI framing, brief, time-respectful.
- "champion": Manager/Senior/Lead. Help them sell internally.
- "peer": Same level/industry. Mutual interest, low-pressure.
- "gatekeeper": EA/Coordinator. Acknowledge role, never bypass.

# Confidence
80-100 multiple strong, 60-79 one strong, 40-59 defensible, 20-39 weak, 0-19 NULL

# Output: JSON only, no markdown:
{
  "big_five": {
    "openness": { "score": 0-100, "confidence": 0-100, "evidence": "..." },
    "conscientiousness": { ... }, "extraversion": { ... }, "agreeableness": { ... }, "neuroticism": { ... }
  },
  "archetype_essence": "ONE sentence (max 25 words)",
  "lens": "executive | champion | peer | gatekeeper",
  "lens_rationale": "ONE sentence",
  "communication_summary": "ONE sentence",
  "strongest_behaviors": ["behavior 1 (15-25 words)", "behavior 2", "behavior 3"],
  "watch_outs": ["watch-out 1 (15-25 words)", "watch-out 2"],
  "likely_beliefs": ["first-person belief 1", "first-person belief 2"],
  "influencing_them": {
    "first_contact": "1-2 sentences", "presentation": "1-2 sentences",
    "objections": "1-2 sentences", "closing": "1-2 sentences", "follow_up": "1-2 sentences"
  },
  "dynamics": { "when_engaged": "1 sentence", "when_stressed": "1 sentence" },
  "outreach": {
    "openers": [
      { "angle": "Direct", "subject_line": "...", "body": "..." },
      { "angle": "Curious", "subject_line": "...", "body": "..." },
      { "angle": "Personal", "subject_line": "...", "body": "..." }
    ]
  },
  "interests": {
    "professional": ["..."], "personal": ["..."],
    "topics_summary": "comma-separated, max 10",
    "evidence": "Brief note"
  },
  "data_quality": "high | medium | low",
  "summary_evidence": "2-3 sentence synthesis"
}

NEVER fabricate. Sparse profiles → confidence 30-50, data_quality "low". Tilt every recommendation through the lens.`;
}

function buildEnrichmentPrompt(): string {
  return `You are extracting structured personal context from a LinkedIn profile. Your output goes directly into a relationship CRM, so accuracy is paramount.

# THE ABSOLUTE RULE
You may only describe what is LITERALLY PRESENT in the profile data provided. If you cannot point to a specific phrase, role, school, or detail in the profile that backs up something you wrote, you MUST NOT write it.

Inventing details — even plausible-sounding ones — corrupts the user's relationship data. This is the worst possible outcome.

# When data is sparse
If the profile contains only a name, headline, and minimal other info (e.g., just 1-2 short job titles, no about, no real description), DO NOT try to write a narrative. Set "narrative_summary": null.

A null narrative is far better than a fabricated one. Users would rather see "no summary available" than read fiction about their contact.

# Hallucination patterns to avoid
NEVER invent:
- Companies the person hasn't worked at (no "previously worked at Google/Stripe/Amazon" unless their experience explicitly says so)
- Schools they didn't attend (no "Stanford graduate" unless their education shows Stanford)
- Cities they don't live in (only use what their location field says)
- Family details, hobbies, interests not mentioned in the profile
- Industries/specializations not in their job titles or about section

If a profile mentions only "Student Assistance Coordinator at Muncie Community Schools" — that's ALL you know. Don't infer that they "focus on student wellness" or "champion educational equity" unless the profile actually uses those phrases.

# Output format
Two things:
1. narrative_summary — 2-4 sentence third-person briefing, OR null if data is too sparse
2. Structured signals — ONLY for things explicitly evidenced

# Good narrative examples (real evidence)
Profile: "Sales and Account Management at America's Floor Source, Indianapolis IN. Previously Company Owner at Old Meridian Home Inspections. Education: Ball State University - Master of Arts, Curriculum and Educational Technology."
Narrative: "Sales and Account Manager at America's Floor Source in Indianapolis. Previously ran his own home inspection company for nearly five years. Holds a Master's in Curriculum and Educational Technology from Ball State University."

# Bad narrative examples (would be hallucination)
Profile data: just "Caleb Beasley, Student Assistance Coordinator at Muncie Community Schools"
WRONG narrative: "Education professional focused on student wellness and academic success at Muncie schools" (invents focus area)
WRONG narrative: "Product Manager at Ramp focused on financial operations" (invents entire career)
RIGHT narrative: null  (the profile is too thin to summarize)

# Signals to extract
ONLY include keys with evidenced data. Omit keys that have no evidence.
- professional_topics: industries/specializations EXPLICITLY mentioned in headline/about/job descriptions
- personal_topics: interests/hobbies/causes EXPLICITLY mentioned (NOT inferred from job)
- family: spouse/kids/parental status only if literally stated
- pets: only if literally stated
- education: schools/degrees from the education section
- affiliations: organizations/groups/churches literally mentioned
- places: current_city from location field; hometown/lived_in only if mentioned
- languages: from languages section only
- side_projects: only if explicitly mentioned

# Output JSON only, no markdown:
{
  "narrative_summary": "<text or null>",
  "professional_topics": ["..."],
  "personal_topics": ["..."],
  "family": { "spouse": "...", "kids": ["..."], "kids_count": N },
  "pets": [{ "name": "...", "type": "..." }],
  "education": [{ "school": "...", "degree": "...", "years": "..." }],
  "affiliations": ["..."],
  "places": { "current_city": "...", "hometown": "...", "lived_in": ["..."] },
  "languages": ["..."],
  "side_projects": ["..."]
}

If you have nothing evidenced for a key, omit the entire key. Returning {"narrative_summary": null} alone is fine.`;
}

function buildAnalysisUserMessage(payload: any): string {
  const sections = [];
  sections.push(`# Profile Analysis Request`);
  sections.push(`**Name**: ${payload.name || "Unknown"}`);
  sections.push(`**LinkedIn URL**: ${payload.linkedin_url || ""}`);
  if (payload.headline) sections.push(`**Headline**: ${payload.headline}`);
  if (payload.location) sections.push(`**Location**: ${payload.location}`);
  if (payload.connection_count) sections.push(`**Network**: ${payload.connection_count}`);
  if (payload.about) sections.push(`\n**About**:\n${payload.about}`);

  if (payload.experience?.length) {
    sections.push(`\n**Experience**:`);
    payload.experience.slice(0, 8).forEach((exp: any) => {
      sections.push(`- ${exp.title || ""} at ${exp.company || ""}${exp.dates ? ` (${exp.dates})` : ""}`);
      if (exp.description) sections.push(`  ${exp.description.slice(0, 600)}`);
    });
  }
  if (payload.education?.length) {
    sections.push(`\n**Education**:`);
    payload.education.slice(0, 4).forEach((ed: any) => {
      sections.push(`- ${ed.school || ""}${ed.degree ? ` -- ${ed.degree}` : ""}`);
    });
  }
  if (payload.skills?.length) sections.push(`\n**Skills**: ${payload.skills.slice(0, 30).join(", ")}`);
  if (payload.languages?.length) {
    sections.push(`\n**Languages**:`);
    payload.languages.forEach((l: any) => sections.push(`- ${l.language || l}`));
  }
  if (payload.volunteer?.length) {
    sections.push(`\n**Volunteer**:`);
    payload.volunteer.forEach((v: any) => sections.push(`- ${v.role}${v.organization ? ` at ${v.organization}` : ""}`));
  }
  if (payload.certifications?.length) {
    sections.push(`\n**Certifications**:`);
    payload.certifications.slice(0, 10).forEach((c: any) => sections.push(`- ${c.name}`));
  }
  if (payload.awards?.length) {
    sections.push(`\n**Awards**:`);
    payload.awards.forEach((a: any) => sections.push(`- ${a.title}`));
  }
  if (payload.recommendation_count) sections.push(`\n**Recs**: ${payload.recommendation_count}`);
  if (payload.activity_snippets?.length) {
    sections.push(`\n**Activity**:`);
    payload.activity_snippets.slice(0, 5).forEach((s: string) => sections.push(`- ${s.slice(0, 250)}`));
  }
  return sections.join("\n");
}

async function runAnalysis(payload: any): Promise<any> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4500,
    system: [{ type: "text", text: buildAnalysisPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildAnalysisUserMessage(payload) }],
  });
  const rawText = response.content[0].type === "text" ? response.content[0].text : "";
  const cleanText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleanText);
  const archetype = mapBigFiveToArchetype(parsed.big_five);
  return { ...parsed, archetype, analyzed_at: new Date().toISOString(), version: ANALYSIS_VERSION };
}

/**
 * Score how much real content the payload has. Used to gate enrichment —
 * if there's not enough to anchor on, Claude will hallucinate. Skip instead.
 *
 * Returns true if the payload has enough substance to safely enrich.
 */
function payloadHasEnoughForEnrichment(payload: any): boolean {
  let signalCount = 0;

  // About section is the strongest single signal
  if (payload.about && payload.about.trim().length >= 100) signalCount += 2;

  // Multiple experience entries with descriptions
  if (Array.isArray(payload.experience)) {
    const richExp = payload.experience.filter(
      (exp: any) => exp.description && exp.description.length >= 50
    );
    if (richExp.length >= 1) signalCount += 2;
    else if (payload.experience.length >= 2) signalCount += 1;
  }

  // Education with degrees
  if (Array.isArray(payload.education) && payload.education.length >= 1) {
    const hasDegree = payload.education.some((ed: any) => ed.degree);
    if (hasDegree) signalCount += 1;
  }

  // Skills
  if (Array.isArray(payload.skills) && payload.skills.length >= 5) signalCount += 1;

  // Activity / posts
  if (Array.isArray(payload.activity_snippets) && payload.activity_snippets.length >= 3) {
    signalCount += 1;
  }

  // Volunteer / awards / certifications
  if (Array.isArray(payload.volunteer) && payload.volunteer.length >= 1) signalCount += 1;
  if (Array.isArray(payload.awards) && payload.awards.length >= 1) signalCount += 1;
  if (Array.isArray(payload.certifications) && payload.certifications.length >= 2) signalCount += 1;

  // Need at least 2 "signal points" — single-job profiles or just-a-name profiles are too thin
  return signalCount >= 2;
}

async function runEnrichment(payload: any): Promise<any | null> {
  // Gate: skip enrichment entirely if there's not enough real data.
  // Claude will fabricate when given thin input, and bad data in a CRM is
  // worse than no data.
  if (!payloadHasEnoughForEnrichment(payload)) {
    console.log("[contact-save:enrichment] payload too thin — skipping to prevent hallucination", {
      name: payload.name,
      about_len: payload.about?.length || 0,
      experience: payload.experience?.length || 0,
      education: payload.education?.length || 0,
      skills: payload.skills?.length || 0,
    });
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2500,
      system: [{ type: "text", text: buildEnrichmentPrompt(), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildAnalysisUserMessage(payload) }],
    });
    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const cleanText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleanText);

    // Defense in depth: even if Claude returned a narrative, sanity-check it.
    // If the payload was borderline AND the narrative mentions companies/schools
    // not present in the source data, drop the narrative.
    if (parsed?.narrative_summary && typeof parsed.narrative_summary === "string") {
      if (looksLikeHallucination(parsed.narrative_summary, payload)) {
        console.warn("[contact-save:enrichment] dropped suspected hallucinated narrative for", payload.name);
        parsed.narrative_summary = null;
      }
    }

    return parsed;
  } catch (e) {
    console.error("[contact-save:enrichment] failed:", e);
    return null;
  }
}

/**
 * Heuristic check: does the narrative mention companies/schools/cities that
 * AREN'T in the source payload? If so it's likely fabricated.
 */
function looksLikeHallucination(narrative: string, payload: any): boolean {
  // Build a haystack of all the strings actually present in the source
  const haystack = [
    payload.name || "",
    payload.headline || "",
    payload.about || "",
    payload.location || "",
    ...(payload.experience || []).flatMap((e: any) => [e.title, e.company, e.description]),
    ...(payload.education || []).flatMap((e: any) => [e.school, e.degree]),
    ...(payload.skills || []),
    ...(payload.activity_snippets || []),
  ].filter(Boolean).join(" ").toLowerCase();

  // Common big-name companies/schools that get hallucinated. If narrative
  // mentions one but it's NOT in the haystack, that's a strong tell.
  const fabricationCanaries = [
    "stripe", "stanford", "harvard", "google", "amazon", "palantir",
    "ramp", "facebook", "meta", "apple", "microsoft", "netflix", "uber",
    "airbnb", "openai", "anthropic", "deepmind", "mit", "berkeley",
    "princeton", "yale", "columbia", "carnegie mellon", "cmu",
  ];
  const narrativeLower = narrative.toLowerCase();
  for (const canary of fabricationCanaries) {
    if (narrativeLower.includes(canary) && !haystack.includes(canary)) {
      return true;
    }
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const apiKey = (req.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!apiKey) {
      return NextResponse.json({ error: "missing_api_key" }, { status: 401, headers: CORS_HEADERS });
    }

    const { data: user } = await supabase
      .from("tom_users")
      .select("id, plan")
      .eq("humble_api_key", apiKey)
      .single();

    if (!user) {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401, headers: CORS_HEADERS });
    }

    const userId = user.id;
    const body = await req.json();

    if (!body.full_name?.trim() || !body.linkedin_url) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400, headers: CORS_HEADERS });
    }

    const fullName = body.full_name.trim();
    const linkedinUrl = body.linkedin_url;
    const email = body.email?.toLowerCase().trim() || null;
    const latestRole = body.experience?.[0];
    const company = latestRole?.company || null;

    // ── 1. Find or prepare to create the contact ──
    const existing = await findExistingContact(userId, linkedinUrl, fullName, email, company);

    // ── 2. Determine if we need to run analysis (and consume a credit) ──
    let analysis = body.relationship_index || null;
    let creditConsumed = false;
    let needsAnalysis = false;

    if (!analysis) {
      // No analysis was passed in. Check if existing contact already has a current one.
      const cachedAnalysis = existing?.relationship_index;
      if (cachedAnalysis?.version === ANALYSIS_VERSION) {
        analysis = cachedAnalysis; // reuse existing, no charge
      } else {
        needsAnalysis = true;
      }
    }

    // If we need to run analysis, check caps first
    if (needsAnalysis) {
      const usage = await getUsage(userId);
      const capCheck = checkCaps(usage);
      if (!capCheck.ok) {
        return NextResponse.json(
          {
            ok: false,
            allowed: false,
            cap_reason: capCheck.reason,
            cap_detail: capCheck.detail,
            usage,
            upgrade_to:
              capCheck.reason === "monthly" && usage.plan === "free"  ? "pro" :
              capCheck.reason === "monthly" && usage.plan === "pro"   ? "growth" :
              null,
          },
          { headers: CORS_HEADERS }
        );
      }

      try {
        analysis = await runAnalysis(body);
      } catch (e: any) {
        console.error("[contact-save] analysis failed:", e);
        return NextResponse.json(
          { error: "analysis_failed", detail: e?.message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // ── 3. Run enrichment for free (always) ──
    const enrichment = await runEnrichment(body);

    // ── 4. Build the update/insert payload ──
    const now = new Date().toISOString();
    const username = extractLinkedInUsername(linkedinUrl);
    const canonical = canonicalLinkedInUrl(username);

    const baseUpdates: any = {};
    const changedFields: string[] = [];

    // Auto-overwrite fields
    if (latestRole?.company) {
      baseUpdates.company = latestRole.company;
      if (existing?.company !== latestRole.company) changedFields.push("company");
    }
    if (latestRole?.title) {
      baseUpdates.job_title = latestRole.title;
      if (existing?.job_title !== latestRole.title) changedFields.push("job_title");
    }
    if (body.headline) {
      baseUpdates.title = body.headline;
      if (existing?.title !== body.headline) changedFields.push("title");
    }
    if (canonical) {
      baseUpdates.linkedin_url = canonical;
      if (existing?.linkedin_url !== canonical) changedFields.push("linkedin_url");
    }
    const inferredSeniority = inferSeniority(latestRole?.title);
    if (inferredSeniority) {
      baseUpdates.seniority = inferredSeniority;
      if (existing?.seniority !== inferredSeniority) changedFields.push("seniority");
    }
    if (body.location) {
      const city = body.location.split(",")[0].trim();
      if (city) {
        baseUpdates.city = city;
        if (existing?.city !== city) changedFields.push("city");
      }
    }
    if (body.birthday) {
      baseUpdates.birthday = body.birthday;
      if (existing?.birthday !== body.birthday) changedFields.push("birthday");
    }

    // Email — append-only logic
    if (email) {
      const existingEmails = [
        existing?.email,
        existing?.personal_email,
        existing?.work_email,
        ...(Array.isArray(existing?.all_emails) ? existing.all_emails : []),
      ]
        .filter(Boolean)
        .map((e: string) => e.toLowerCase().trim());

      if (!existingEmails.includes(email)) {
        if (!existing?.personal_email) {
          baseUpdates.personal_email = email;
          changedFields.push("personal_email");
        } else if (!existing?.work_email) {
          baseUpdates.work_email = email;
          changedFields.push("work_email");
        }
        const allEmails = Array.isArray(existing?.all_emails) ? [...existing.all_emails] : [];
        allEmails.push(email);
        baseUpdates.all_emails = allEmails;
      }
    }

    // Phone — only fill if empty
    if (body.phone && !existing?.phone) {
      baseUpdates.phone = body.phone.trim();
      changedFields.push("phone");
    }

    // Topics — merge from enrichment
    if (enrichment) {
      const newTopics = [
        ...(enrichment.professional_topics || []),
        ...(enrichment.personal_topics || []),
        ...(enrichment.affiliations || []),
      ].filter(Boolean);

      if (newTopics.length > 0) {
        const existingTopics = Array.isArray(existing?.topics) ? existing.topics : [];
        const lowercaseExisting = new Set(existingTopics.map((t: string) => t.toLowerCase()));
        const merged = [...existingTopics];
        newTopics.forEach((t: string) => {
          if (!lowercaseExisting.has(t.toLowerCase())) {
            merged.push(t);
            lowercaseExisting.add(t.toLowerCase());
          }
        });
        if (merged.length !== existingTopics.length) {
          baseUpdates.topics = merged;
          changedFields.push("topics");
        }
      }
    }

    // Topics_they_care_about — backfill from analysis + education activities
    {
      // Collect candidate items: AI-extracted topics summary + LinkedIn
      // education "Activities and societies" entries
      const candidates: string[] = [];

      // Activities from each education entry (LinkedIn signal — clubs, teams,
      // honor societies are real interests they invested time in)
      if (Array.isArray(body.education)) {
        for (const ed of body.education) {
          if (ed?.activities && typeof ed.activities === "string") {
            // Split comma- or semicolon-separated lists into individual items
            ed.activities
              .split(/[,;]/)
              .map((s: string) => s.trim())
              .filter((s: string) => s && s.length > 1 && s.length < 100)
              .forEach((s: string) => candidates.push(s));
          }
        }
      }

      if (candidates.length > 0) {
        const existingText = (existing?.topics_they_care_about || "").trim();
        const existingItems: string[] = existingText
          ? existingText.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
          : [];
        const lowercaseExisting = new Set(existingItems.map((s: string) => s.toLowerCase()));

        const newItems: string[] = [];
        for (const c of candidates) {
          if (!lowercaseExisting.has(c.toLowerCase())) {
            newItems.push(c);
            lowercaseExisting.add(c.toLowerCase());
          }
        }
        if (newItems.length > 0) {
          const merged = [...existingItems, ...newItems].join(", ");
          baseUpdates.topics_they_care_about = merged;
          if (!changedFields.includes("topics_they_care_about")) {
            changedFields.push("topics_they_care_about");
          }
        }
      }

      // Backfill from analysis if STILL empty
      const stillEmpty = !baseUpdates.topics_they_care_about && !existing?.topics_they_care_about?.trim();
      if (analysis?.interests?.topics_summary && stillEmpty) {
        baseUpdates.topics_they_care_about = analysis.interests.topics_summary;
        if (!changedFields.includes("topics_they_care_about")) {
          changedFields.push("topics_they_care_about");
        }
      }
    }

    // Personal_details — merge enrichment
    if (enrichment) {
      const existingDetails = (existing?.personal_details && typeof existing.personal_details === "object")
        ? existing.personal_details
        : {};
      const merged: any = { ...existingDetails };
      let detailsChanged = false;

      if (enrichment.family) { merged.family = { ...(existingDetails.family || {}), ...enrichment.family }; detailsChanged = true; }
      if (enrichment.pets?.length) { merged.pets = enrichment.pets; detailsChanged = true; }
      if (enrichment.education?.length) { merged.education = enrichment.education; detailsChanged = true; }
      if (enrichment.affiliations?.length) { merged.affiliations = enrichment.affiliations; detailsChanged = true; }
      if (enrichment.places) { merged.places = { ...(existingDetails.places || {}), ...enrichment.places }; detailsChanged = true; }
      if (enrichment.languages?.length) { merged.languages = enrichment.languages; detailsChanged = true; }
      if (enrichment.side_projects?.length) { merged.side_projects = enrichment.side_projects; detailsChanged = true; }

      if (detailsChanged) {
        merged.last_linkedin_enrichment_at = now;
        baseUpdates.personal_details = merged;
        changedFields.push("personal_details");
      }
    }

    // Notes_context — append narrative (only if it's a real, non-trivial string)
    const narrative = enrichment?.narrative_summary;
    if (narrative && typeof narrative === "string" && narrative.trim().length >= 30) {
      const trimmedNarrative = narrative.trim();
      const dateLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      const newBlock = `📌 LinkedIn enrichment (${dateLabel}): ${trimmedNarrative}`;
      const existingNotes = (existing?.notes_context || "").trim();
      const alreadyHasNarrative = existingNotes.includes(trimmedNarrative);
      if (!alreadyHasNarrative) {
        baseUpdates.notes_context = existingNotes ? `${existingNotes}\n\n${newBlock}` : newBlock;
        changedFields.push("notes_context");
      }
    }

    // Intelligence jsonb snapshot
    const intelSnapshot: any = {
      ...((existing?.intelligence && typeof existing.intelligence === "object") ? existing.intelligence : {}),
      linkedin: {
        synced_at: now,
        headline: body.headline || null,
        location: body.location || null,
        about: body.about || null,
        connection_count: body.connection_count || null,
        experience: body.experience || [],
        education: body.education || [],
        skills: body.skills || [],
        languages: body.languages || [],
        volunteer: body.volunteer || [],
        certifications: body.certifications || [],
        awards: body.awards || [],
        recommendation_count: body.recommendation_count || 0,
        activity_count: body.activity_count || 0,
      },
    };
    if (enrichment) intelSnapshot.linkedin.enrichment = enrichment;
    baseUpdates.intelligence = intelSnapshot;
    baseUpdates.intelligence_scan_at = now;

    // Analysis
    if (analysis) {
      baseUpdates.relationship_index = analysis;
    }

    // Timestamps
    baseUpdates.last_synced_at = now;
    baseUpdates.tom_ai_updated_at = now;

    // ── 5. Insert or update ──
    let savedContact: any;
    let created = false;

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from("tom_contacts")
        .update(baseUpdates)
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select()
        .single();

      if (updateErr) {
        console.error("[contact-save] update failed:", updateErr);
        return NextResponse.json(
          { error: "update_failed", detail: updateErr.message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
      savedContact = updated;
    } else {
      const insertPayload: any = {
        user_id: userId,
        full_name: fullName,
        ...baseUpdates,
      };
      if (insertPayload.title === undefined && body.headline) insertPayload.title = body.headline;

      const { data: created_row, error: insertErr } = await supabase
        .from("tom_contacts")
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        console.error("[contact-save] insert failed:", insertErr);
        return NextResponse.json(
          { error: "create_failed", detail: insertErr.message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
      savedContact = created_row;
      created = true;
    }

    // ── 6. Consume credit if we ran a fresh analysis ──
    if (needsAnalysis) {
      await consumeCredit(userId, savedContact.id, linkedinUrl);
      creditConsumed = true;
    }

    // ── 7. Mirror to Google Contacts ──
    let googleSynced = false;
    try {
      const accessToken = await getValidAccessToken(userId);
      if (accessToken) {
        if (savedContact.google_resource_name) {
          await updateGoogleContact(accessToken, savedContact.google_resource_name, {
            full_name: savedContact.full_name,
            email: savedContact.email || savedContact.personal_email || savedContact.work_email,
            company: savedContact.company,
            job_title: savedContact.job_title,
          });
          googleSynced = true;
        } else {
          const newResource = await createGoogleContact(accessToken, {
            full_name: savedContact.full_name,
            email: savedContact.email || savedContact.personal_email || savedContact.work_email,
            company: savedContact.company,
            job_title: savedContact.job_title,
          });
          if (newResource) {
            await supabase
              .from("tom_contacts")
              .update({ google_resource_name: newResource })
              .eq("id", savedContact.id)
              .eq("user_id", userId);
            googleSynced = true;
          }
        }
      }
    } catch (e) {
      console.error("[contact-save] google mirror failed:", e);
    }

    // ── 8. Return everything the UI needs ──
    const newUsage = await getUsage(userId);

    return NextResponse.json(
      {
        ok: true,
        created,
        updated: !created,
        credit_consumed: creditConsumed,
        changed_fields: changedFields.filter((f) => f !== "intelligence"),
        google_synced: googleSynced,
        analysis,
        narrative_summary: enrichment?.narrative_summary || null,
        contact: {
          id: savedContact.id,
          full_name: savedContact.full_name,
          email: savedContact.email,
          company: savedContact.company,
          job_title: savedContact.job_title,
          linkedin_url: savedContact.linkedin_url,
          topics_they_care_about: savedContact.topics_they_care_about,
        },
        usage: newUsage,
      },
      { headers: CORS_HEADERS }
    );
  } catch (e: any) {
    console.error("[contact-save] unexpected error:", e);
    return NextResponse.json(
      { error: "server_error", detail: e?.message || String(e) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}