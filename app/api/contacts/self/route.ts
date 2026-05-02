import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createGoogleContact } from "../../../lib/googleContacts";
import { getValidAccessToken } from "../../../lib/google";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("tom_session")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Get user email from tom_users
  const { data: user } = await supabase
    .from("tom_users")
    .select("email")
    .eq("id", userId)
    .single();

  if (!user?.email) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Upsert self contact — match on user_id + is_self
  const { data: existing } = await supabase
    .from("tom_contacts")
    .select("id, google_resource_name")
    .eq("user_id", userId)
    .eq("is_self", true)
    .maybeSingle();

  const payload = {
    user_id: userId,
    full_name: body.full_name,
    email: user.email,
    phone: body.phone || null,
    job_title: body.job_title || null,
    company: body.company || null,
    linkedin_url: body.linkedin_url || null,
    home_address: body.home_address || null,
    work_address: body.work_address || null,
    work_email: body.work_email || null,
    personal_email: body.personal_email || null,
    work_phone: body.work_phone || null,
    is_self: true,
    last_synced_at: new Date().toISOString(),
  };

  let contactId: string;

  if (existing) {
    await supabase.from("tom_contacts").update(payload).eq("id", existing.id);
    contactId = existing.id;
  } else {
    const { data: newContact } = await supabase
      .from("tom_contacts")
      .insert(payload)
      .select()
      .single();
    contactId = newContact?.id;
  }

  // Sync to Google Contacts
  try {
    const accessToken = await getValidAccessToken(userId);
    if (!existing?.google_resource_name) {
      const resourceName = await createGoogleContact(accessToken, payload);
      if (resourceName) {
        await supabase.from("tom_contacts").update({ google_resource_name: resourceName }).eq("id", contactId);
      }
    }
  } catch (e) {
    console.error("Google sync error for self contact:", e);
  }

  return NextResponse.json({ success: true, contact_id: contactId });
}