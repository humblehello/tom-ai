import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mock Shopify Birthday collection
const MOCK_BIRTHDAY_PRODUCTS = [
  { id: "prod_001", title: "Luxury Candle Set", price: 38, description: "Hand-poured soy candles in 3 scents", image: "🕯️", tags: ["home", "relaxation", "universal"] },
  { id: "prod_002", title: "Artisan Coffee Bundle", price: 45, description: "3 single-origin coffees with tasting notes", image: "☕", tags: ["coffee", "food", "morning person", "work"] },
  { id: "prod_003", title: "Wine & Cheese Gift Box", price: 49, description: "Curated red wine with aged cheeses", image: "🍷", tags: ["wine", "food", "entertaining", "client"] },
  { id: "prod_004", title: "Succulent Garden Kit", price: 32, description: "3 succulents with handmade ceramic pots", image: "🌱", tags: ["home", "plants", "universal", "low maintenance"] },
  { id: "prod_005", title: "Spa & Wellness Set", price: 44, description: "Bath salts, face mask, and essential oils", image: "🛁", tags: ["wellness", "self-care", "relaxation", "universal"] },
  { id: "prod_006", title: "Gourmet Chocolate Box", price: 28, description: "Assorted Belgian chocolates, 24 pieces", image: "🍫", tags: ["food", "sweet", "universal", "safe"] },
  { id: "prod_007", title: "Leather Journal & Pen Set", price: 42, description: "Handbound leather journal with gold pen", image: "📓", tags: ["professional", "writing", "business", "executive"] },
  { id: "prod_008", title: "Craft Beer Sampler", price: 46, description: "12 craft beers from local breweries", image: "🍺", tags: ["beer", "food", "casual", "fun"] },
];

async function getEmailSignals(accessToken: string, contactName: string): Promise<string> {
  try {
    const firstName = contactName.split(" ")[0];
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${firstName}&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!data.messages?.length) return "No email history found.";

    // Get first message snippet
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=metadata`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msg = await msgRes.json();
    return msg.snippet || "No signals found.";
  } catch {
    return "Could not retrieve email signals.";
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("tom_session")?.value;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { contactName, occasion, budget = 50 } = await req.json();

    // Get user tokens
    const { data: user } = await supabase
      .from("tom_users")
      .select("access_token, name")
      .eq("id", userId)
      .single();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Get email signals
    const emailSignals = await getEmailSignals(user.access_token, contactName);

    // Ask Claude to pick the best gift
    const prompt = `You are Humble Hello, an AI life assistant helping pick the perfect birthday gift.

Contact: ${contactName}
Occasion: ${occasion}
Budget: under $${budget}
Email signals from past conversations: ${emailSignals}

Available gifts:
${JSON.stringify(MOCK_BIRTHDAY_PRODUCTS.filter(p => p.price <= budget), null, 2)}

Your job:
1. Analyze the email signals for any personal interests, hobbies, dietary preferences, or lifestyle clues
2. Score each product for this specific person
3. Pick the single best gift
4. Explain your reasoning in 1-2 sentences (mention any signals you picked up)
5. Set confidence: "high" if you found clear signals, "medium" if moderate, "low" if no signals

Return ONLY valid JSON in this format:
{
  "selected": { product object },
  "reasoning": "why you picked this",
  "confidence": "high" | "medium" | "low",
  "signals_found": ["list of signals you detected"],
  "alternatives": [ up to 2 other product objects as backups ]
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || "{}";
    const result = JSON.parse(raw);

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to select gift" }, { status: 500 });
  }
}