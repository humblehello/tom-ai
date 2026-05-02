import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/app/lib/google";
import { classifyRelationship, classifyTopContacts } from "@/app/lib/relationship-classifier";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// POST /api/relationships/classify — classify a single contact or top batch
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { contact_id, batch_size = 10 } = body;

  try {
    const accessToken = await getValidAccessToken(userId);

    if (contact_id) {
      // Classify single contact
      const result = await classifyRelationship(userId, contact_id, accessToken);
      return NextResponse.json({ result });
    } else {
      // Classify top batch
      const results = await classifyTopContacts(userId, accessToken, batch_size);
      return NextResponse.json({ classified: results.length, results });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — get classified contacts ranked by relationship strength
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const { data } = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, phone, company, job_title, relationship_type, relationship_types, relationship_strength, relationship_health, key_context, best_channel, relationship_context, last_emailed_at, last_classified_at, last_meaningful_touch_at, last_reached_out_at, calendar_intimacy_score, shared_events, dunbar_tier, dunbar_bucket, humble_score, tier_override, topics, tags, notes, birthday, home_address, linkedin_url, twitter_url, instagram_url, facebook_url, gifting_eligible, card_eligible, all_emails, phones, engage_snoozed_until, engage_permanently_excluded, email_count, email_status").eq("user_id", userId)
    .or("last_classified_at.not.is.null,dunbar_tier.not.is.null")
    .order("relationship_strength", { ascending: false })
    .limit(1000);
  return NextResponse.json({ contacts: data || [] });
}