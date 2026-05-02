import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { disconnectMicrosoft } from '../../../../lib/microsoft/client';

/**
 * POST /api/auth/microsoft/disconnect
 *
 * Clears Microsoft tokens from the user's record. If Microsoft was their
 * primary provider and Google is connected, falls back to Google.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('tom_session')?.value;

  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: row } = await admin
    .from('tom_users')
    .select('primary_email_provider, refresh_token')
    .eq('id', userId)
    .single();

  if (row?.primary_email_provider === 'microsoft' && row.refresh_token) {
    await admin
      .from('tom_users')
      .update({ primary_email_provider: 'google' })
      .eq('id', userId);
  }

  await disconnectMicrosoft(userId);

  return NextResponse.json({ ok: true });
}