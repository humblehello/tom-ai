import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/app/lib/google";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pageToken = body.pageToken || null;

  const accessToken = await getValidAccessToken(userId);

  // 3 years ago in Gmail date format
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const afterDate = `${threeYearsAgo.getFullYear()}/${String(threeYearsAgo.getMonth() + 1).padStart(2, "0")}/${String(threeYearsAgo.getDate()).padStart(2, "0")}`;

  // Fetch one page of messages (inbox + sent combined via OR)
  const query = `after:${afterDate}`;
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", "500");
  url.searchParams.set("q", query);
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const listRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listRes.json();

  const messages = listData.messages || [];
  const nextPageToken = listData.nextPageToken || null;

  if (messages.length === 0) {
    return NextResponse.json({ done: true, processed: 0, updated: 0, nextPageToken: null });
  }

  // Fetch headers only (metadata format — much faster than full format)
  const details = await Promise.all(
    messages.map(async (msg: any) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return res.json();
    })
  );

  // Build email → latest date map
  const emailDateMap: Record<string, Date> = {};
  const emailCountMap: Record<string, number> = {};

  const extractEmail = (str: string): string | null => {
    const match = str?.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    return match ? match[0].toLowerCase() : null;
  };

  for (const msg of details) {
    const headers = msg.payload?.headers || [];
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const to = headers.find((h: any) => h.name === "To")?.value || "";
    const dateStr = headers.find((h: any) => h.name === "Date")?.value || "";
    const date = dateStr ? new Date(dateStr) : null;
    if (!date || isNaN(date.getTime())) continue;

    // Check both from and to fields
    for (const field of [from, to]) {
      const email = extractEmail(field);
      if (!email) continue;
      if (!emailDateMap[email] || date > emailDateMap[email]) {
        emailDateMap[email] = date;
      }
      emailCountMap[email] = (emailCountMap[email] || 0) + 1;
    }
  }

  const emailList = Object.keys(emailDateMap);
  if (emailList.length === 0) {
    return NextResponse.json({ done: !nextPageToken, processed: messages.length, updated: 0, nextPageToken });
  }

  // Load matching contacts for this user
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("id, email, last_emailed_at, email_count")
    .eq("user_id", userId)
    .in("email", emailList);

  let updated = 0;

  for (const contact of contacts || []) {
    if (!contact.email) continue;
    const newDate = emailDateMap[contact.email.toLowerCase()];
    if (!newDate) continue;

    const existingDate = contact.last_emailed_at ? new Date(contact.last_emailed_at) : null;
    const shouldUpdate = !existingDate || newDate > existingDate;

    if (shouldUpdate) {
      await supabase
        .from("tom_contacts")
        .update({
          last_emailed_at: newDate.toISOString(),
          email_count: (contact.email_count || 0) + (emailCountMap[contact.email.toLowerCase()] || 0),
        })
        .eq("id", contact.id)
        .eq("user_id", userId);
      updated++;
    }
  }

  return NextResponse.json({
    done: !nextPageToken,
    processed: messages.length,
    updated,
    nextPageToken,
  });
}