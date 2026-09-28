import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user session
   const cookieStore = await cookies();
const userId = cookieStore.get('tom_user_id')?.value;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get user's Google access token
    const { data: user, error: userError } = await supabase
  .from('tom_users')
  .select('access_token, refresh_token')
  .eq('id', userId)
  .single();

if (userError || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

let accessToken = user.access_token;

    // Fetch contacts from Google People API
    let contacts = [];
    let pageToken = null;

    do {
      const url = new URL('https://people.googleapis.com/v1/people/me/connections');
      url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers,addresses,birthdays,biographies');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      let response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      // Refresh token if expired
      if (response.status === 401) {
        const refreshed = await refreshAccessToken(user.refresh_token);
        if (!refreshed) return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
        accessToken = refreshed;

       await supabase
  .from('tom_users')
  .update({ access_token: accessToken })
  .eq('id', userId);

        response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      }

      const data = await response.json();
      if (data.connections) contacts = contacts.concat(data.connections);
      pageToken = data.nextPageToken || null;

    } while (pageToken);

    // Transform and upsert contacts
    const rows = contacts
      .filter(c => c.names?.length > 0)
      .map(c => {
        const name = c.names?.[0];
        const email = c.emailAddresses?.[0]?.value || null;
        const phone = c.phoneNumbers?.[0]?.value || null;

        const addresses = c.addresses || [];
        const homeAddr = addresses.find(a => a.type === 'home') || addresses[0] || null;
        const workAddr = addresses.find(a => a.type === 'work') || null;

        const formatAddress = (addr) => {
          if (!addr) return null;
          return {
            streetAddress: addr.streetAddress || addr.formattedValue?.split('\n')[0] || null,
            city: addr.city || null,
            state: addr.region || null,
            zip: addr.postalCode || null,
            country: addr.country || 'US',
            formatted: addr.formattedValue || null
          };
        };

        const bday = c.birthdays?.[0]?.date;
        const birthday = bday
          ? `${String(bday.month).padStart(2,'0')}-${String(bday.day).padStart(2,'0')}`
          : null;

        return {
          user_id: userId,
          google_contact_id: c.resourceName,
          full_name: `${name.givenName || ''} ${name.familyName || ''}`.trim(),
          email,
          phone,
          home_address: formatAddress(homeAddr),
          work_address: formatAddress(workAddr),
          birthday,
          notes: c.biographies?.[0]?.value || null,
          last_synced_at: new Date().toISOString()
        };
      });

    // Legacy full-sync path. Do not update rows that already exist — that
    // overwrite put Google's copy over edits. New rows still insert.
    // Ongoing sync belongs in /api/contacts/google-sync, which is field-aware.
    const { error: upsertError } = await supabase
      .from('tom_contacts')
      .upsert(rows, {
        onConflict: 'user_id,google_contact_id',
        ignoreDuplicates: true
      });

    if (upsertError) throw upsertError;

    // Count eligible contacts
    const { count } = await supabase
      .from('tom_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('gifting_eligible', true);

    return NextResponse.json({
      success: true,
      total_synced: rows.length,
      gifting_eligible: count
    });

  } catch (err) {
    console.error('Contacts sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function refreshAccessToken(refreshToken) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}