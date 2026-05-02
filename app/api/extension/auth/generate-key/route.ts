import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ─────────────────────────────────────────────────────────────────────
// Generate a Humble Hello API key for the logged-in user.
//
// Format: hh_live_<32 random hex chars>
// Example: hh_live_a3f9b2c4e8d1f6a7b4c2d9e8f1a3b6c4
//
// POST → generates a new key, replaces any existing key
// GET  → returns the existing key (or null if none)
// ─────────────────────────────────────────────────────────────────────

function newApiKey(): string {
  const random = randomBytes(16).toString("hex");
  return `hh_live_${random}`;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: user } = await supabase
    .from("tom_users")
    .select("humble_api_key, humble_api_key_created_at")
    .eq("id", userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    api_key: user.humble_api_key || null,
    created_at: user.humble_api_key_created_at || null,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = newApiKey();
  const createdAt = new Date().toISOString();

  // Use .select() on the update to force PostgREST to return the row
  // AFTER the write commits — eliminating the race with verify-key.
  const { data: updated, error } = await supabase
    .from("tom_users")
    .update({
      humble_api_key: apiKey,
      humble_api_key_created_at: createdAt,
    })
    .eq("id", userId)
    .select("humble_api_key, humble_api_key_created_at")
    .single();

  if (error) {
    console.error("[auth/generate-key] update error:", error);
    return NextResponse.json(
      { error: "key_generation_failed", detail: error.message },
      { status: 500 }
    );
  }

  // Sanity check: confirm the value we just wrote is what came back.
  // If this ever fails, something is intercepting/transforming the write
  // (RLS, trigger, etc.) and we should bail rather than hand the client
  // a key that doesn't match what's in the database.
  if (updated?.humble_api_key !== apiKey) {
    console.error("[auth/generate-key] write mismatch", {
      sent: apiKey.slice(0, 16) + "...",
      got: updated?.humble_api_key?.slice(0, 16) + "...",
    });
    return NextResponse.json(
      { error: "write_verification_failed" },
      { status: 500 }
    );
  }

  // Read back via a second SELECT to confirm it's visible to subsequent
  // reads (catches Supabase replica lag if it ever occurs).
  const { data: readback } = await supabase
    .from("tom_users")
    .select("humble_api_key")
    .eq("id", userId)
    .single();

  if (readback?.humble_api_key !== apiKey) {
    console.error("[auth/generate-key] readback mismatch", {
      expected: apiKey.slice(0, 16) + "...",
      readback: readback?.humble_api_key?.slice(0, 16) + "...",
    });
    return NextResponse.json(
      { error: "readback_verification_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    api_key: apiKey,
    created_at: createdAt,
  });
}

export async function DELETE() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("tom_users")
    .update({
      humble_api_key: null,
      humble_api_key_created_at: null,
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json(
      { error: "revoke_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}