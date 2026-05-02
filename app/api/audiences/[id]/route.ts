import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function PATCH(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, filter_config, manual_contact_ids } = body;

  const { data: audience, error } = await supabase
    .from("audiences")
    .update({
      name: name?.trim(),
      description: description?.trim() || null,
      filter_config: filter_config || { groups: [], group_logic: "AND" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audience_contacts").delete().eq("audience_id", params.id);

  if (filter_config?.groups?.flatMap((g: any) => g.rules).length > 0) {
    const { resolveFilterContacts, insertAudienceContacts } = await import("../route") as any;
    const contactIds = await resolveFilterContacts(userId, filter_config);
    if (contactIds.length > 0) await insertAudienceContacts(params.id, userId, contactIds.slice(0, 250));
  }

  if (manual_contact_ids?.length > 0) {
    const rows = manual_contact_ids.slice(0, 250).map((contact_id: string) => ({ audience_id: params.id, contact_id, user_id: userId }));
    await supabase.from("audience_contacts").insert(rows);
  }

  return NextResponse.json({ audience });
}

export async function DELETE(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Remove from any campaigns first
  await supabase.from("campaign_audiences").delete().eq("audience_id", params.id);

  // Remove contacts
  await supabase.from("audience_contacts").delete().eq("audience_id", params.id);

  // Delete the audience
  const { error } = await supabase
    .from("audiences")
    .delete()
    .eq("id", params.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[audience DELETE] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}