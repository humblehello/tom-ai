import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../../lib/google";
import { fillBlankFields } from "../../../lib/contactFieldPolicy";
import { selectContacts, updateContact } from "../../../lib/contactWrite";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch { return ""; }
}

function extractTextFromPayload(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractTextFromPayload(part);
      if (text) return text;
    }
  }
  return "";
}

function truncateAtReplyBoundary(text: string): string {
  const boundaries = [
    /^On .+ wrote:/m,
    /^-----Original Message-----/m,
    /^From:.+Sent:/m,
    /^>{3}/m,
  ];
  let earliest = text.length;
  for (const boundary of boundaries) {
    const match = text.search(boundary);
    if (match > 0 && match < earliest) earliest = match;
  }
  return text.slice(0, Math.min(earliest, 1500)).trim();
}

// Fetch last N emails exchanged with a specific email address
async function fetchEmailsWithContact(
  accessToken: string,
  contactEmail: string,
  ownEmail: string,
  limit = 10
): Promise<{ from: string; date: string; body: string }[]> {
  const queries = [
    `from:${contactEmail}`,
    `to:${contactEmail} from:${ownEmail}`,
  ];

  const allMessages: any[] = [];

  for (const q of queries) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "5");
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.messages) allMessages.push(...data.messages);
  }

  if (allMessages.length === 0) return [];

  // Fetch full content for each message
  const emails = await Promise.all(
    allMessages.slice(0, limit).map(async (msg: any) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      const headers = data.payload?.headers || [];
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const dateStr = headers.find((h: any) => h.name === "Date")?.value || "";
      const body = truncateAtReplyBoundary(extractTextFromPayload(data.payload));
      return { from, date: dateStr, body };
    })
  );

  return emails.filter(e => e.body.length > 20);
}

// Run Claude analysis on emails
async function analyzeEmailsWithClaude(
  contactName: string,
  contactEmail: string,
  emails: { from: string; date: string; body: string }[]
): Promise<{
  key_context: string;
  topics: string[];
  relationship_tone: string;
  last_discussed: string;
  action_items: string;
}> {
  const emailText = emails.map((e, i) =>
    `Email ${i + 1} (${e.date}, from ${e.from}):\n${e.body}`
  ).join("\n\n---\n\n");

  const prompt = `You are analyzing emails between Tom Rector (tom@thumbprint.com) and ${contactName} (${contactEmail}) to understand their relationship.

Here are their recent emails:

${emailText}

Based ONLY on what is explicitly stated in these emails, extract:

1. KEY CONTEXT: 2-3 sentences summarizing who this person is to Tom and what they talk about. Be specific, not generic.
2. TOPICS: List 3-5 specific topics or themes they discuss (e.g. "promotional products", "golf", "their daughter's college search")
3. RELATIONSHIP TONE: One word — warm/professional/friendly/formal/casual
4. LAST DISCUSSED: What was the main topic of the most recent email? One sentence.
5. ACTION ITEMS: Any open questions, promises, or follow-ups mentioned? One sentence or "None".

NEVER invent information not in the emails. If you can't tell, say so briefly.

Respond in this exact JSON format with no other text:
{
  "key_context": "...",
  "topics": ["...", "...", "..."],
  "relationship_tone": "...",
  "last_discussed": "...",
  "action_items": "..."
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      key_context: "",
      topics: [],
      relationship_tone: "unknown",
      last_discussed: "",
      action_items: "",
    };
  }
}

// POST — scan a specific contact or batch of top contacts
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
  const { contact_id, batch_size = 10 } = body;

  try {
    const { data: userData } = await supabase
      .from("tom_users")
      .select("email")
      .eq("id", userId)
      .single();
    const ownEmail = userData?.email || "tom@thumbprint.com";
    const accessToken = await getValidAccessToken(userId);

    let contacts: any[] = [];

    if (contact_id) {
      // Single contact scan
      const { data } = await selectContacts(
        supabase,
        "id, full_name, email, email_count, key_context, topics, notes_context, best_channel, relationship_context",
        (query) => query.eq("id", contact_id).eq("user_id", userId).single()
      );
      if (data) contacts = [data];
    } else {
      // Batch — top contacts by email count not yet scanned or scanned > 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await selectContacts(
        supabase,
        "id, full_name, email, email_count, key_context, topics, notes_context, best_channel, relationship_context",
        (query) =>
          query
            .eq("user_id", userId)
            .not("email", "is", null)
            .gte("email_count", 5)
            .or(`email_scan_at.is.null,email_scan_at.lt.${thirtyDaysAgo}`)
            .order("email_count", { ascending: false })
            .limit(batch_size)
      );
      contacts = data || [];
    }

    const results = [];

    for (const contact of contacts) {
      if (!contact.email) continue;

      try {
        // Fetch emails
        const emails = await fetchEmailsWithContact(accessToken, contact.email, ownEmail);

        if (emails.length === 0) {
          await supabase
            .from("tom_contacts")
            .update({ email_scan_at: new Date().toISOString() })
            .eq("id", contact.id)
            .eq("user_id", userId);
          continue;
        }

        // Analyze with Claude
        const analysis = await analyzeEmailsWithClaude(contact.full_name, contact.email, emails);

        // Save back to contact. Collected notes and context are fill-blank only.
        const updates: any = {
          email_scan_at: new Date().toISOString(),
          ...fillBlankFields(
            contact,
            {
              key_context: analysis.key_context,
              topics: analysis.topics?.length > 0 ? analysis.topics : null,
              best_channel: analysis.relationship_tone,
              notes_context: analysis.last_discussed,
              relationship_context: analysis.action_items && analysis.action_items !== "None" ? analysis.action_items : null,
            },
            ["key_context", "topics", "best_channel", "notes_context", "relationship_context"],
            "enrichment"
          ),
        };

        await updateContact(supabase, contact.id, userId, updates);

        results.push({
          name: contact.full_name,
          emails_read: emails.length,
          key_context: analysis.key_context,
          topics: analysis.topics,
        });

        // Small delay between contacts to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`Scan failed for ${contact.full_name}:`, e);
      }
    }

    return NextResponse.json({
      scanned: results.length,
      results,
    });

  } catch (e: any) {
    console.error("Email scan error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — check scan status
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count: eligible } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("email_count", 5)
    .not("email", "is", null);

  const { count: scanned } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("email_scan_at", "is", null);

  return NextResponse.json({ eligible, scanned });
}