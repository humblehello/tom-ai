import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createGoogleContact } from '../../lib/googleContacts';
import { getValidAccessToken } from '../../lib/google';
import { emailTakenBySomeoneElse, insertContact } from '../../lib/contactWrite';
import { stampHumanEdits } from '../../lib/contactFieldPolicy';

async function getUserId() {
  const cookieStore = await cookies();
  return cookieStore.get('tom_session')?.value || null;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const eligibleOnly = searchParams.get('eligible') === 'true';
  const stale = searchParams.get('stale') === 'true';
  const search = searchParams.get('search') || '';
  const limit = parseInt(searchParams.get('limit') || '250');
  const offset = parseInt(searchParams.get('offset') || '0');
  const tierFilter = searchParams.get('tier') || '';
  const bucketFilter = searchParams.get('bucket') || '';
  const typeFilter = searchParams.get('type') || '';
  const needsAttention = searchParams.get('needs_attention') === 'true';

  // ── Full-field search via Postgres function ──────────────────────────────
  if (search) {
    const { data: searchData, error: searchError } = await supabase
      .rpc('search_contacts', {
        p_user_id: userId,
        p_query: search,
      });

    if (searchError) return NextResponse.json({ error: searchError.message }, { status: 500 });

    return NextResponse.json({
      contacts: searchData || [],
      total: searchData?.length || 0,
      offset: 0,
      limit: 500,
      has_more: false,
      is_search: true,
    });
  }

  // ── Normal paginated fetch ───────────────────────────────────────────────
  let query = supabase
    .from('tom_contacts')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('full_name');

 if (eligibleOnly) query = query.eq('gifting_eligible', true);
  if (stale) query = query.eq('deletion_suggested', true);
  if (tierFilter) query = query.eq('dunbar_tier', parseInt(tierFilter));
  if (bucketFilter) query = query.contains('dunbar_bucket', [bucketFilter]);
  if (typeFilter === 'friends') query = query.in('relationship_type', ['friend', 'close_friend']);
  else if (typeFilter === 'family') query = query.eq('relationship_type', 'family');
  else if (typeFilter === 'customers') query = query.eq('relationship_type', 'customer');
  else if (typeFilter === 'vendors') query = query.eq('relationship_type', 'vendor');
  else if (typeFilter === 'colleagues') query = query.eq('relationship_type', 'colleague');
  if (needsAttention) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    query = query.or(`last_emailed_at.is.null,last_emailed_at.lt.${ninetyDaysAgo}`);
  }
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    contacts: data || [],
    total: count || 0,
    offset,
    limit,
    has_more: (data || []).length === limit,
    is_search: false,
  });
}

export async function POST(req) {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check contact limit
  const { data: userData } = await supabase
    .from('tom_users')
    .select('plan, trial_ends_at, plan_contact_limit')
    .eq('id', userId)
    .single();

  const now = new Date();
  const trialExpired = userData?.trial_ends_at ? now > new Date(userData.trial_ends_at) : false;
  const effectivePlan = userData?.plan === 'trial' && trialExpired ? 'free' : userData?.plan || 'free';
  const contactLimit = effectivePlan === 'free' ? 1000 : effectivePlan === 'pro' ? 5000 : 999999;

  const { count } = await supabase
    .from('tom_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count || 0) >= contactLimit) {
    return NextResponse.json({
      error: 'contact_limit_reached',
      limit: contactLimit,
      plan: effectivePlan,
      message: `You've reached the ${contactLimit.toLocaleString()} contact limit for your ${effectivePlan} plan.`,
    }, { status: 402 });
  }

  const body = await req.json();

  // Strip any client-supplied identity fields — always use session userId
  const { id: _id, user_id: _uid, created_at: _ca, google_resource_name: _grn, field_provenance: _prov, ...fields } = body;

  if (fields.email) {
    const decision = await emailTakenBySomeoneElse(supabase, userId, fields.email, null, fields.full_name);
    if (decision !== 'allow') {
      return NextResponse.json({ error: 'That email already belongs to another person.' }, { status: 409 });
    }
  }

  const humanFields = ['full_name', 'email', 'phone', 'company', 'job_title', 'home_address', 'birthday', 'notes', 'key_context'];
  fields.field_provenance = stampHumanEdits({}, fields, humanFields);

  // Step 1: Insert into Supabase first
  const { data: contact, error } = await insertContact(
    supabase,
    { ...fields, user_id: userId },
    { returning: true }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Step 2: Create in Google Contacts so it syncs to phone/calendar
  try {
    console.log('Attempting Google contact creation for:', contact.full_name, contact.email);
    const accessToken = await getValidAccessToken(userId);
    console.log('Got access token, creating Google contact...');

    const googleResourceName = await createGoogleContact(accessToken, {
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone,
      address: contact.home_address,
      company: contact.company,
      job_title: contact.job_title,
    });

    // Step 3: Save the Google resource name back so future syncs work
    if (googleResourceName) {
      await supabase
        .from('tom_contacts')
        .update({ google_resource_name: googleResourceName })
        .eq('id', contact.id)
        .eq('user_id', userId);

      contact.google_resource_name = googleResourceName;
    }
  } catch (e) {
    // Don't fail the whole request if Google sync fails
    // Contact is already saved in Supabase
    console.error('Google Contact creation failed:', e);
  }

  return NextResponse.json({ contact });
}