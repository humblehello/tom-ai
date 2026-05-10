import { NextRequest, NextResponse } from "next/server";
import { inngest } from "../../lib/inngest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
    || new URL(req.url).searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: users } = await supabase
    .from("tom_users")
    .select("id")
    .eq("onboarding_complete", true);

  if (!users?.length) {
    return NextResponse.json({ message: "No active users" });
  }

  // ── Group 1 (0s): No Google API — fire immediately ──
const group1 = users.flatMap(user => [
  { name: "tom/scheduled.emails",     data: { userId: user.id } },
  { name: "tom/contacts.score",       data: { userId: user.id } },
  // Auto-merge disabled 2026-05 — function no longer exists
// { name: "tom/contacts.auto-merge",  data: { userId: user.id } },,
  { name: "tom/verifications.send",   data: { userId: user.id } },
]);

  // ── Group 2 (10s): Gmail API only ──
 const group2 = users.flatMap(user => [
  { name: "tom/gmail.backfill",         data: { userId: user.id } },
  { name: "tom/emails.scan",            data: { userId: user.id } },
  { name: "tom/signatures.parse",       data: { userId: user.id } },
  { name: "tom/verifications.parse",    data: { userId: user.id } },
]);

  // ── Group 3 (30s): People API — contacts sync + backfill ──
  const group3 = users.flatMap(user => [
    { name: "tom/contacts.sync",    data: { userId: user.id } },
    { name: "tom/calendar.enrich",  data: { userId: user.id } },
    { name: "tom/google.backfill",  data: { userId: user.id, batchSize: 100 } },
  ]);

  // ── Group 4 (50s): External APIs — Apollo + intelligence ──
  const group4 = users.flatMap(user => [
    { name: "tom/apollo.enrich",        data: { userId: user.id } },
    { name: "tom/intelligence.extract", data: { userId: user.id } },
  ]);

 // Fire all groups immediately — Inngest handles the staggering
  const allEvents = [
    ...group1,
    ...group2.map(e => ({ ...e, ts: Date.now() + 10_000 })),
    ...group3.map(e => ({ ...e, ts: Date.now() + 30_000 })),
    ...group4.map(e => ({ ...e, ts: Date.now() + 50_000 })),
  ];

  await inngest.send(allEvents);

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    users: users.length,
    events_fired: allEvents.length,
});
}