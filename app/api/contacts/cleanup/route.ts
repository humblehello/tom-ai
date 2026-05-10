import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/app/lib/google";
import { isBlockedEmail } from "@/app/lib/contact-blocklist";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}
// Pattern list moved to app/lib/contact-blocklist.ts (2026-05-10)
const isSystemEmail = (email: string) => isBlockedEmail(email);

function isMissingName(contact: any): boolean {
  const full = (contact.full_name || "").trim();
  if (!full) return true;
  if (full.includes("@")) return true;
  const parts = full.split(" ").filter((p: string) => p.length > 0);
  if (parts.length < 2) return true;
  return false;
}

async function deleteFromGoogle(accessToken: string, resourceName: string): Promise<void> {
  try {
    await fetch(
      `https://people.googleapis.com/v1/${resourceName}:deleteContact`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch (e) {}
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let accessToken: string | null = null;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (e) {}

  const results = {
    no_email: 0,
    no_name: 0,
    system_email: 0,
    inactive_3_years: 0,
    spam_junk: 0,
    total_deleted: 0,
  };

  try {
    const { data: contacts } = await supabase
      .from("tom_contacts")
      .select("id, full_name, email, google_resource_name, last_emailed_at, notes, deletion_reason")
      .eq("user_id", userId)
      .range(0, 99999);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, ...results });
    }

    const toDelete: { id: string; resource: string | null; reason: string }[] = [];
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);

    for (const contact of contacts) {
      const email = (contact.email || "").toLowerCase().trim();
      const notes = (contact.notes || "").toLowerCase();

      // Rule 1: No email address
      if (!email) {
        toDelete.push({ id: contact.id, resource: contact.google_resource_name, reason: "no_email" });
        continue;
      }

      // Rule 2: Missing first OR last name
      if (isMissingName(contact)) {
        toDelete.push({ id: contact.id, resource: contact.google_resource_name, reason: "no_name" });
        continue;
      }

      // Rule 3: System/automated email
      if (isSystemEmail(email)) {
        toDelete.push({ id: contact.id, resource: contact.google_resource_name, reason: "system_email" });
        continue;
      }

      // Rule 4: Marked as spam or junk
      if (
        notes.includes("spam") ||
        notes.includes("junk") ||
        contact.deletion_reason?.toLowerCase().includes("spam") ||
        contact.deletion_reason?.toLowerCase().includes("junk")
      ) {
        toDelete.push({ id: contact.id, resource: contact.google_resource_name, reason: "spam_junk" });
        continue;
      }

      // Rule 5: No email interaction in 3+ years or never emailed
      if (!contact.last_emailed_at) {
        toDelete.push({ id: contact.id, resource: contact.google_resource_name, reason: "inactive_3_years" });
        continue;
      }

      if (new Date(contact.last_emailed_at) < threeYearsAgo) {
        toDelete.push({ id: contact.id, resource: contact.google_resource_name, reason: "inactive_3_years" });
        continue;
      }
    }

    // Delete in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE);
      const ids = batch.map(c => c.id);

      await supabase
        .from("tom_contacts")
        .delete()
        .in("id", ids)
        .eq("user_id", userId);

      if (accessToken) {
        for (const contact of batch) {
          if (contact.resource) {
            await deleteFromGoogle(accessToken, contact.resource);
            await new Promise(r => setTimeout(r, 50));
          }
        }
      }

      batch.forEach(c => {
        if (c.reason === "no_email") results.no_email++;
        else if (c.reason === "no_name") results.no_name++;
        else if (c.reason === "system_email") results.system_email++;
        else if (c.reason === "inactive_3_years") results.inactive_3_years++;
        else if (c.reason === "spam_junk") results.spam_junk++;
      });
    }

    results.total_deleted = toDelete.length;

    return NextResponse.json({
      success: true,
      ...results,
      message: `Cleaned up ${results.total_deleted} contacts`,
    });

  } catch (e: any) {
    console.error("Cleanup error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}