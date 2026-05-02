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

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const isExport = searchParams.get("export") === "true";

  const { data } = await supabase
    .from("network_contacts")
    .select("*")
    .eq("suppressed", false)
    .order("contributor_count", { ascending: false })
    .limit(isExport ? 100000 : 500);

  if (isExport) {
    const headers = ["full_name", "company", "job_title", "industry", "linkedin_url", "birthday", "confidence_score", "contributor_count", "created_at"];
    const rows = (data || []).map(c => headers.map(h => {
      const val = (c as any)[h];
      if (typeof val === "object") return JSON.stringify(val);
      return val || "";
    }).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=network-contacts.csv" } });
  }

  return NextResponse.json({ contacts: data || [] });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  await supabase.from("network_contacts").update({ suppressed: true, suppressed_at: new Date().toISOString(), suppression_reason: "admin_removal" }).eq("id", id);
  return NextResponse.json({ success: true });
}