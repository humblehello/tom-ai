import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/app/lib/google";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const accessToken = await getValidAccessToken(userId);

    // Search Gmail for birthday/anniversary signals
    const queries = [
      "subject:birthday",
      "subject:anniversary",
      "happy birthday",
      "birthday wishes",
    ];

    const messageIds = new Set<string>();

    for (const q of queries) {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      (data.messages || []).forEach((m: any) => messageIds.add(m.id));
    }

    // Fetch message details and extract names/dates
    const detected: any[] = [];

    for (const id of Array.from(messageIds).slice(0, 30)) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
        const from = headers.find((h: any) => h.name === "From")?.value || "";
        const date = headers.find((h: any) => h.name === "Date")?.value || "";

        // Extract sender name
        const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
        const senderName = nameMatch ? nameMatch[1].trim() : from.split("@")[0];

        const isBirthday = /birthday/i.test(subject);
        const isAnniversary = /anniversary/i.test(subject);

        if ((isBirthday || isAnniversary) && senderName) {
          detected.push({
            contact_name: senderName,
            event_type: isBirthday ? "Birthday" : "Anniversary",
            email_date: date,
            subject,
          });
        }
      } catch (e) {
        // Skip failed messages
      }
    }

    // Use Claude to extract structured data from detected signals
    if (detected.length === 0) {
      return NextResponse.json({ scanned: 0, detected: 0, added: 0 });
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `From these email signals, extract birthday/anniversary events. 
For each, return a JSON array with objects: { contact_name, event_type, event_date (MM-DD format, best guess from context), relationship_type (family/close_friend/colleague/contact) }
Only include entries where you can reasonably infer the person's name and event type.
Signals: ${JSON.stringify(detected.slice(0, 20))}
Return ONLY valid JSON array, no other text.`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "[]";

    let extracted: any[] = [];
    try {
      extracted = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      extracted = [];
    }

    // Get existing events to avoid duplicates
    const { data: existing } = await supabase
      .from("life_events")
      .select("contact_name, event_type")
      .eq("user_id", userId);

    const existingKeys = new Set(
      (existing || []).map(e => `${e.contact_name}_${e.event_type}`.toLowerCase())
    );

    // Insert new events
    let added = 0;
    for (const item of extracted) {
      const key = `${item.contact_name}_${item.event_type}`.toLowerCase();
      if (existingKeys.has(key)) continue;

      const year = new Date().getFullYear();
      const fullDate = `${year}-${item.event_date}`;

      const { error } = await supabase.from("life_events").insert({
        user_id: userId,
        contact_name: item.contact_name,
        event_type: item.event_type,
        event_date: fullDate,
        relationship_type: item.relationship_type || "contact",
        recurring: true,
        notes: "Auto-detected from Gmail",
      });

      if (!error) added++;
    }

    return NextResponse.json({
      scanned: messageIds.size,
      detected: detected.length,
      added,
    });
  } catch (e: any) {
    console.error("Life events scan error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}