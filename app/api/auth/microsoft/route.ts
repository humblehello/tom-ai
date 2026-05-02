import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { getAuthCodeUrl } from '../../../lib/microsoft/client';

/**
 * GET /api/auth/microsoft
 *
 * Initiates the Microsoft OAuth flow. Stores a CSRF state token in an
 * httpOnly cookie and redirects to login.microsoftonline.com.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('tom_session')?.value;

  if (!userId) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const state = randomBytes(24).toString('hex');
  cookieStore.set('ms_oauth_state', `${state}:${userId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  const authUrl = await getAuthCodeUrl(state);
  return NextResponse.redirect(authUrl);
}