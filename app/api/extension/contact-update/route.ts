import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getValidAccessToken } from "../../../lib/google";
import { keepFilledIdentity, emailTakenBySomeoneElse } from "../../../lib/contactWrite";
import { updateGoogleContact } from "../../../lib/googleContacts";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────
// /api/extension/contact-update
//
// User-initiated LinkedIn enrichment. Triggered when user clicks
// "Update Contact from LinkedIn" in the sidebar.
//
// Field rules:
//   AUTO-OVERWRITE (LinkedIn authoritative):
//     company, job_title, title (headline), linkedin_url,
//     industry, seniority, city, birthday
//   APPEND-ONLY (don't replace existing):
//     personal_email / work_email — only fill if empty
//     phone — only fill if empty
//     all_emails — append new, dedupe
//     topics — merge new with existing, dedupe
//     personal_details (jsonb) — merge family/pets/affiliations
//     notes_context — append timestamped enrichment block
//   STRUCTURED:
//     intelligence (jsonb) — full LinkedIn snapshot for diffing
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

// ─────────────────────────────────────────────────────────────────────
// Claude prompt for narrative + structured signal extraction
// ─────────────────────────────────────────────────────────────────────

function buildEnrichmentPrompt(): string {
  return `You are extracting structured personal context from a LinkedIn profile so a relationship manager can personalize future outreach. The user has explicitly authorized this enrichment by clicking "Update Contact" — extract everything useful for relationship building.

# Your task
Read the profile and produce TWO outputs:
1. A natural-language NARRATIVE SUMMARY (2-4 sentences) capturing this person's professional and personal context. Write it the way you'd brief a colleague before they meet this person.
2. STRUCTURED SIGNALS extracted from the profile.

# Narrative summary guidance
Examples of good narratives:
- "Investor and small-business operator running Thumbprint, a promotional products company in Indianapolis. Father of two, active in his church, plays recreational soccer. Marion University alum. Hosts an annual industry event called Fusion."
- "Senior backend engineer at Stripe focused on payment infrastructure. Cycling enthusiast, lived in Berlin for 5 years, fluent in German. Mentors junior engineers via /dev/color."

Write in third person. Lead with what they do professionally. Then weave in personal context naturally. Be specific and concrete — real names of schools, companies, hobbies, places, family members where evidenced.

# Structured signals to extract
- **professional_topics**: industries, roles, work themes from headline/about/posts. Examples: "promotional products", "B2B sales", "leadership development"
- **personal_topics**: hobbies, sports, interests, causes mentioned anywhere. Examples: "soccer", "woodworking", "trail running"
- **family**: spouse name, kids' names, # of kids, parental status — IF mentioned anywhere in their profile
- **pets**: pet names, types — if mentioned
- **education**: schools, degrees, years
- **affiliations**: church, nonprofits, communities, alumni groups
- **places**: current city, hometown, cities lived in
- **languages**: spoken languages
- **side_projects**: any mentioned outside the main role

# Critical rules
- ONLY extract what is actually evidenced in the profile. NEVER invent.
- The user has explicitly authorized this enrichment, so extract family/kids/pets when mentioned.
- For each signal, be specific. "Has kids" is weaker than "Two kids, Emma and Liam".
- If a signal isn't evidenced, omit it from the JSON (don't include empty arrays/nulls for everything).

# Output — respond with ONLY valid JSON, no markdown:

{
  "narrative_summary": "2-4 sentence third-person briefing",
  "professional_topics": ["topic 1", "topic 2"],
  "personal_topics": ["topic 1", "topic 2"],
  "family": {
    "spouse": "name if mentioned",
    "kids": ["name 1", "name 2"],
    "kids_count": 2,
    "notes": "any other family detail"
  },
  "pets": [
    { "name": "pet name", "type": "dog/cat/etc" }
  ],
  "education": [
    { "school": "...", "degree": "...", "years": "..." }
  ],
  "affiliations": ["church name", "nonprofit", "alumni group"],
  "places": {
    "current_city": "...",
    "hometown": "...",
    "lived_in": ["city 1", "city 2"]
  },
  "languages": ["English", "Spanish"],
  "side_projects": ["project name + brief description"]
}

If a section has nothing evidenced, omit the entire key. Better to return a small JSON than fabricate.`;
}

function buildEnrichmentUserMessage(payload: any): string {
  const sections = [];
  sections.push(`# Profile Enrichment Request\n`);
  sections.push(`**Name**: ${payload.name || ""}`);
  if (payload.headline) sections.push(`**Headline**: ${payload.headline}`);
  if (payload.location) sections.push(`**Location**: ${payload.location}`);
  if (payload.connection_count) sections.push(`**Network Size**: ${payload.connection_count}`);
  if (payload.about) sections.push(`\n**About**:\n${payload.about}`);

  if (payload.experience?.length) {
    sections.push(`\n**Experience**:`);
    payload.experience.slice(0, 10).forEach((exp: any) => {
      sections.push(`- **${exp.title || ""}** at ${exp.company || ""}${exp.dates ? ` (${exp.dates})` : ""}`);
      if (exp.description) sections.push(`  ${exp.description.slice(0, 600)}`);
    });
  }

  if (payload.education?.length) {
    sections.push(`\n**Education**:`);
    payload.education.forEach((ed: any) => {
      sections.push(`- ${ed.school || ""}${ed.degree ? ` -- ${ed.degree}` : ""}${ed.dates ? ` (${ed.dates})` : ""}`);
    });
  }

  if (payload.skills?.length) {
    sections.push(`\n**Skills**: ${payload.skills.slice(0, 30).join(", ")}`);
  }

  if (payload.languages?.length) {
    sections.push(`\n**Languages**:`);
    payload.languages.forEach((l: any) => {
      sections.push(`- ${l.language || l}${l.proficiency ? ` (${l.proficiency})` : ""}`);
    });
  }

  if (payload.volunteer?.length) {
    sections.push(`\n**Volunteer**:`);
    payload.volunteer.forEach((v: any) => {
      sections.push(`- ${v.role || ""}${v.organization ? ` at ${v.organization}` : ""}${v.description ? ` — ${v.description.slice(0, 300)}` : ""}`);
    });
  }

  if (payload.certifications?.length) {
    sections.push(`\n**Certifications**:`);
    payload.certifications.slice(0, 10).forEach((c: any) => {
      sections.push(`- ${c.name}${c.issuer ? ` (${c.issuer})` : ""}`);
    });
  }

  if (payload.awards?.length) {
    sections.push(`\n**Awards**:`);
    payload.awards.forEach((a: any) => sections.push(`- ${a.title || a}`));
  }

  if (payload.activity_snippets?.length) {
    sections.push(`\n**Recent Activity / Posts**:`);
    payload.activity_snippets.slice(0, 8).forEach((s: string) => sections.push(`- ${s.slice(0, 400)}`));
  }

  return sections.join("\n");
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
      .select("id")
      .eq("humble_api_key", apiKey)
      .single();

    if (!user) {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401, headers: CORS_HEADERS });
    }

    const userId = user.id;
    const body = await req.json();
    const { contact_id, ...linkedinData } = body;

    if (!contact_id) {
      return NextResponse.json({ error: "missing_contact_id" }, { status: 400, headers: CORS_HEADERS });
    }

    // Load the existing contact
    const { data: existing, error: loadErr } = await supabase
      .from("tom_contacts")
      .select("*")
      .eq("id", contact_id)
      .eq("user_id", userId)
      .single();

    if (loadErr || !existing) {
      return NextResponse.json({ error: "contact_not_found" }, { status: 404, headers: CORS_HEADERS });
    }

    // ── 1. Run Claude enrichment for narrative + structured signals ──
    let enrichment: any = null;
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2500,
        system: [{ type: "text", text: buildEnrichmentPrompt(), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildEnrichmentUserMessage(linkedinData) }],
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";
      const cleanText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      enrichment = JSON.parse(cleanText);
    } catch (e) {
      console.error("[contact-update] enrichment failed:", e);
      // Continue without enrichment — still apply structured field updates
    }

    // ── 2. Build update payload ──
    const updates: any = {};
    const changedFields: string[] = [];
    const now = new Date().toISOString();

    // LinkedIn enrichment fills blanks. It does not replace a value already on the contact.
    const latestRole = linkedinData.experience?.[0];

    if (latestRole?.company && latestRole.company !== existing.company) {
      updates.company = latestRole.company;
      changedFields.push("company");
    }
    if (latestRole?.title && latestRole.title !== existing.job_title) {
      updates.job_title = latestRole.title;
      changedFields.push("job_title");
    }
    if (linkedinData.headline && linkedinData.headline !== existing.title) {
      updates.title = linkedinData.headline;
      changedFields.push("title");
    }

    const username = extractLinkedInUsername(linkedinData.linkedin_url);
    if (username) {
      const canonical = canonicalLinkedInUrl(username);
      if (canonical !== existing.linkedin_url) {
        updates.linkedin_url = canonical;
        changedFields.push("linkedin_url");
      }
    }

    const inferredSeniority = inferSeniority(latestRole?.title);
    if (inferredSeniority && inferredSeniority !== existing.seniority) {
      updates.seniority = inferredSeniority;
      changedFields.push("seniority");
    }

    if (linkedinData.location) {
      const city = linkedinData.location.split(",")[0].trim();
      if (city && city !== existing.city) {
        updates.city = city;
        changedFields.push("city");
      }
    }

    if (linkedinData.birthday && linkedinData.birthday !== existing.birthday) {
      updates.birthday = linkedinData.birthday;
      changedFields.push("birthday");
    }

    // ── APPEND-ONLY: email ──
    if (linkedinData.email && typeof linkedinData.email === "string") {
      const newEmail = linkedinData.email.toLowerCase().trim();
      const existingEmails = [
        existing.email,
        existing.personal_email,
        existing.work_email,
        ...(Array.isArray(existing.all_emails) ? existing.all_emails : []),
      ]
        .filter(Boolean)
        .map((e: string) => e.toLowerCase().trim());

      const emailDecision = await emailTakenBySomeoneElse(
        supabase, userId, newEmail, existing.id, existing.full_name
      );
      if (!existingEmails.includes(newEmail) && emailDecision !== "reject") {
        if (!existing.personal_email) {
          updates.personal_email = newEmail;
          changedFields.push("personal_email");
        } else if (!existing.work_email) {
          updates.work_email = newEmail;
          changedFields.push("work_email");
        }
        const allEmails = Array.isArray(existing.all_emails) ? [...existing.all_emails] : [];
        allEmails.push(newEmail);
        updates.all_emails = allEmails;
      }
    }

    // ── APPEND-ONLY: phone ──
    if (linkedinData.phone && typeof linkedinData.phone === "string" && !existing.phone) {
      updates.phone = linkedinData.phone.trim();
      changedFields.push("phone");
    }

    // ── MERGE: topics (text[] array) ──
    if (enrichment) {
      const newTopics = [
        ...(enrichment.professional_topics || []),
        ...(enrichment.personal_topics || []),
        ...(enrichment.affiliations || []),
      ].filter(Boolean);

      if (newTopics.length > 0) {
        const existingTopics = Array.isArray(existing.topics) ? existing.topics : [];
        const lowercaseExisting = new Set(existingTopics.map((t: string) => t.toLowerCase()));
        const merged = [...existingTopics];
        newTopics.forEach((t: string) => {
          if (!lowercaseExisting.has(t.toLowerCase())) {
            merged.push(t);
            lowercaseExisting.add(t.toLowerCase());
          }
        });
        if (merged.length !== existingTopics.length) {
          updates.topics = merged;
          changedFields.push("topics");
        }
      }
    }

    // ── MERGE: personal_details (jsonb) ──
    if (enrichment) {
      const existingDetails = (existing.personal_details && typeof existing.personal_details === "object")
        ? existing.personal_details
        : {};

      const merged: any = { ...existingDetails };
      let detailsChanged = false;

      if (enrichment.family) {
        merged.family = { ...(existingDetails.family || {}), ...enrichment.family };
        detailsChanged = true;
      }
      if (enrichment.pets?.length) {
        merged.pets = enrichment.pets;
        detailsChanged = true;
      }
      if (enrichment.education?.length) {
        merged.education = enrichment.education;
        detailsChanged = true;
      }
      if (enrichment.affiliations?.length) {
        merged.affiliations = enrichment.affiliations;
        detailsChanged = true;
      }
      if (enrichment.places) {
        merged.places = { ...(existingDetails.places || {}), ...enrichment.places };
        detailsChanged = true;
      }
      if (enrichment.languages?.length) {
        merged.languages = enrichment.languages;
        detailsChanged = true;
      }
      if (enrichment.side_projects?.length) {
        merged.side_projects = enrichment.side_projects;
        detailsChanged = true;
      }

      if (detailsChanged) {
        merged.last_linkedin_enrichment_at = now;
        updates.personal_details = merged;
        changedFields.push("personal_details");
      }
    }

    // ── APPEND: notes_context with enrichment narrative ──
    if (enrichment?.narrative_summary) {
      const dateLabel = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const newBlock = `📌 LinkedIn enrichment (${dateLabel}): ${enrichment.narrative_summary}`;
      const existingNotes = (existing.notes_context || "").trim();
      // Avoid duplicating the same narrative if user re-enriches
      const alreadyHasNarrative = existingNotes.includes(enrichment.narrative_summary);
      if (!alreadyHasNarrative) {
        updates.notes_context = existingNotes
          ? `${existingNotes}\n\n${newBlock}`
          : newBlock;
        changedFields.push("notes_context");
      }
    }

    // ── STRUCTURED: intelligence jsonb snapshot ──
    const intelSnapshot: any = {
      ...((existing.intelligence && typeof existing.intelligence === "object") ? existing.intelligence : {}),
      linkedin: {
        synced_at: now,
        headline: linkedinData.headline || null,
        location: linkedinData.location || null,
        about: linkedinData.about || null,
        connection_count: linkedinData.connection_count || null,
        experience: linkedinData.experience || [],
        education: linkedinData.education || [],
        skills: linkedinData.skills || [],
        languages: linkedinData.languages || [],
        volunteer: linkedinData.volunteer || [],
        certifications: linkedinData.certifications || [],
        awards: linkedinData.awards || [],
        recommendation_count: linkedinData.recommendation_count || 0,
        activity_count: linkedinData.activity_count || 0,
      },
    };
    if (enrichment) {
      intelSnapshot.linkedin.enrichment = enrichment;
    }
    updates.intelligence = intelSnapshot;
    updates.intelligence_scan_at = now;

    const protectedFields = ["company", "job_title", "title", "linkedin_url", "seniority", "city", "birthday", "phone"];
    keepFilledIdentity(existing, updates, protectedFields);
    for (const field of protectedFields) {
      if (!Object.prototype.hasOwnProperty.call(updates, field)) {
        const idx = changedFields.indexOf(field);
        if (idx >= 0) changedFields.splice(idx, 1);
      }
    }

    // Do not stamp tom_ai_updated_at. That flag is reserved for a person's edit;
    // setting it here made the next Google sync treat LinkedIn data as a human edit.
    updates.last_synced_at = now;

    // ── 3. Apply updates ──
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: true, updated: false, message: "No changes detected", contact: { id: existing.id, full_name: existing.full_name } },
        { headers: CORS_HEADERS }
      );
    }

    const { error: updateErr } = await supabase
      .from("tom_contacts")
      .update(updates)
      .eq("id", contact_id)
      .eq("user_id", userId);

    if (updateErr) {
      console.error("[contact-update] supabase error:", updateErr);
      return NextResponse.json(
        { error: "update_failed", detail: updateErr.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // ── 4. Mirror to Google Contacts (per standing rule) ──
    let googleSynced = false;
    if (existing.google_resource_name) {
      try {
        const accessToken = await getValidAccessToken(userId);
        if (accessToken) {
          await updateGoogleContact(accessToken, existing.google_resource_name, {
            full_name: existing.full_name,
            email: updates.personal_email || existing.email || existing.personal_email,
            company: updates.company || existing.company,
            job_title: updates.job_title || existing.job_title,
          });
          googleSynced = true;
        }
      } catch (e) {
        console.error("[contact-update] google mirror failed:", e);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        updated: changedFields.length > 0,
        changed_fields: changedFields.filter((f) => f !== "intelligence"), // hide internal field
        google_synced: googleSynced,
        narrative_summary: enrichment?.narrative_summary || null,
        contact: {
          id: existing.id,
          full_name: existing.full_name,
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (e: any) {
    console.error("[contact-update] unexpected error:", e);
    return NextResponse.json(
      { error: "server_error", detail: e?.message || String(e) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}