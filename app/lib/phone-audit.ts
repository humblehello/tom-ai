/**
 * Read-only report: phones that belong to an internal employee but sit on
 * someone else, and phones that show up on more than one contact.
 * Nothing in this file writes to a database.
 */

import { isInternalEmail, namesMatch, phoneDigits } from "./signature-parser";

export interface AuditContact {
  id: string;
  full_name?: string | null;
  email?: string | null;
  all_emails?: string[] | null;
  phone?: string | null;
  phones?: { number?: string | null; label?: string | null; type?: string | null }[] | null;
  all_phones?: string[] | null;
}

export interface InternalPhoneHit {
  phone: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  internalName: string;
  internalEmail: string | null;
  /** True when the outside row's name matches the employee (personal address). */
  samePerson: boolean;
}

export interface SharedPhoneHit {
  phone: string;
  contacts: { id: string; name: string; email: string | null }[];
  likelyDuplicate: boolean;
  differentPeople: boolean;
}

export interface PhoneAuditReport {
  internalNumberOnOutsideContact: InternalPhoneHit[];
  sharedNumbers: SharedPhoneHit[];
}

function contactEmails(contact: AuditContact): string[] {
  return [contact.email, ...(contact.all_emails || [])].filter((email): email is string => !!email);
}

function contactPhones(contact: AuditContact): string[] {
  const values = [
    contact.phone,
    ...(contact.all_phones || []),
    ...((contact.phones || []).map((phone) => phone?.number)),
  ];
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const value of values) {
    const digits = phoneDigits(value);
    if (digits.length !== 10 || seen.has(digits)) continue;
    seen.add(digits);
    phones.push(digits);
  }
  return phones;
}

function isInternalContact(contact: AuditContact): boolean {
  return contactEmails(contact).some((email) => isInternalEmail(email));
}

export function auditContactPhones(contacts: AuditContact[]): PhoneAuditReport {
  const internalByPhone = new Map<string, AuditContact[]>();
  for (const contact of contacts) {
    if (!isInternalContact(contact)) continue;
    for (const digits of contactPhones(contact)) {
      const list = internalByPhone.get(digits) || [];
      list.push(contact);
      internalByPhone.set(digits, list);
    }
  }

  const internalNumberOnOutsideContact: InternalPhoneHit[] = [];
  const seenHits = new Set<string>();
  for (const contact of contacts) {
    if (isInternalContact(contact)) continue;
    for (const digits of contactPhones(contact)) {
      const owners = internalByPhone.get(digits);
      if (!owners?.length) continue;
      for (const owner of owners) {
        const key = `${contact.id}:${owner.id}:${digits}`;
        if (seenHits.has(key)) continue;
        seenHits.add(key);
        internalNumberOnOutsideContact.push({
          phone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
          contactId: contact.id,
          contactName: contact.full_name || "",
          contactEmail: contact.email || null,
          internalName: owner.full_name || "",
          internalEmail: owner.email || null,
          samePerson: namesMatch(contact.full_name || "", owner.full_name || ""),
        });
      }
    }
  }

  const contactsByPhone = new Map<string, AuditContact[]>();
  for (const contact of contacts) {
    for (const digits of contactPhones(contact)) {
      const list = contactsByPhone.get(digits) || [];
      if (!list.some((existing) => existing.id === contact.id)) list.push(contact);
      contactsByPhone.set(digits, list);
    }
  }

  const sharedNumbers: SharedPhoneHit[] = [];
  for (const [digits, group] of contactsByPhone) {
    if (group.length < 2) continue;
    const names = group.map((contact) => contact.full_name || "").filter(Boolean);
    const sameName = names.length >= 2 && names.every((name) => namesMatch(name, names[0]));
    sharedNumbers.push({
      phone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
      contacts: group.map((contact) => ({
        id: contact.id,
        name: contact.full_name || "",
        email: contact.email || null,
      })),
      likelyDuplicate: sameName,
      differentPeople: !sameName,
    });
  }

  sharedNumbers.sort((a, b) => a.phone.localeCompare(b.phone));
  return { internalNumberOnOutsideContact, sharedNumbers };
}
