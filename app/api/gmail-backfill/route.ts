import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "../../lib/google";
import { isBlockedEmail } from "@/app/lib/contact-blocklist";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

const extractEmails = (str: string): string[] => {
  if (!str) return [];
  const matches = str.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
  return matches.map(e => e.toLowerCase());
};

// Local-part blocklist moved to app/lib/contact-blocklist.ts (substring match, 2026-05-10)
const isJunk = (email: string): boolean => {
  if (isBlockedEmail(email)) return true;
  // Domain suffix checks for sending infrastructure
  const lower = email.toLowerCase();
  if (lower.endsWith(".amazonaws.com")) return true;
  if (lower.endsWith(".sendgrid.net")) return true;
  return false;
};

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { cursor_inbox, cursor_sent, folder = "sent", year } = body;

  try {
    // Get user's own email to exclude it
    const { data: userData } = await supabase
      .from("tom_users")
      .select("email")
      .eq("id", userId)
      .single();
    const ownEmail = userData?.email?.toLowerCase() || "";

    const accessToken = await getValidAccessToken(userId);

    // Build query — sent first, optionally filtered by year
    let query = folder === "sent" ? "in:sent" : "in:inbox";
    if (year) query += ` after:${year}/01/01 before:${parseInt(year) + 1}/01/01`;
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", "500");
    url.searchParams.set("q", query);

    const cursor = folder === "sent" ? cursor_sent : cursor_inbox;
    if (cursor) url.searchParams.set("pageToken", cursor);

    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listRes.json();
    const messages = listData.messages || [];
    const nextPageToken = listData.nextPageToken || null;

    if (messages.length === 0) {
      const isDone = folder === "inbox" && !nextPageToken;
      if (isDone) {
        await supabase.from("tom_users").update({ gmail_backfill_complete: true }).eq("id", userId);
      }
      return NextResponse.json({
        processed: 0, matched: 0,
        next_cursor_inbox: folder === "inbox" ? null : cursor_inbox,
        next_cursor_sent: folder === "sent" ? null : cursor_sent,
        next_folder: folder === "sent" ? "inbox" : null,
        done: isDone,
      });
    }

    // Fetch metadata in parallel
    const details = await Promise.all(
      messages.map(async (msg: any) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return res.json();
      })
    );

    // Build email → latest date map, excluding own email and junk
    const emailMap = new Map<string, string>();

    for (const msg of details) {
      const headers = msg.payload?.headers || [];
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const to = headers.find((h: any) => h.name === "To")?.value || "";
      const cc = headers.find((h: any) => h.name === "Cc")?.value || "";
      const dateStr = headers.find((h: any) => h.name === "Date")?.value || "";
      const date = dateStr ? new Date(dateStr) : null;
      if (!date || isNaN(date.getTime())) continue;
      const isoDate = date.toISOString();

      const allAddresses = [
        ...extractEmails(from),
        ...extractEmails(to),
        ...extractEmails(cc),
      ];

      for (const email of allAddresses) {
        if (email === ownEmail) continue;
        if (isJunk(email)) continue;
        const existing = emailMap.get(email);
        if (!existing || isoDate > existing) {
          emailMap.set(email, isoDate);
        }
      }
    }

    const emailEntries = Array.from(emailMap.entries()).map(([email, date]) => ({ email, date }));

    let matched = 0;
    if (emailEntries.length > 0) {
      const result = await supabase.rpc("process_gmail_backfill_page", {
        p_user_id: userId,
        p_emails: emailEntries,
      });
      matched = result.data?.updated || 0;
    }

    // Update processed count
    const { data: user } = await supabase
      .from("tom_users")
      .select("gmail_backfill_processed")
      .eq("id", userId)
      .single();

    const isDone = folder === "inbox" && !nextPageToken;

    await supabase
      .from("tom_users")
      .update({
        gmail_backfill_processed: (user?.gmail_backfill_processed || 0) + messages.length,
        gmail_backfill_complete: isDone,
      })
      .eq("id", userId);

    return NextResponse.json({
      processed: messages.length,
      matched,
      emails_extracted: emailEntries.length,
      next_cursor_inbox: folder === "inbox" ? nextPageToken : cursor_inbox,
      next_cursor_sent: folder === "sent" ? nextPageToken : cursor_sent,
      next_folder: nextPageToken ? folder : (folder === "sent" ? "inbox" : null),
      done: isDone,
    });

  } catch (e: any) {
    console.error("Backfill error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("tom_users")
    .select("gmail_backfill_complete, gmail_backfill_processed")
    .eq("id", userId)
    .single();

  const { count } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("last_emailed_at", "is", null);

  return NextResponse.json({
    complete: data?.gmail_backfill_complete,
    processed: data?.gmail_backfill_processed,
    contacts_matched: count,
  });
}