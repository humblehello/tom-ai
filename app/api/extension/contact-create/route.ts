import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../../lib/google";
import { createGoogleContact } from "../../../lib/googleContacts";

export const maxDuration = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────
// Matching helpers — kept consistent with /api/extension/analyze
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
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
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

/**
 * Find an existing contact using the same multi-strategy approach as analyze.
 * Returns the matched contact or null.
 */
async function findExistingContact(
  userId: string,
  linkedinUrl: string,
  name: string,
  email: string | null,
  company: string | null
) {
  const username = extractLinkedInUsername(linkedinUrl);
  const usernameNormalized = normalizeForCompare(username);

  // ── 1. Exact slug (fast path) ──
  if (username) {
    const { data: byUrl } = await supabase
      .from("tom_contacts")
      .select("id, full_name, linkedin_url")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%/in/${username}%`)
      .limit(1);
    if (byUrl && byUrl.length > 0) return byUrl[0];

    const { data: byPub } = await supabase
      .from("tom_contacts")
      .select("id, full_name, linkedin_url")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%/pub/${username}%`)
      .limit(1);
    if (byPub && byPub.length > 0) return byPub[0];
  }

  // ── 2. Normalized slug similarity ──
  if (usernameNormalized) {
    const { data: allWithUrl } = await supabase
      .from("tom_contacts")
      .select("id, full_name, linkedin_url")
      .eq("user_id", userId)
      .not("linkedin_url", "is", null);

    if (allWithUrl && allWithUrl.length > 0) {
      const candidates = allWithUrl.filter((c) => {
        const dbSlug = extractLinkedInUsername(c.linkedin_url);
        const dbNormalized = normalizeForCompare(dbSlug);
        const dbStripped = normalizeForCompare(stripSlugSuffix(dbSlug));
        return (
          dbNormalized === usernameNormalized ||
          dbStripped === usernameNormalized
        );
      });
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) {
        const targetName = normalizeForCompare(name);
        const nameMatch = candidates.find(
          (c) => normalizeForCompare(c.full_name) === targetName
        );
        if (nameMatch) return nameMatch;
      }
    }
  }

  // ── 3. Email ──
  if (email) {
    const { data: byEmail } = await supabase
      .from("tom_contacts")
      .select("id, full_name, linkedin_url")
      .eq("user_id", userId)
      .ilike("email", email.trim())
      .limit(1);
    if (byEmail && byEmail.length > 0) return byEmail[0];
  }

  // ── 4. Name + company ──
  if (name && company) {
    const { data: byNameCompany } = await supabase
      .from("tom_contacts")
      .select("id, full_name, linkedin_url")
      .eq("user_id", userId)
      .ilike("full_name", name)
      .ilike("company", company)
      .limit(1);
    if (byNameCompany && byNameCompany.length > 0) return byNameCompany[0];
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// /api/extension/contact-create
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ──
    const apiKey = (req.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "missing_api_key" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { data: user } = await supabase
      .from("tom_users")
      .select("id")
      .eq("humble_api_key", apiKey)
      .single();

    if (!user) {
      return NextResponse.json(
        { error: "invalid_api_key" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const userId = user.id;

    // ── 2. Parse body ──
    const body = await req.json();
    const {
      full_name,
      linkedin_url,
      email,
      experience,
      headline,
      relationship_index,
    } = body;

    if (!full_name?.trim()) {
      return NextResponse.json(
        { error: "missing_name" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!linkedin_url) {
      return NextResponse.json(
        { error: "missing_linkedin_url" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const latestRole = experience?.[0];
    const company = latestRole?.company || null;

    // ── 3. Dedupe with same matcher as analyze ──
    const existingContact = await findExistingContact(
      userId,
      linkedin_url,
      full_name.trim(),
      email || null,
      company
    );

    if (existingContact) {
      // If they already exist, save the analysis to that contact (don't create a dupe)
      // and backfill linkedin_url if missing.
      const username = extractLinkedInUsername(linkedin_url);
      const updates: any = {};
      if (!existingContact.linkedin_url && username) {
        updates.linkedin_url = canonicalLinkedInUrl(username);
      }
      if (relationship_index) {
        updates.relationship_index = relationship_index;
        updates.relationship_index_analyzed_at = new Date().toISOString();
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("tom_contacts")
          .update(updates)
          .eq("id", existingContact.id)
          .eq("user_id", userId);
      }

      // Re-fetch the full contact so the UI can transition to the matched state
      const { data: refreshed } = await supabase
        .from("tom_contacts")
        .select("id, full_name, email, linkedin_url, company, job_title")
        .eq("id", existingContact.id)
        .eq("user_id", userId)
        .single();

      return NextResponse.json(
        {
          ok: true,
          duplicate: true,
          message: "Contact already exists — analysis saved to existing record",
          contact: refreshed || {
            id: existingContact.id,
            full_name: existingContact.full_name,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    // ── 4. Build new contact payload ──
    const newContactPayload: any = {
      user_id: userId,
      full_name: full_name.trim(),
      linkedin_url,
      email: email?.toLowerCase().trim() || null,
      company: company,
      job_title: latestRole?.title || null,
      last_synced_at: new Date().toISOString(),
    };

    if (relationship_index) {
      newContactPayload.relationship_index = relationship_index;
      newContactPayload.relationship_index_analyzed_at = new Date().toISOString();
    }

    // ── 5. Insert into Supabase ──
    const { data: newContact, error: insertErr } = await supabase
      .from("tom_contacts")
      .insert(newContactPayload)
      .select()
      .single();

    if (insertErr || !newContact) {
      console.error("[extension/contact-create] supabase error:", insertErr);
      return NextResponse.json(
        { error: "create_failed", detail: insertErr?.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // ── 6. Mirror to Google Contacts ──
    let googleResourceName: string | null = null;
    try {
      const accessToken = await getValidAccessToken(userId);
      if (accessToken) {
        googleResourceName = await createGoogleContact(accessToken, {
          full_name: newContact.full_name,
          email: newContact.email,
          company: newContact.company,
          job_title: newContact.job_title,
        });

        if (googleResourceName) {
          await supabase
            .from("tom_contacts")
            .update({ google_resource_name: googleResourceName })
            .eq("id", newContact.id)
            .eq("user_id", userId);
        }
      }
    } catch (e) {
      console.error("[extension/contact-create] google mirror failed:", e);
    }

    return NextResponse.json(
      {
        ok: true,
        created: true,
        google_synced: !!googleResourceName,
        contact: {
          id: newContact.id,
          full_name: newContact.full_name,
          email: newContact.email,
          company: newContact.company,
          job_title: newContact.job_title,
          linkedin_url: newContact.linkedin_url,
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (e: any) {
    console.error("[extension/contact-create] unexpected error:", e);
    return NextResponse.json(
      { error: "server_error", detail: e?.message || String(e) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}