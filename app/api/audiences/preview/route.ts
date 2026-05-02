import { NextRequest, NextResponse } from "next/server";
import { checkFeature } from "@/app/lib/requireFeature";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("audience_builder");
  if (block) return block;

  const { filter_config } = await request.json();

  let query = supabase
    .from("tom_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("email", "is", null);

  for (const group of filter_config?.groups || []) {
    for (const rule of group.rules || []) {
      query = applyRule(query, rule);
    }
  }

  const { count } = await query;
  return NextResponse.json({ count: count || 0 });
}

function applyRule(query: any, rule: any): any {
  const { field, operator, value } = rule;

  switch (field) {
    // ── Relationship ──────────────────────────────────────────────────────────
    case "dunbar_tier":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("dunbar_tier", value.map(Number));
      if (operator === "not_in" && Array.isArray(value) && value.length > 0) return query.not("dunbar_tier", "in", `(${value.map(Number).join(",")})`);
      break;
    case "dunbar_bucket":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.overlaps("dunbar_bucket", value);
      break;
    case "relationship_type":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("relationship_type", value);
      break;
    case "relationship_health":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("relationship_health", value);
      break;
    case "humble_score":
      if (operator === "gt") return query.gt("humble_score", value);
      if (operator === "lt") return query.lt("humble_score", value);
      if (operator === "gte") return query.gte("humble_score", value);
      if (operator === "lte") return query.lte("humble_score", value);
      break;
    case "relationship_strength":
      if (operator === "gt") return query.gt("relationship_strength", value);
      if (operator === "lt") return query.lt("relationship_strength", value);
      if (operator === "gte") return query.gte("relationship_strength", value);
      if (operator === "lte") return query.lte("relationship_strength", value);
      break;

    // ── Contact info ──────────────────────────────────────────────────────────
    case "has_email":
    case "has_work_email":
      return operator === "is" ? query.not("email", "is", null) : query.is("email", null);
    case "has_personal_email":
      return operator === "is" ? query.not("all_emails", "is", null) : query.is("all_emails", null);
    case "has_phone":
      return operator === "is" ? query.not("phone", "is", null) : query.is("phone", null);
    case "has_home_address":
      return operator === "is" ? query.not("home_address", "is", null) : query.is("home_address", null);
    case "has_work_address":
      return operator === "is" ? query.not("work_address", "is", null) : query.is("work_address", null);
    case "has_birthday":
      return operator === "is" ? query.not("birthday", "is", null) : query.is("birthday", null);
    case "has_linkedin":
      return operator === "is" ? query.not("linkedin_url", "is", null) : query.is("linkedin_url", null);

    // ── Activity ──────────────────────────────────────────────────────────────
    case "never_contacted":
      return operator === "is" ? query.is("last_emailed_at", null) : query.not("last_emailed_at", "is", null);
    case "last_meaningful_touch_at":
    case "last_emailed_at": {
      const days = Number(value) || 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      if (operator === "lt") return query.gte(field, cutoff);
      if (operator === "gt") return query.lt(field, cutoff);
      if (operator === "is_not_set") return query.is(field, null);
      break;
    }
    case "email_count":
      if (operator === "gt") return query.gt("email_count", value);
      if (operator === "lt") return query.lt("email_count", value);
      if (operator === "gte") return query.gte("email_count", value);
      if (operator === "lte") return query.lte("email_count", value);
      break;

    // ── Professional ──────────────────────────────────────────────────────────
    case "company":
      if (operator === "contains") return query.ilike("company", `%${value}%`);
      if (operator === "not_contains") return query.not("company", "ilike", `%${value}%`);
      if (operator === "is") return query.ilike("company", value);
      if (operator === "is_set") return query.not("company", "is", null);
      if (operator === "is_not_set") return query.is("company", null);
      break;
    case "job_title":
      if (operator === "contains") return query.ilike("job_title", `%${value}%`);
      if (operator === "not_contains") return query.not("job_title", "ilike", `%${value}%`);
      if (operator === "is") return query.ilike("job_title", value);
      if (operator === "is_set") return query.not("job_title", "is", null);
      if (operator === "is_not_set") return query.is("job_title", null);
      break;
    case "industry":
      if (operator === "contains") return query.ilike("industry", `%${value}%`);
      if (operator === "is_set") return query.not("industry", "is", null);
      break;
    case "seniority":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("seniority", value);
      break;

    // ── Location (JSONB) ──────────────────────────────────────────────────────
    case "city":
      if (operator === "contains" && value) return query.ilike("home_address->>city", `%${value}%`);
      if (operator === "is" && value) return query.ilike("home_address->>city", value);
      if (operator === "is_set") return query.not("home_address", "is", null);
      break;
    case "state":
      if (operator === "contains" && value) return query.ilike("home_address->>region", `%${value}%`);
      if (operator === "is" && value) return query.ilike("home_address->>region", value);
      break;
    case "country":
      if (operator === "contains" && value) return query.ilike("home_address->>country", `%${value}%`);
      if (operator === "is" && value) return query.ilike("home_address->>country", value);
      break;

    // ── Tags & Interests ──────────────────────────────────────────────────────
    case "tags":
      if (operator === "contains" && value) return query.ilike("tags::text", `%${value}%`);
      if (operator === "not_contains" && value) return query.not("tags::text", "ilike", `%${value}%`);
      if (operator === "is_set") return query.not("tags", "is", null);
      if (operator === "is_not_set") return query.is("tags", null);
      break;
    case "topics":
      if (operator === "contains" && value) return query.contains("topics", [value]);
      if (operator === "not_contains" && value) return query.not("topics", "cs", `{"${value}"}`);
      if (operator === "is_set") return query.not("topics", "is", null);
      if (operator === "is_not_set") return query.is("topics", null);
      break;
  }

  return query;
}