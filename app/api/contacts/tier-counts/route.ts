import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/contacts/tier-counts
// Returns exact counts of contacts in each Dunbar tier.
// Used by the Network Health widget to show accurate totals without
// being constrained by the classify route's filters.
export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("tom_contacts")
    .select("dunbar_tier")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = { tier1: 0, tier2: 0, tier3: 0, tier4: 0, tier5: 0, unassigned: 0 };
  for (const c of data || []) {
    if (c.dunbar_tier === 1) counts.tier1++;
    else if (c.dunbar_tier === 2) counts.tier2++;
    else if (c.dunbar_tier === 3) counts.tier3++;
    else if (c.dunbar_tier === 4) counts.tier4++;
    else if (c.dunbar_tier === 5) counts.tier5++;
    else counts.unassigned++;
  }

  return NextResponse.json({ counts, total: (data || []).length });
}