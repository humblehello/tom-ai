import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { core5 } = await req.json();
  // core5 = { personal: ["Name1",...], business: ["Name1",...], prospects: ["Name1",...] }

  const bucketMap: Record<string, string> = {
    personal: "personal",
    business: "business",
    prospects: "prospects",
  };

  const results = { matched: 0, created: 0 };

  for (const [bucket, names] of Object.entries(core5)) {
    const nameList = (names as string[]).filter(n => n.trim());

    for (const name of nameList) {
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");

      // Try to find existing contact by name
      const { data: matches } = await supabase
        .from("tom_contacts")
        .select("id, full_name, dunbar_tier, bucket")
        .eq("user_id", userId)
        .ilike("full_name", `%${firstName}%`)
        .limit(5);

      // Find best match — prefer exact full name match
      const exact = matches?.find(m =>
        m.full_name.toLowerCase() === name.toLowerCase()
      );
      const best = exact || (lastName
        ? matches?.find(m => m.full_name.toLowerCase().includes(lastName.toLowerCase()))
        : null) || matches?.[0];

      if (best) {
        // Update existing contact
        await supabase
          .from("tom_contacts")
          .update({
            dunbar_tier: 1,
            bucket: bucketMap[bucket],
            tier_override: true,
          })
          .eq("id", best.id)
          .eq("user_id", userId);
        results.matched++;
      } else {
        // Create stub contact
        await supabase
          .from("tom_contacts")
          .insert({
            user_id: userId,
            full_name: name.trim(),
            dunbar_tier: 1,
            bucket: bucketMap[bucket],
            tier_override: true,
            last_synced_at: new Date().toISOString(),
          });
        results.created++;
      }
    }
  }

  return NextResponse.json({ success: true, ...results });
}