import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { fillBlankFields } from "../../../lib/contactFieldPolicy";
import { selectContacts, updateContact } from "../../../lib/contactWrite";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── Match a person via Apollo people/match ────────────────────────────────────
export async function enrichContactWithApollo(
  email: string,
  firstName?: string,
  lastName?: string,
  company?: string
): Promise<{
  job_title?: string | null;
  company?: string | null;
  company_industry?: string | null;
  company_size?: string | null;
  company_founded?: number | null;
  company_description?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  seniority?: string | null;
  departments?: string[];
  technologies?: string[];
  funding_stage?: string | null;
} | null> {
  try {
    const body: any = { api_key: process.env.APOLLO_API_KEY };

    if (email) body.email = email;
    if (firstName) body.first_name = firstName;
    if (lastName) body.last_name = lastName;
    if (company) body.organization_name = company;

    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": process.env.APOLLO_API_KEY!,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Apollo API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const person = data.person;
    if (!person) return null;

    const org = person.organization || {};

    return {
      job_title: person.title || null,
      company: person.organization_name || org.name || null,
      company_industry: org.industry || person.industry || null,
      company_size: org.estimated_num_employees ? (org.estimated_num_employees + " employees") : undefined,
      company_founded: org.founded_year || null,
      company_description: org.short_description || null,
      linkedin_url: person.linkedin_url || null,
      city: person.city || null,
      state: person.state || null,
      country: person.country || null,
      seniority: person.seniority || null,
      departments: person.departments || [],
      technologies: org.current_technologies?.slice(0, 10).map((t: any) => t.name) || [],
      funding_stage: org.latest_funding_stage || null,
    };
  } catch (e) {
    console.error("Apollo enrichment error:", e);
    return null;
  }
}

// ── POST — enrich a single contact by ID ─────────────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contact_id } = await req.json();
  if (!contact_id) return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });

  // Fetch contact
  const { data: contact } = await selectContacts(
    supabase,
    "id, full_name, email, company, job_title, city, linkedin_url, industry, company_description, company_size, seniority, funding_stage, technologies, apollo_enriched_at",
    (query) => query.eq("id", contact_id).eq("user_id", userId).single()
  );

  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Skip if enriched in last 30 days — don't burn credits
  if (contact.apollo_enriched_at) {
    const daysSince = Math.floor(
      (Date.now() - new Date(contact.apollo_enriched_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince < 30) {
      return NextResponse.json({ success: true, skipped: true, reason: "Enriched recently" });
    }
  }

  if (!contact.email) {
    return NextResponse.json({ success: false, reason: "No email to match on" });
  }

  const nameParts = contact.full_name?.trim().split(" ") || [];
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const enriched = await enrichContactWithApollo(
    contact.email,
    firstName,
    lastName,
    contact.company
  );

  if (!enriched) {
    return NextResponse.json({ success: false, reason: "No match found in Apollo" });
  }

  // Fill blanks only. Apollo used to replace LinkedIn, industry, and seniority
  // even when a person had already set them.
  const updates: Record<string, any> = {
    apollo_enriched_at: new Date().toISOString(),
    ...fillBlankFields(
      contact,
      {
        job_title: enriched.job_title,
        company: enriched.company,
        industry: enriched.company_industry,
        company_description: enriched.company_description,
        company_size: enriched.company_size,
        linkedin_url: enriched.linkedin_url,
        seniority: enriched.seniority,
        funding_stage: enriched.funding_stage,
        technologies: enriched.technologies,
        city: enriched.city,
      },
      ["job_title", "company", "industry", "company_description", "company_size", "linkedin_url", "seniority", "funding_stage", "technologies", "city"],
      "enrichment"
    ),
  };

  await updateContact(supabase, contact_id, userId, updates);

  return NextResponse.json({ success: true, enriched });
}