import { ConfidentialClientApplication, type AuthenticationResult } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';
import { MICROSOFT_AUTH_SCOPES, MICROSOFT_REFRESH_SCOPES } from './scopes';

// ---------------------------------------------------------------------------
// MSAL confidential client (multi-tenant + personal accounts via `common`)
// ---------------------------------------------------------------------------

let _msalClient: ConfidentialClientApplication | null = null;

export function getMsalClient(): ConfidentialClientApplication {
  if (_msalClient) return _msalClient;

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set');
  }

  _msalClient = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: 'https://login.microsoftonline.com/common',
    },
  });

  return _msalClient;
}

// ---------------------------------------------------------------------------
// Token storage (Supabase service-role client)
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ---------------------------------------------------------------------------
// OAuth flow helpers
// ---------------------------------------------------------------------------

export function getAuthCodeUrl(state: string): Promise<string> {
  return getMsalClient().getAuthCodeUrl({
    scopes: [...MICROSOFT_AUTH_SCOPES],
    redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
    state,
    prompt: 'select_account',
  });
}

export async function acquireTokenByCode(code: string): Promise<AuthenticationResult> {
  const result = await getMsalClient().acquireTokenByCode({
    code,
    scopes: [...MICROSOFT_AUTH_SCOPES],
    redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
  });
  if (!result) throw new Error('MSAL returned null token result');
  return result;
}

// ---------------------------------------------------------------------------
// Get a valid access token for a user, refreshing if needed.
//
// MSAL's confidentialClient does NOT persist its token cache across requests
// (we run on Vercel serverless), so we manage refresh tokens ourselves in DB
// and call the OAuth token endpoint directly when refreshing. This is the
// same pattern we use for Google.
// ---------------------------------------------------------------------------

export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: user, error } = await supabase
    .from('tom_users')
    .select('microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at')
    .eq('id', userId)
    .single();

  if (error || !user) throw new Error(`User ${userId} not found`);
  if (!user.microsoft_refresh_token) {
    throw new Error(`User ${userId} has no Microsoft connection`);
  }

  // 60-second buffer to avoid edge-case expiry mid-request
  const expiresAt = user.microsoft_token_expires_at
    ? new Date(user.microsoft_token_expires_at).getTime()
    : 0;
  const stillValid = user.microsoft_access_token && expiresAt > Date.now() + 60_000;

  if (stillValid) return user.microsoft_access_token!;

  return refreshMicrosoftAccessToken(userId, user.microsoft_refresh_token);
}

async function refreshMicrosoftAccessToken(
  userId: string,
  refreshToken: string
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: MICROSOFT_REFRESH_SCOPES.join(' '),
  });

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    // If refresh token is invalid (revoked, expired, consent withdrawn),
    // clear the connection so the user is prompted to reconnect.
    if (res.status === 400 || res.status === 401) {
      await supabase
        .from('tom_users')
        .update({
          microsoft_refresh_token: null,
          microsoft_access_token: null,
          microsoft_token_expires_at: null,
          microsoft_disconnected_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }
    throw new Error(`Microsoft token refresh failed (${res.status}): ${errText}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from('tom_users')
    .update({
      microsoft_access_token: tokens.access_token,
      microsoft_refresh_token: tokens.refresh_token ?? refreshToken,
      microsoft_token_expires_at: expiresAt,
    })
    .eq('id', userId);

  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Disconnect: clear tokens. (Microsoft does not provide a programmatic revoke
// endpoint for delegated tokens; users revoke at account.microsoft.com if
// desired. We instruct them in the UI.)
// ---------------------------------------------------------------------------

export async function disconnectMicrosoft(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('tom_users')
    .update({
      microsoft_refresh_token: null,
      microsoft_access_token: null,
      microsoft_token_expires_at: null,
      microsoft_messages_delta_link: null,
      microsoft_contacts_delta_link: null,
      microsoft_events_delta_link: null,
      microsoft_disconnected_at: new Date().toISOString(),
    })
    .eq('id', userId);
}