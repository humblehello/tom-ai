/**
 * Field-level rules for contact writes.
 *
 * Google Contacts is the master for identity fields (name, email, phone,
 * company, title, address, birthday). A value a person typed in Humble Hello
 * is kept, and written back to Google, until that write has landed and Google
 * is later changed to something else. Scrapes and enrichment only fill blanks,
 * and never replace a human value — including a blank a human cleared.
 */

export const IDENTITY_FIELDS = [
  "full_name",
  "email",
  "phone",
  "company",
  "job_title",
  "home_address",
  "birthday",
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export const ENRICHMENT_FILL_FIELDS = [
  "phone",
  "company",
  "job_title",
  "title",
  "linkedin_url",
  "twitter_url",
  "instagram_url",
  "facebook_url",
  "city",
  "seniority",
  "industry",
  "company_description",
  "company_size",
  "funding_stage",
  "technologies",
  "birthday",
  "home_address",
  "key_context",
  "topics",
  "notes_context",
  "relationship_context",
  "best_channel",
  "best_time",
] as const;

export type FieldSource = "human" | "google" | "microsoft" | "scrape" | "enrichment";

export type ProvenanceEntry = {
  source: FieldSource;
  at: string;
  value?: string | null;
  synced_value?: string | null;
  synced_at?: string | null;
};

export type FieldProvenance = Record<string, ProvenanceEntry>;

export function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((v) => isBlank(v));
  }
  return false;
}

export function serializeFieldValue(value: unknown): string | null {
  if (isBlank(value)) return null;
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function asPhoneDigits(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = digits(value);
  if (d.length < 7) return null;
  const letters = value.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0) return null;
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

function addressKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = value as Record<string, unknown>;
  const street = String(a.streetAddress || a.street || "").trim().toLowerCase();
  const city = String(a.city || "").trim().toLowerCase();
  const region = String(a.region || a.state || "").trim().toLowerCase();
  const postal = String(a.postalCode || a.zip || "").trim().toLowerCase();
  if (!street && !city && !region && !postal) return null;
  return [street, city, region, postal].join("|");
}

function birthdayKey(value: unknown): { monthDay: string; year: string | null } | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return { monthDay: `${month}-${day}`, year: match[1] || null };
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  const phoneA = asPhoneDigits(a);
  const phoneB = asPhoneDigits(b);
  if (phoneA && phoneB) return phoneA === phoneB;

  const addrA = addressKey(a);
  const addrB = addressKey(b);
  if (addrA && addrB) return addrA === addrB;

  const bdayA = birthdayKey(a);
  const bdayB = birthdayKey(b);
  if (bdayA && bdayB) {
    if (bdayA.monthDay !== bdayB.monthDay) return false;
    if (bdayA.year && bdayB.year) return bdayA.year === bdayB.year;
    return true;
  }

  if (typeof a === "string" || typeof b === "string") {
    return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  }
  return serializeFieldValue(a) === serializeFieldValue(b);
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const cleaned = email.trim().toLowerCase();
  if (!cleaned.includes("@") || cleaned.startsWith("@") || cleaned.endsWith("@")) return null;
  return cleaned;
}

export function namesLookLikeSamePerson(a?: string | null, b?: string | null): boolean {
  const norm = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = na.split(" ");
  const pb = nb.split(" ");
  if (pa.length >= 2 && pb.length >= 2 && pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1]) {
    return true;
  }
  return false;
}

export function readProvenance(existing: { field_provenance?: FieldProvenance | null } | null | undefined): FieldProvenance {
  const raw = existing?.field_provenance;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

export function isHumanOwned(provenance: FieldProvenance | null | undefined, field: string): boolean {
  return provenance?.[field]?.source === "human";
}

function cloneProvenance(provenance: FieldProvenance | null | undefined): FieldProvenance {
  return { ...(provenance || {}) };
}

export function stampHumanEdits(
  provenance: FieldProvenance | null | undefined,
  updates: Record<string, unknown>,
  fields: readonly string[],
  at: string = new Date().toISOString()
): FieldProvenance {
  const next = cloneProvenance(provenance);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    const prev = next[field];
    next[field] = {
      source: "human",
      at,
      value: serializeFieldValue(updates[field]),
      synced_value: prev?.synced_value ?? null,
      synced_at: prev?.synced_at ?? null,
    };
  }
  return next;
}

export function stampSource(
  provenance: FieldProvenance | null | undefined,
  updates: Record<string, unknown>,
  source: FieldSource,
  at: string = new Date().toISOString()
): FieldProvenance {
  const next = cloneProvenance(provenance);
  for (const field of Object.keys(updates)) {
    if (field === "field_provenance") continue;
    const prev = next[field];
    const serialized = serializeFieldValue(updates[field]);
    next[field] = {
      source,
      at,
      value: serialized,
      synced_value: source === "google" ? serialized : prev?.synced_value ?? null,
      synced_at: source === "google" ? at : prev?.synced_at ?? null,
    };
  }
  return next;
}

export function markFieldsSynced(
  provenance: FieldProvenance | null | undefined,
  fields: string[],
  values: Record<string, unknown>,
  syncedAt: string = new Date().toISOString()
): FieldProvenance {
  const next = cloneProvenance(provenance);
  for (const field of fields) {
    const prev = next[field] || { source: "human" as const, at: syncedAt };
    next[field] = {
      ...prev,
      synced_value: serializeFieldValue(values[field]),
      synced_at: syncedAt,
    };
  }
  return next;
}

/**
 * Fill only fields that are empty and were not set by a person.
 * A human clearing a field (source human, blank value) stays blank.
 */
export function fillBlankFields(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any>,
  fields: readonly string[],
  source: FieldSource,
  at: string = new Date().toISOString()
): Record<string, any> {
  const provenance = readProvenance(existing);
  const patch: Record<string, any> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    const value = incoming[field];
    if (isBlank(value)) continue;
    if (isHumanOwned(provenance, field)) continue;
    if (existing && !isBlank(existing[field])) continue;
    patch[field] = value;
  }
  if (Object.keys(patch).length === 0) return {};
  patch.field_provenance = stampSource(provenance, patch, source, at);
  return patch;
}

export type GoogleReconcileResult = {
  patch: Record<string, any>;
  pushBack: Record<string, any>;
  conflicts: string[];
};

/**
 * Compare one Google contact to the Humble Hello row.
 *
 * Non-human fields take Google's value (Google is master).
 * Human fields are kept and returned in pushBack until Google has been
 * observed holding that same value (synced_value matches the HH value) and
 * Google's contact updateTime is later than that sync, with a different value.
 */
export function reconcileGoogleIdentity(args: {
  existing: Record<string, any>;
  incoming: Partial<Record<IdentityField, unknown>>;
  googleUpdatedAt?: string | null;
  now?: string;
}): GoogleReconcileResult {
  const now = args.now || new Date().toISOString();
  const provenance = readProvenance(args.existing);
  const nextProvenance = cloneProvenance(provenance);
  const patch: Record<string, any> = {};
  const pushBack: Record<string, any> = {};
  const conflicts: string[] = [];
  let provenanceChanged = false;

  for (const field of IDENTITY_FIELDS) {
    const incomingVal = args.incoming[field];
    if (isBlank(incomingVal)) continue;
    const currentVal = args.existing[field];
    const entry = provenance[field];

    if (!entry || entry.source !== "human") {
      if (!valuesEqual(currentVal, incomingVal)) patch[field] = incomingVal;
      const serialized = serializeFieldValue(incomingVal);
      if (!entry || entry.source !== "google" || entry.synced_value !== serialized) {
        nextProvenance[field] = {
          source: "google",
          at: args.googleUpdatedAt || now,
          value: serialized,
          synced_value: serialized,
          synced_at: args.googleUpdatedAt || now,
        };
        provenanceChanged = true;
      }
      continue;
    }

    if (valuesEqual(currentVal, incomingVal)) {
      const serialized = serializeFieldValue(incomingVal);
      if (entry.synced_value !== serialized || !entry.synced_at) {
        nextProvenance[field] = {
          ...entry,
          value: serialized,
          synced_value: serialized,
          synced_at: args.googleUpdatedAt || entry.synced_at || now,
        };
        provenanceChanged = true;
      }
      continue;
    }

    const writeLanded = valuesEqual(entry.synced_value ?? null, serializeFieldValue(currentVal));
    const googleMovedAfterLandedWrite =
      writeLanded &&
      !!entry.synced_at &&
      !!args.googleUpdatedAt &&
      new Date(args.googleUpdatedAt).getTime() > new Date(entry.synced_at).getTime() &&
      !valuesEqual(serializeFieldValue(incomingVal), entry.synced_value ?? null);

    if (googleMovedAfterLandedWrite) {
      patch[field] = incomingVal;
      const serialized = serializeFieldValue(incomingVal);
      nextProvenance[field] = {
        source: "google",
        at: args.googleUpdatedAt || now,
        value: serialized,
        synced_value: serialized,
        synced_at: args.googleUpdatedAt || now,
      };
      provenanceChanged = true;
      conflicts.push(field);
      continue;
    }

    pushBack[field] = currentVal;
  }

  if (provenanceChanged) patch.field_provenance = nextProvenance;
  return { patch, pushBack, conflicts };
}

export type EmailOwner = {
  id: string;
  full_name?: string | null;
  google_resource_name?: string | null;
};

/**
 * allow — this email can be stored on selfId (nobody else has it).
 * same_person — one other row has it and looks like the same person; link, don't insert.
 * reject — a different person already has it. Do not copy the email onto anyone else.
 */
export function emailAssignmentDecision(args: {
  incomingEmail: string | null | undefined;
  incomingName?: string | null;
  incomingResource?: string | null;
  owners: EmailOwner[];
  selfId?: string | null;
}): "allow" | "same_person" | "reject" {
  if (!normalizeEmail(args.incomingEmail)) return "allow";
  const others = args.owners.filter((owner) => owner.id !== args.selfId);
  if (others.length === 0) return "allow";
  if (others.length > 1) return "reject";
  const owner = others[0];
  if (
    owner.google_resource_name &&
    args.incomingResource &&
    owner.google_resource_name !== args.incomingResource
  ) {
    return "reject";
  }
  if (owner.full_name && args.incomingName && !namesLookLikeSamePerson(owner.full_name, args.incomingName)) {
    return "reject";
  }
  return "same_person";
}

export function pushBackToGoogleUpdates(pushBack: Record<string, any>): Record<string, any> {
  const googleUpdates: Record<string, any> = {};
  if (!isBlank(pushBack.full_name)) googleUpdates.full_name = pushBack.full_name;
  if (!isBlank(pushBack.email)) googleUpdates.email = pushBack.email;
  if (!isBlank(pushBack.phone)) googleUpdates.phone = pushBack.phone;
  if (!isBlank(pushBack.company)) googleUpdates.company = pushBack.company;
  if (Object.prototype.hasOwnProperty.call(pushBack, "job_title") && !isBlank(pushBack.job_title)) {
    googleUpdates.job_title = pushBack.job_title;
  }
  if (!isBlank(pushBack.home_address)) googleUpdates.address = pushBack.home_address;
  if (!isBlank(pushBack.birthday)) googleUpdates.birthday = pushBack.birthday;
  return googleUpdates;
}
