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

function stepFromDb(s: any) {
  const config: any = {};
  if (s.subject) config.subject = s.subject;
  if (s.body) config.body = s.body;
  if (s.wait_days != null) config.days = s.wait_days;
  if (s.card_occasion) config.occasion = s.card_occasion;
  if (s.card_message) config.message = s.card_message;
  if (s.branch_condition) config.condition = s.branch_condition;
  return {
    id: s.id,
    step_type: s.step_type,
    position: s.step_order,
    config,
  };
}

export async function GET(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("campaigns");
  if (block) return block;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(`
      id, name, description, status, reply_behavior, card_budget, no_budget_cap, created_at, updated_at,
      campaign_audiences (
        audience_id,
        audiences ( id, name, audience_contacts(count) )
      ),
      campaign_steps (
        id, step_type, step_order, subject, body, wait_days,
        card_occasion, card_message, branch_condition
      )
    `)
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: events } = await supabase
    .from("campaign_events")
    .select("event_type")
    .eq("campaign_id", params.id);

  const stats = { sent: 0, opened: 0, clicked: 0, replied: 0, opted_out: 0 };
  (events || []).forEach((e: any) => {
    if (e.event_type === "email_sent") stats.sent++;
    if (e.event_type === "open") stats.opened++;
    if (e.event_type === "click") stats.clicked++;
    if (e.event_type === "reply") stats.replied++;
    if (e.event_type === "opt_out") stats.opted_out++;
  });

  const normalized = {
    ...campaign,
    stats,
    campaign_audiences: (campaign as any).campaign_audiences?.map((ca: any) => ({
      ...ca,
      audiences: {
        ...ca.audiences,
        contact_count: ca.audiences?.audience_contacts?.[0]?.count || 0,
      },
    })),
    campaign_steps: (campaign as any).campaign_steps
      ?.sort((a: any, b: any) => a.step_order - b.step_order)
      .map(stepFromDb),
  };

  return NextResponse.json({ campaign: normalized });
}

export async function PATCH(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("campaigns");
  if (block) return block;

  const body = await request.json();
  const { name, description, reply_behavior, audience_ids, steps } = body;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .update({
      name: name?.trim(),
      description: description?.trim() || null,
      reply_behavior: reply_behavior || "exit",
      card_budget: body.card_budget ?? null,
      no_budget_cap: body.no_budget_cap ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (audience_ids !== undefined) {
    await supabase.from("campaign_audiences").delete().eq("campaign_id", params.id);
    if (audience_ids.length > 0) {
      const { error: audErr } = await supabase.from("campaign_audiences").insert(
        audience_ids.map((audience_id: string) => ({ campaign_id: params.id, audience_id }))
      );
      if (audErr) console.error("[campaigns PATCH] audience error:", audErr.message);
    }
  }

  if (steps !== undefined) {
    await supabase.from("campaign_steps").delete().eq("campaign_id", params.id);
    if (steps.length > 0) {
      const { error: stepsErr } = await supabase.from("campaign_steps").insert(
        steps.map((s: any, i: number) => stepToDb(s, i, params.id))
      );
      if (stepsErr) console.error("[campaigns PATCH] steps error:", stepsErr.message);
    }
  }

  return NextResponse.json({ campaign });
}

export async function DELETE(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("campaigns");
  if (block) return block;

  // Delete in correct order to avoid FK constraint errors
  await supabase.from("campaign_events").delete().eq("campaign_id", params.id);
  await supabase.from("campaign_enrollments").delete().eq("campaign_id", params.id);
  await supabase.from("campaign_steps").delete().eq("campaign_id", params.id);
  await supabase.from("campaign_audiences").delete().eq("campaign_id", params.id);

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", params.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[campaign DELETE] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}