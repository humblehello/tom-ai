import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import {
  acquireTokenByCode,
  getMsalClient,
} from '../../../../lib/microsoft/client';
import { inngest } from '../../../../lib/inngest';

/**
 * GET /api/auth/microsoft/callback
 *
 * Handles the redirect from Microsoft, exchanges the auth code for tokens,
 * fetches the user's profile, and stores everything on tom_users.
 *
 * After success: kicks off the initial Inngest sync events and redirects
 * back to /settings with a success flag.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  // Handle user cancellation / consent denial
  if (error) {
    return NextResponse.redirect(
    new URL(
  `/settings?ms_error=${encodeURIComponent(errorDesc || error)}`,
  req.url
)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings?ms_error=missing_code', req.url)
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const stored = cookieStore.get('ms_oauth_state')?.value;
  cookieStore.delete('ms_oauth_state');

  if (!stored) {
    return NextResponse.redirect(
      new URL('/settings?ms_error=state_expired', req.url)
    );
  }

  const [storedState, userId] = stored.split(':');
  if (storedState !== state || !userId) {
    return NextResponse.redirect(
      new URL('/settings?ms_error=state_mismatch', req.url)
    );
  }

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await acquireTokenByCode(code);
  } catch (e) {
    console.error('[microsoft callback] token exchange failed', e);
    return NextResponse.redirect(
      new URL('/settings?ms_error=token_exchange_failed', req.url)
    );
  }

  if (!tokens.accessToken) {
    return NextResponse.redirect(
      new URL('/settings?ms_error=no_access_token', req.url)
    );
  }

  // Fetch profile so we can persist account email + tenant
  let profile: {
    id?: string;
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  } = {};
  try {
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (profileRes.ok) profile = await profileRes.json();
  } catch (e) {
    console.warn('[microsoft callback] profile fetch failed (non-fatal)', e);
  }

  // MSAL doesn't surface refresh_token directly on AuthenticationResult.
  // We extract it from the serialized token cache.
  const cacheSerialized = await getMsalClient().getTokenCache().serialize();
  const refreshToken = extractRefreshToken(JSON.parse(cacheSerialized));

  if (!refreshToken) {
    // Fallback: if we didn't get a refresh token, the user probably didn't
    // grant offline_access. Redirect them with an actionable error.
    return NextResponse.redirect(
      new URL('/settings?ms_error=no_refresh_token', req.url)
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const expiresAt = new Date(
    (tokens.expiresOn ?? new Date(Date.now() + 3600_000)).getTime()
  ).toISOString();

  await supabase
    .from('tom_users')
    .update({
      microsoft_refresh_token: refreshToken,
      microsoft_access_token: tokens.accessToken,
      microsoft_token_expires_at: expiresAt,
      microsoft_account_email:
        profile.mail ?? profile.userPrincipalName ?? null,
      microsoft_user_id: profile.id ?? null,
      microsoft_tenant_id: tokens.tenantId ?? null,
      microsoft_connected_at: new Date().toISOString(),
      microsoft_disconnected_at: null,
    })
    .eq('id', userId);

  // Kick off initial sync via Inngest
  try {
    await inngest.send([
      { name: 'tom/microsoft.contacts.sync', data: { userId } },
      { name: 'tom/microsoft.mail.scan', data: { userId } },
      { name: 'tom/microsoft.calendar.scan', data: { userId } },
    ]);
  } catch (e) {
    console.error('[microsoft callback] failed to enqueue initial sync', e);
    // Don't fail the user-visible flow over this
  }

  return NextResponse.redirect(
    new URL('/settings?ms_connected=1', req.url)
  );
}

// ---------------------------------------------------------------------------
// MSAL refresh-token extraction helper.
//
// MSAL Node intentionally hides refresh tokens from AuthenticationResult.
// We read them out of the serialized cache. This is the documented escape
// hatch for apps (like ours) that manage refresh tokens in their own DB.
// ---------------------------------------------------------------------------

function extractRefreshToken(cache: Record<string, unknown>): string | null {
  const refreshTokenObj = cache.RefreshToken as
    | Record<string, { secret?: string }>
    | undefined;
  if (!refreshTokenObj) return null;
  const first = Object.values(refreshTokenObj)[0];
  return first?.secret ?? null;
}