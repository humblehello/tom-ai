import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "../../../lib/inngest";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Count how many contacts need pushing — for the success toast
  const { count } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("microsoft_contact_id", null)
    .not("full_name", "is", "null");

  // Fire Inngest event — actual push happens in background function
  await inngest.send({
    name: "tom/microsoft.backfill",
    data: { userId },
  });

  return NextResponse.json({
    ok: true,
    missing: count || 0,
    pushed: 0,
    queued: true,
    message: `Queued ${count || 0} contacts for background sync to Outlook. Will complete in ~${Math.ceil((count || 0) * 0.5 / 60)} minutes.`
  });
}