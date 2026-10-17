/**
 * Read-only audit of contact phones.
 *
 * Finds:
 *   - an outside contact carrying a phone number that also belongs to a
 *     thumbprint.com employee (including staff who also have a personal address)
 *   - a phone number stored on more than one contact
 *
 * This script only SELECTs. It has no insert, update, delete, or rpc calls.
 * Do not point it at production unless a human explicitly wants a read.
 * It refuses to start when the Supabase URL is missing, and it refuses a URL
 * that looks like a hosted project unless AUDIT_ALLOW_HOSTED_READ=1 is set.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/audit-signature-phones.ts
 */

import { createClient } from "@supabase/supabase-js";
import { auditContactPhones, type AuditContact } from "../app/lib/phone-audit";

function hostedProjectUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.net");
  } catch {
    return false;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    console.error("No Supabase URL or service role key in the environment. Nothing was queried.");
    process.exitCode = 1;
    return;
  }
  if (hostedProjectUrl(url) && process.env.AUDIT_ALLOW_HOSTED_READ !== "1") {
    console.error(
      "This Supabase URL is a hosted project. Set AUDIT_ALLOW_HOSTED_READ=1 to run a read-only select. No query was sent."
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key);
  const pageSize = 1000;
  const contacts: AuditContact[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("tom_contacts")
      .select("id, full_name, email, all_emails, phone, phones, all_phones")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("Read failed:", error.message);
      process.exitCode = 1;
      return;
    }
    contacts.push(...((data || []) as AuditContact[]));
    if (!data || data.length < pageSize) break;
  }

  const report = auditContactPhones(contacts);
  console.log(JSON.stringify({
    contacts_read: contacts.length,
    internal_number_on_outside_contact: report.internalNumberOnOutsideContact.length,
    shared_numbers: report.sharedNumbers.length,
    report,
  }, null, 2));
}

main();
