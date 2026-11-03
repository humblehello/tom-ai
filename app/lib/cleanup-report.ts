/**
 * Classification for the one-time contact cleanup.
 * Dry-run uses this and writes nothing. Execute re-checks every id.
 */

import { isEspDomain, isRoleAddress } from "./inbound-screen";

export interface CleanupContact {
  id: string;
  full_name?: string | null;
  email?: string | null;
  all_emails?: string[] | null;
  phone?: string | null;
  company?: string | null;
  key_context?: string | null;
  notes?: string | null;
  email_count?: number | null;
  last_emailed_at?: string | null;
  manually_created?: boolean | null;
  is_self?: boolean | null;
  dunbar_tier?: number | null;
  google_resource_name?: string | null;
  signature_scanned_at?: string | null;
  created_at?: string | null;
}

export interface CleanupQueueRow {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  reason?: string | null;
  contact_a_name?: string | null;
  contact_b_name?: string | null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const cleaned = email.trim().toLowerCase();
  if (!cleaned.includes("@") || cleaned.startsWith("@") || cleaned.endsWith("@")) return null;
  return cleaned;
}

export function normalizeName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isProtectedTier(tier: number | null | undefined): boolean {
  return typeof tier === "number" && tier > 0 && tier <= 2;
}

/** Same primary email and the same full name, and neither person is tier 1 or 2. */
export function isSafeAutoMerge(a: CleanupContact, b: CleanupContact): boolean {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (!emailA || !emailB || emailA !== emailB) return false;
  const nameA = normalizeName(a.full_name);
  const nameB = normalizeName(b.full_name);
  if (!nameA || !nameB || nameA !== nameB) return false;
  if (isProtectedTier(a.dunbar_tier) || isProtectedTier(b.dunbar_tier)) return false;
  if (a.is_self || b.is_self) return false;
  return true;
}

export function junkReasons(contact: CleanupContact): string[] {
  const reasons: string[] = [];
  if (contact.is_self) return reasons;
  const email = normalizeEmail(contact.email);
  if (!email) return reasons;

  if (isRoleAddress(email)) reasons.push("role_address");
  if (isEspDomain(email)) reasons.push("esp_domain");

  const local = email.split("@")[0];
  const name = normalizeName(contact.full_name);
  if (name && (name === local || name === local.replace(/[._-]/g, " ") || name === local.replace(/[._-]/g, ""))) {
    reasons.push("mailbox_name_only");
  }

  const untouched =
    !contact.manually_created &&
    (contact.email_count == null || contact.email_count <= 1) &&
    !contact.phone &&
    !contact.key_context;
  if (untouched && !contact.manually_created) reasons.push("one_way_shape");

  return reasons;
}

export interface CleanupReport {
  safeMerges: Array<{
    queue_id: string;
    keep_id: string;
    delete_id: string;
    full_name: string;
    email: string;
    queue_reason: string;
  }>;
  dismissQueue: Array<{
    queue_id: string;
    contact_a_id: string;
    contact_b_id: string;
    contact_a_name: string;
    contact_b_name: string;
    queue_reason: string;
    why: string;
  }>;
  likelyJunk: Array<{
    contact_id: string;
    full_name: string;
    email: string;
    reasons: string;
    google_resource_name: string;
    email_count: string;
    dunbar_tier: string;
  }>;
}

export function buildCleanupReport(
  queue: CleanupQueueRow[],
  contacts: CleanupContact[]
): CleanupReport {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const safeMerges: CleanupReport["safeMerges"] = [];
  const dismissQueue: CleanupReport["dismissQueue"] = [];
  const safeQueueIds = new Set<string>();

  for (const row of queue) {
    const a = byId.get(row.contact_a_id);
    const b = byId.get(row.contact_b_id);
    if (a && b && isSafeAutoMerge(a, b)) {
      const keep = (a.email_count || 0) >= (b.email_count || 0) ? a : b;
      const drop = keep.id === a.id ? b : a;
      safeMerges.push({
        queue_id: row.id,
        keep_id: keep.id,
        delete_id: drop.id,
        full_name: keep.full_name || "",
        email: normalizeEmail(keep.email) || "",
        queue_reason: row.reason || "",
      });
      safeQueueIds.add(row.id);
      continue;
    }
    let why = "not_exact_email_and_name";
    if (!a || !b) why = "missing_contact";
    else if (isProtectedTier(a.dunbar_tier) || isProtectedTier(b.dunbar_tier)) why = "protected_tier";
    else if (normalizeEmail(a.email) && normalizeEmail(a.email) === normalizeEmail(b.email)) why = "same_email_different_name";
    dismissQueue.push({
      queue_id: row.id,
      contact_a_id: row.contact_a_id,
      contact_b_id: row.contact_b_id,
      contact_a_name: a?.full_name || row.contact_a_name || "",
      contact_b_name: b?.full_name || row.contact_b_name || "",
      queue_reason: row.reason || "",
      why,
    });
  }

  const likelyJunk: CleanupReport["likelyJunk"] = [];
  for (const contact of contacts) {
    const reasons = junkReasons(contact);
    if (reasons.length === 0) continue;
    likelyJunk.push({
      contact_id: contact.id,
      full_name: contact.full_name || "",
      email: contact.email || "",
      reasons: reasons.join("|"),
      google_resource_name: contact.google_resource_name || "",
      email_count: contact.email_count == null ? "" : String(contact.email_count),
      dunbar_tier: contact.dunbar_tier == null ? "" : String(contact.dunbar_tier),
    });
  }

  return { safeMerges, dismissQueue, likelyJunk };
}

export type CleanupOp =
  | { op: "merge"; queueId: string }
  | { op: "dismiss"; queueId: string }
  | { op: "quarantine"; contactId: string };

const EXECUTE_CONFIRM = "QUARANTINE_AND_MERGE_APPROVED_IDS";

export function parseApprovedActions(text: string): CleanupOp[] {
  const actions: CleanupOp[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(merge|dismiss|quarantine)\s+(\S+)$/i);
    if (!match) {
      throw new Error(`Unrecognized approval line: ${line}`);
    }
    const op = match[1].toLowerCase();
    const id = match[2];
    if (op === "merge") actions.push({ op: "merge", queueId: id });
    else if (op === "dismiss") actions.push({ op: "dismiss", queueId: id });
    else actions.push({ op: "quarantine", contactId: id });
  }
  return actions;
}

export function assertExecuteAllowed(confirm: string | undefined, actions: CleanupOp[]): void {
  if (confirm !== EXECUTE_CONFIRM) {
    throw new Error(`Execute refused. Pass confirm=${EXECUTE_CONFIRM} and an explicit id list.`);
  }
  if (actions.length === 0) {
    throw new Error("Execute refused. The approval list is empty. Nothing was changed.");
  }
}

export { EXECUTE_CONFIRM };
