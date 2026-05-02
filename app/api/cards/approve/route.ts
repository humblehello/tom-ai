import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { approval_id, action, address, card_id, message } = await req.json();
  if (!approval_id || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: approval } = await supabase
    .from("card_approvals")
    .select("*")
    .eq("id", approval_id)
    .eq("user_id", userId)
    .single();

  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  if (approval.status !== "pending") {
    return NextResponse.json({ error: "Already processed" }, { status: 400 });
  }

  // ── SKIP ─────────────────────────────────────────────────────────────────
  if (action === "skip") {
    await supabase
      .from("card_approvals")
      .update({ status: "skipped", skipped_at: new Date().toISOString() })
      .eq("id", approval_id);
    return NextResponse.json({ ok: true, action: "skipped" });
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────
  if (action === "approve") {
    // 1. Save the address back to the contact so this dance never happens
    //    again for this contact. Only update if an address was provided
    //    AND the contact doesn't already have one (don't clobber existing
    //    good addresses with partial input).
    if (address && approval.contact_id) {
      const { data: contact } = await supabase
        .from("tom_contacts")
        .select("home_address")
        .eq("id", approval.contact_id)
        .eq("user_id", userId)
        .maybeSingle();

      const hasAddress =
        contact?.home_address &&
        contact.home_address.streetAddress &&
        contact.home_address.city;

      if (!hasAddress) {
        const normalizedAddress = {
          streetAddress: address.streetAddress || address.address1 || "",
          city: address.city || "",
          region: (address.region || address.state || "").trim().toUpperCase(),
          postalCode: address.postalCode || address.zip || "",
          country: address.country || "United States",
        };
        await supabase
          .from("tom_contacts")
          .update({ home_address: normalizedAddress })
          .eq("id", approval.contact_id)
          .eq("user_id", userId);
      }
    }

    // 2. Call the send route internally. Wrap in try/catch so network
    //    failures are surfaced cleanly instead of crashing the endpoint.
    let sendResult: any = null;
    let sendError: string | null = null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cards/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `tom_session=${userId}`,
        },
        body: JSON.stringify({
          contact_id: approval.contact_id,
          contact_name: approval.contact_name,
          occasion: approval.occasion,
          message: message || approval.message,
          address,
          card_id,
          trigger_type: "approved",
          requires_approval: false,
        }),
      });
      sendResult = await res.json();
      if (!res.ok || !sendResult?.ok) {
        sendError = sendResult?.error || sendResult?.details?.message || "Send failed";
      }
    } catch (e: any) {
      sendError = e?.message || "Network error while sending card";
    }

    // 3. Don't mark the approval as approved unless the send actually
    //    succeeded. This prevents the "approval done, card not sent" state.
    if (sendError) {
      return NextResponse.json(
        { error: sendError, ok: false },
        { status: 500 }
      );
    }

    await supabase
      .from("card_approvals")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      })
      .eq("id", approval_id);

    return NextResponse.json({
      ok: true,
      action: "approved",
      order_id: sendResult.order_id,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── List pending approvals for the dashboard widget ─────────────────────────
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const list = searchParams.get("list");

  if (list) {
    // Auto-expire anything past its expiration before returning the list
    await supabase
      .from("card_approvals")
      .update({ status: "expired" })
      .eq("user_id", userId)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const { data: rows } = await supabase
      .from("card_approvals")
      .select("*, tom_contacts(home_address, work_address)")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });

    const enriched = (rows || []).map((a: any) => ({
      ...a,
      address: a.tom_contacts?.home_address,
      work_address: a.tom_contacts?.work_address,
    }));

    // Split into two lists based on address presence.
    // An approval "needs info" if neither home nor work address is set
    // AND no address was stored on the approval row itself.
    const needsInfo = enriched.filter((a: any) => {
      const hasAddress =
        (a.address && a.address.streetAddress) ||
        (a.work_address && a.work_address.streetAddress) ||
        (a.address_snapshot && a.address_snapshot.streetAddress);
      return !hasAddress;
    });
    const approvals = enriched.filter((a: any) => !needsInfo.includes(a));

    return NextResponse.json(
      { approvals, needs_info: needsInfo },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({ approvals: [], needs_info: [] });
}