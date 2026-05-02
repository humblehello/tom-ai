import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getValidAccessToken(userId: string): Promise<string> {
  const { data: user } = await supabase
    .from("tom_users")
    .select("access_token, refresh_token, access_token_expires_at")
    .eq("id", userId)
    .single();

  if (!user) throw new Error("User not found");

  // Check if token is still valid (with 5 min buffer)
  const expiresAt = new Date(user.access_token_expires_at).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now > fiveMinutes) {
    // Token still valid
    return user.access_token;
  }

  // Token expired - refresh it
  if (!user.refresh_token) {
    throw new Error("No refresh token available - user must re-authenticate");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: user.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh token - user must re-authenticate");
  }

  const tokens = await res.json();

  // Save new access token to Supabase
  await supabase
    .from("tom_users")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  console.log("✅ Token refreshed successfully for user", userId);
  return tokens.access_token;
}
export async function getHumbleHelloAccessToken(): Promise<string> {
  const refreshToken = process.env.HUMBLEHELLO_GMAIL_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Humble Hello Gmail credentials not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await res.json();
  if (!tokens.access_token) throw new Error("Failed to get Humble Hello access token");
  return tokens.access_token;
}