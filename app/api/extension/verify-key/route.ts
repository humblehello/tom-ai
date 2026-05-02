import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Lightweight endpoint used by the Chrome extension after the connect flow
 * completes. Confirms the API key is valid and returns minimal user context
 * so the extension can show plan/quotas in its popup.
 *
 * The extension also calls this on startup ("verify_connection") to detect
 * keys that have been revoked or rotated server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "missing_auth" }, { status: 401 });
    }
    const apiKey = auth.replace("Bearer ", "").trim();

    const { data: user, error } = await supabaseAdmin
      .from("tom_users")
      .select("id, email, plan")
      .eq("humble_api_key", apiKey)
      .single();

    if (error || !user) {
      console.error("[verify-key] lookup failed:", { error, hasUser: !!user, keyPrefix: apiKey.slice(0, 16) });
      return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan || "free",
      },
    });
  } catch (e: any) {
    console.error("[verify-key] error:", e);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}