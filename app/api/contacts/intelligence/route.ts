import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

const INTELLIGENCE_PROMPT = (contactName: string, existingIntelligence: any, emailContent: string, journalContent: string) => `
You are extracting personal intelligence about ${contactName} from emails and journal notes to help Tom Rector maintain a genuine relationship with them.

EXISTING KNOWN INFORMATION:
${JSON.stringify(existingIntelligence, null, 2)}

EMAIL CONTENT:
${emailContent || "None provided"}

JOURNAL NOTES:
${journalContent || "None provided"}

Extract ONLY information explicitly mentioned or strongly implied. Never invent or assume.

For each piece of information found, assign a confidence score:
- 95-100: Explicitly stated ("my dog Max", "my wife Sarah", "I went to Purdue")
- 80-94: Strongly implied ("we took the kids to Disney", "watching the game Sunday")
- 60-79: Suggested but uncertain ("sounds like they have kids", "might be a Colts fan")

Extract these categories if present:
- pets: type, name, breed
- family: married/single/divorced, spouse name, kids names/ages, new baby
- education: college, graduation year, degree
- sports: teams, sports they play or watch
- interests: travel destinations, car preferences, books read, book genres
- civic: clubs, nonprofits, associations, volunteer work
- politics: republican/democrat/independent (only if explicitly stated)
- professional: side projects, career changes, promotions
- life_events: recent moves, job changes, health events, milestones

Also identify GAPS — things partially known that need follow-up:
- If you know they have a dog but not the name → gap
- If you know they have kids but not ages → gap
- If you know they went to college but not which one → gap

Respond in this exact JSON format only, no other text:
{
  "tags": [
    {"tag": "has_dog", "value": "golden retriever named Max", "confidence": 95, "source": "email"},
    {"tag": "married", "value": "wife named Sarah", "confidence": 90, "source": "email"},
    {"tag": "has_kids", "value": "2 kids", "confidence": 85, "source": "journal"},
    {"tag": "college_grad", "value": "Purdue University", "confidence": 95, "source": "email"},
    {"tag": "likes_sports", "value": "Colts fan", "confidence": 80, "source": "email"}
  ],
  "intelligence": {
    "pets": [{"type": "dog", "name": "Max", "breed": "golden retriever"}],
    "family": {"status": "married", "spouse": "Sarah", "kids": []},
    "education": {"college": "Purdue University", "year": null},
    "sports": {"teams": ["Colts"], "plays": []},
    "interests": {"travel": [], "cars": [], "books": [], "book_genres": []},
    "civic": {"clubs": [], "nonprofits": []},
    "politics": null,
    "life_events": []
  },
  "gaps": [
    {"field": "pets.name", "question": "You mentioned ${contactName} has a dog — do you know its name or breed?"},
    {"field": "family.kids_names", "question": "${contactName} seems to have kids — do you know their names or ages?"}
  ]
}`;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  let userId: string | null = null;

  if (secret === process.env.CRON_SECRET) {
    userId = new URL(req.url).searchParams.get("userId");
  } else {
    userId = await getUserId();
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { contact_id, batch_size = 10, source_text, source_type } = body;

  try {
    let contacts: any[] = [];

    if (contact_id) {
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, full_name, key_context, notes, notes_context, tags, intelligence, relationship_context")
        .eq("id", contact_id)
        .eq("user_id", userId)
        .single();
      if (data) contacts = [data];
    } else {
      // Batch — contacts with email context but not yet intelligence-scanned
      const { data } = await supabase
        .from("tom_contacts")
        .select("id, full_name, key_context, notes, notes_context, tags, intelligence, relationship_context")
        .eq("user_id", userId)
        .not("key_context", "is", null)
        .or("tags.eq.[],tags.is.null")
        .order("email_count", { ascending: false })
        .limit(batch_size);
      contacts = data || [];
    }

    const results = [];

    for (const contact of contacts) {
      try {
        const existingIntelligence = contact.intelligence || {};
        const existingTags = contact.tags || [];

        // Build email content from what we already have
        const emailContent = [
          contact.key_context,
          contact.notes_context,
          contact.relationship_context,
        ].filter(Boolean).join("\n\n");

        // If source_text provided (from journal or hopper), use that
        const journalContent = source_type === "journal" || source_type === "hopper"
          ? source_text || ""
          : contact.notes || "";

        if (!emailContent && !journalContent) continue;

        const prompt = INTELLIGENCE_PROMPT(
          contact.full_name,
          existingIntelligence,
          emailContent,
          journalContent
        );

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const aiData = await res.json();
        const text = aiData.content?.[0]?.text || "{}";

        let extracted: any = {};
        try {
          extracted = JSON.parse(text.replace(/```json|```/g, "").trim());
        } catch { continue; }

        if (!extracted.tags && !extracted.intelligence) continue;

        // Merge new tags with existing — keep highest confidence version
        const mergedTags = [...existingTags];
        for (const newTag of (extracted.tags || [])) {
          const existingIdx = mergedTags.findIndex((t: any) => t.tag === newTag.tag);
          if (existingIdx >= 0) {
            if (newTag.confidence > mergedTags[existingIdx].confidence) {
              mergedTags[existingIdx] = newTag;
            }
          } else {
            mergedTags.push(newTag);
          }
        }

        // Merge intelligence — deep merge, don't overwrite existing values
        const mergedIntelligence = deepMerge(existingIntelligence, extracted.intelligence || {});

        // Save gaps for journal follow-ups
        const gaps = extracted.gaps || [];

        const updates: any = {
          tags: mergedTags,
          intelligence: mergedIntelligence,
          intelligence_scan_at: new Date().toISOString(),
        };

        // Store gaps so journal can ask about them
        if (gaps.length > 0) {
          updates.intelligence_gaps = gaps;
        }

        // Auto-apply tags with confidence >= 80 to key_context if empty
        const highConfidenceTags = mergedTags.filter((t: any) => t.confidence >= 80);
        if (highConfidenceTags.length > 0 && !contact.key_context) {
          const tagSummary = highConfidenceTags
            .map((t: any) => t.value)
            .filter(Boolean)
            .join(", ");
          if (tagSummary) updates.key_context = tagSummary;
        }

        await supabase
          .from("tom_contacts")
          .update(updates)
          .eq("id", contact.id)
          .eq("user_id", userId);

        // Sync high-confidence tags to Google Contacts
        await syncTagsToGoogle(userId, contact.id, highConfidenceTags);

        results.push({
          name: contact.full_name,
          tags_found: mergedTags.length,
          gaps: gaps.length,
          high_confidence: highConfidenceTags.length,
        });

        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.error(`Intelligence scan failed for ${contact.full_name}:`, e);
      }
    }

    return NextResponse.json({ scanned: results.length, results });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Deep merge two objects — don't overwrite existing non-null values
function deepMerge(existing: any, incoming: any): any {
  if (!incoming) return existing;
  const result = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (incoming[key] === null || incoming[key] === undefined) continue;
    if (Array.isArray(incoming[key])) {
      if (!Array.isArray(result[key]) || result[key].length === 0) {
        result[key] = incoming[key];
      } else {
        // Merge arrays, deduplicate strings
        const merged = [...result[key]];
        for (const item of incoming[key]) {
          if (typeof item === "string" && !merged.includes(item)) merged.push(item);
          else if (typeof item === "object") merged.push(item);
        }
        result[key] = merged;
      }
    } else if (typeof incoming[key] === "object") {
      result[key] = deepMerge(result[key] || {}, incoming[key]);
    } else {
      if (result[key] === null || result[key] === undefined || result[key] === "") {
        result[key] = incoming[key];
      }
    }
  }
  return result;
}

async function syncTagsToGoogle(_userId: string, _contactId: string, _tags: any[]) {
  // Tags stay on tom_contacts.tags. This used to rewrite the notes field, which
  // replaced notes a person had typed and could then be pushed to Google.
  return;
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count: with_tags } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("tags", "eq", "[]")
    .not("tags", "is", null);

  const { count: with_gaps } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("intelligence_gaps", "is", null);

  return NextResponse.json({ contacts_with_tags: with_tags, contacts_with_gaps: with_gaps });
}