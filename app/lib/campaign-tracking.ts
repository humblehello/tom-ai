import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://humblehello.com";

function generateToken(): string {
  return randomBytes(16).toString("hex"); // 32-char hex string
}

/**
 * Creates an open-tracking pixel URL for an enrollment.
 * Inserts a token row and returns the full pixel src URL.
 */
export async function createOpenTrackingUrl(
  enrollmentId: string
): Promise<string> {
  const token = generateToken();

  await supabase.from("campaign_tracking_tokens").insert({
    token,
    enrollment_id: enrollmentId,
    token_type: "open",
    redirect_url: null,
  });

  return `${BASE_URL}/o/${token}`;
}

/**
 * Wraps a destination URL with a click-tracking redirect.
 * Inserts a token row and returns the full redirect URL.
 */
export async function createClickTrackingUrl(
  enrollmentId: string,
  destinationUrl: string
): Promise<string> {
  const token = generateToken();

  await supabase.from("campaign_tracking_tokens").insert({
    token,
    enrollment_id: enrollmentId,
    token_type: "click",
    redirect_url: destinationUrl,
  });

  return `${BASE_URL}/t/${token}`;
}

/**
 * Replaces all href links in an HTML email body with tracked versions.
 * Also appends the open-tracking pixel before </body>.
 */
export async function injectTracking(
  htmlBody: string,
  enrollmentId: string
): Promise<string> {
  // Replace all links
  const linkRegex = /href="(https?:\/\/[^"]+)"/g;
  const replacements: Array<{ original: string; tracked: string }> = [];

  let match;
  while ((match = linkRegex.exec(htmlBody)) !== null) {
    const original = match[1];
    // Don't double-track humblehello.com/t/ links
    if (!original.includes("/t/") && !original.includes("/o/")) {
      const tracked = await createClickTrackingUrl(enrollmentId, original);
      replacements.push({ original, tracked });
    }
  }

  let result = htmlBody;
  for (const { original, tracked } of replacements) {
    result = result.replaceAll(`href="${original}"`, `href="${tracked}"`);
  }

  // Append open tracking pixel
  const pixelUrl = await createOpenTrackingUrl(enrollmentId);
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;

  if (result.includes("</body>")) {
    result = result.replace("</body>", `${pixel}</body>`);
  } else {
    result += pixel;
  }

  return result;
}