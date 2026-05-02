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

function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^1/, "");
}

function emailDomain(email?: string | null): string {
  if (!email) return "";
  return email.split("@")[1]?.toLowerCase() || "";
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "comcast.net",
  "sbcglobal.net", "msn.com", "live.com",
]);

function isPersonalEmail(email?: string | null): boolean {
  return PERSONAL_DOMAINS.has(emailDomain(email));
}

function normalizeCompany(company?: string | null): string {
  if (!company) return "";
  return company.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function shouldAutoMerge(a: any, b: any): { keepId: string; deleteId: string; reason: string } | null {
  if (!a.email || !b.email) return null;
  if (a.email.toLowerCase() !== b.email.toLowerCase()) return null;

  const nameA = (a.full_name || "").toLowerCase().trim();
  const nameB = (b.full_name || "").toLowerCase().trim();
  if (!nameA || !nameB || nameA !== nameB) return null;

  const keepId = (a.email_count || 0) >= (b.email_count || 0) ? a.id : b.id;
  const deleteId = keepId === a.id ? b.id : a.id;
  return { keepId, deleteId, reason: "same_name_same_email" };
}
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: queue } = await supabase
    .from("tom_merge_queue")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!queue?.length) return NextResponse.json({ ok: true, auto_merged: 0, remaining: 0 });

  const contactIds = [...new Set(queue.flatMap((q: any) => [q.contact_a_id, q.contact_b_id]))];
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, all_emails, phone, company, job_title, home_address, email_count, google_resource_name")
    .eq("user_id", userId)
    .in("id", contactIds);

  const contactMap: Record<string, any> = Object.fromEntries((contacts || []).map((c: any) => [c.id, c]));

  let autoMerged = 0;
  const reasons: Record<string, number> = {};

  for (const item of queue) {
    let a = contactMap[item.contact_a_id];
    let b = contactMap[item.contact_b_id];

    if (!a || !b) {
      await supabase.from("tom_merge_queue").delete().eq("id", item.id).eq("user_id", userId);
      continue;
    }

    // Prefer keeping contact with google_resource_name
    if (b.google_resource_name && !a.google_resource_name) { const tmp = a; a = b; b = tmp; }

    console.log("Checking:", a.full_name, a.email, b.email, "phone match:", normalizePhone(a.phone), "===", normalizePhone(b.phone), "company match:", normalizeCompany(a.company), "===", normalizeCompany(b.company));
    const decision = shouldAutoMerge(a, b);
    console.log("Decision:", decision?.reason || "none");
if (!decision) continue;
    // Fetch full contacts for merge
    const [{ data: keeper }, { data: loser }] = await Promise.all([
      supabase.from("tom_contacts").select("*").eq("id", decision.keepId).eq("user_id", userId).single(),
      supabase.from("tom_contacts").select("*").eq("id", decision.deleteId).eq("user_id", userId).single(),
    ]);
    if (!keeper || !loser) continue;
    // Never auto-merge protected tier contacts
    if ((keeper.dunbar_tier && keeper.dunbar_tier <= 2) || (loser.dunbar_tier && loser.dunbar_tier <= 2)) continue;
    const updates: Record<string, any> = {};

    // Combine all_emails
    const keeperEmails = new Set([...(keeper.all_emails || [keeper.email].filter(Boolean))]);
    (loser.all_emails || [loser.email].filter(Boolean)).forEach((e: string) => { if (e) keeperEmails.add(e.toLowerCase()); });
    updates.all_emails = Array.from(keeperEmails).filter(Boolean);

    if ((loser.email_count || 0) > (keeper.email_count || 0)) updates.email = loser.email;

    // Combine phones jsonb
    const keeperPhones: any[] = keeper.phones || (keeper.phone ? [{ number: keeper.phone, type: "cell", primary: true }] : []);
    const loserPhones: any[] = loser.phones || (loser.phone ? [{ number: loser.phone, type: "cell", primary: true }] : []);
    const allPhoneNumbers = new Set(keeperPhones.map((p: any) => p.number));
    loserPhones.forEach((p: any) => { if (!allPhoneNumbers.has(p.number)) keeperPhones.push({ ...p, primary: false }); });
    updates.phones = keeperPhones;

    updates.email_count = Math.max(keeper.email_count || 0, loser.email_count || 0);

    if (loser.last_emailed_at && (!keeper.last_emailed_at || new Date(loser.last_emailed_at) > new Date(keeper.last_emailed_at))) {
      updates.last_emailed_at = loser.last_emailed_at;
    }

    const fillFields = ["phone", "company", "job_title", "home_address", "work_address", "birthday", "notes", "key_context", "topics", "best_channel", "relationship_type", "relationship_types", "linkedin_url", "twitter_url", "instagram_url", "facebook_url", "industry", "seniority", "tags", "intelligence", "dunbar_bucket"];
    // Preserve tier — take the higher tier (lower number) from either contact
    const keeperTier = keeper.dunbar_tier || 999;
    const loserTier = loser.dunbar_tier || 999;
    if (loserTier < keeperTier) {
      updates.dunbar_tier = loser.dunbar_tier;
      updates.tier_override = loser.tier_override || true;
    } else if (keeper.dunbar_tier) {
      updates.tier_override = keeper.tier_override || true;
    }
    for (const field of fillFields) {
      if (!keeper[field] && loser[field]) updates[field] = loser[field];
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("tom_contacts").update(updates).eq("id", decision.keepId).eq("user_id", userId);
    }

    if (loser.google_resource_name) {
      await supabase.from("tom_deleted_contacts").insert({ user_id: userId, google_resource_name: loser.google_resource_name });
    }

    await supabase.from("tom_contacts").delete().eq("id", decision.deleteId).eq("user_id", userId);
    await supabase.from("tom_merge_queue").delete().eq("id", item.id).eq("user_id", userId);

    delete contactMap[decision.deleteId];
    autoMerged++;
    reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
  }

  const { count: remaining } = await supabase
    .from("tom_merge_queue")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  return NextResponse.json({ ok: true, auto_merged: autoMerged, remaining: remaining || 0, reasons });
}