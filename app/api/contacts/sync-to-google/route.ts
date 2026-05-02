import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { updateGoogleContact } from "../../../lib/googleContacts";
import { getValidAccessToken } from "../../../lib/google";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// POST — push a batch of contacts from Supabase back to Google
// Call repeatedly until done: true
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const offset = body.offset || 0;
  const batchSize = 25;

  try {
    const accessToken = await getValidAccessToken(userId);

    // Get contacts with a real Google resource name
    const { data: contacts } = await supabase
      .from("tom_contacts")
      .select("id, full_name, phone, email, company, job_title, birthday, notes, key_context, home_address, work_address, google_resource_name")
      .eq("user_id", userId)
      .not("google_resource_name", "is", null)
      .not("phone", "is", null)
      .range(offset, offset + batchSize - 1);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ done: true, message: "All contacts synced to Google" });
    }

    let synced = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        if (
          contact.google_resource_name.startsWith("email_scrape_") ||
          contact.google_resource_name.startsWith("manual_")
        ) continue;

        await updateGoogleContact(accessToken, contact.google_resource_name, {
          phone: contact.phone,
          full_name: contact.full_name,
          email: contact.email,
          company: contact.company,
          job_title: contact.job_title,
          birthday: contact.birthday,
          notes: contact.notes,
          key_context: contact.key_context,
          address: contact.home_address,
          work_address: contact.work_address,
        });

        synced++;
        await new Promise(r => setTimeout(r, 100)); // rate limit
      } catch (e) {
        failed++;
        console.error("Sync error for contact:", contact.id, e);
      }
    }

    return NextResponse.json({
      done: contacts.length < batchSize,
      synced,
      failed,
      next_offset: offset + batchSize,
      message: `Synced ${synced} contacts to Google (offset ${offset})`,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}