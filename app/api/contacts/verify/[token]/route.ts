import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const { data: verification } = await supabase
    .from("tom_verifications")
    .select("*")
    .eq("token", token)
    .single();

  if (!verification) return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 404 });

  const { data: contact } = await supabase
    .from("tom_contacts")
    .select("full_name, email, phone, work_phone, personal_email, work_email, home_address, work_address, birthday, job_title, company, linkedin_url, twitter_url, instagram_url, facebook_url, topics")
    .eq("id", verification.contact_id)
    .single();

  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: user } = await supabase
    .from("tom_users")
    .select("name")
    .eq("id", verification.user_id)
    .single();

  return NextResponse.json({
    contact_name: contact.full_name,
    contact_email: contact.email,
    sender_name: user?.name || "this person",
    current_info: {
      phone: contact.phone,
      work_phone: contact.work_phone,
      personal_email: contact.personal_email,
      work_email: contact.work_email,
      home_address: contact.home_address,
      work_address: contact.work_address,
      birthday: contact.birthday,
      job_title: contact.job_title,
      company: contact.company,
      linkedin_url: contact.linkedin_url,
      twitter_url: contact.twitter_url,
      instagram_url: contact.instagram_url,
      facebook_url: contact.facebook_url,
      topics: contact.topics,
    },
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const { data: verification } = await supabase
    .from("tom_verifications")
    .select("*")
    .eq("token", token)
    .single();

  if (!verification) return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 404 });

  const body = await req.json();

  const nextEligible = new Date();
  nextEligible.setMonth(nextEligible.getMonth() + 18);

  const updates: Record<string, any> = {
    verification_status: "verified",
    verified_at: new Date().toISOString(),
    verification_next_eligible_at: nextEligible.toISOString(),
    verification_sequence_reset_at: null,
    verification_attempts: 0,
  };

  if (body.phone) updates.phone = body.phone;
  if (body.work_phone) updates.work_phone = body.work_phone;
  if (body.personal_email) updates.personal_email = body.personal_email;
  if (body.work_email) updates.work_email = body.work_email;
  if (body.home_address?.streetAddress) updates.home_address = body.home_address;
  if (body.work_address?.streetAddress) updates.work_address = body.work_address;
  if (body.birthday) updates.birthday = body.birthday;
  if (body.job_title) updates.job_title = body.job_title;
  if (body.company) updates.company = body.company;
  if (body.linkedin_url) updates.linkedin_url = body.linkedin_url;
  if (body.twitter_url) updates.twitter_url = body.twitter_url;
  if (body.instagram_url) updates.instagram_url = body.instagram_url;
  if (body.facebook_url) updates.facebook_url = body.facebook_url;
  if (body.topics?.length) updates.topics = body.topics;

  await supabase.from("tom_contacts").update(updates).eq("id", verification.contact_id);

  await supabase
    .from("tom_verifications")
    .update({ status: "completed", responded_at: new Date().toISOString(), response_type: "updated" })
    .eq("token", token);

  return NextResponse.json({ success: true });
}