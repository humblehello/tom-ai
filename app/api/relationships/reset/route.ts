import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resetAllClassifications } from "@/app/lib/relationship-classifier";

export async function POST() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await resetAllClassifications(userId);
  return NextResponse.json({ success: true, reset: count });
}