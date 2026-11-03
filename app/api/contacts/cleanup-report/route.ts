import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/app/lib/google";
import {
  assertExecuteAllowed,
  buildCleanupReport,
  isSafeAutoMerge,
  type CleanupContact,
  type CleanupOp,
  type CleanupQueueRow,
} from "@/app/lib/cleanup-report";
import { labelGoogleContactQuarantine } from "@/app/lib/google-quarantine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONTACT_COLUMNS = "id, full_name, email, all_emails, phone, company, job_title, notes, key_context, email_count, last_emailed_at, manually_created, is_self, dunbar_tier, google_resource_name, signature_scanned_at, created_at";

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

async function loadReport(userId: string) {
  const { data: queue, error: queueError } = await supabase
    .from("tom_merge_queue")
    .select("id, contact_a_id, contact_b_id, reason, contact_a_name, contact_b_name")
    .eq("user_id", userId);
  if (queueError) throw new Error(queueError.message);

  const contacts: CleanupContact[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("tom_contacts")
      .select(CONTACT_COLUMNS)
      .eq("user_id", userId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    contacts.push(...((data || []) as CleanupContact[]));
    if (!data || data.length < pageSize) break;
  }

  return {
    report: buildCleanupReport((queue || []) as CleanupQueueRow[], contacts),
    contacts,
  };
}

async function quarantineContact(userId: string, contactId: string, accessToken: string | null) {
  const { data: contact } = await supabase
    .from("tom_contacts")
    .select("id, google_resource_name, deletion_reason")
    .eq("id", contactId)
    .eq("user_id", userId)
    .single();
  if (!contact) return { ok: false, error: "contact not found" };

  let google: { ok: boolean; error?: string } = { ok: true };
  if (contact.google_resource_name && accessToken) {
    google = await labelGoogleContactQuarantine(accessToken, contact.google_resource_name);
  }

  const { error } = await supabase
    .from("tom_contacts")
    .update({
      deletion_suggested: true,
      deletion_reason: "quarantine: cleanup report. Google contact was labeled, not deleted.",
    })
    .eq("id", contactId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message, google };
  return { ok: true, google, deleted: false };
}

async function mergeQueuePair(userId: string, queueId: string) {
  const { data: row } = await supabase
    .from("tom_merge_queue")
    .select("id, contact_a_id, contact_b_id")
    .eq("id", queueId)
    .eq("user_id", userId)
    .single();
  if (!row) return { ok: false, error: "queue row not found" };

  const { data: pair } = await supabase
    .from("tom_contacts")
    .select(CONTACT_COLUMNS)
    .eq("user_id", userId)
    .in("id", [row.contact_a_id, row.contact_b_id]);
  const a = (pair || []).find((contact) => contact.id === row.contact_a_id) as CleanupContact | undefined;
  const b = (pair || []).find((contact) => contact.id === row.contact_b_id) as CleanupContact | undefined;
  if (!a || !b || !isSafeAutoMerge(a, b)) {
    return { ok: false, error: "pair is no longer an exact email and name match outside tier 1-2" };
  }

  const keep = (a.email_count || 0) >= (b.email_count || 0) ? a : b;
  const drop = keep.id === a.id ? b : a;
  const updates: Record<string, unknown> = {};
  if (!keep.phone && drop.phone) updates.phone = drop.phone;
  if (!keep.company && drop.company) updates.company = drop.company;
  if (!keep.google_resource_name && drop.google_resource_name) {
    updates.google_resource_name = drop.google_resource_name;
  }
  const emails = new Set<string>([
    ...(keep.all_emails || []),
    ...(drop.all_emails || []),
    keep.email || "",
    drop.email || "",
  ].map((email) => email.toLowerCase()).filter(Boolean));
  updates.all_emails = [...emails];
  await supabase.from("tom_contacts").update(updates).eq("id", keep.id).eq("user_id", userId);
  await supabase.from("tom_contacts").delete().eq("id", drop.id).eq("user_id", userId);
  await supabase.from("tom_merge_queue").delete().eq("id", queueId).eq("user_id", userId);
  return { ok: true, keep_id: keep.id, delete_id: drop.id, google_deleted: false };
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { report } = await loadReport(userId);
    return NextResponse.json({
      dry_run: true,
      safe_merges: report.safeMerges.length,
      dismiss_queue: report.dismissQueue.length,
      likely_junk: report.likelyJunk.length,
      safeMerges: report.safeMerges,
      dismissQueue: report.dismissQueue,
      likelyJunk: report.likelyJunk,
      note: "Dry run. Nothing was changed. ARF-only detection for existing contacts is in the script with --check-sent.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.execute !== true) {
    const { report } = await loadReport(userId);
    return NextResponse.json({ dry_run: true, ...report });
  }

  let actions: CleanupOp[] = [];
  try {
    actions = Array.isArray(body.actions) ? body.actions : [];
    assertExecuteAllowed(body.confirm, actions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message, changed: false }, { status: 400 });
  }

  let accessToken: string | null = null;
  try { accessToken = await getValidAccessToken(userId); } catch { accessToken = null; }

  const results = [];
  for (const action of actions) {
    if (action.op === "dismiss") {
      await supabase.from("tom_merge_queue").delete().eq("id", action.queueId).eq("user_id", userId);
      results.push({ ...action, ok: true });
    } else if (action.op === "quarantine") {
      results.push({ ...action, ...(await quarantineContact(userId, action.contactId, accessToken)) });
    } else if (action.op === "merge") {
      results.push({ ...action, ...(await mergeQueuePair(userId, action.queueId)) });
    } else {
      results.push({ ok: false, error: "unknown op" });
    }
  }

  return NextResponse.json({
    dry_run: false,
    changed: true,
    google_contacts_deleted: 0,
    results,
  });
}
