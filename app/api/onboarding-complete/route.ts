import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "../../lib/inngest";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await inngest.send({
    name: "tom/onboarding.complete",
    data: { userId },
  });

  return NextResponse.json({ ok: true });
}