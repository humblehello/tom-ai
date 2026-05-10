import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAuthCodeUrl } from '../../../lib/microsoft/client';

/**
 * GET /api/auth/microsoft
 *
 * Initiates the Microsoft OAuth flow for both new signups and returning
 * sign-ins. Stores a CSRF state token in an httpOnly cookie and redirects
 * to login.microsoftonline.com. The callback handles upsert-by-email.
 */
export async function GET(req: NextRequest) {
  const state = randomBytes(24).toString('hex');

  const authUrl = await getAuthCodeUrl(state);
  const response = NextResponse.redirect(authUrl);

  response.cookies.set('ms_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  return response;
}