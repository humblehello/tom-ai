import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  const { data } = await supabase
    .from("tom_users")
    .select("id")
    .eq("id", session)
    .single();
  return data;
}

interface ContactRow {
  id: string;
  full_name: string | null;
  email: string | null;
  relationship_strength: number | null;
  dunbar_tier: number | null;
  last_emailed_at: string | null;
  google_resource_name: string | null;
  microsoft_contact_id: string | null;
  created_at: string;
}

interface ScoredContact {
  id: string;
  full_name: string;
  email: string | null;
  signals: string[];
  score: number;
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pull all real (non-self) contacts with a name
  const { data: contacts, error } = await supabase
    .from("tom_contacts")
    .select(
      "id, full_name, email, relationship_strength, dunbar_tier, last_emailed_at, google_resource_name, microsoft_contact_id, created_at"
    )
    .eq("user_id", user.id)
    .eq("is_self", false)
    .not("full_name", "is", null)
    .order("relationship_strength", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    console.error("[core5-suggestions] query error:", error);
    return NextResponse.json({
      suggestions: [],
      all_contacts: [],
    });
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({
      suggestions: [],
      all_contacts: [],
    });
  }

  // Score each contact
  const now = Date.now();
  const scored: ScoredContact[] = contacts.map((c: ContactRow) => {
    const signals: string[] = [];
    let score = 0;

    // Signal 1: existing relationship strength (already weighted by your scorer)
    if (c.relationship_strength) {
      score += c.relationship_strength;
    }

    // Signal 2: synced from Google or Microsoft = manually maintained contact
    // (auto-scraped contacts have placeholder resource names like "email_scrape_*")
    const isManualGoogle =
      c.google_resource_name &&
      !c.google_resource_name.startsWith("email_scrape_") &&
      !c.google_resource_name.startsWith("manual_");
    const isManualMicrosoft = !!c.microsoft_contact_id;
    if (isManualGoogle || isManualMicrosoft) {
      score += 12;
      signals.push("In your address book");
    }

    // Signal 3: recent email activity (last 30 days = strong signal)
    if (c.last_emailed_at) {
      const daysAgo =
        (now - new Date(c.last_emailed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 7) {
        score += 8;
        signals.push("Recently emailed");
      } else if (daysAgo < 30) {
        score += 5;
        signals.push("Recently emailed");
      } else if (daysAgo < 90) {
        score += 2;
      }
    }

    // Signal 4: tier already assigned to top tiers (Core 5 / Inner 15)
    if (c.dunbar_tier === 1) {
      score += 20; // already in Core 5 — trump card
      signals.push("Top relationship");
    } else if (c.dunbar_tier === 2) {
      score += 6;
    }

    // Signal 5: personal email domain bonus (gmail/yahoo/icloud = more likely personal)
    if (c.email) {
      const domain = c.email.split("@")[1]?.toLowerCase() || "";
      const personalDomains = ["gmail.com", "yahoo.com", "icloud.com", "me.com", "hotmail.com", "outlook.com", "aol.com"];
      if (personalDomains.includes(domain)) {
        score += 2;
      }
    }

    return {
      id: c.id,
      full_name: c.full_name || "Unknown",
      email: c.email,
      signals: signals.slice(0, 2), // cap at 2 signal pills per row
      score,
    };
  });

  // Sort by score descending, take top 8 for suggestions
  const suggestions = scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Full searchable list — sorted alphabetically, capped at 500
  const all_contacts = scored
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .slice(0, 500);

  return NextResponse.json({
    suggestions,
    all_contacts,
  });
}