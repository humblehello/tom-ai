import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { getAuthCodeUrl } from '../../../lib/microsoft/client';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/auth/microsoft
 *
 * Initiates the Microsoft OAuth flow. Stores a CSRF state token in an
 * httpOnly cookie and redirects to login.microsoftonline.com.
 */
export async function GET(req: NextRequest) {
  // Verify the user is authenticated to Humble Hello first.
  // Adjust the auth check to match your Supabase SSR helper.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Cookie: req.headers.get('cookie') ?? '' } },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Generate state and store with userId so we can recover identity in callback
  const state = randomBytes(24).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('ms_oauth_state', `${state}:${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  });

  const authUrl = await getAuthCodeUrl(state);
  return NextResponse.redirect(authUrl);
}