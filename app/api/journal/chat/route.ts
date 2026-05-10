import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────
// Server-side name resolution
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract candidate person names from the user's latest message.
 * Looks for capitalized words following relationship cues, plus
 * standalone capitalized name patterns.
 */
function extractCandidateNames(text: string): string[] {
  if (!text) return [];

  const candidates = new Set<string>();

  // Pattern 1: relationship cues followed by capitalized words
  // "my wife Nicole", "my friend Gabe", "my best friend Marcus Johnson"
  const cuePattern = /\b(?:my|our|the)\s+(?:wife|husband|partner|spouse|mom|dad|mother|father|son|daughter|brother|sister|friend|best friend|buddy|co-?founder|business partner|mentor|boss|colleague|client|attorney|accountant|neighbor)s?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
  let match;
  while ((match = cuePattern.exec(text)) !== null) {
    candidates.add(match[1].trim());
  }

  // Pattern 2: explicit name introductions
  // "I know Sarah", "I met John Davis", "talking to Mike", "saw Gabe yesterday"
  const introPattern = /\b(?:know|met|saw|with|to|from|about|talking to|spoke with|called|texted|emailed|reached out to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  while ((match = introPattern.exec(text)) !== null) {
    candidates.add(match[1].trim());
  }

  // Pattern 3: standalone proper-noun pairs (likely full names)
  // "Marcus Johnson is brilliant", "Nicole Rector"
  const fullNamePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g;
  while ((match = fullNamePattern.exec(text)) !== null) {
    candidates.add(match[1].trim());
  }

  // Pattern 4: standalone single names (only if message is short/conversational)
  // "Gabe is great" — but skip if the word is sentence-initial or a common word
  if (text.length < 200) {
    const singleNamePattern = /(?<=\s|^)([A-Z][a-z]{2,})(?=\s|[.,!?]|$)/g;
    const commonWords = new Set([
      "I", "We", "They", "He", "She", "It", "That", "This", "Yes", "No",
      "Okay", "OK", "Sure", "Maybe", "Today", "Yesterday", "Tomorrow",
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
      "Christmas", "Easter", "Thanksgiving",
    ]);
    while ((match = singleNamePattern.exec(text)) !== null) {
      if (!commonWords.has(match[1])) {
        candidates.add(match[1].trim());
      }
    }
  }

  return Array.from(candidates);
}

/**
 * Look up candidate names against the user's contacts.
 * Returns matches with context, plus a list of names that didn't match anything.
 */
async function resolveContactNames(
  userId: string,
  candidateNames: string[]
): Promise<{
  matched: Array<{
    candidate: string;
    contact: any;
    confidence: "exact" | "first_name" | "fuzzy";
  }>;
  unmatched: string[];
}> {
  if (candidateNames.length === 0) {
    return { matched: [], unmatched: [] };
  }

  const matched: Array<{ candidate: string; contact: any; confidence: "exact" | "first_name" | "fuzzy" }> = [];
  const unmatched: string[] = [];

  for (const candidate of candidateNames) {
    const candidateTrim = candidate.trim();
    if (!candidateTrim) continue;

    // Try exact match first (full name)
    const { data: exactHits } = await supabase
      .from("tom_contacts")
      .select("id, full_name, relationship_type, relationship_tag, dunbar_tier, key_context, intelligence, tags, company, job_title")
      .eq("user_id", userId)
      .ilike("full_name", candidateTrim)
      .limit(3);

    if (exactHits && exactHits.length === 1) {
      matched.push({ candidate, contact: exactHits[0], confidence: "exact" });
      continue;
    }
    if (exactHits && exactHits.length > 1) {
      // Multiple exact matches — let the AI ask for clarification
      matched.push({ candidate, contact: exactHits[0], confidence: "fuzzy" });
      continue;
    }

    // No exact — try first-name match (where contact's first word matches the candidate)
    // e.g. user says "Gabe" → match "Gabe Peters", "Gabriel Sanchez"
    const { data: firstNameHits } = await supabase
      .from("tom_contacts")
      .select("id, full_name, relationship_type, relationship_tag, dunbar_tier, key_context, intelligence, tags, company, job_title, email_count")
      .eq("user_id", userId)
      .ilike("full_name", `${candidateTrim}%`)
      .order("email_count", { ascending: false, nullsFirst: false })
      .limit(5);

    if (firstNameHits && firstNameHits.length > 0) {
      // Prefer the contact with the most email_count (likely the one they actually mean)
      matched.push({
        candidate,
        contact: firstNameHits[0],
        confidence: firstNameHits.length === 1 ? "first_name" : "fuzzy",
      });
      continue;
    }

    // Try fuzzy substring match (less common but catches "Mike" → "Michael Smith")
    const { data: fuzzyHits } = await supabase
      .from("tom_contacts")
      .select("id, full_name, relationship_type, relationship_tag, dunbar_tier, key_context, intelligence, tags, company, job_title, email_count")
      .eq("user_id", userId)
      .ilike("full_name", `%${candidateTrim}%`)
      .order("email_count", { ascending: false, nullsFirst: false })
      .limit(3);

    if (fuzzyHits && fuzzyHits.length > 0) {
      matched.push({ candidate, contact: fuzzyHits[0], confidence: "fuzzy" });
      continue;
    }

    // No match anywhere
    unmatched.push(candidate);
  }

  return { matched, unmatched };
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

const ALL_THEMES = [
   "starting_5", "desert_island", "life_advice", "wedding_toast",
  "dream_dinner_party", "business_partner", "move_to_new_city",
  "crisis_call", "decade_friendship", "growth_circle",
  "underrated_relationships", "people_who_shaped_you",
  "reconnect_wishlist", "inner_circle_audit", "trust_ladder",
  "referral_network", "celebration_circle", "accountability_partners",
  "family_depth", "mentor_map","high_school_friends", "college_friends", "career_mentors",
  "close_friends_current", "lost_touch", "customers_turned_friends",
  "family_extended", "changed_your_life", "early_career",
  "local_community", "childhood_friends", "college_professors",
  "first_job_colleagues", "sports_teammates", "neighbors_past",
  "neighbors_current", "travel_connections", "industry_peers",
  "people_who_hired_you", "people_you_hired", "business_partners",
  "friendly_competitors", "church_community", "volunteer_connections",
  "people_you_admire_from_afar", "underrated_relationships",
  "people_who_believed_in_you", "people_you_want_to_know_better",
];
const THEME_PROMPTS: Record<string, string> = {
  starting_5: `Ask: "If you were putting together your starting 5 for a basketball team — the people you'd go to battle with — who makes the cut?" Then dig into each person: how they know them, what makes them trustworthy, what they're into.`,
  desert_island: `Ask: "If you were stranded on a desert island and could only bring 3 people from your network, who would you pick and why?" Dig into the relationships.`,
  life_advice: `Ask: "Who are the 2-3 people whose advice you trust most when things get hard — and why them specifically?"`,
  wedding_toast: `Ask: "If you were giving a wedding toast and had to name the people who've had the biggest impact on your life, who would you mention?"`,
  dream_dinner_party: `Ask: "You're hosting a dinner party — 6 people from your real life, no celebrities. Who's at the table and what makes them interesting?"`,
  business_partner: `Ask: "If you were starting a company tomorrow and could only bring one person from your network as a co-founder, who would it be and why?"`,
  move_to_new_city: `Ask: "If you had to move to a new city and could only bring the relationships you already have — who are the 3 people you'd make sure to stay close with?"`,
  crisis_call: `Ask: "Who are the people you'd call at 2am if something went really wrong? Walk me through each one."`,
  decade_friendship: `Ask: "Who have you known for 10+ years that you still feel genuinely close to? Tell me about them."`,
  growth_circle: `Ask: "Who in your life pushes you to grow — the people who challenge you or hold you to a higher standard?"`,
  underrated_relationships: `Ask: "Who's someone in your life that most people don't know about but has had a quiet but significant impact on you?"`,
  people_who_shaped_you: `Ask: "Outside of immediate family, who are 2-3 people who shaped who you are today?"`,
  reconnect_wishlist: `Ask: "Who are some people you've lost touch with that you genuinely miss or think about? No pressure — just names that come to mind."`,
  inner_circle_audit: `Ask: "Let's do a quick audit of your inner circle — who are the people you talk to most often, and who do you wish you talked to more?"`,
  trust_ladder: `Ask: "On a trust ladder — who sits at the very top? The people you'd trust with your biggest decisions or secrets?"`,
  referral_network: `Ask: "Who are the people in your network you'd most confidently introduce to others? The ones you'd stake your reputation on?"`,
  celebration_circle: `Ask: "When something great happens in your life, who are the first people you want to tell? Walk me through that list."`,
  accountability_partners: `Ask: "Who holds you accountable in your life — the people who call you out when you're slipping or push you to follow through?"`,
  family_depth: `Ask: "Let's talk about family — not just names but relationships. Who are you closest to and what do those relationships actually look like day to day?"`,
  mentor_map: `Ask: "Who are the mentors or guides in your life — people who've invested in you or opened doors? I'd love to understand those relationships."`,
};

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { messages, action, theme } = await req.json();

    const { data: user } = await supabase
      .from("tom_users")
      .select("first_name, full_name, city, state, industry, company")
      .eq("id", userId)
      .single();

    const userName = user?.first_name || user?.full_name?.split(" ")[0] || "there";
    const userCity = user?.city || "your city";
    const userCompany = user?.company || "your business";

    // ── Action: start ────────────────────────────────────────────────────────
    if (action === "start") {

      // Check for contacts with intelligence gaps first
      const { data: gapContacts } = await supabase
        .from("tom_contacts")
        .select("full_name, intelligence_gaps, intelligence, tags, relationship_type, dunbar_tier, email_count")
        .eq("user_id", userId)
        .not("intelligence_gaps", "is", null)
        .not("intelligence_gaps", "eq", "[]")
        .not("relationship_type", "is", null)
        .gte("email_count", 3)
        .in("dunbar_tier", [1, 2, 3])
        .order("dunbar_tier", { ascending: true })
        .order("email_count", { ascending: false })
        .limit(5);

      // Pick a gap to ask about
      let gapQuestion: string | null = null;
      let gapTheme = "contact_enrichment";
      let gapContactName = "";

      if (gapContacts && gapContacts.length > 0) {
        // Pick a random contact with gaps
        const gapContact = gapContacts[Math.floor(Math.random() * gapContacts.length)];
        const gaps = gapContact.intelligence_gaps || [];

        if (gaps.length > 0) {
          const gap = gaps[Math.floor(Math.random() * gaps.length)];
          gapContactName = gapContact.full_name;
          gapQuestion = gap.question?.replace(/\${contactName}/g, gapContact.full_name) || null;
          gapTheme = "contact_enrichment";
        }
      }

      // Use gap question only 30% of the time — let discovery themes dominate
      if (gapQuestion && Math.random() < 0.3) {
        return NextResponse.json({
          message: gapQuestion,
          theme: gapTheme,
          gap_contact: gapContactName,
          themes_remaining: ALL_THEMES.length,
        });
      }

      // No gaps — pick an unused theme
      const { data: usedThemesData } = await supabase
        .from("reflections")
        .select("theme")
        .eq("user_id", userId)
        .not("theme", "is", null);

      const usedThemes = (usedThemesData || []).map((r: any) => r.theme).filter(Boolean);
      const availableThemes = ALL_THEMES.filter(t => !usedThemes.includes(t));
      const themesToUse = availableThemes.length > 0 ? availableThemes : ALL_THEMES;
      const randomTheme = themesToUse[Math.floor(Math.random() * themesToUse.length)];

      const themePrompt = THEME_PROMPTS[randomTheme] || `Ask about people who have been important in ${userName}'s life.`;

      const questionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{
            role: "user",
            content: `Generate a warm, specific opening question for a relationship journal session.

User's name: ${userName}
Theme instruction: ${themePrompt}

Rules:
- Address them by first name naturally
- Make it feel like a curious, smart friend asking — not a survey
- Ask them to name specific people
- Keep it to 1-2 sentences max
- Be direct and interesting — not generic

Return ONLY the question text, nothing else.`,
          }],
        }),
      });

      const questionData = await questionRes.json();
      const question = questionData.content?.[0]?.text?.trim() ||
        `${userName}, if you were putting together your starting 5 — the people you'd go to battle with — who makes the cut?`;

      return NextResponse.json({
        message: question,
        theme: randomTheme,
        themes_used: usedThemes.length,
        themes_remaining: availableThemes.length,
      });
    }

    // ── Action: chat ─────────────────────────────────────────────────────────
    if (action === "chat") {
      const gapContact = messages?.[0]?.gap_contact || "";

      // ── Resolve names server-side ────────────────────────────────────────
      // Extract names from the latest user message, look them up in DB,
      // inject only the matched contacts (with rich context) into the prompt.
      const latestUserMessage = [...(messages || [])].reverse().find((m: any) => m.role === "user")?.content || "";
      const candidateNames = extractCandidateNames(latestUserMessage);
      const { matched, unmatched } = await resolveContactNames(userId, candidateNames);

      // Build contact context block for the prompt
      let contactContextBlock = "";
      if (matched.length > 0 || unmatched.length > 0) {
        const matchedLines = matched.map(m => {
          const c = m.contact;
          const tier = c.dunbar_tier ? `tier ${c.dunbar_tier}` : "no tier";
          const tag = c.relationship_tag || c.relationship_type || "no relationship type";
          const role = c.job_title && c.company ? ` — ${c.job_title} at ${c.company}` : c.company ? ` — at ${c.company}` : "";
          const ctx = c.key_context ? ` Key context: ${c.key_context}` : "";
          const conf = m.confidence === "exact" ? "" : m.confidence === "first_name" ? " [matched on first name only]" : " [fuzzy match — confirm with user]";
          return `  • "${m.candidate}" → ${c.full_name} (${tier}, ${tag})${role}.${ctx}${conf}`;
        }).join("\n");

        const unmatchedLines = unmatched.length > 0
          ? `\nNOT IN CONTACTS (mentioned but no match):\n${unmatched.map(n => `  • ${n}`).join("\n")}`
          : "";

        contactContextBlock = `\nNAME RESOLUTION (server-verified, authoritative):\n${matchedLines}${unmatchedLines}\n`;
      }

      const systemPrompt = `You are ${userName}'s personal relationship coach inside Humble Hello — a relationship OS that automatically updates contacts based on conversations.

${gapContact ? `IMPORTANT: The opening question was about "${gapContact}", already in ${userName}'s contacts. Keep focus there unless they redirect.` : ""}

User context:
- Name: ${userName}
- Location: ${userCity}  
- Company: ${userCompany}
${contactContextBlock}

CONTACT RESOLUTION RULES — this is critical:
- The NAME RESOLUTION block above is AUTHORITATIVE. It was generated server-side from ${userName}'s actual contact database.
- If a name appears in the matched list, that contact EXISTS — confirm naturally without doubt: "Got it, Gabe Peters." or "Yes, your wife Nicole — I'll update that."
- If a name appears with [fuzzy match], gently confirm: "Did you mean Gabe Peters? I have a few Gabes in your contacts."
- If a name appears in NOT IN CONTACTS, the person is new: "I don't see [Name] in your contacts yet — want me to add them?"
- If no NAME RESOLUTION block is present, no specific names were detected in this turn — proceed with the conversation normally.
- When ${userName} says "my wife/husband/partner [Name]" → relationship_type = family, relationship_tag = Wife/Husband/Partner, dunbar_tier = 1
- When ${userName} says "my best friend [Name]" → relationship_type = close_friend, relationship_tag = Best Friend, dunbar_tier = 2

CONVERSATION STYLE:
- Warm and genuinely curious — like a trusted friend
- Use ${userName}'s name occasionally
- Ask ONE follow-up question at a time — max 2 sentences
- Dig naturally for: pets (name/breed), family (spouse name, kids names/ages), sports teams, interests, how they met
- After 4+ exchanges, offer to save

CARD/GIFT SCHEDULING:
- If ${userName} wants to send a card or gift to someone, confirm the contact name and occasion first
- When confirmed, end your response with: QUEUE_CARD:{"contact_name":"Full Name","occasion":"occasion text","event_type":"new_baby|birthday|promotion|thinking_of_you|congratulations|thank_you|just_because"}
- Only include QUEUE_CARD after explicit confirmation
- For gifts say "Gifts coming soon — I'll queue a card for now instead"

Never invent information. Keep responses to 2 sentences max.`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          system: systemPrompt,
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        }),
      });

      const claudeData = await claudeRes.json();
      const rawReply = claudeData.content?.[0]?.text || "Tell me more about that.";
      
      // Check for QUEUE_CARD command
      const queueCardMatch = rawReply.match(/QUEUE_CARD:(\{[^}]+\})/);
      if (queueCardMatch) {
        const cleanReply = rawReply.replace(/QUEUE_CARD:\{[^}]+\}/, "").trim();
        try {
          const cardData = JSON.parse(queueCardMatch[1]);
          
          // Find the contact
          const { data: contact } = await supabase
            .from("tom_contacts")
            .select("id, full_name, home_address, work_address, relationship_type, key_context, relationship_tag")
            .eq("user_id", userId)
            .ilike("full_name", `%${cardData.contact_name}%`)
            .maybeSingle();

          if (contact) {
            // Draft card message
            const draftRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY!,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 300,
                messages: [{
                  role: "user",
                  content: `Write a warm handwritten card message for ${contact.full_name} for: ${cardData.occasion}.
Context: ${contact.key_context || "a valued contact"}
Relationship: ${contact.relationship_tag || contact.relationship_type || "friend"}
Rules: 2-4 sentences max, warm and genuine, no sign-off name, no emojis.
Return ONLY the card message.`,
                }],
              }),
            });
            const draftData = await draftRes.json();
            const cardMessage = draftData.content?.[0]?.text || `Thinking of you and wishing you all the best!`;

            // Queue in approvals
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            
            const { data: approval } = await supabase
              .from("card_approvals")
              .insert({
                user_id: userId,
                contact_id: contact.id,
                contact_name: contact.full_name,
                occasion: cardData.occasion,
                message: cardMessage,
                address: contact.home_address || null,
                work_address: contact.work_address || null,
                status: "pending",
                type: "card",
                trigger_type: "journal_request",
                expires_at: expiresAt.toISOString(),
                created_at: new Date().toISOString(),
              })
              .select()
              .single();

            return NextResponse.json({ 
              message: cleanReply,
              card_queued: true,
              contact_name: contact.full_name,
              approval_id: approval?.id,
            });
          }
        } catch (e) {
          console.error("QUEUE_CARD parse error:", e);
        }
      }

      // Check if AI flagged a missing contact
      const missingContactMatch = rawReply.match(/I don't see (.+?) in your contacts yet/i);
      if (missingContactMatch) {
        return NextResponse.json({ 
          message: rawReply,
          missing_contact: missingContactMatch[1].trim(),
        });
      }

      // Check if AI confirmed a contact match (e.g. "Gabe Peters?")
      const confirmationMatch = rawReply.match(/^([A-Z][a-z]+ [A-Z][a-z]+)\?/);
      if (confirmationMatch) {
        return NextResponse.json({
          message: rawReply,
          confirming_contact: confirmationMatch[1],
        });
      }

      return NextResponse.json({ message: rawReply });
    }

    // ── Action: extract ───────────────────────────────────────────────────────
    if (action === "extract") {
      const conversationText = messages
        .map((m: any) => `${m.role === "user" ? userName : "AI"}: ${m.content}`)
        .join("\n");

      const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [{
            role: "user",
            content: `Extract all relationship intelligence from this conversation between ${userName} and their AI relationship coach.

CONVERSATION:
${conversationText}

For every person mentioned by name, extract everything including personal life details.
Return ONLY a valid JSON object with no markdown or code fences:
{
  "contacts": [
    {
      "full_name": "First Last",
      "first_name": "First",
      "last_name": "Last",
      "relationship_type": "close_friend|friend|family|mentor|client|colleague|acquaintance|vendor",
      "relationship_tag": "REQUIRED — always set this. Specific human-readable tag e.g. Wife, Husband, Mom, Dad, Brother, Sister, Son, Daughter, Best Friend, Oldest Friend, Business Partner, Mentor, Co-Founder, Attorney, Accountant, Client, Investor, College Roommate. If close_friend use 'Close Friend', if friend use 'Friend', if family use the specific relation.",
      "dunbar_tier": 2,
      "bucket": "personal|business|prospects",
      "is_explicit_statement": true,
      "relationship_strength": 0,
      "how_they_met": "brief description",
      "current_status": "active|drifted|lost_touch|wants_to_reconnect",
      "key_context": "2-3 sentences about this person and their relationship",
      "topics": ["sports", "business", "family"],
      "company": "if mentioned",
      "job_title": "if mentioned",
      "city": "if mentioned",
      "phone": "if mentioned",
      "email": "if mentioned",
      "notes": "any specific memories or details",
      "wants_to_reconnect": false,
      "confidence": 0,
      "intelligence": {
        "pets": [{"type": "dog", "name": "Max", "breed": "golden retriever"}],
        "family": {"status": "married", "spouse": "Sarah", "kids": [{"name": "Emma", "age": 8}], "new_baby": null},
        "education": {"college": "Purdue", "year": null, "degree": null},
        "sports": {"teams": ["Colts"], "plays": ["golf"]},
        "interests": {"travel": ["Europe"], "cars": [], "books": [], "book_genres": []},
        "civic": {"clubs": [], "nonprofits": []},
        "politics": null,
        "life_events": []
      },
      "tags": [
        {"tag": "has_dog", "value": "golden retriever named Max", "confidence": 95, "source": "journal"},
        {"tag": "married", "value": "wife named Sarah", "confidence": 90, "source": "journal"}
      ]
    }
  ],
  "summary": "one paragraph summary of what was learned"
}

DUNBAR TIER RULES — always assign a tier, never leave null:
- Tier 1 (Core 5): spouse, partner, parent, child, best friend, co-founder — only if explicitly stated
- Tier 2 (Inner 15): close_friend, sibling, mentor, trusted business partner, oldest friend, grew up together, known a long time
- Tier 3 (Active 50): colleague, client, friend, good friend, advisor, went to school together
- Tier 4 (Network 150): acquaintance, vendor, someone they want to know better
- Default to Tier 3 if unsure

BUCKET RULES:
- personal: family, close friends, personal relationships, friend
- business: colleagues, clients, business partners, mentors, work
- prospects: people they want to build a relationship with

IS_EXPLICIT_STATEMENT RULES:
- true if ${userName} directly stated the relationship e.g. "my wife Nicole", "Gabe is my best friend", "my dad Tom"
- false if relationship was inferred from context

RELATIONSHIP TAG RULES:
- Be specific: not "family" but "Wife" or "Mom"
- Not "close_friend" but "Best Friend" or "College Roommate"
- Use title case

Only include real people ${userName} has a personal relationship with. Extract ALL personal details — pets, family, sports, interests, education.`,
          }],
        }),
      });

      const extractData = await extractRes.json();
      const rawText = extractData.content?.[0]?.text || "{}";
      const clean = rawText.replace(/```json|```/g, "").trim();

      let extracted: any;
      try {
        extracted = JSON.parse(clean);
      } catch {
        return NextResponse.json({ error: "Failed to parse extraction" }, { status: 500 });
      }

      // ── Extract user self-learning signals ─────────────────────────────────
      try {
        const userExtractRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 500,
            messages: [{
              role: "user",
              content: `Extract signals about ${userName} themselves (not their contacts) from this conversation.

CONVERSATION:
${conversationText}

Look for things ${userName} mentions about themselves:
- Personal interests, hobbies, passions
- Sports teams they follow or play
- Travel preferences or places they've been
- Books, music, food preferences
- Values and what matters to them
- Life events (marriage, kids, moves, career changes)
- Communication style signals

Return ONLY valid JSON, no markdown:
{
  "interests": ["golf", "travel", "entrepreneurship"],
  "sports_teams": ["Colts", "Pacers"],
  "values": ["loyalty", "family first"],
  "life_context": "brief note about anything significant learned",
  "nothing_found": false
}

If nothing meaningful was found about ${userName} themselves, return {"nothing_found": true}.`,
            }],
          }),
        });

        const userExtractData = await userExtractRes.json();
        const userRaw = userExtractData.content?.[0]?.text?.replace(/```json|```/g, "").trim() || "{}";
        const userSignals = JSON.parse(userRaw);

        if (!userSignals.nothing_found) {
          // Fetch current user interests to merge
          const { data: currentUser } = await supabase
            .from("tom_users")
            .select("interests, journal_context")
            .eq("id", userId)
            .single();

          const existingInterests: string[] = currentUser?.interests || [];
          const newInterests: string[] = userSignals.interests || [];
          const mergedInterests = [...new Set([...existingInterests, ...newInterests])];

          const existingContext = currentUser?.journal_context || "";
          const newContext = userSignals.life_context
            ? `${existingContext ? existingContext + " | " : ""}${userSignals.life_context}`
            : existingContext;

          await supabase
            .from("tom_users")
            .update({
              interests: mergedInterests,
              journal_context: newContext.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }
      } catch (e) {
        console.error("User self-learning extraction error:", e);
      }

      // Save conversation to reflections
      try {
        await supabase.from("reflections").insert({
          user_id: userId,
          question: messages[0]?.content || "Journal conversation",
          answer: conversationText,
          question_type: "conversation",
          theme: theme || null,
          created_at: new Date().toISOString(),
        });
      } catch (_) {}

      // After extracting, resolve each extracted contact against the DB using
      // the same server-side resolution logic as the chat handler. Contacts
      // that match get updated; contacts that don't match are flagged as new.
      const newContactsToCreate: any[] = [];

      if (extracted.contacts?.length > 0) {
        for (const contact of extracted.contacts) {
          if (!contact.full_name) continue;

          // Use the resolver to find this contact (handles first-name only,
          // fuzzy matches, and "Mike" → "Michael Smith" cases)
          const { matched } = await resolveContactNames(userId, [contact.full_name]);

          if (matched.length === 0) {
            // No match — collect for creation rather than silently losing
            newContactsToCreate.push(contact);
            continue;
          }

          // Re-fetch the matched contact with full fields (resolver returns a subset)
          const matchedId = matched[0].contact.id;
          const { data: dbContact } = await supabase
            .from("tom_contacts")
            .select("id, tags, intelligence, intelligence_gaps, full_name, relationship_type, relationship_tag, dunbar_tier")
            .eq("user_id", userId)
            .eq("id", matchedId)
            .maybeSingle();

          if (!dbContact) continue;

          // Merge tags
          const existingTags = dbContact.tags || [];
          const newTags = contact.tags || [];
          const mergedTags = [...existingTags];
          for (const t of newTags) {
            const idx = mergedTags.findIndex((e: any) => e.tag === t.tag);
            if (idx >= 0) { if (t.confidence > mergedTags[idx].confidence) mergedTags[idx] = t; }
            else mergedTags.push(t);
          }

          // Merge intelligence
          const existingIntel = dbContact.intelligence || {};
          const newIntel = contact.intelligence || {};
          const mergedIntel = mergeDeep(existingIntel, newIntel);

          // Clear gaps that were answered in this conversation
          const remainingGaps = (dbContact.intelligence_gaps || []).filter((gap: any) => {
            const field = gap.field || "";
            const conversationLower = conversationText.toLowerCase();
            const gapKeywords = field.split(".").join(" ").toLowerCase();
            return !conversationLower.includes(gapKeywords.split("_").join(" "));
          });

          // Build update — only overwrite relationship fields if explicitly stated by user
          const updates: any = {
            tags: mergedTags,
            intelligence: mergedIntel,
            intelligence_gaps: remainingGaps,
            intelligence_scan_at: new Date().toISOString(),
          };

          // Apply relationship type/tag/tier ONLY if user was explicit
          // ("my wife Nicole" = explicit; "I worked with Nicole" = inferred)
          if (contact.is_explicit_statement) {
            if (contact.relationship_type) updates.relationship_type = contact.relationship_type;
            if (contact.relationship_tag) updates.relationship_tag = contact.relationship_tag;
            if (contact.dunbar_tier) updates.dunbar_tier = contact.dunbar_tier;
          }

          await supabase
            .from("tom_contacts")
            .update(updates)
            .eq("id", dbContact.id)
            .eq("user_id", userId);
        }
      }

      return NextResponse.json({
        success: true,
        contacts: extracted.contacts || [],
        new_contacts: newContactsToCreate,        // Names that didn't match anything
        new_contact_count: newContactsToCreate.length,
        summary: extracted.summary || "",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  } catch (e: any) {
    console.error("Journal chat error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function mergeDeep(existing: any, incoming: any): any {
  if (!incoming) return existing;
  const result = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (incoming[key] === null || incoming[key] === undefined) continue;
    if (Array.isArray(incoming[key])) {
      if (!Array.isArray(result[key]) || result[key].length === 0) {
        result[key] = incoming[key];
      } else {
        const merged = [...result[key]];
        for (const item of incoming[key]) {
          if (typeof item === "string" && !merged.includes(item)) merged.push(item);
          else if (typeof item === "object") merged.push(item);
        }
        result[key] = merged;
      }
    } else if (typeof incoming[key] === "object" && !Array.isArray(incoming[key])) {
      result[key] = mergeDeep(result[key] || {}, incoming[key]);
    } else {
      if (!result[key]) result[key] = incoming[key];
    }
  }
  return result;
}