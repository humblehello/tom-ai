import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RELATIONSHIP_INDEX_CAPS, type Plan } from "@/app/lib/plan";

// Plan → caps mapping is centralized in app/lib/plan.ts (RELATIONSHIP_INDEX_CAPS).
// Trial users get Free-tier extension caps (extension is a Pro+ benefit).
// Unknown plans default to Free (fail-closed).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CORS for Chrome extension calls — the extension runs in linkedin.com's origin
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders();

  try {
    // ── 1. Authenticate via humble_api_key ─────────────────────────────
    const auth = req.headers.get("authorization") || "";
    const apiKey = auth.replace(/^Bearer\s+/i, "").trim();

    if (!apiKey) {
      return NextResponse.json(
        { allowed: false, reason: "missing_api_key" },
        { status: 401, headers }
      );
    }

    const { data: user, error: userErr } = await supabase
      .from("tom_users")
      .select("id, plan")
      .eq("humble_api_key", apiKey)
      .maybeSingle();

    if (userErr || !user) {
      return NextResponse.json(
        { allowed: false, reason: "invalid_api_key" },
        { status: 401, headers }
      );
    }

    // ── 2. Determine plan and caps ─────────────────────────────────────
    const planRaw = (user.plan || "free").toLowerCase();
    const plan: Plan = (planRaw in RELATIONSHIP_INDEX_CAPS ? planRaw : "free") as Plan;
    const caps = RELATIONSHIP_INDEX_CAPS[plan];

    // ── 3. Parse request body ──────────────────────────────────────────
    const body = await req.json();
    const {
      linkedin_url,
      name,
      company,
      title,
      email,
      analysis,
      bypass_soft_cap = false,
    } = body || {};

    if (!analysis || typeof analysis !== "object") {
      return NextResponse.json(
        { allowed: false, reason: "missing_analysis" },
        { status: 400, headers }
      );
    }
    if (!linkedin_url && !email) {
      return NextResponse.json(
        { allowed: false, reason: "missing_identifiers" },
        { status: 400, headers }
      );
    }

    // ── 4. Atomic credit check + decrement ─────────────────────────────
    const { data: creditResult, error: creditErr } = await supabase.rpc(
      "consume_relationship_index_credit",
      {
        p_user_id: user.id,
        p_monthly_cap: caps.monthly,
        p_daily_soft_cap: caps.daily_soft,
        p_daily_hard_cap: caps.daily_hard,
        p_bypass_soft_cap: !!bypass_soft_cap,
      }
    );

    if (creditErr) {
      console.error("Credit RPC error:", creditErr);
      return NextResponse.json(
        { allowed: false, reason: "credit_check_failed", error: creditErr.message },
        { status: 500, headers }
      );
    }

    // creditResult is the JSON returned by the function
    if (!creditResult?.allowed) {
      return NextResponse.json(
        {
          ...creditResult,
          plan,
        },
        { status: 200, headers }
      );
    }

    // ── 5. Look up existing contact (linkedin_url first, then email) ───
    // Pull the fields we might need to enrich so we know what's missing.
    type ExistingContact = {
      id: string;
      full_name: string;
      linkedin_url: string | null;
      company: string | null;
      job_title: string | null;
      email: string | null;
    };
    let existingContact: ExistingContact | null = null;

    if (linkedin_url) {
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, full_name, linkedin_url, company, job_title, email")
        .eq("user_id", user.id)
        .eq("linkedin_url", linkedin_url)
        .maybeSingle();
      if (data) existingContact = data as ExistingContact;
    }

    if (!existingContact && email) {
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, full_name, linkedin_url, company, job_title, email")
        .eq("user_id", user.id)
        .ilike("email", email)
        .maybeSingle();
      if (data) existingContact = data as ExistingContact;
    }

    // ── 6. If contact exists, auto-save the analysis + enrich missing fields ───
    // Rule: never overwrite. Only fill in fields that are currently null/empty.
    let saved = false;
    let enrichedFields: string[] = [];

    if (existingContact) {
      const updates: Record<string, any> = {
        relationship_index: analysis,
        relationship_index_analyzed_at: new Date().toISOString(),
      };

      // Fill in linkedin_url only if missing
      if (linkedin_url && !existingContact.linkedin_url) {
        updates.linkedin_url = linkedin_url;
        enrichedFields.push("linkedin_url");
      }

      // Fill in company only if missing
      if (company && !existingContact.company) {
        updates.company = company;
        enrichedFields.push("company");
      }

      // Fill in job_title only if missing
      if (title && !existingContact.job_title) {
        updates.job_title = title;
        enrichedFields.push("job_title");
      }

      // Fill in email only if missing AND we have one from the extension
      if (email && !existingContact.email) {
        updates.email = email;
        enrichedFields.push("email");
      }

      const { error: updateErr } = await supabase
        .from("tom_contacts")
        .update(updates)
        .eq("id", existingContact.id)
        .eq("user_id", user.id);

      if (updateErr) {
        console.error("Failed to save analysis to existing contact:", updateErr);
      } else {
        saved = true;
      }
    }

    // ── 7. Return success with state for the extension UI ──────────────
    return NextResponse.json(
      {
        ...creditResult,
        plan,
        contact: existingContact
          ? {
              matched: true,
              id: existingContact.id,
              full_name: existingContact.full_name,
              saved,
              enriched_fields: enrichedFields,
            }
          : {
              matched: false,
              saved: false,
              // Frontend shows "Save to Humble Hello" CTA → calls /api/extension/contact-create
              suggested_payload: {
                linkedin_url,
                name,
                company,
                title,
                email,
              },
            },
      },
      { status: 200, headers }
    );
  } catch (e: any) {
    console.error("contact-enrich error:", e);
    return NextResponse.json(
      { allowed: false, reason: "server_error", error: e?.message || String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }
}