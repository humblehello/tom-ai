import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
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

  const { data, error } = await supabase.rpc("merge_duplicate_contacts", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Merge error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    auto_merged: data?.auto_merged || 0,
    email_duplicates: data?.email_duplicates || 0,
    name_duplicates: data?.name_duplicates || 0,
    queued_for_review: data?.queued_for_review || 0,
    message: `${data?.auto_merged || 0} merged, ${data?.queued_for_review || 0} queued for review`,
  });
}