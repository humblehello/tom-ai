import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { contact_id, action, days } = await req.json();
  if (!contact_id || !action) {
    return NextResponse.json({ error: "Missing contact_id or action" }, { status: 400 });
  }

  const now = new Date();
  let updates: Record<string, any> = {};

  switch (action) {
    case "engaged":
      // Mark that we reached out today. Tier cadence takes over from here.
      updates.last_reached_out_at = now.toISOString();
      // Clear any short pause since we just engaged.
      updates.engage_snoozed_until = null;
      break;

    case "pause_30":
      // Hard 30-day pause regardless of tier.
      updates.engage_snoozed_until = new Date(now.getTime() + 30 * 86400_000).toISOString();
      break;

    case "pause":
      // Custom-duration pause. Days passed in request body. Default 30.
      const pauseDays = Math.max(1, Math.min(365, Number(days) || 30));
      updates.engage_snoozed_until = new Date(now.getTime() + pauseDays * 86400_000).toISOString();
      break;

    case "snooze_1year":
      // Don't engage for 1 year.
      updates.engage_snoozed_until = new Date(now.getTime() + 365 * 86400_000).toISOString();
      break;

    case "never_engage":
      // Permanent exclusion. Editable from contact edit modal.
      updates.engage_permanently_excluded = true;
      updates.engage_snoozed_until = null;
      break;

    case "clear":
      // Remove all engage restrictions (from edit modal).
      updates.engage_snoozed_until = null;
      updates.engage_permanently_excluded = false;
      break;

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tom_contacts")
    .update(updates)
    .eq("id", contact_id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, contact: data });
}