import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── Phone normalization — strip all non-digits for comparison ────────────────
function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^1/, ""); // strip country code
}

// ── Email domain extractor ───────────────────────────────────────────────────
function emailDomain(email?: string | null): string {
  if (!email) return "";
  return email.split("@")[1]?.toLowerCase() || "";
}

// ── Personal email domains ───────────────────────────────────────────────────
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "comcast.net",
  "sbcglobal.net", "msn.com", "live.com",
]);

function isPersonalEmail(email?: string | null): boolean {
  return PERSONAL_DOMAINS.has(emailDomain(email));
}

// ── Company name normalization ───────────────────────────────────────────────
function normalizeCompany(company?: string | null): string {
  if (!company) return "";
  return company.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Auto-resolve decision engine ─────────────────────────────────────────────
function shouldAutoMerge(a: any, b: any): { merge: boolean; keepId: string; deleteId: string; reason: string } | null {
  const noMerge = null;

  // ── Rule 1: One contact has no email (shell record) ──────────────────────
  if (!a.email && b.email) {
    return { merge: true, keepId: b.id, deleteId: a.id, reason: "shell_no_email" };
  }
  if (!b.email && a.email) {
    return { merge: true, keepId: a.id, deleteId: b.id, reason: "shell_no_email" };
  }

  // ── Rule 2: Same email address (exact match) ─────────────────────────────
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
    // Keep the one with more email history
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "same_email" };
  }

  const domainA = emailDomain(a.email);
  const domainB = emailDomain(b.email);
  const companyA = normalizeCompany(a.company);
  const companyB = normalizeCompany(b.company);
  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);

  const sameCompany = companyA && companyB && companyA === companyB;
  const samePhone = phoneA && phoneB && phoneA === phoneB && phoneA.length >= 10;
  const sameDomain = domainA && domainB && domainA === domainB;
  const onePersonalOneWork = (isPersonalEmail(a.email) && !isPersonalEmail(b.email)) ||
                              (!isPersonalEmail(a.email) && isPersonalEmail(b.email));

  // ── Rule 3: Same email domain + same company ─────────────────────────────
  if (sameDomain && sameCompany) {
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "same_domain_same_company" };
  }

  // ── Rule 4: Same email domain + same phone ───────────────────────────────
  if (sameDomain && samePhone) {
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "same_domain_same_phone" };
  }

  // ── Rule 5: Personal + work email, same company ──────────────────────────
  if (onePersonalOneWork && sameCompany) {
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "personal_work_same_company" };
  }

  // ── Rule 6: Personal + work email, same phone ────────────────────────────
  if (onePersonalOneWork && samePhone) {
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "personal_work_same_phone" };
  }

  // ── Rule 7: Same company + same phone (phone must not be sole signal) ────
  // Phone + company together is strong enough
  if (sameCompany && samePhone) {
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "same_company_same_phone" };
  }

  // ── Rule 8: Same company + same address ─────────────────────────────────
  const addrA = a.home_address ? JSON.stringify(a.home_address).toLowerCase() : "";
  const addrB = b.home_address ? JSON.stringify(b.home_address).toLowerCase() : "";
  if (sameCompany && addrA && addrB && addrA === addrB) {
    const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
    const deleteId = keepId === a.id ? b.id : a.id;
    return { merge: true, keepId, deleteId, reason: "same_company_same_address" };
  }

  // ── No auto-merge rule matched → human review ────────────────────────────
  return noMerge;
}

// ── Merge executor — combines all data from both contacts ────────────────────
async function executeMerge(userId: string, keepId: string, deleteId: string, queueId: string) {
  const [{ data: keeper }, { data: loser }] = await Promise.all([
    supabase.from("tom_contacts").select("*").eq("id", keepId).eq("user_id", userId).single(),
    supabase.from("tom_contacts").select("*").eq("id", deleteId).eq("user_id", userId).single(),
  ]);

  if (!keeper || !loser) return { error: "Contacts not found" };

  const updates: Record<string, any> = {};

  // ── Combine all_emails — deduplicated, primary = higher email_count ───────
  const keeperEmails = new Set([
    ...(keeper.all_emails || [keeper.email].filter(Boolean)),
  ]);
  const loserEmails = [
    ...(loser.all_emails || [loser.email].filter(Boolean)),
  ];
  loserEmails.forEach(e => { if (e) keeperEmails.add(e.toLowerCase()); });
  updates.all_emails = Array.from(keeperEmails).filter(Boolean);

  // Primary email = whichever contact has higher email_count
  if ((loser.email_count || 0) > (keeper.email_count || 0)) {
    updates.email = loser.email;
  }

  // ── Combine phones jsonb ──────────────────────────────────────────────────
  const keeperPhones: any[] = keeper.phones || (keeper.phone ? [{ number: keeper.phone, type: "cell", primary: true }] : []);
  const loserPhones: any[] = loser.phones || (loser.phone ? [{ number: loser.phone, type: "cell", primary: true }] : []);
  const allPhoneNumbers = new Set(keeperPhones.map((p: any) => p.number));
  loserPhones.forEach((p: any) => { if (!allPhoneNumbers.has(p.number)) keeperPhones.push({ ...p, primary: false }); });
  updates.phones = keeperPhones;

  // ── Take higher email count ───────────────────────────────────────────────
  updates.email_count = Math.max(keeper.email_count || 0, loser.email_count || 0);

  // ── Most recent contact date ──────────────────────────────────────────────
  if (loser.last_emailed_at && (!keeper.last_emailed_at ||
    new Date(loser.last_emailed_at) > new Date(keeper.last_emailed_at))) {
    updates.last_emailed_at = loser.last_emailed_at;
  }

  // ── Fill missing fields from loser into keeper ────────────────────────────
  const fillFields = [
    "phone", "company", "job_title", "home_address", "work_address",
    "birthday", "notes", "key_context", "topics", "best_channel",
    "relationship_type", "relationship_types", "linkedin_url",
    "twitter_url", "instagram_url", "facebook_url", "industry",
    "seniority", "tags", "intelligence",
  ];
  for (const field of fillFields) {
    if (!keeper[field] && loser[field]) {
      updates[field] = loser[field];
    }
  }

  // ── Prefer keeper with google_resource_name ───────────────────────────────
  // (keepId is already chosen to be the one with google_resource_name if possible)

  // Apply updates
  if (Object.keys(updates).length > 0) {
    await supabase.from("tom_contacts").update(updates).eq("id", keepId).eq("user_id", userId);
  }

  // Log loser for Google deletion
  if (loser.google_resource_name) {
    await supabase.from("tom_deleted_contacts").insert({
      user_id: userId,
      google_resource_name: loser.google_resource_name,
    });
  }

  // Delete loser
  await supabase.from("tom_contacts").delete().eq("id", deleteId).eq("user_id", userId);

  // Remove from queue
  if (queueId) {
    await supabase.from("tom_merge_queue").delete().eq("id", queueId).eq("user_id", userId);
  }

  return { success: true, updates_applied: Object.keys(updates) };
}

// ── GET — fetch queue with full contact details ───────────────────────────────
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: queue, error } = await supabase
    .from("tom_merge_queue")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!queue || queue.length === 0) return NextResponse.json({ items: [] });

  const contactIds = [...new Set(queue.flatMap(q => [q.contact_a_id, q.contact_b_id]))];
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, all_emails, phone, company, job_title, home_address, birthday, notes, key_context, topics, relationship_strength, relationship_health, relationship_type, email_count, last_emailed_at, google_resource_name")
    .eq("user_id", userId)
    .in("id", contactIds);

  const contactMap = Object.fromEntries((contacts || []).map(c => [c.id, c]));

  const items = queue.map(q => ({
    ...q,
    contact_a: contactMap[q.contact_a_id] || null,
    contact_b: contactMap[q.contact_b_id] || null,
  }));

  return NextResponse.json({ items });
}

// ── POST — handle merge, keep_both, auto_resolve ──────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { queue_id, action, keep_id, delete_id } = body;

  // ── Auto-resolve: sweep entire queue ─────────────────────────────────────
  if (action === "auto_resolve") {
    const { data: queue } = await supabase
      .from("tom_merge_queue")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (!queue?.length) return NextResponse.json({ auto_merged: 0, remaining: 0 });

    const contactIds = [...new Set(queue.flatMap(q => [q.contact_a_id, q.contact_b_id]))];
    const { data: contacts } = await supabase
      .from("tom_contacts")
      .select("id, full_name, email, all_emails, phone, company, job_title, home_address, email_count, google_resource_name")
      .eq("user_id", userId)
      .in("id", contactIds);

    const contactMap = Object.fromEntries((contacts || []).map(c => [c.id, c]));

    let autoMerged = 0;
    const reasons: Record<string, number> = {};

    for (const item of queue) {
      const a = contactMap[item.contact_a_id];
      const b = contactMap[item.contact_b_id];

      if (!a || !b) {
        // One contact already deleted — clean up queue entry
        await supabase.from("tom_merge_queue").delete().eq("id", item.id).eq("user_id", userId);
        continue;
      }

      // Prefer keeping contact with google_resource_name
      let contactA = a;
      let contactB = b;
      if (b.google_resource_name && !a.google_resource_name) {
        contactA = b;
        contactB = a;
      }

      const decision = shouldAutoMerge(contactA, contactB);
      if (decision) {
        const result = await executeMerge(userId, decision.keepId, decision.deleteId, item.id);
        if (!result.error) {
          autoMerged++;
          reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
          // Update contactMap so subsequent items reflect deletions
          delete contactMap[decision.deleteId];
        }
      }
    }

    const { count: remaining } = await supabase
      .from("tom_merge_queue")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    return NextResponse.json({ auto_merged: autoMerged, remaining: remaining || 0, reasons });
  }

  // ── Single queue item actions ─────────────────────────────────────────────
  const { data: queueItem } = await supabase
    .from("tom_merge_queue")
    .select("*")
    .eq("id", queue_id)
    .eq("user_id", userId)
    .single();

  if (!queueItem) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });

  if (action === "keep_both") {
    await supabase.from("tom_merge_queue").delete().eq("id", queue_id).eq("user_id", userId);
    return NextResponse.json({ success: true, action: "keep_both" });
  }

  if (action === "merge") {
    if (!keep_id || !delete_id) return NextResponse.json({ error: "Missing keep_id or delete_id" }, { status: 400 });
    const result = await executeMerge(userId, keep_id, delete_id, queue_id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ success: true, action: "merged", updates_applied: result.updates_applied });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}