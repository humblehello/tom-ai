import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { inngest } from "@/app/lib/inngest";

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
    .select("*")
    .eq("id", session)
    .single();
  return data;
}

export async function POST() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events: any[] = [];

  // Google connected → fire Google scans
  if (user.refresh_token) {
    events.push({
      name: "tom/contacts.sync",
      data: { userId: user.id, source: "onboarding" },
    });
    events.push({
      name: "tom/gmail.backfill",
      data: { userId: user.id, source: "onboarding" },
    });
    events.push({
      name: "tom/emails.scan",
      data: { userId: user.id, source: "onboarding" },
    });
    events.push({
      name: "tom/calendar.enrich",
      data: { userId: user.id, source: "onboarding" },
    });
  }

  // Microsoft connected → fire Microsoft scans
  if (user.microsoft_refresh_token) {
    events.push({
      name: "tom/microsoft.contacts.sync",
      data: { userId: user.id, source: "onboarding" },
    });
    events.push({
      name: "tom/microsoft.mail.scan",
      data: { userId: user.id, source: "onboarding" },
    });
    events.push({
      name: "tom/microsoft.calendar.scan",
      data: { userId: user.id, source: "onboarding" },
    });
  }

  if (events.length === 0) {
    return NextResponse.json(
      { error: "No connected providers" },
      { status: 400 }
    );
  }

  // Fire all events in parallel
  try {
    await inngest.send(events);
  } catch (err) {
    console.error("[start-scan] Inngest send failed:", err);
    // Don't block — onboarding can continue without the scan
  }

  return NextResponse.json({
    ok: true,
    events_fired: events.length,
    google: !!user.refresh_token,
    microsoft: !!user.microsoft_refresh_token,
  });
}