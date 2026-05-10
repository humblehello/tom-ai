import { graphFetch, graphPaginate } from './graph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphEmailAddress {
  name?: string;
  address?: string;
}

export interface GraphPhone {
  type?: string;
  number?: string;
}

export interface GraphPhysicalAddress {
  street?: string;
  city?: string;
  state?: string;
  countryOrRegion?: string;
  postalCode?: string;
}

export interface GraphContact {
  id: string;
  '@odata.etag'?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  middleName?: string;
  nickName?: string;
  title?: string;
  companyName?: string;
  jobTitle?: string;
  emailAddresses?: GraphEmailAddress[];
  homePhones?: string[];
  mobilePhone?: string;
  businessPhones?: string[];
  homeAddress?: GraphPhysicalAddress;
  businessAddress?: GraphPhysicalAddress;
  birthday?: string;
  personalNotes?: string;
  /** Soft-delete marker on delta queries */
  '@removed'?: { reason: 'changed' | 'deleted' };
}

// ---------------------------------------------------------------------------
// Delta sync — fetch all changes since last sync
// ---------------------------------------------------------------------------

export interface ContactsSyncResult {
  upserted: GraphContact[];
  deleted: string[]; // contact ids
  newDeltaLink: string | undefined;
}

export async function syncMicrosoftContacts(
  userId: string,
  deltaLink: string | null
): Promise<ContactsSyncResult> {
  // Kept for backward compatibility, but DO NOT call this from cron paths —
  // it paginates the entire delta and can take 5+ minutes for large accounts.
  // Use syncMicrosoftContactsPage instead, which processes one page per call.
  console.warn("syncMicrosoftContacts: full-pagination version called — prefer syncMicrosoftContactsPage for cron use");

  const startUrl = deltaLink ?? '/me/contacts/delta?$top=100';

  const upserted: GraphContact[] = [];
  const deleted: string[] = [];
  let newDeltaLink: string | undefined;

  const iterator = graphPaginate<GraphContact>(userId, startUrl, {
    absoluteUrl: startUrl.startsWith('https://'),
  });

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      newDeltaLink = next.value;
      break;
    }
    const contact = next.value;
    if (contact['@removed']?.reason === 'deleted') {
      deleted.push(contact.id);
    } else {
      upserted.push(contact);
    }
  }

  return { upserted, deleted, newDeltaLink };
}

// ---------------------------------------------------------------------------
// Single-page version — for use in Inngest cron paths
// Each call processes ONE page (~100 contacts). Returns nextLink to continue,
// or newDeltaLink if done. The caller passes nextLink back on the next run.
// ---------------------------------------------------------------------------

export interface ContactsPageResult {
  upserted: GraphContact[];
  deleted: string[];
  /** If set, more pages exist — call again with this as the cursor */
  nextLink?: string;
  /** If set, sync is complete — save this as the new delta link */
  newDeltaLink?: string;
}

export async function syncMicrosoftContactsPage(
  userId: string,
  cursor: string | null
): Promise<ContactsPageResult> {
  // cursor = null on first run → use deltaLink from user record OR start fresh
  // cursor = a nextLink → continue from that page
  const url = cursor ?? '/me/contacts/delta?$top=100';

  const res = await graphFetch<{
    value: GraphContact[];
    '@odata.nextLink'?: string;
    '@odata.deltaLink'?: string;
  }>(userId, url, {
    method: 'GET',
    absoluteUrl: url.startsWith('https://'),
  });

  const upserted: GraphContact[] = [];
  const deleted: string[] = [];

  for (const contact of res.value || []) {
    if (contact['@removed']?.reason === 'deleted') {
      deleted.push(contact.id);
    } else {
      upserted.push(contact);
    }
  }

  return {
    upserted,
    deleted,
    nextLink: res['@odata.nextLink'],
    newDeltaLink: res['@odata.deltaLink'],
  };
}

// ---------------------------------------------------------------------------
// CRUD — for write-back when Humble Hello creates/edits/deletes contacts
// (mirrors the Google People API behavior per standing rule)
// ---------------------------------------------------------------------------

export interface ContactInput {
  givenName?: string;
  surname?: string;
  displayName?: string;
  email?: string;
  emails?: string[];
  mobilePhone?: string;
  businessPhones?: string[];
  companyName?: string;
  jobTitle?: string;
  birthday?: string; // ISO date
  personalNotes?: string;
}

function toGraphContactBody(input: ContactInput): Record<string, unknown> {
  const emails = input.emails ?? (input.email ? [input.email] : []);
  return {
    ...(input.givenName !== undefined ? { givenName: input.givenName } : {}),
    ...(input.surname !== undefined ? { surname: input.surname } : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(emails.length
      ? { emailAddresses: emails.map((address) => ({ address, name: address })) }
      : {}),
    ...(input.mobilePhone !== undefined ? { mobilePhone: input.mobilePhone } : {}),
    ...(input.businessPhones !== undefined ? { businessPhones: input.businessPhones } : {}),
    ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
    ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
    ...(input.birthday !== undefined ? { birthday: input.birthday } : {}),
    ...(input.personalNotes !== undefined ? { personalNotes: input.personalNotes } : {}),
  };
}

export async function createMicrosoftContact(
  userId: string,
  input: ContactInput
): Promise<GraphContact> {
  return graphFetch<GraphContact>(userId, '/me/contacts', {
    method: 'POST',
    body: JSON.stringify(toGraphContactBody(input)),
  });
}

export async function updateMicrosoftContact(
  userId: string,
  contactId: string,
  input: ContactInput,
  etag?: string
): Promise<GraphContact> {
  const headers: Record<string, string> = {};
  if (etag) headers['If-Match'] = etag;

  return graphFetch<GraphContact>(
    userId,
    `/me/contacts/${encodeURIComponent(contactId)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(toGraphContactBody(input)),
    }
  );
}

export async function deleteMicrosoftContact(
  userId: string,
  contactId: string
): Promise<void> {
  await graphFetch(userId, `/me/contacts/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Mapping helpers — flatten a Graph contact into the shape tom_contacts uses.
// You'll likely already have an equivalent for Google; this is the parity fn.
// ---------------------------------------------------------------------------

export function flattenGraphContact(contact: GraphContact) {
  const primaryEmail =
    contact.emailAddresses?.[0]?.address ?? null;
  const allEmails = (contact.emailAddresses ?? [])
    .map((e) => e.address)
    .filter((e): e is string => !!e);

  const phone =
    contact.mobilePhone ??
    contact.businessPhones?.[0] ??
    contact.homePhones?.[0] ??
    null;

  return {
    microsoft_contact_id: contact.id,
    microsoft_etag: contact['@odata.etag'],
    first_name: contact.givenName ?? null,
    last_name: contact.surname ?? null,
    full_name:
      contact.displayName ||
[contact.givenName, contact.surname].filter(Boolean).join(' ').trim() ||
null,
    primary_email: primaryEmail,
    all_emails: allEmails,
    phone,
    company: contact.companyName ?? null,
    title: contact.jobTitle ?? null,
    birthday: contact.birthday ?? null,
    notes: contact.personalNotes ?? null,
  };
}