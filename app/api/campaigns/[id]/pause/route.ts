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

  await supabase
    .from("campaigns")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", userId);

  return NextResponse.json({ ok: true });
}