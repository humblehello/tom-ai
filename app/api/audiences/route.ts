import { NextRequest, NextResponse } from "next/server";
import { checkFeature } from "@/app/lib/requireFeature";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("audience_builder");
  if (block) return block;

  const { data: audiences, error } = await supabase
    .from("audiences")
    .select(`id, name, description, filter_config, created_at, updated_at, audience_contacts (count)`)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withCounts = (audiences || []).map((a: any) => ({
    ...a,
    contact_count: a.audience_contacts?.[0]?.count || 0,
    audience_contacts: undefined,
  }));

  return NextResponse.json({ audiences: withCounts });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("audience_builder");
  if (block) return block;

  const body = await request.json();
  const { name, description, filter_config, manual_contact_ids } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data: audience, error } = await supabase
    .from("audiences")
    .insert({ user_id: userId, name: name.trim(), description: description?.trim() || null, filter_config: filter_config || { groups: [], group_logic: "AND" } })
    .select()
    .single();

  if (error || !audience) return NextResponse.json({ error: error?.message }, { status: 500 });

  if (filter_config?.groups?.flatMap((g: any) => g.rules).length > 0) {
    const contactIds = await resolveFilterContacts(userId, filter_config);
    if (contactIds.length > 0) await insertAudienceContacts(audience.id, userId, contactIds.slice(0, 250));
  }

  if (manual_contact_ids?.length > 0) {
    await insertAudienceContacts(audience.id, userId, manual_contact_ids.slice(0, 250));
  }

  return NextResponse.json({ audience });
}

// ── Filter resolver ───────────────────────────────────────────────────────────

export async function resolveFilterContacts(userId: string, filterConfig: any): Promise<string[]> {
  let query = supabase.from("tom_contacts").select("id").eq("user_id", userId).not("email", "is", null);

  const groups = filterConfig.groups || [];
  for (const group of groups) {
    for (const rule of group.rules || []) {
      query = applyRule(query, rule);
    }
  }

  const { data } = await query.limit(250);
  return (data || []).map((c: any) => c.id);
}

export function applyRule(query: any, rule: any): any {
  const { field, operator, value } = rule;

  switch (field) {
    // ── Relationship ──────────────────────────────────────────────────────────
    case "dunbar_tier":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("dunbar_tier", value.map(Number));
      if (operator === "not_in" && Array.isArray(value) && value.length > 0) return query.not("dunbar_tier", "in", `(${value.map(Number).join(",")})`);
      break;
    case "dunbar_bucket":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.overlaps("dunbar_bucket", value);
      if (operator === "not_in" && Array.isArray(value) && value.length > 0) return query.not("dunbar_bucket", "ov", `{${value.join(",")}}`);
      break;
    case "relationship_type":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("relationship_type", value);
      if (operator === "not_in" && Array.isArray(value) && value.length > 0) return query.not("relationship_type", "in", `(${value.map((v: string) => `'${v}'`).join(",")})`);
      break;
    case "relationship_health":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("relationship_health", value);
      if (operator === "not_in" && Array.isArray(value) && value.length > 0) return query.not("relationship_health", "in", `(${value.map((v: string) => `'${v}'`).join(",")})`);
      break;
    case "humble_score":
      if (operator === "gt") return query.gt("humble_score", value);
      if (operator === "lt") return query.lt("humble_score", value);
      if (operator === "gte") return query.gte("humble_score", value);
      if (operator === "lte") return query.lte("humble_score", value);
      if (operator === "is") return query.eq("humble_score", value);
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
      if (operator === "is") return query.eq("email_count", value);
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
      if (operator === "not_contains") return query.not("industry", "ilike", `%${value}%`);
      if (operator === "is_set") return query.not("industry", "is", null);
      if (operator === "is_not_set") return query.is("industry", null);
      break;
    case "seniority":
      if (operator === "in" && Array.isArray(value) && value.length > 0) return query.in("seniority", value);
      if (operator === "not_in" && Array.isArray(value) && value.length > 0) return query.not("seniority", "in", `(${value.map((v: string) => `'${v}'`).join(",")})`);
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

async function insertAudienceContacts(audienceId: string, userId: string, contactIds: string[]) {
  const rows = contactIds.map(contact_id => ({ audience_id: audienceId, contact_id, user_id: userId }));
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await supabase.from("audience_contacts").insert(rows.slice(i, i + CHUNK));
  }
}