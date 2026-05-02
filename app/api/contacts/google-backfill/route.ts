import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { inngest } from "../../../lib/inngest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get count of contacts missing google_resource_name
  const { count } = await supabase
    .from("tom_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or("google_resource_name.is.null,google_resource_name.like.email_scrape_%,google_resource_name.like.manual_%")
    .not("full_name", "is", null);

    // Fire the Inngest backfill event — process all contacts
await inngest.send({
    name: "tom/google.backfill",
    data: { userId },
  });

return NextResponse.json({
    ok: true,
    queued: true,
    missing: count || 0,
    message: `Backfill started — pushing all ${count || 0} contacts to Google in the background. Check back in a few minutes.`,
  });
}