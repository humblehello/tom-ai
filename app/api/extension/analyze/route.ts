import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const ANALYSIS_VERSION = "v6-adaptive-lens";

// ─────────────────────────────────────────────────────────────────────
// Plan caps
// ─────────────────────────────────────────────────────────────────────

type Plan = "free" | "pro" | "growth";

interface PlanCaps {
  monthly: number;
  daily: number | null;
}

const PLAN_CAPS: Record<Plan, PlanCaps> = {
  free:   { monthly: 5,   daily: null },
  pro:    { monthly: 50,  daily: 30 },
  growth: { monthly: 200, daily: 30 },
};

const SOFT_WARNING_THRESHOLD = 0.8;

function getCapsForPlan(plan: string | null | undefined): PlanCaps {
  const p = (plan || "free").toLowerCase() as Plan;
  return PLAN_CAPS[p] || PLAN_CAPS.free;
}

// ─────────────────────────────────────────────────────────────────────
// LinkedIn URL normalization + matching helpers
// ─────────────────────────────────────────────────────────────────────

function extractLinkedInUsername(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "";
  const cleaned = url
    .toLowerCase()
    .trim()
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

async function findContact(
  userId: string,
  payload: { linkedin_url?: string; name?: string; experience?: any[] }
) {
  const username = extractLinkedInUsername(payload.linkedin_url);
  const usernameStripped = stripSlugSuffix(username);
  const usernameNormalized = normalizeForCompare(username);

  if (username) {
    const { data: byUrl } = await supabaseAdmin
      .from("tom_contacts")
      .select("id, full_name, email, linkedin_url, company, job_title, relationship_index, topics_they_care_about, last_meaningful_touch_at")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%/in/${username}%`)
      .order("last_meaningful_touch_at", { ascending: false, nullsFirst: false })
      .limit(5);

    if (byUrl && byUrl.length > 0) return { contact: byUrl[0], matched_via: "linkedin_url" as const };

    const { data: byPub } = await supabaseAdmin
      .from("tom_contacts")
      .select("id, full_name, email, linkedin_url, company, job_title, relationship_index, topics_they_care_about, last_meaningful_touch_at")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%/pub/${username}%`)
      .order("last_meaningful_touch_at", { ascending: false, nullsFirst: false })
      .limit(5);

    if (byPub && byPub.length > 0) return { contact: byPub[0], matched_via: "linkedin_url" as const };
  }

  if (usernameNormalized) {
    const { data: allWithUrl } = await supabaseAdmin
      .from("tom_contacts")
      .select("id, full_name, email, linkedin_url, company, job_title, relationship_index, topics_they_care_about, last_meaningful_touch_at")
      .eq("user_id", userId)
      .not("linkedin_url", "is", null);

    if (allWithUrl && allWithUrl.length > 0) {
      const candidates = allWithUrl
        .map((c) => {
          const dbSlug = extractLinkedInUsername(c.linkedin_url);
          return {
            contact: c,
            dbNormalized: normalizeForCompare(dbSlug),
            dbStripped: normalizeForCompare(stripSlugSuffix(dbSlug)),
          };
        })
        .filter(
          (x) =>
            x.dbNormalized === usernameNormalized ||
            x.dbStripped === usernameNormalized ||
            x.dbNormalized === normalizeForCompare(usernameStripped)
        );

      if (candidates.length === 1) {
        const c = candidates[0].contact;
        const canonical = canonicalLinkedInUrl(username);
        if (c.linkedin_url !== canonical) {
          await supabaseAdmin
            .from("tom_contacts")
            .update({ linkedin_url: canonical })
            .eq("id", c.id)
            .eq("user_id", userId);
          c.linkedin_url = canonical;
        }
        return { contact: c, matched_via: "slug_normalized" as const };
      }

      if (candidates.length > 1) {
        const targetName = normalizeForCompare(payload.name);
        const nameMatch = candidates.find((x) => normalizeForCompare(x.contact.full_name) === targetName);
        if (nameMatch) return { contact: nameMatch.contact, matched_via: "slug_normalized" as const };
      }
    }
  }

  const name = (payload.name || "").trim();
  const company = (payload.experience?.[0]?.company || "").trim();

  if (name && company) {
    const { data: byNameCompany } = await supabaseAdmin
      .from("tom_contacts")
      .select("id, full_name, email, linkedin_url, company, job_title, relationship_index, topics_they_care_about, last_meaningful_touch_at")
      .eq("user_id", userId)
      .ilike("full_name", name)
      .ilike("company", company)
      .order("last_meaningful_touch_at", { ascending: false, nullsFirst: false })
      .limit(5);

    if (byNameCompany && byNameCompany.length > 0) {
      const contact = byNameCompany[0];
      if (!contact.linkedin_url && username) {
        const canonical = canonicalLinkedInUrl(username);
        await supabaseAdmin
          .from("tom_contacts")
          .update({ linkedin_url: canonical })
          .eq("id", contact.id)
          .eq("user_id", userId);
        contact.linkedin_url = canonical;
      }
      return { contact, matched_via: "name_company" as const };
    }
  }

  if (name && name.split(/\s+/).length >= 2) {
    const { data: byName } = await supabaseAdmin
      .from("tom_contacts")
      .select("id, full_name, email, linkedin_url, company, job_title, relationship_index, topics_they_care_about, last_meaningful_touch_at")
      .eq("user_id", userId)
      .ilike("full_name", name)
      .is("linkedin_url", null)
      .order("last_meaningful_touch_at", { ascending: false, nullsFirst: false })
      .limit(2);

    if (byName && byName.length === 1) {
      const contact = byName[0];
      if (username) {
        const canonical = canonicalLinkedInUrl(username);
        await supabaseAdmin
          .from("tom_contacts")
          .update({ linkedin_url: canonical })
          .eq("id", contact.id)
          .eq("user_id", userId);
        contact.linkedin_url = canonical;
      }
      return { contact, matched_via: "name_only" as const };
    }
  }

  return { contact: null, matched_via: "none" as const };
}

// ─────────────────────────────────────────────────────────────────────
// Archetype mapping
// ─────────────────────────────────────────────────────────────────────

function mapBigFiveToArchetype(bigFive: any): { name: string; descriptors: string[]; quadrant: { x: number; y: number } } {
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

  return {
    name,
    descriptors: descriptors.slice(0, 3),
    quadrant: { x: e, y: c },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Cap enforcement
// ─────────────────────────────────────────────────────────────────────

interface UsageInfo {
  monthly_used: number;
  monthly_cap: number;
  daily_used: number;
  daily_cap: number | null;
  plan: Plan;
  approaching_monthly_cap: boolean;
}

async function getUsage(userId: string): Promise<UsageInfo> {
  const { data: user } = await supabaseAdmin
    .from("tom_users")
    .select("plan")
    .eq("id", userId)
    .single();

  const plan = ((user?.plan || "free").toLowerCase()) as Plan;
  const caps = getCapsForPlan(plan);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count: monthlyCount } = await supabaseAdmin
    .from("relationship_index_credits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count: dailyCount } = await supabaseAdmin
    .from("relationship_index_credits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", dayStart.toISOString());

  const monthly_used = monthlyCount || 0;
  const monthly_cap = caps.monthly;
  const daily_used = dailyCount || 0;
  const daily_cap = caps.daily;

  return {
    monthly_used,
    monthly_cap,
    daily_used,
    daily_cap,
    plan,
    approaching_monthly_cap: monthly_used >= Math.floor(monthly_cap * SOFT_WARNING_THRESHOLD) && monthly_used < monthly_cap,
  };
}

interface CapCheckResult {
  ok: boolean;
  reason?: "monthly" | "daily";
  detail?: string;
}

function checkCaps(usage: UsageInfo): CapCheckResult {
  if (usage.daily_cap !== null && usage.daily_used >= usage.daily_cap) {
    return {
      ok: false,
      reason: "daily",
      detail: `Daily limit reached (${usage.daily_used}/${usage.daily_cap}). This protects your LinkedIn account from being flagged. Try again tomorrow.`,
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
  const { error } = await supabaseAdmin.from("relationship_index_credits").insert({
    user_id: userId,
    consumed_at: new Date().toISOString(),
    contact_id: contactId,
    linkedin_url: linkedinUrl,
    cached: false,
  });

  if (error) {
    console.error("[analyze:consumeCredit] FAILED to record credit:", error);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// System prompt (unchanged)
// ─────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a behavioral analyst writing for relationship-driven sellers and connectors. You read LinkedIn profiles and produce concise, actionable communication guidance grounded in the Big Five personality model (the Five Factor Model — academic, public-domain).

# Important boundaries
- Use Big Five trait names only: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.
- Do NOT use proprietary assessment terminology from any commercial assessment vendor.
- Use only this app's archetype names: Driver, Analyst, Connector, Observer.

# Your task
Read the profile. Output a JSON object describing:
1. Big Five trait scores with confidence and evidence
2. A one-sentence archetype essence
3. The most likely "lens" for engaging this person (executive / peer / champion / gatekeeper) and why
4. 3 strongest observable behaviors
5. 2-3 things to watch out for
6. 2-3 likely beliefs that shape how they evaluate offers
7. Situation-specific guidance for influencing them
8. How they show up when engaged vs. when stressed
9. Three distinct outreach openers
10. Topics and interests for relationship-building

# Big Five signals
## Openness: STRONG: multiple languages, creative skills, diverse industries
## Conscientiousness: STRONG: detailed roles, 5+ recommendations, certifications, long tenures
## Extraversion: STRONG: 500+ connections, leadership titles, customer-facing
## Agreeableness: STRONG: volunteer work, mentoring, team language
## Neuroticism: DEFAULT: confidence 0-30 unless evidence

# Confidence: 80-100 multiple strong, 60-79 one strong, 40-59 defensible, 20-39 weak, 0-19 NULL

# Lens
- "executive": C-suite/VP/Director/Owner/Founder. Tilt: ROI, brief, peer-to-peer, time-respectful.
- "champion": Manager/Senior/Lead. Tilt: help them sell internally, give ammunition.
- "peer": Same level/industry. Tilt: mutual interest, low-pressure, referral-friendly.
- "gatekeeper": EA/Coordinator. Tilt: acknowledge role, ask permission, never bypass.

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

# Critical: NEVER fabricate. Sparse profiles → confidence 30-50, data_quality "low". Tilt every recommendation through the lens.`;
}

function buildUserMessage(payload: any): string {
  const sections = [];
  sections.push(`# Profile Analysis Request\n`);
  sections.push(`**Name**: ${payload.name || "Unknown"}`);
  sections.push(`**LinkedIn URL**: ${payload.linkedin_url || ""}`);
  if (payload.headline) sections.push(`**Headline**: ${payload.headline}`);
  if (payload.location) sections.push(`**Location**: ${payload.location}`);
  if (payload.connection_count) sections.push(`**Network Size**: ${payload.connection_count}`);
  if (payload.about) sections.push(`\n**About**:\n${payload.about}`);

  if (payload.experience?.length) {
    sections.push(`\n**Experience** (${payload.experience.length} roles):`);
    payload.experience.slice(0, 8).forEach((exp: any) => {
      sections.push(`- **${exp.title || ""}** at ${exp.company || ""}${exp.dates ? ` (${exp.dates})` : ""}`);
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
    payload.languages.forEach((l: any) => sections.push(`- ${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`));
  }
  if (payload.volunteer?.length) {
    sections.push(`\n**Volunteer**:`);
    payload.volunteer.forEach((v: any) => sections.push(`- ${v.role}${v.organization ? ` at ${v.organization}` : ""}`));
  }
  if (payload.certifications?.length) {
    sections.push(`\n**Certifications**:`);
    payload.certifications.slice(0, 10).forEach((c: any) => sections.push(`- ${c.name}${c.issuer ? ` (${c.issuer})` : ""}`));
  }
  if (payload.awards?.length) {
    sections.push(`\n**Awards**:`);
    payload.awards.forEach((a: any) => sections.push(`- ${a.title}`));
  }
  if (payload.recommendation_count) sections.push(`\n**Recommendations**: ${payload.recommendation_count}`);
  if (payload.activity_snippets?.length) {
    sections.push(`\n**Recent Activity**:`);
    payload.activity_snippets.slice(0, 5).forEach((s: string) => sections.push(`- ${s.slice(0, 250)}`));
  }

  return sections.join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401 });
    }
    const apiKey = auth.replace("Bearer ", "").trim();

    const { data: user, error: userError } = await supabaseAdmin
      .from("tom_users")
      .select("id, plan, trial_ends_at")
      .eq("humble_api_key", apiKey)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
    }

    const payload = await req.json();
    if (!payload.linkedin_url || !payload.name) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    // ── Find existing contact ──
    const { contact: existingContact, matched_via } = await findContact(user.id, payload);

    if (existingContact) {
      console.log(`[analyze] matched contact ${existingContact.id} via ${matched_via}`);
    } else {
      console.log(`[analyze] no match for ${payload.name} / ${payload.linkedin_url}`);
    }

    // ── NEW: match_only short-circuit ──
    // Used by the silent "checking" call from the sidebar to look up the contact
    // without consuming a credit or running Claude. Returns cached analysis if
    // available; otherwise returns just the contact match info.
    if (payload.match_only) {
      const usage = await getUsage(user.id);
      const cached = existingContact?.relationship_index as any;
      const hasCurrentCache = cached?.version === ANALYSIS_VERSION;

      return NextResponse.json({
        allowed: true,
        cached: hasCurrentCache,
        match_only: true,
        analysis: hasCurrentCache ? cached : null,
        contact: existingContact
          ? {
              matched: true,
              id: existingContact.id,
              full_name: existingContact.full_name,
              company: existingContact.company,
              job_title: existingContact.job_title,
              topics_they_care_about: existingContact.topics_they_care_about,
              matched_via,
            }
          : { matched: false, matched_via: "none" },
        usage,
      });
    }

    // ── Cache hit: return existing analysis (FREE — no credit consumed) ──
    const forceRefresh = !!payload.force_refresh;
    if (existingContact?.relationship_index && !forceRefresh) {
      const cached = existingContact.relationship_index as any;
      if (cached?.version === ANALYSIS_VERSION) {
        const usage = await getUsage(user.id);
        return NextResponse.json({
          allowed: true,
          cached: true,
          analysis: cached,
          contact: {
            matched: true,
            id: existingContact.id,
            full_name: existingContact.full_name,
            company: existingContact.company,
            job_title: existingContact.job_title,
            topics_they_care_about: existingContact.topics_they_care_about,
            matched_via,
          },
          usage,
        });
      }
    }

    // ── Cap check (only for fresh analyses) ──
    const usage = await getUsage(user.id);
    const capCheck = checkCaps(usage);

    if (!capCheck.ok) {
      return NextResponse.json({
        allowed: false,
        cap_reason: capCheck.reason,
        cap_detail: capCheck.detail,
        usage,
        upgrade_to:
          capCheck.reason === "monthly" && usage.plan === "free"  ? "pro" :
          capCheck.reason === "monthly" && usage.plan === "pro"   ? "growth" :
          null,
      });
    }

    // ── Run Claude ──
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(payload);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4500,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const cleanText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      console.error("[analyze] JSON parse failed:", rawText.slice(0, 500));
      return NextResponse.json({ error: "parse_error" }, { status: 500 });
    }

    const archetype = mapBigFiveToArchetype(parsed.big_five);

    const analysis = {
      ...parsed,
      archetype,
      analyzed_at: new Date().toISOString(),
      version: ANALYSIS_VERSION,
    };

    // ── Save analysis to existing contact ──
    if (existingContact) {
      const username = extractLinkedInUsername(payload.linkedin_url);
      const updates: any = { relationship_index: analysis };

      if (!existingContact.linkedin_url && username) {
        updates.linkedin_url = canonicalLinkedInUrl(username);
      }

      const currentTopics = existingContact.topics_they_care_about?.trim();
      const newTopics = parsed.interests?.topics_summary?.trim();
      if (!currentTopics && newTopics) {
        updates.topics_they_care_about = newTopics;
      }

      const { error: updateError } = await supabaseAdmin
        .from("tom_contacts")
        .update(updates)
        .eq("id", existingContact.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[analyze] failed to save analysis:", updateError);
      }
    }

    // ── Consume credit (only on successful fresh analysis) ──
    const creditOk = await consumeCredit(
      user.id,
      existingContact?.id || null,
      payload.linkedin_url || null
    );

    if (!creditOk) {
      console.error("[analyze] CRITICAL: credit not recorded for user", user.id);
    }

    const newUsage = await getUsage(user.id);

    return NextResponse.json({
      allowed: true,
      cached: false,
      analysis,
      contact: existingContact
        ? {
            matched: true,
            id: existingContact.id,
            full_name: existingContact.full_name,
            company: existingContact.company,
            job_title: existingContact.job_title,
            topics_they_care_about: existingContact.topics_they_care_about,
            topics_were_populated: !existingContact.topics_they_care_about?.trim() && !!parsed.interests?.topics_summary,
            matched_via,
          }
        : { matched: false, matched_via: "none" },
      usage: newUsage,
    });
  } catch (e: any) {
    console.error("[analyze] error:", e);
    return NextResponse.json({ error: "internal_error", message: e?.message }, { status: 500 });
  }
}