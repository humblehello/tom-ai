import { NextRequest, NextResponse } from "next/server";
import { checkFeature } from "@/app/lib/requireFeature";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

function stepToDb(s: any, i: number, campaignId: string) {
  const config = s.config || {};
  return {
    campaign_id: campaignId,
    step_order: i,
    step_type: s.step_type,
    subject: config.subject || null,
    body: config.body || null,
    wait_days: config.days || null,
    card_occasion: config.occasion || null,
    card_message: config.message || null,
    branch_condition: config.condition || null,
    include_signature: true,
    include_footer: true,
  };
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("campaigns");
  if (block) return block;

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select(`
      id, name, description, status, reply_behavior, created_at, updated_at,
      campaign_audiences (
        audience_id,
        audiences ( id, name )
      )
    `)
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withStats = await Promise.all((campaigns || []).map(async (c: any) => {
    const { data: events } = await supabase
      .from("campaign_events")
      .select("event_type")
      .eq("campaign_id", c.id);

    const stats = { sent: 0, opened: 0, clicked: 0, replied: 0, opted_out: 0 };
    (events || []).forEach((e: any) => {
      if (e.event_type === "email_sent") stats.sent++;
      if (e.event_type === "open") stats.opened++;
      if (e.event_type === "click") stats.clicked++;
      if (e.event_type === "reply") stats.replied++;
      if (e.event_type === "opt_out") stats.opted_out++;
    });

    return { ...c, stats };
  }));

  return NextResponse.json({ campaigns: withStats });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("campaigns");
  if (block) return block;
  
  const body = await request.json();
  const { name, description, reply_behavior, audience_ids, steps } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      user_id: userId,
      name: name.trim(),
      description: description?.trim() || null,
      status: "draft",
      reply_behavior: reply_behavior || "exit",
      card_budget: body.card_budget ?? null,
      no_budget_cap: body.no_budget_cap ?? false,
    })
    .select()
    .single();

  if (error || !campaign) return NextResponse.json({ error: error?.message }, { status: 500 });

  // Link audiences (no user_id column on this table)
  if (audience_ids?.length > 0) {
    const { error: audErr } = await supabase.from("campaign_audiences").insert(
      audience_ids.map((audience_id: string) => ({ campaign_id: campaign.id, audience_id }))
    );
    if (audErr) console.error("[campaigns POST] audience error:", audErr.message);
  }

  // Save steps using actual DB column names
  if (steps?.length > 0) {
    const { error: stepsErr } = await supabase.from("campaign_steps").insert(
      steps.map((s: any, i: number) => stepToDb(s, i, campaign.id))
    );
    if (stepsErr) console.error("[campaigns POST] steps error:", stepsErr.message);
  }

  return NextResponse.json({ campaign });
}