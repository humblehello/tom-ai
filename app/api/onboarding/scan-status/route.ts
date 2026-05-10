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
    .select("*")
    .eq("id", session)
    .single();
  return data;
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count contacts found so far
  const { count: contactCount } = await supabase
    .from("tom_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_self", false);

  // Check sync timestamps to know if scans have started returning data
  const googleSynced = !!user.google_sync_token || !!user.gmail_backfill_processed;
  const microsoftSynced = !!user.microsoft_contacts_last_synced_at;

  // "Ready" means: at least one provider has started syncing AND we have some contacts
  const hasProvider = !!user.refresh_token || !!user.microsoft_refresh_token;
  const someProviderSynced = googleSynced || microsoftSynced;
  const ready = hasProvider && someProviderSynced && (contactCount ?? 0) >= 5;

  return NextResponse.json({
    ready,
    contact_count: contactCount ?? 0,
    google_synced: googleSynced,
    microsoft_synced: microsoftSynced,
  });
}