import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  try {

    // Look up the token
    const { data: trackingToken, error } = await supabase
      .from("campaign_tracking_tokens")
      .select("id, enrollment_id, token_type")
      .eq("token", token)
      .eq("token_type", "open")
      .single();

    if (!error && trackingToken) {
      // Log the open event (ignore duplicate errors — multiple opens are fine)
      // Get campaign_id from enrollment
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
          event_type: "open",
          metadata: {
            token,
            user_agent: request.headers.get("user-agent"),
            ip: request.headers.get("x-forwarded-for"),
          },
        });
      }

      // Mark enrollment as opened if not already
      await supabase
        .from("campaign_enrollments")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", trackingToken.enrollment_id)
        .is("opened_at", null);
    }
  } catch (err) {
    // Never fail — always return the pixel even if tracking errors
    console.error("[open-tracking] error:", err);
  }

  // Always return the 1x1 GIF with no-cache headers
  return new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}