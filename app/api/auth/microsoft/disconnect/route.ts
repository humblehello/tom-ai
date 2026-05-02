import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { disconnectMicrosoft } from '../../../../lib/microsoft/client';

/**
 * POST /api/auth/microsoft/disconnect
 *
 * Clears Microsoft tokens from the user's record. If Microsoft was their
 * primary provider and Google is connected, falls back to Google.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Cookie: req.headers.get('cookie') ?? '' } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // If MS was primary and Google is still connected, switch primary to Google
  const { data: row } = await admin
    .from('tom_users')
    .select('primary_email_provider, google_refresh_token')
    .eq('id', user.id)
    .single();

  if (row?.primary_email_provider === 'microsoft' && row.google_refresh_token) {
    await admin
      .from('tom_users')
      .update({ primary_email_provider: 'google' })
      .eq('id', user.id);
  }

  await disconnectMicrosoft(user.id);

  return NextResponse.json({ ok: true });
}