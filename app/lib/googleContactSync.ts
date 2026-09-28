import { updateGoogleContact } from "./googleContacts";
import {
  emailAssignmentDecision,
  isHumanOwned,
  markFieldsSynced,
  normalizeEmail,
  pushBackToGoogleUpdates,
  readProvenance,
  reconcileGoogleIdentity,
  stampSource,
} from "./contactFieldPolicy";
import { findContactsWithEmail, insertContact, selectContacts, updateContact } from "./contactWrite";

export type GoogleIncoming = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  home_address?: any;
  birthday?: string | null;
};

export type ApplyGoogleResult = {
  contactId: string | null;
  fromGoogle: number;
  kept: number;
  collision: boolean;
  created: boolean;
};

function identityChangeCount(patch: Record<string, any>): number {
  return ["full_name", "email", "phone", "company", "job_title", "home_address", "birthday"].filter(
    (field) => Object.prototype.hasOwnProperty.call(patch, field)
  ).length;
}

async function safeEmailList(
  supabase: any,
  userId: string,
  emails: string[],
  selfId: string,
  incomingName: string | null | undefined,
  resourceName: string
): Promise<{ safe: string[]; collision: boolean }> {
  const safe: string[] = [];
  let collision = false;
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const owners = await findContactsWithEmail(supabase, userId, email);
    const decision = emailAssignmentDecision({
      incomingEmail: email,
      incomingName,
      incomingResource: resourceName,
      owners,
      selfId,
    });
    if (decision === "reject") {
      collision = true;
      continue;
    }
    safe.push(email);
  }
  return { safe, collision };
}

/**
 * Write a Google contact onto an existing Humble Hello row.
 * Identity fields follow Google unless a person edited them here.
 * Those edits are written back to Google instead of being overwritten.
 */
export async function applyGoogleToExisting(
  supabase: any,
  userId: string,
  accessToken: string,
  existing: Record<string, any>,
  resourceName: string,
  incoming: GoogleIncoming,
  allEmails: string[],
  allPhones: string[],
  phonesArray: any[],
  googleUpdatedAt: string | null
): Promise<ApplyGoogleResult> {
  const { patch, pushBack } = reconcileGoogleIdentity({
    existing,
    incoming,
    googleUpdatedAt,
  });

  let collision = false;
  if (patch.email) {
    const owners = await findContactsWithEmail(supabase, userId, patch.email);
    const decision = emailAssignmentDecision({
      incomingEmail: patch.email,
      incomingName: incoming.full_name,
      incomingResource: resourceName,
      owners,
      selfId: existing.id,
    });
    if (decision === "reject") {
      delete patch.email;
      collision = true;
    }
  }

  const provenance = readProvenance(existing);
  const phoneProtected = isHumanOwned(provenance, "phone") && pushBack.phone !== undefined && patch.phone === undefined;
  if (phoneProtected && existing.phone) {
    const currentPhones = Array.isArray(existing.phones) ? existing.phones : [];
    const rest = currentPhones.filter((p: any) => p?.number !== existing.phone);
    patch.phones = [{ number: existing.phone, type: "cell", primary: true }, ...rest];
  } else if (!phoneProtected && phonesArray.length > 0) {
    patch.phones = phonesArray;
    patch.all_phones = allPhones;
  }

  const { safe, collision: listCollision } = await safeEmailList(
    supabase,
    userId,
    allEmails,
    existing.id,
    incoming.full_name,
    resourceName
  );
  if (listCollision) collision = true;
  const emailProtected = isHumanOwned(provenance, "email") && pushBack.email !== undefined && patch.email === undefined;
  if (safe.length > 0) {
    if (emailProtected) {
      const union = new Set<string>(
        [...(existing.all_emails || []), existing.email, ...safe].filter(Boolean).map((e: string) => e.toLowerCase())
      );
      patch.all_emails = [...union];
    } else {
      patch.all_emails = safe;
    }
  }

  if (!existing.google_resource_name) patch.google_resource_name = resourceName;
  patch.last_synced_at = new Date().toISOString();

  const fromGoogle = identityChangeCount(patch);
  const kept = Object.keys(pushBack).length;

  if (Object.keys(patch).length > 0) {
    await updateContact(supabase, existing.id, userId, patch);
  }

  const googleUpdates = pushBackToGoogleUpdates(pushBack);
  if (Object.keys(googleUpdates).length > 0) {
    const result = await updateGoogleContact(accessToken, resourceName, googleUpdates);
    if (result.success) {
      const base = patch.field_provenance || provenance;
      await updateContact(supabase, existing.id, userId, {
        field_provenance: markFieldsSynced(base, Object.keys(pushBack), pushBack),
      });
    }
  }

  return { contactId: existing.id, fromGoogle, kept, collision, created: false };
}

export async function createFromGoogle(
  supabase: any,
  userId: string,
  resourceName: string,
  row: Record<string, any>
): Promise<ApplyGoogleResult> {
  const identity = {
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    job_title: row.job_title,
    home_address: row.home_address,
    birthday: row.birthday,
  };
  const provenance = stampSource({}, identity, "google");
  const { data, error } = await insertContact(
    supabase,
    { ...row, user_id: userId, google_resource_name: resourceName, field_provenance: provenance },
    { returning: true }
  );
  if (error || !data) return { contactId: null, fromGoogle: 0, kept: 0, collision: false, created: false };
  return { contactId: data.id, fromGoogle: 0, kept: 0, collision: false, created: true };
}

export async function loadContactByResource(supabase: any, userId: string, resourceName: string) {
  return selectContacts(
    supabase,
    "id, full_name, email, phone, company, job_title, notes, home_address, birthday, all_emails, all_phones, phones, google_resource_name",
    (query) => query.eq("user_id", userId).eq("google_resource_name", resourceName).maybeSingle()
  );
}

export async function loadContactById(supabase: any, userId: string, id: string) {
  return selectContacts(
    supabase,
    "id, full_name, email, phone, company, job_title, notes, home_address, birthday, all_emails, all_phones, phones, google_resource_name",
    (query) => query.eq("user_id", userId).eq("id", id).maybeSingle()
  );
}
