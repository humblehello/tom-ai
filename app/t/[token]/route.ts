import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  let destinationUrl: string | null = null;

  try {

    // Look up the token + destination URL
    const { data: trackingToken, error } = await supabase
      .from("campaign_tracking_tokens")
      .select("id, enrollment_id, token_type, redirect_url")
      .eq("token", token)
      .eq("token_type", "click")
      .single();

    if (!error && trackingToken) {
      destinationUrl = trackingToken.redirect_url;

      // Get campaign_id + contact_id from enrollment
      const { data: enrollment } = await supabase
        .from("campaign_enrollments")
        .select("campaign_id, contact_id")
        .eq("id", trackingToken.enrollment_id)
        .single();

      if (enrollment) {
        await supabase.from("campaign_events").insert({
          campaign_id: enrollment.campaign_id,
          contact_id: enrollment.contact_id,
          enrollment_id: trackingToken.enrollment_id,
          event_type: "click",
          metadata: {
            token,
            url: trackingToken.redirect_url,
            user_agent: request.headers.get("user-agent"),
            ip: request.headers.get("x-forwarded-for"),
          },
        });
      }

      // Mark enrollment as clicked if not already
      await supabase
        .from("campaign_enrollments")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", trackingToken.enrollment_id)
        .is("clicked_at", null);
    }
  } catch (err) {
    console.error("[click-tracking] error:", err);
  }

  // Redirect to destination, or fallback to humblehello.com
  const redirectTo = destinationUrl ?? "https://humblehello.com";
  return NextResponse.redirect(redirectTo, { status: 307 });
}