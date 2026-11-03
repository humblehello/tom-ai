/**
 * One-time cleanup report. Dry-run by default. Does not write anything
 * unless --execute and an approval file are both present.
 *
 * Dry run (no database writes, no Google writes):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/cleanup-duplicates-report.ts --user-email you@example.com
 *
 * Add --check-sent to read Sent mail and mark contacts whose only replies
 * match the ARF donation or buyer/investor templates. That reads Gmail.
 * It still does not write.
 *
 *   npx tsx scripts/cleanup-duplicates-report.ts --user-email you@example.com --check-sent
 *
 * Execute only the ids in the approval file. Quarantine labels a Google
 * contact. It does not delete it. Merge deletes the duplicate Humble Hello
 * row and does not delete the Google contact.
 *
 *   npx tsx scripts/cleanup-duplicates-report.ts --user-email you@example.com \
 *     --execute --approve cleanup-reports/approved.txt
 *
 * approved.txt lines:
 *   merge <queue-id>
 *   dismiss <queue-id>
 *   quarantine <contact-id>
 *
 * Refuses a hosted Supabase URL unless CLEANUP_ALLOW_HOSTED=1.
 * This file was not run by the change that added it.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { getValidAccessToken } from "../app/lib/google";
import {
  assertExecuteAllowed,
  buildCleanupReport,
  isSafeAutoMerge,
  parseApprovedActions,
  type CleanupContact,
  type CleanupQueueRow,
} from "../app/lib/cleanup-report";
import { isAutoReplyTemplate } from "../app/lib/auto-reply-templates";
import { labelGoogleContactQuarantine } from "../app/lib/google-quarantine";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function hostedProjectUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.net");
  } catch {
    return false;
  }
}

function csv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string) => `"${(value || "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header] || "")).join(","))].join("\n");
}

async function markArfOnly<T extends { contact_id: string; email: string; reasons: string }>(
  userId: string,
  junk: T[]
): Promise<T[]> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (error: any) {
    console.error("Sent-mail check skipped. Could not get a Google token:", error?.message || error);
    return junk;
  }

  const checked: T[] = [];
  for (const row of junk) {
    if (!row.email) {
      checked.push(row);
      continue;
    }
    const query = `in:sent to:${row.email} newer_than:2y`;
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const list = await listRes.json();
    const messages = list.messages || [];
    if (messages.length === 0) {
      checked.push({ ...row, reasons: row.reasons ? `${row.reasons}|no_sent_mail` : "no_sent_mail" });
      continue;
    }
    let real = false;
    let template = false;
    for (const message of messages.slice(0, 3)) {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      const snippet = data.snippet || "";
      if (!snippet) continue;
      if (isAutoReplyTemplate(snippet)) template = true;
      else real = true;
    }
    if (template && !real) {
      checked.push({ ...row, reasons: `${row.reasons}|only_template_reply` });
    } else {
      checked.push(row);
    }
  }
  return checked;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const userEmail = arg("--user-email");
  if (!url || !key || !userEmail) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and --user-email. Nothing was queried.");
    process.exitCode = 1;
    return;
  }
  if (hostedProjectUrl(url) && process.env.CLEANUP_ALLOW_HOSTED !== "1") {
    console.error("Hosted Supabase URL. Set CLEANUP_ALLOW_HOSTED=1 to continue. Nothing was queried.");
    process.exitCode = 1;
    return;
  }

  const execute = hasFlag("--execute");
  const supabase = createClient(url, key);
  const { data: user, error: userError } = await supabase
    .from("tom_users")
    .select("id, email")
    .ilike("email", userEmail)
    .maybeSingle();
  if (userError || !user) {
    console.error(userError?.message || "User not found. Nothing was changed.");
    process.exitCode = 1;
    return;
  }

  const { data: queue, error: queueError } = await supabase
    .from("tom_merge_queue")
    .select("id, contact_a_id, contact_b_id, reason, contact_a_name, contact_b_name")
    .eq("user_id", user.id);
  if (queueError) {
    console.error(queueError.message);
    process.exitCode = 1;
    return;
  }

  const contacts: CleanupContact[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tom_contacts")
      .select("id, full_name, email, all_emails, phone, company, key_context, notes, email_count, last_emailed_at, manually_created, is_self, dunbar_tier, google_resource_name, signature_scanned_at, created_at")
      .eq("user_id", user.id)
      .range(from, from + 999);
    if (error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    contacts.push(...((data || []) as CleanupContact[]));
    if (!data || data.length < 1000) break;
  }

  const report = buildCleanupReport((queue || []) as CleanupQueueRow[], contacts);
  if (hasFlag("--check-sent")) {
    report.likelyJunk = await markArfOnly(user.id, report.likelyJunk);
  }

  mkdirSync("cleanup-reports", { recursive: true });
  writeFileSync("cleanup-reports/safe-merges.csv", csv(report.safeMerges));
  writeFileSync("cleanup-reports/dismiss-queue.csv", csv(report.dismissQueue));
  writeFileSync("cleanup-reports/likely-junk.csv", csv(report.likelyJunk));
  console.log(JSON.stringify({
    dry_run: !execute,
    user: user.email,
    safe_merges: report.safeMerges.length,
    dismiss_queue: report.dismissQueue.length,
    likely_junk: report.likelyJunk.length,
    files: [
      "cleanup-reports/safe-merges.csv",
      "cleanup-reports/dismiss-queue.csv",
      "cleanup-reports/likely-junk.csv",
    ],
  }, null, 2));

  if (!execute) {
    console.log("Dry run only. No contacts, queue rows, or Google contacts were changed.");
    return;
  }

  const approvePath = arg("--approve");
  if (!approvePath) {
    console.error("Execute refused. Pass --approve with a file of ids. Nothing was changed.");
    process.exitCode = 1;
    return;
  }
  let actions;
  try {
    actions = parseApprovedActions(readFileSync(approvePath, "utf8"));
    assertExecuteAllowed("QUARANTINE_AND_MERGE_APPROVED_IDS", actions);
  } catch (error: any) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  let accessToken: string | null = null;
  try { accessToken = await getValidAccessToken(user.id); } catch { accessToken = null; }

  const results: Array<Record<string, unknown>> = [];
  for (const action of actions) {
    if (action.op === "dismiss") {
      const { error } = await supabase.from("tom_merge_queue").delete().eq("id", action.queueId).eq("user_id", user.id);
      results.push({ ...action, ok: !error, error: error?.message });
      continue;
    }
    if (action.op === "quarantine") {
      const { data: contact } = await supabase
        .from("tom_contacts")
        .select("id, google_resource_name")
        .eq("id", action.contactId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!contact) {
        results.push({ ...action, ok: false, error: "contact not found" });
        continue;
      }
      let google: { ok: boolean; error?: string } = { ok: true };
      if (contact.google_resource_name && accessToken) {
        google = await labelGoogleContactQuarantine(accessToken, contact.google_resource_name);
      }
      const { error } = await supabase.from("tom_contacts").update({
        deletion_suggested: true,
        deletion_reason: "quarantine: cleanup report. Google contact was labeled, not deleted.",
      }).eq("id", action.contactId).eq("user_id", user.id);
      results.push({ ...action, ok: !error, error: error?.message, google, google_deleted: false });
      continue;
    }
    const { data: row } = await supabase
      .from("tom_merge_queue")
      .select("id, contact_a_id, contact_b_id")
      .eq("id", action.queueId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) {
      results.push({ ...action, ok: false, error: "queue row not found" });
      continue;
    }
    const { data: pair } = await supabase
      .from("tom_contacts")
      .select("id, full_name, email, email_count, dunbar_tier, is_self, phone, company, google_resource_name, all_emails")
      .eq("user_id", user.id)
      .in("id", [row.contact_a_id, row.contact_b_id]);
    const a = (pair || []).find((contact) => contact.id === row.contact_a_id) as CleanupContact | undefined;
    const b = (pair || []).find((contact) => contact.id === row.contact_b_id) as CleanupContact | undefined;
    if (!a || !b || !isSafeAutoMerge(a, b)) {
      results.push({ ...action, ok: false, error: "pair is no longer a safe exact match" });
      continue;
    }
    const keep = (a.email_count || 0) >= (b.email_count || 0) ? a : b;
    const drop = keep.id === a.id ? b : a;
    const emails = new Set<string>([...(keep.all_emails || []), ...(drop.all_emails || []), keep.email || "", drop.email || ""]
      .map((email) => (email || "").toLowerCase()).filter(Boolean));
    await supabase.from("tom_contacts").update({
      all_emails: [...emails],
      ...(!keep.phone && drop.phone ? { phone: drop.phone } : {}),
      ...(!keep.company && drop.company ? { company: drop.company } : {}),
      ...(!keep.google_resource_name && drop.google_resource_name ? { google_resource_name: drop.google_resource_name } : {}),
    }).eq("id", keep.id).eq("user_id", user.id);
    if (drop.google_resource_name && drop.google_resource_name !== keep.google_resource_name && accessToken) {
      await labelGoogleContactQuarantine(accessToken, drop.google_resource_name);
    }
    await supabase.from("tom_contacts").delete().eq("id", drop.id).eq("user_id", user.id);
    await supabase.from("tom_merge_queue").delete().eq("id", action.queueId).eq("user_id", user.id);
    results.push({ ...action, ok: true, keep_id: keep.id, delete_id: drop.id, google_deleted: false });
  }
  console.log(JSON.stringify({ executed: results.length, google_contacts_deleted: 0, results }, null, 2));
}

main();
