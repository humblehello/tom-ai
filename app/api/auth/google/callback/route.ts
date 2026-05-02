import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/connect?error=no_code", req.url));
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/connect?error=no_token", req.url));
    }

    // ── Get basic user info ──
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();

    // ── Get rich profile from People API (company, city, job title) ──
    let company = null;
    let jobTitle = null;
    let city = null;
    let state = null;
    let addr: any = null;

    try {
      const peopleRes = await fetch(
        "https://people.googleapis.com/v1/people/me?personFields=organizations,addresses,occupations",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const peopleData = await peopleRes.json();

      // Company + job title from first organization
      const org = peopleData.organizations?.[0];
      if (org) {
        company = org.name || null;
        jobTitle = org.title || null;
      }

      // City + state from first address
      addr = peopleData.addresses?.[0];
      if (addr) {
        city = addr.city || null;
        state = addr.region || null;
      }
    } catch (e) {
      // Don't fail login if People API fails
      console.error("People API error:", e);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // ── Upsert user — only set company/city if not already set ──
    // First check if user exists
    const { data: existingUser } = await supabase
      .from("tom_users")
      .select("id, company, city, state, onboarding_complete")
      .eq("google_id", googleUser.id)
      .single();

    // Set trial for new users only
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const isNewUser = !existingUser;

    const upsertData: any = {
      google_id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: expiresAt,
      scopes: tokens.scope,
      updated_at: new Date().toISOString(),
      ...(isNewUser && {
        plan: "trial",
        trial_ends_at: trialEndsAt,
      }),
    };

    // Only set company/city/state from Google if not already manually set
    if (!existingUser?.company && company) upsertData.company = company;
    if (!existingUser?.city && city) upsertData.city = city;
    if (!existingUser?.state && state) upsertData.state = state;

    const { data: user, error } = await supabase
      .from("tom_users")
      .upsert(upsertData, { onConflict: "google_id" })
      .select()
      .single();

    if (error || !user) {
      console.error("Supabase error:", error);
      return NextResponse.redirect(new URL("/connect?error=db_error", req.url));
    }

    // ── Upsert self-contact row ──
    try {
      // First check if a contact already exists with the user's email
      const { data: existingByEmail } = await supabase
        .from("tom_contacts")
        .select("id")
        .eq("user_id", user.id)
        .eq("email", googleUser.email)
        .maybeSingle();

      if (existingByEmail) {
        // Just flag the existing contact as self
        await supabase
          .from("tom_contacts")
          .update({ is_self: true })
          .eq("id", existingByEmail.id);
      } else {
        // Check if already have a self contact
        const { data: existingSelf } = await supabase
          .from("tom_contacts")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_self", true)
          .maybeSingle();

        if (!existingSelf) {
          // No match by email, no existing self — create one
          const selfAddress = (city || state) ? {
            streetAddress: addr?.streetAddress || null,
            city: city,
            region: state,
            postalCode: addr?.postalCode || null,
            country: addr?.country || "US",
          } : null;

          await supabase
            .from("tom_contacts")
            .insert({
              user_id: user.id,
              full_name: googleUser.name,
              email: googleUser.email,
              company: company || null,
              job_title: jobTitle || null,
              home_address: selfAddress,
              is_self: true,
              last_synced_at: new Date().toISOString(),
            });
        }
      }
    } catch (e) {
      console.error("Self-contact upsert error:", e);
    }

    const destination = user.onboarding_complete ? "/dashboard" : "/onboarding";
    const response = NextResponse.redirect(new URL(destination, req.url));
    response.cookies.set("tom_session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/connect?error=unknown", req.url));
  }
}