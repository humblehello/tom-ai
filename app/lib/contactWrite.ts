import {
  emailAssignmentDecision,
  fillBlankFields,
  isBlank,
  normalizeEmail,
  readProvenance,
  stampHumanEdits,
  type EmailOwner,
  type FieldSource,
} from "./contactFieldPolicy";

const HUMAN_STAMP_FIELDS = [
  "full_name",
  "email",
  "phone",
  "company",
  "job_title",
  "home_address",
  "work_address",
  "birthday",
  "notes",
  "key_context",
  "topics",
  "notes_context",
  "relationship_context",
  "best_channel",
  "linkedin_url",
  "city",
] as const;

export function isMissingProvenanceColumn(error: { message?: string } | null | undefined): boolean {
  const msg = error?.message || "";
  return /field_provenance/i.test(msg) && /(schema cache|column|does not exist|could not find)/i.test(msg);
}

export async function selectContacts(
  supabase: any,
  columns: string,
  filters: (query: any) => any
): Promise<{ data: any; error: any; count?: number | null }> {
  const listed = columns.split(",").map((part) => part.trim()).filter(Boolean);
  const withoutProvenance = listed.filter((part) => part !== "field_provenance").join(", ") || "id";
  const withProvenance = listed.includes("field_provenance") ? columns : `${withoutProvenance}, field_provenance`;

  const first = await filters(supabase.from("tom_contacts").select(withProvenance));
  if (!first?.error || !isMissingProvenanceColumn(first.error)) return first;
  return filters(supabase.from("tom_contacts").select(withoutProvenance));
}

export async function updateContact(
  supabase: any,
  id: string,
  userId: string,
  patch: Record<string, any>,
  options?: { returning?: boolean }
): Promise<{ data: any; error: any }> {
  const run = (payload: Record<string, any>) => {
    let query = supabase.from("tom_contacts").update(payload).eq("id", id).eq("user_id", userId);
    if (options?.returning) query = query.select().single();
    return query;
  };

  const result = await run(patch);
  if (
    result?.error &&
    isMissingProvenanceColumn(result.error) &&
    Object.prototype.hasOwnProperty.call(patch, "field_provenance")
  ) {
    const { field_provenance: _ignored, ...rest } = patch;
    if (Object.keys(rest).length === 0) return { data: null, error: null };
    return run(rest);
  }
  return result;
}

export async function insertContact(
  supabase: any,
  row: Record<string, any>,
  options?: { returning?: boolean }
): Promise<{ data: any; error: any }> {
  const run = (payload: Record<string, any>) => {
    let query = supabase.from("tom_contacts").insert(payload);
    if (options?.returning) query = query.select().single();
    return query;
  };

  const result = await run(row);
  if (
    result?.error &&
    isMissingProvenanceColumn(result.error) &&
    Object.prototype.hasOwnProperty.call(row, "field_provenance")
  ) {
    const { field_provenance: _ignored, ...rest } = row;
    return run(rest);
  }
  return result;
}

export function withHumanStamp(
  existingProvenance: any,
  updates: Record<string, any>,
  at: string = new Date().toISOString()
): Record<string, any> {
  const stamped = stampHumanEdits(readProvenance({ field_provenance: existingProvenance }), updates, HUMAN_STAMP_FIELDS, at);
  const touched = HUMAN_STAMP_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(updates, field));
  if (!touched) return updates;
  return { ...updates, field_provenance: stamped };
}

/** Drop enrichment overwrites of fields that already have a value or were set by a person. */
export function keepFilledIdentity(
  existing: Record<string, any> | null | undefined,
  updates: Record<string, any>,
  fields: readonly string[]
): void {
  const provenance = readProvenance(existing);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    if (provenance[field]?.source === "human" || (existing && !isBlank(existing[field]))) {
      delete updates[field];
    }
  }
}

export async function findContactsWithEmail(
  supabase: any,
  userId: string,
  email: string | null | undefined
): Promise<EmailOwner[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const primary = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, google_resource_name")
    .eq("user_id", userId)
    .ilike("email", normalized)
    .limit(10);

  const owners = new Map<string, EmailOwner>();
  for (const row of primary.data || []) {
    owners.set(row.id, row);
  }

  const alternates = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, google_resource_name, all_emails")
    .eq("user_id", userId)
    .contains("all_emails", [normalized])
    .limit(10);

  if (!alternates.error) {
    for (const row of alternates.data || []) {
      if (!owners.has(row.id)) owners.set(row.id, row);
    }
  }

  return [...owners.values()];
}

export async function emailTakenBySomeoneElse(
  supabase: any,
  userId: string,
  email: string | null | undefined,
  selfId: string | null | undefined,
  incomingName: string | null | undefined,
  incomingResource?: string | null
): Promise<"allow" | "same_person" | "reject"> {
  const owners = await findContactsWithEmail(supabase, userId, email);
  return emailAssignmentDecision({
    incomingEmail: email,
    incomingName,
    incomingResource,
    owners,
    selfId,
  });
}

export function enrichmentPatch(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any>,
  fields: readonly string[],
  source: FieldSource
): Record<string, any> {
  return fillBlankFields(existing, incoming, fields, source);
}
