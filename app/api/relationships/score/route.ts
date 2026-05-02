import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreContact } from "@/app/lib/relationship-scorer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const offset = parseInt(searchParams.get("offset") || "0");
  const batchSize = 100;

  const { data: contacts } = await supabase
    .from("tom_contacts")
   .select("id, email, last_emailed_at, last_interaction_at, email_count, interaction_count, home_address, phone, birthday, notes, company, job_title, gifting_eligible, priority_override")
    .eq("user_id", userId)
    .range(offset, offset + batchSize - 1);

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ scored: 0, done: true });
  }

  // Score all contacts in memory first
  const updates = contacts.map(contact => {
    const { score, tier } = scoreContact(contact);
    return {
      id: contact.id,
      relationship_score: score,
      relationship_tier: tier,
      last_interaction_at: contact.last_emailed_at || contact.last_interaction_at || null,
    };
  });

  // Single upsert for all updates
  const { error } = await supabase
    .from("tom_contacts")
    .upsert(updates, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    scored: contacts.length,
    offset,
    next_offset: offset + batchSize,
    done: contacts.length < batchSize,
  });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [top, cold] = await Promise.all([
    supabase
      .from("tom_contacts")
      .select("id, full_name, email, phone, relationship_score, relationship_tier, last_interaction_at, last_emailed_at, company, job_title, notes, home_address")
      .eq("user_id", userId)
      .not("relationship_tier", "is", null)
      .neq("relationship_tier", "C")
      .order("relationship_score", { ascending: false })
      .limit(10),
    supabase
      .from("tom_contacts")
      .select("id, full_name, email, phone, relationship_score, relationship_tier, last_interaction_at, last_emailed_at, company, job_title")
      .eq("user_id", userId)
      .in("relationship_tier", ["A+", "A"])
      .lt("last_emailed_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order("relationship_score", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({ top: top.data || [], cold: cold.data || [] });
}