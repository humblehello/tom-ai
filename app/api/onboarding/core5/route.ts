import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  const { data } = await supabase
    .from("tom_users")
    .select("id")
    .eq("id", session)
    .single();
  return data;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const contactIds: string[] = Array.isArray(body.contact_ids)
    ? body.contact_ids
    : [];

  if (contactIds.length === 0) {
    // User skipped — that's fine, no changes
    return NextResponse.json({ ok: true, saved: 0, mode: "skip" });
  }

  // Detect re-do: does user already have Core 5 contacts?
  const { count: existingCore5 } = await supabase
    .from("tom_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("dunbar_tier", 1);

  const isRedo = (existingCore5 ?? 0) > 0;

  // First-time: cap at 5. Re-do: unlimited.
  const ids = isRedo ? contactIds : contactIds.slice(0, 5);

  // Set Core 5 picks: dunbar_tier=1, tier_override=true, mark when assigned
  const { error } = await supabase
    .from("tom_contacts")
    .update({
      dunbar_tier: 1,
      tier_override: true,
      core_5_assigned_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) {
    console.error("[core5 save] update error:", error);
    return NextResponse.json(
      { error: "Failed to save picks" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    saved: ids.length,
    mode: isRedo ? "redo" : "first_time",
    cap_applied: !isRedo && contactIds.length > 5,
  });
}