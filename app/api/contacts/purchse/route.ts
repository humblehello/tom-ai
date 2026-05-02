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

  const { contact_id, amount, notes } = await req.json();
  if (!contact_id || !amount) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Update contact purchase info
  const { data: contact, error } = await supabase
    .from("tom_contacts")
    .update({
      last_purchase_amount: amount,
      last_purchase_at: new Date().toISOString(),
      last_purchase_notes: notes || null,
      last_meaningful_touch_at: new Date().toISOString(),
    })
    .eq("id", contact_id)
    .eq("user_id", userId)
    .select("id, full_name, home_address, work_address, relationship_type, key_context")
    .single();

  if (error || !contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Get user settings thresholds
  const { data: settings } = await supabase
    .from("user_settings")
    .select("card_purchase_threshold, gift_purchase_threshold, purchase_card_auto_send, purchase_gift_auto_send")
    .eq("user_id", userId)
    .single();

  const cardThreshold = settings?.card_purchase_threshold ?? 500;
  const giftThreshold = settings?.gift_purchase_threshold ?? 10000;
  const cardAutoSend = settings?.purchase_card_auto_send ?? false;
  const giftAutoSend = settings?.purchase_gift_auto_send ?? false;

  // Determine action
  let action: "gift" | "card" | null = null;
  if (giftThreshold > 0 && amount >= giftThreshold) {
    action = "gift";
  } else if (cardThreshold > 0 && amount >= cardThreshold) {
    action = "card";
  }

  if (action) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const autoSend = action === "gift" ? giftAutoSend : cardAutoSend;

    // Draft a personalized thank-you message
    const msgRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Write a warm, genuine handwritten thank-you card message for ${contact.full_name} who just made a purchase of $${amount.toLocaleString()}.
Context: ${contact.key_context || "a valued customer"}
Relationship: ${contact.relationship_type || "customer"}
Rules: 2-3 sentences, warm and personal, reference their investment in the relationship. No sign-off, no emojis.
Return ONLY the card message.`,
        }],
      }),
    }).then(r => r.json()).catch(() => null);

    const message = msgRes?.content?.[0]?.text?.trim() ||
      `Thank you so much for your continued trust and business — it means more than you know. I'm grateful for the relationship we've built and look forward to continuing to work together.`;

    await supabase.from("card_approvals").insert({
      user_id: userId,
      contact_id: contact.id,
      contact_name: contact.full_name,
      occasion: "Thank you",
      message,
      address: contact.home_address || null,
      work_address: contact.work_address || null,
      status: autoSend ? "auto_pending" : "pending",
      type: "card",
      trigger_type: "purchase",
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    });

    // Log life event
    await supabase.from("life_events").insert({
      user_id: userId,
      contact_id: contact.id,
      contact_name: contact.full_name,
      event_type: "made_a_purchase",
      event_date: new Date().toISOString(),
      source: "manual",
      detected_at: new Date().toISOString(),
      raw_signal: `Purchase of $${amount.toLocaleString()}${notes ? ` — ${notes}` : ""}`,
    });
  }

  return NextResponse.json({ ok: true, action, amount, contact_name: contact.full_name });
}