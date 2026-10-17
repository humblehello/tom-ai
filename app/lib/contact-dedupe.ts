/**
 * Shared "does this email already belong to a contact?" lookup.
 *
 * supabase-js `maybeSingle()` returns `data: null` both when there are zero
 * rows and when there are two or more (the latter is an error). Callers that
 * only checked `data` treated an existing duplicate as "no contact" and
 * inserted another one. These helpers fail closed: any match, or a failed
 * lookup, means do not insert.
 */

export interface ExistingContactRow {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  birthday?: string | null;
  home_address?: any;
  google_resource_name?: string | null;
  import_attributes?: any;
}

export type ExistingContactLookup =
  | { status: "none" }
  | { status: "one"; contact: ExistingContactRow }
  | { status: "many"; contacts: ExistingContactRow[] }
  | { status: "error" };

const CONTACT_COLUMNS =
  "id, full_name, email, phone, company, job_title, birthday, home_address, google_resource_name, import_attributes";

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const cleaned = email.trim().toLowerCase();
  if (!cleaned.includes("@") || cleaned.startsWith("@") || cleaned.endsWith("@")) return null;
  return cleaned;
}

/** Insert only when the lookup positively found nobody. */
export function insertDecision(lookup: ExistingContactLookup): "insert" | "skip" {
  return lookup.status === "none" ? "insert" : "skip";
}

function fromRows(
  rows: ExistingContactRow[] | null | undefined,
  errored: boolean
): ExistingContactLookup {
  if (errored) return { status: "error" };
  const list = rows || [];
  if (list.length === 0) return { status: "none" };
  if (list.length === 1) return { status: "one", contact: list[0] };
  return { status: "many", contacts: list };
}

export async function findContactsByEmail(
  supabase: any,
  userId: string,
  email: string | null | undefined,
  columns: string = CONTACT_COLUMNS
): Promise<ExistingContactLookup> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { status: "error" };

  const primary = await supabase
    .from("tom_contacts")
    .select(columns)
    .eq("user_id", userId)
    .ilike("email", normalized)
    .limit(10);

  if (primary.error) return { status: "error" };

  const owners = new Map<string, ExistingContactRow>();
  for (const row of primary.data || []) owners.set(row.id, row);

  // Secondary addresses live in all_emails. If this filter isn't supported,
  // keep the primary-email result instead of failing the whole lookup.
  const alternates = await supabase
    .from("tom_contacts")
    .select(columns)
    .eq("user_id", userId)
    .contains("all_emails", [normalized])
    .limit(10);

  if (!alternates.error) {
    for (const row of alternates.data || []) {
      if (!owners.has(row.id)) owners.set(row.id, row);
    }
  }

  return fromRows([...owners.values()], false);
}

export async function findContactsByName(
  supabase: any,
  userId: string,
  fullName: string | null | undefined,
  columns: string = CONTACT_COLUMNS
): Promise<ExistingContactLookup> {
  const name = (fullName || "").trim();
  if (!name) return { status: "error" };

  const result = await supabase
    .from("tom_contacts")
    .select(columns)
    .eq("user_id", userId)
    .ilike("full_name", name)
    .limit(10);

  if (result.error) return { status: "error" };
  return fromRows(result.data, false);
}
