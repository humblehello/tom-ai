import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ADMIN_USER_ID = "c82b7211-354f-4bfe-b44f-c03f4b3f50c3";

async function checkAdmin() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  return userId === ADMIN_USER_ID;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("network_suppression")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ requests: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await req.json();
  if (action === "process") {
    await supabase.from("network_suppression")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", id);

    // Also suppress in network_contacts if email matches
    const { data: request } = await supabase.from("network_suppression").select("email").eq("id", id).single();
    if (request?.email) {
      await supabase.from("network_contacts")
        .update({ suppressed: true, suppressed_at: new Date().toISOString(), suppression_reason: "contact_request" })
        .filter("emails", "cs", JSON.stringify([{ email: request.email }]));
    }
  }

  return NextResponse.json({ success: true });
}