import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteParams = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: verification } = await supabase
    .from("tom_verifications")
    .select("*, tom_contacts(*)")
    .eq("token", token)
    .single();

  if (!verification) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const contact = verification.tom_contacts;

  // 18 months from now
  const nextEligible = new Date();
  nextEligible.setMonth(nextEligible.getMonth() + 18);

  // Opt out
  if (body.opt_out) {
    const optOutType = body.opt_out_type || "stop_emails";

    if (optOutType === "delete_all") {
      // Delete from Google Contacts first
      const { data: user } = await supabase
        .from("tom_users")
        .select("access_token")
        .eq("id", verification.user_id)
        .single();

      if (user?.access_token && contact.google_resource_name &&
          !contact.google_resource_name.startsWith("email_scrape_") &&
          !contact.google_resource_name.startsWith("manual_")) {
        try {
          await fetch(`https://people.googleapis.com/v1/${contact.google_resource_name}:deleteContact`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${user.access_token}` },
          });
        } catch (e) {
          console.error("Google delete failed:", e);
        }
      }

      // Delete from HH
      await supabase.from("tom_contacts").delete().eq("id", contact.id);
      await supabase.from("tom_verifications")
        .update({ status: "opted_out", responded_at: new Date().toISOString(), response_type: "delete_all" })
        .eq("token", token);

    } else {
      // stop_emails — keep info, just lock verification
      await supabase
        .from("tom_contacts")
        .update({
          verification_status: "opted_out",
          verification_next_eligible_at: nextEligible.toISOString(),
        })
        .eq("id", contact.id);

      await supabase
        .from("tom_verifications")
        .update({ status: "opted_out", responded_at: new Date().toISOString(), response_type: "stop_emails" })
        .eq("token", token);
    }

    return NextResponse.json({ success: true });
  }

  // Confirmed correct (no changes)
  if (body.confirmed_correct) {
    await supabase
      .from("tom_contacts")
      .update({
        verification_status: "verified",
        verified_at: new Date().toISOString(),
        verification_next_eligible_at: nextEligible.toISOString(),
        verification_sequence_reset_at: null,
        verification_attempts: 0,
      })
      .eq("id", contact.id);

    await supabase
      .from("tom_verifications")
      .update({ status: "confirmed", responded_at: new Date().toISOString(), response_type: "confirmed_correct" })
      .eq("token", token);

    return NextResponse.json({ success: true });
  }

  // Save updated data
  const updates: any = {
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

  await supabase.from("tom_contacts").update(updates).eq("id", contact.id);

  await supabase
    .from("tom_verifications")
    .update({ status: "completed", responded_at: new Date().toISOString(), response_type: "updated" })
    .eq("token", token);

  return NextResponse.json({ success: true });
}