import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Set campaign to active
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

// Fire Inngest event via Event API
  const inngestKey = process.env.INNGEST_EVENT_KEY;
  if (inngestKey) {
    // Enroll contacts
    await fetch(`https://inn.gs/e/${inngestKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "tom/campaign.launch",
        data: { campaign_id: params.id, user_id: userId },
      }),
    }).catch(err => console.error("[launch] Inngest send failed:", err));

    // Trigger sender immediately (respects send window internally)
    await fetch(`https://inn.gs/e/${inngestKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "tom/campaign.send.now",
        data: { campaign_id: params.id, user_id: userId },
      }),
    }).catch(err => console.error("[launch] sender trigger failed:", err));
  }

  return NextResponse.json({ ok: true });
}