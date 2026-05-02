import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkFeature } from "@/app/lib/requireFeature";
import { parseCSVToRows, parseExcelToRows, buildProcessingPlan } from "@/app/lib/hopper-smart-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("hopper_imports");
  if (block) return block;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const instruction = formData.get("instruction") as string || "";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!instruction.trim()) return NextResponse.json({ error: "No instruction provided" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const name = file.name.toLowerCase();

    let headers: string[] = [];
    let rows: Record<string, string>[] = [];

    if (name.endsWith(".csv")) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      ({ headers, rows } = parseCSVToRows(text));
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      ({ headers, rows } = await parseExcelToRows(buffer));
    } else {
      return NextResponse.json({ error: "Smart Import only supports CSV and Excel files" }, { status: 400 });
    }

    if (!headers.length || !rows.length) {
      return NextResponse.json({ error: "File appears to be empty or unreadable" }, { status: 400 });
    }

    const plan = await buildProcessingPlan(headers, rows, instruction);
    plan.total_rows = rows.length;

    return NextResponse.json({ plan });
  } catch (err: any) {
    console.error("Smart plan error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}