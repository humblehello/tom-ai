import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HANDWRYTTEN_API = "https://api.handwrytten.com/v2";

// Card catalog by occasion — Handwrytten card_ids
const CARD_CATALOG: Record<string, number[]> = {
  "Happy Birthday":   [60469, 119983, 58330, 2669],
  "Birthday":         [60469, 119983, 58330, 2669],
  "Congratulations":  [2665, 194410, 135588, 24],
  "Thank you":        [58691, 168112, 2663, 210, 111],
  "Thank You":        [58691, 168112, 2663, 210, 111],
  "Just because":     [142528, 62389, 139593],
  "Just Because":     [142528, 62389, 139593],
  "Thinking of you":  [119241, 134150],
  "Thinking of You":  [119241, 134150],
  "Other":            [60469, 2665, 58691, 142528, 119241],
};

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── Get available cards from Handwrytten ──────────────────────────────────────
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${HANDWRYTTEN_API}/cards`, {
      headers: { Authorization: process.env.HANDWRYTTEN_API_KEY! },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Send a card ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    contact_id,
    contact_name,
    occasion,
    message,
    address,
    card_id,
    trigger_type = "manual",
    requires_approval = false,
  } = await req.json();

  if (!contact_id || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!address && !requires_approval) {
    return NextResponse.json(
      {
        error: "No home address on file",
        missing_address: true,
        message: "This contact needs a home address before you can send a card.",
      },
      { status: 400 }
    );
  }

  // ── Fetch user data ONCE ──────────────────────────────────────────────────
  const { data: userData } = await supabase
    .from("tom_users")
    .select("card_profile, name, home_address, home_address_text, stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!userData) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Validate the user has a sender address before sending. Never fall back
  // to a hardcoded address — that would stamp someone else's name/address
  // on the return envelope.
  const senderAddress = userData.home_address;
  const hasSenderAddress =
    senderAddress &&
    senderAddress.streetAddress &&
    senderAddress.city &&
    senderAddress.region &&
    senderAddress.postalCode;

  if (!hasSenderAddress && !requires_approval) {
    return NextResponse.json(
      {
        error: "no_sender_address",
        needs_setup: true,
        message: "You need to add your mailing address in Settings before sending cards.",
      },
      { status: 400 }
    );
  }

  // ── If approval required, queue it and return ────────────────────────────
  if (requires_approval) {
    const { data: approval } = await supabase
      .from("card_approvals")
      .insert({
        user_id: userId,
        contact_id,
        contact_name,
        occasion,
        message,
        card_type: "handwrytten",
        status: "pending",
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    return NextResponse.json({
      ok: true,
      requires_approval: true,
      approval_id: approval?.id,
    });
  }

  // ── Charge $4.75 via Stripe ───────────────────────────────────────────────
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  });

  if (!userData.stripe_customer_id) {
    return NextResponse.json(
      { error: "no_payment_method", needs_setup: true },
      { status: 402 }
    );
  }

  const paymentMethods = await stripe.paymentMethods.list({
    customer: userData.stripe_customer_id,
    type: "card",
  });
  if (!paymentMethods.data.length) {
    return NextResponse.json(
      { error: "no_payment_method", needs_setup: true },
      { status: 402 }
    );
  }

  let paymentIntentId: string | null = null;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 475,
      currency: "usd",
      customer: userData.stripe_customer_id,
      payment_method: paymentMethods.data[0].id,
      confirm: true,
      off_session: true,
      description: `Humble Hello card — ${occasion} for ${contact_name}`,
      metadata: { user_id: userId, contact_name, occasion },
    });
    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: "charge_failed", needs_setup: true },
        { status: 402 }
      );
    }
    paymentIntentId = paymentIntent.id;
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message, needs_setup: true },
      { status: 402 }
    );
  }

  // ── Persist the contact's address if they didn't have one ─────────────────
  // This ensures the next card to this contact won't re-queue for approval.
  if (contact_id && address) {
    const { data: contact } = await supabase
      .from("tom_contacts")
      .select("home_address")
      .eq("id", contact_id)
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
        .eq("id", contact_id)
        .eq("user_id", userId);
    }
  }

  // ── Send via Handwrytten ──────────────────────────────────────────────────
  try {
    const cardOptions = CARD_CATALOG[occasion] || CARD_CATALOG["Other"];
    const selectedCardId =
      card_id || cardOptions[Math.floor(Math.random() * cardOptions.length)];

    const nameParts = (userData.name || "").split(" ");
    const senderFirstName = nameParts[0] || "";
    const senderLastName = nameParts.slice(1).join(" ") || "";

    const payload = {
      card_id: selectedCardId,
      message,
      font_label: "Executive Adam",
      sender_first_name: senderFirstName,
      sender_last_name: senderLastName,
      sender_address1: senderAddress.streetAddress,
      sender_address2: senderAddress.address2 || "",
      sender_city: senderAddress.city,
      sender_state: senderAddress.region,
      sender_zip: senderAddress.postalCode,
      recipient_first_name: contact_name?.split(" ")[0] || "",
      recipient_last_name: contact_name?.split(" ").slice(1).join(" ") || "",
      recipient_address1:
        (address.streetAddress || address.address1 || "").split("\n")[0],
      recipient_address2: (address.streetAddress || "").includes("\n")
        ? address.streetAddress.split("\n")[1]
        : undefined,
      recipient_city: address.city || "",
      recipient_state: (address.region || address.state || "").trim() || "",
      recipient_zip: (address.postalCode || address.zip || "").trim(),
      recipient_country: address.country || "United States",
    };

    const hwRes = await fetch(`${HANDWRYTTEN_API}/orders/singleStepOrder`, {
      method: "POST",
      headers: {
        Authorization: process.env.HANDWRYTTEN_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const hwData = await hwRes.json();

    if (!hwRes.ok) {
      console.error("Handwrytten error:", hwData);

      // Refund the Stripe charge since the card didn't actually ship
      if (paymentIntentId) {
        try {
          await stripe.refunds.create({ payment_intent: paymentIntentId });
        } catch (refundErr) {
          console.error("Refund failed after Handwrytten error:", refundErr);
          // Log failed-refund record so we know to handle it manually
          await supabase.from("card_sends").insert({
            user_id: userId,
            contact_id,
            contact_name,
            occasion,
            message,
            card_type: "handwrytten",
            trigger_type,
            status: "refund_failed",
            handwrytten_order_id: null,
            cost_cents: 475,
            sent_at: new Date().toISOString(),
          });
        }
      }

      const hwMessage = hwData?.message || hwData?.error || "Card send failed";
      return NextResponse.json(
        { error: "Card send failed", details: { message: hwMessage } },
        { status: 500 }
      );
    }

    // Log the successful send
    await supabase.from("card_sends").insert({
      user_id: userId,
      contact_id,
      contact_name,
      occasion,
      message,
      card_type: "handwrytten",
      trigger_type,
      status: "sent",
      handwrytten_order_id: hwData.order_id || hwData.id,
      cost_cents: hwData.cost ? Math.round(hwData.cost * 100) : 475,
      sent_at: new Date().toISOString(),
    });

    // ── Auto-resolve any still-pending approvals for the same contact/occasion
    // This prevents the approver widget from showing a "pending" approval for
    // a card that was already sent through a different route (dashboard engage
    // card, campaign, birthday auto-sender, etc.)
    if (contact_id && trigger_type !== "approved") {
      await supabase
        .from("card_approvals")
        .update({
          status: "sent_via_other_route",
          sent_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("contact_id", contact_id)
        .eq("occasion", occasion)
        .in("status", ["pending", "auto_pending"]);
    }

    return NextResponse.json({
      ok: true,
      order_id: hwData.order_id || hwData.id,
    });
  } catch (e: any) {
    console.error("Card send error:", e);

    // Refund on unexpected failure
    if (paymentIntentId) {
      try {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      } catch (refundErr) {
        console.error("Refund failed after send error:", refundErr);
      }
    }

    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}