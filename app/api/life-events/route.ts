import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// GET — list all life events
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("life_events")
    .select("*")
    .eq("user_id", userId)
    .order("event_date", { ascending: true });

  // Filter out events for deleted contacts
  const { data: activeContacts } = await supabase
    .from("tom_contacts")
    .select("full_name")
    .eq("user_id", userId);

  const activeNames = new Set((activeContacts || []).map((c: any) => c.full_name));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filtered = (data || []).filter(e => activeNames.has(e.contact_name));
  return NextResponse.json({ events: filtered }); 
}

// POST — create a new life event
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contact_name, event_type, event_date, relationship_type, notes, recurring, contact_id } = body;

  if (!contact_name || !event_type || !event_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("life_events")
    .insert({
      user_id: userId,
      contact_id: contact_id || null,
      contact_name,
      event_type,
      event_date,
      relationship_type: relationship_type || "contact",
      notes: notes || null,
      recurring: recurring !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

// DELETE — remove a life event
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("life_events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}