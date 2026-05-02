import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// TODO: Remove hardcoded sports teams — make dynamic based on user's city
function classifyCalendarEvent(title: string, description: string = "", location: string = ""): {
  type: string;
  intimacy: number;
} {
  const t = title.toLowerCase();
  const d = description.toLowerCase();
  const l = location.toLowerCase();
  const all = `${t} ${d} ${l}`;

  if (/dinner|cookout|bbq|barbecue|birthday party|holiday|thanksgiving|christmas|new year|easter|halloween|baby shower|wedding|graduation|anniversary party|housewarming/.test(all)) {
    return { type: "personal_event", intimacy: 30 };
  }
  if (/game|concert|golf|drinks|happy hour|bar|brewery|winery|tailgate|watch party/.test(all)) {
    return { type: "social_outing", intimacy: 25 };
  }
  if (/dinner|lunch|breakfast|brunch|restaurant|cafe|coffee(?! call| meeting)/.test(all)) {
    return { type: "meal", intimacy: 18 };
  }
  if (/coffee|catch up|catch-up|1:1|one on one|one-on-one/.test(all)) {
    return { type: "coffee_meeting", intimacy: 12 };
  }
  if (/networking|mixer|conference|summit|expo|seminar|workshop|panel/.test(all)) {
    return { type: "networking", intimacy: 8 };
  }
  if (/call|zoom|teams|meet|interview|presentation|review|standup|sync|check.in/.test(all)) {
    return { type: "professional", intimacy: 2 };
  }
  return { type: "unknown", intimacy: 5 };
}

// ── Layer 1: Gmail DNA ───────────────────────────────────────────────────────
async function getGmailProfile(accessToken: string, email: string): Promise<{
  emailCount: number;
  sentCount: number;
  receivedCount: number;
  initiationBalance: number;
  recentEmails: any[];
  firstEmailDate: string | null;
  hasWeekendEmails: boolean;
  hasEveningEmails: boolean;
  emailsPerMonth: number;
  relationshipAgeMonths: number;
}> {
  try {
    const [receivedRes, sentRes] = await Promise.all([
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=from:${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=to:${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const [receivedData, sentData] = await Promise.all([
      receivedRes.json(),
      sentRes.json(),
    ]);

    const receivedMessages = receivedData.messages || [];
    const sentMessages = sentData.messages || [];
    const totalEmails = receivedMessages.length + sentMessages.length;

    const recentEmails: any[] = [];
    let hasWeekendEmails = false;
    let hasEveningEmails = false;
    let firstEmailDate: string | null = null;
    let oldestDate: Date | null = null;

    for (const msg of receivedMessages.slice(0, 5)) {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const detail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
        const date = headers.find((h: any) => h.name === "Date")?.value || "";
        const snippet = detail.snippet || "";

        const emailDate = new Date(date);
        const hour = emailDate.getHours();
        const day = emailDate.getDay();

        if (day === 0 || day === 6) hasWeekendEmails = true;
        if (hour < 8 || hour > 18) hasEveningEmails = true;

        recentEmails.push({ subject, date, snippet });

        if (!oldestDate || emailDate < oldestDate) {
          oldestDate = emailDate;
          firstEmailDate = date;
        }
      } catch (e) {}
    }

    // Calculate relationship age and frequency
    const relationshipAgeMonths = oldestDate
      ? Math.max(1, Math.floor((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : 1;
    const emailsPerMonth = totalEmails / relationshipAgeMonths;

    return {
      emailCount: totalEmails,
      sentCount: sentMessages.length,
      receivedCount: receivedMessages.length,
      initiationBalance: sentMessages.length - receivedMessages.length,
      recentEmails,
      firstEmailDate,
      hasWeekendEmails,
      hasEveningEmails,
      emailsPerMonth: Math.round(emailsPerMonth * 10) / 10,
      relationshipAgeMonths,
    };
  } catch (e) {
    return {
      emailCount: 0, sentCount: 0, receivedCount: 0,
      initiationBalance: 0, recentEmails: [], firstEmailDate: null,
      hasWeekendEmails: false, hasEveningEmails: false,
      emailsPerMonth: 0, relationshipAgeMonths: 0,
    };
  }
}

// ── Layer 2: Calendar Intelligence ──────────────────────────────────────────
async function getCalendarProfile(accessToken: string, email: string): Promise<{
  sharedEvents: any[];
  totalEvents: number;
  calendarIntimacyScore: number;
  eventTypes: string[];
  hasPersonalEvents: boolean;
  hasSocialEvents: boolean;
  organizerBalance: number;
}> {
  try {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${twoYearsAgo}&timeMax=${now}&singleEvents=true&orderBy=startTime&maxResults=500&q=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const calData = await calRes.json();
    const allEvents = calData.items || [];

    const sharedEvents = allEvents.filter((event: any) => {
      const attendees = event.attendees || [];
      return attendees.some((a: any) => a.email?.toLowerCase() === email.toLowerCase());
    });

    let totalIntimacy = 0;
    const eventTypes: string[] = [];
    let hasPersonalEvents = false;
    let hasSocialEvents = false;
    let userOrganized = 0;
    let theyOrganized = 0;

    const processedEvents = sharedEvents.map((event: any) => {
      const { type, intimacy } = classifyCalendarEvent(
        event.summary || "",
        event.description || "",
        event.location || ""
      );
      totalIntimacy += intimacy;
      eventTypes.push(type);
      if (type === "personal_event") hasPersonalEvents = true;
      if (type === "social_outing") hasSocialEvents = true;
      const organizer = event.organizer?.email || "";
      if (organizer.toLowerCase() === email.toLowerCase()) theyOrganized++;
      else userOrganized++;
      return {
        title: event.summary,
        date: event.start?.dateTime || event.start?.date,
        type, intimacy, location: event.location,
      };
    });

    return {
      sharedEvents: processedEvents.slice(0, 20),
      totalEvents: sharedEvents.length,
      calendarIntimacyScore: Math.min(totalIntimacy, 100),
      eventTypes: [...new Set(eventTypes)],
      hasPersonalEvents, hasSocialEvents,
      organizerBalance: userOrganized - theyOrganized,
    };
  } catch (e) {
    return {
      sharedEvents: [], totalEvents: 0, calendarIntimacyScore: 0,
      eventTypes: [], hasPersonalEvents: false, hasSocialEvents: false,
      organizerBalance: 0,
    };
  }
}

// ── Layer 3: Contact Card Depth ──────────────────────────────────────────────
function getDepthProfile(contact: any): {
  depthScore: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;

  if (contact.home_address) { score += 8; signals.push("has home address"); }
  if (contact.phone) { score += 6; signals.push("has phone number"); }
  if (contact.birthday) { score += 5; signals.push("birthday known"); }
  if (contact.notes) { score += 4; signals.push("has personal notes"); }
  if (contact.company) { score += 2; signals.push(`works at ${contact.company}`); }
  if (contact.job_title) { score += 1; signals.push(`title: ${contact.job_title}`); }

  const email = contact.email || "";
  const domain = email.split("@")[1] || "";
  const personalDomains = ["gmail.com", "yahoo.com", "hotmail.com", "icloud.com", "me.com", "outlook.com"];
  if (personalDomains.includes(domain)) {
    score += 3;
    signals.push("personal email domain");
  }

  return { depthScore: Math.min(score, 25), signals };
}

// ── Layer 4: Network Graph ───────────────────────────────────────────────────
async function getNetworkProfile(accessToken: string, email: string): Promise<{
  sharedThreads: number;
  isConnector: boolean;
}> {
  try {
    const ccRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=cc:${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const ccData = await ccRes.json();
    const ccCount = (ccData.messages || []).length;
    return { sharedThreads: ccCount, isConnector: ccCount > 5 };
  } catch (e) {
    return { sharedThreads: 0, isConnector: false };
  }
}

// ── Layer 5: Journal Intelligence ────────────────────────────────────────────
async function getJournalProfile(userId: string, contactName: string): Promise<{
  hasJournalMention: boolean;
  journalRelationshipType: string | null;
  journalConfidence: number;
  journalContext: string | null;
  wantsToReconnect: boolean;
}> {
  try {
    // Check journal_signals on the contact directly
    const { data: contact } = await supabase
      .from("tom_contacts")
      .select("journal_signals")
      .eq("user_id", userId)
      .ilike("full_name", contactName)
      .maybeSingle();

    const signals = contact?.journal_signals || [];
    if (signals.length === 0) {
      return {
        hasJournalMention: false,
        journalRelationshipType: null,
        journalConfidence: 0,
        journalContext: null,
        wantsToReconnect: false,
      };
    }

    // Get the most recent high-confidence signal
    const sorted = [...signals].sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const best = sorted.find((s: any) => s.confidence >= 60) || sorted[0];

    return {
      hasJournalMention: true,
      journalRelationshipType: best.relationship_type || null,
      journalConfidence: best.confidence || 0,
      journalContext: best.notes || best.how_they_met || null,
      wantsToReconnect: best.wants_to_reconnect || false,
    };
  } catch (e) {
    return {
      hasJournalMention: false,
      journalRelationshipType: null,
      journalConfidence: 0,
      journalContext: null,
      wantsToReconnect: false,
    };
  }
}

// ── Layer 6: Claude Synthesis ────────────────────────────────────────────────
async function synthesizeWithClaude(
  contact: any,
  gmailProfile: any,
  calendarProfile: any,
  depthProfile: any,
  networkProfile: any,
  journalProfile: any,
  userId: string
): Promise<any> {

  // TODO: Pull user's first_name from tom_users for personalized prompts
  const userName = "Tom";

  // Build journal override instruction
  const journalInstruction = journalProfile.hasJournalMention
    ? `
JOURNAL INTELLIGENCE (HIGHEST PRIORITY — OVERRIDES ALL OTHER SIGNALS):
- ${userName} has explicitly mentioned this person in a journal conversation
- Journal relationship type: ${journalProfile.journalRelationshipType}
- Journal confidence: ${journalProfile.journalConfidence}%
- Context: ${journalProfile.journalContext || "mentioned as important"}
- Wants to reconnect: ${journalProfile.wantsToReconnect ? "Yes" : "No"}
- INSTRUCTION: If journal confidence >= 60, you MUST use the journal relationship_type. Do not override with email inference.`
    : `JOURNAL INTELLIGENCE: No journal mentions found for this contact.`;

  // Guardrail instructions
  const guardrails = `
STRICT CLASSIFICATION RULES (must follow):
1. Only assign "family" if: personal calendar events exist OR weekend/evening emails exist AND the relationship pattern clearly indicates family. Never assign family based on email tone alone.
2. Only assign "close_friend" if: personal events OR social outings exist, OR journal explicitly says so.
3. If total email count < 5, classify as "acquaintance" unless journal says otherwise.
4. If confidence < 60, classify as "acquaintance".
5. "colleague" and "vendor" should only be assigned when there are ONLY professional signals and no personal ones.
6. Email frequency matters more than raw count — ${gmailProfile.emailsPerMonth} emails/month over ${gmailProfile.relationshipAgeMonths} months.`;

  const prompt = `You are analyzing the relationship between ${userName} and ${contact.full_name} (${contact.email}).

${journalInstruction}

GMAIL SIGNALS:
- Total emails exchanged: ${gmailProfile.emailCount}
- ${userName} sent: ${gmailProfile.sentCount}, received: ${gmailProfile.receivedCount}
- Email frequency: ${gmailProfile.emailsPerMonth} emails/month
- Relationship age: ${gmailProfile.relationshipAgeMonths} months
- Initiation balance: ${gmailProfile.initiationBalance > 0 ? `${userName} initiates more` : gmailProfile.initiationBalance < 0 ? "They initiate more" : "Balanced"}
- Weekend emails: ${gmailProfile.hasWeekendEmails ? "Yes - personal signal" : "No"}
- Evening emails: ${gmailProfile.hasEveningEmails ? "Yes - personal signal" : "No"}
- Recent email subjects/snippets: ${gmailProfile.recentEmails.map((e: any) => `"${e.subject}: ${e.snippet?.slice(0, 80)}"`).join(" | ") || "none"}

CALENDAR SIGNALS:
- Shared events: ${calendarProfile.totalEvents}
- Calendar intimacy score: ${calendarProfile.calendarIntimacyScore}/100
- Event types: ${calendarProfile.eventTypes.join(", ") || "none"}
- Personal events together: ${calendarProfile.hasPersonalEvents ? "Yes - strong personal signal" : "No"}
- Social outings together: ${calendarProfile.hasSocialEvents ? "Yes - personal signal" : "No"}
- Recent shared events: ${calendarProfile.sharedEvents.slice(0, 5).map((e: any) => `${e.title} (${e.type})`).join(", ") || "none"}

CONTACT DEPTH:
- Depth score: ${depthProfile.depthScore}/25
- Signals: ${depthProfile.signals.join(", ")}
- Company: ${contact.company || "unknown"}
- Job title: ${contact.job_title || "unknown"}

NETWORK:
- Shared CC threads: ${networkProfile.sharedThreads}
- Is connector: ${networkProfile.isConnector ? "Yes" : "No"}

${guardrails}

Based on ALL these signals (with journal taking highest priority), classify this relationship. Return ONLY valid JSON:
{
  "relationship_type": "family|close_friend|friend|customer|vendor|colleague|mentor|mentee|connector|acquaintance",
  "relationship_strength": 0-100,
  "relationship_health": "thriving|warm|cooling|cold|dormant",
  "communication_style": "formal|casual|mixed",
  "initiation_balance": -100 to 100,
  "topics": ["business", "personal", "social"],
  "key_context": "2-3 sentence summary of who this person is and the relationship",
  "best_channel": "text|email|call",
  "best_time": "weekday mornings|weekday afternoons|evenings|weekends|anytime",
  "next_action": "specific suggested action to strengthen this relationship",
  "confidence": 0-100,
  "reasoning": "brief explanation of classification",
  "journal_override_applied": true/false
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
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const claudeData = await claudeRes.json();
  const text = claudeData.content?.[0]?.text || "{}";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    return null;
  }
}

// ── Post-processing guardrails ────────────────────────────────────────────────
function applyGuardrails(
  classification: any,
  gmailProfile: any,
  calendarProfile: any,
  journalProfile: any
): any {
  const result = { ...classification };

  // HARD RULE: classifier can never set "colleague" automatically.
  // "Colleague" means "we work at the same company" — a fact we can't infer
  // from email/calendar signals alone. Must be set manually by the user.
  // If Claude picked colleague, demote to the next-best guess based on signals.
  if (result.relationship_type === "colleague") {
    // Pick replacement based on available signals
    if (journalProfile.hasJournalMention) {
      result.relationship_type = journalProfile.journalRelationshipType || "friend";
    } else if (calendarProfile.hasPersonalEvents || calendarProfile.hasSocialEvents) {
      result.relationship_type = "friend";
    } else if (gmailProfile.hasWeekendEmails || gmailProfile.hasEveningEmails) {
      result.relationship_type = "friend";
    } else if (gmailProfile.emailCount >= 10) {
      // Heavy professional email — most likely a vendor or customer, default to acquaintance
      // since we can't tell which direction the money flows
      result.relationship_type = "acquaintance";
    } else {
      result.relationship_type = "acquaintance";
    }
    result.reasoning = (result.reasoning || "") + " (rejected 'colleague' — reserved for manual assignment only)";
  }

  // Journal always wins if confidence >= 60
  if (journalProfile.hasJournalMention && journalProfile.journalConfidence >= 60) {
    result.relationship_type = journalProfile.journalRelationshipType;
    result.confidence = Math.max(result.confidence, journalProfile.journalConfidence);
    result.journal_override_applied = true;
    return result;
  }

  // Not enough emails — force acquaintance
  if (gmailProfile.emailCount < 5 && !journalProfile.hasJournalMention) {
    result.relationship_type = "acquaintance";
    result.confidence = Math.min(result.confidence, 40);
    return result;
  }

  // Low confidence — force acquaintance
  if (result.confidence < 60 && !journalProfile.hasJournalMention) {
    result.relationship_type = "acquaintance";
    return result;
  }

  // Family/close_friend require strong evidence
  if (result.relationship_type === "family" || result.relationship_type === "close_friend") {
    const hasStrongEvidence =
      calendarProfile.hasPersonalEvents ||
      calendarProfile.hasSocialEvents ||
      gmailProfile.hasWeekendEmails ||
      journalProfile.hasJournalMention;

    if (!hasStrongEvidence) {
      result.relationship_type = "friend";
      result.reasoning += " (downgraded from family/close_friend — insufficient personal evidence)";
    }
  }

  return result;
}

// ── Calculate final relationship score ───────────────────────────────────────
function calculateFinalScore(
  classification: any,
  gmailProfile: any,
  calendarProfile: any,
  depthProfile: any,
  journalProfile: any,
): number {
  let score = 0;

  // Type weight (25 pts) — colleagues and vendors capped low
  const typeScores: Record<string, number> = {
    family: 25, close_friend: 23, friend: 20, mentor: 20, mentee: 18,
    customer: 16, connector: 15, colleague: 8, vendor: 4, acquaintance: 3,
  };
  score += typeScores[classification.relationship_type] || 5;

  // Health weight (25 pts)
  const healthScores: Record<string, number> = {
    thriving: 5, warm: 25, cooling: 20, cold: 12, dormant: 3,
  };
  score += healthScores[classification.relationship_health] || 10;

  // Depth (15 pts)
  score += Math.round(depthProfile.depthScore * 0.6);

  // Calendar intimacy (15 pts)
  score += Math.min(Math.round(calendarProfile.calendarIntimacyScore * 0.15), 15);

  // Personal signals (10 pts)
  if (calendarProfile.hasPersonalEvents) score += 5;
  if (calendarProfile.hasSocialEvents) score += 3;
  if (gmailProfile.hasWeekendEmails) score += 2;

  // Email frequency bonus (5 pts) — frequent contact scores higher
  if (gmailProfile.emailsPerMonth >= 4) score += 5;
  else if (gmailProfile.emailsPerMonth >= 2) score += 3;
  else if (gmailProfile.emailsPerMonth >= 1) score += 1;

  // Journal mention bonus (5 pts)
  if (journalProfile.hasJournalMention) score += 5;
  if (journalProfile.wantsToReconnect) score += 3;

  // Recency modifier
  const lastEmailed = gmailProfile.recentEmails[0]?.date;
  if (lastEmailed) {
    const daysSince = Math.floor((Date.now() - new Date(lastEmailed).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 3) score -= 15;
    else if (daysSince <= 7) score -= 8;
    else if (daysSince >= 30 && daysSince <= 90) score += 5;
  }

  // Hard cap colleagues and vendors
  if (classification.relationship_type === "colleague") score = Math.min(score, 35);
  if (classification.relationship_type === "vendor") score = Math.min(score, 20);

  return Math.max(0, Math.min(100, score));
}

// ── Main classifier function ─────────────────────────────────────────────────
export async function classifyRelationship(
  userId: string,
  contactId: string,
  accessToken: string
): Promise<any> {
  const { data: contact } = await supabase
    .from("tom_contacts")
    .select("*")
    .eq("id", contactId)
    .eq("user_id", userId)
    .single();

  if (!contact?.email) return null;

  // Run all layers in parallel
  const [gmailProfile, calendarProfile, networkProfile, journalProfile] = await Promise.all([
    getGmailProfile(accessToken, contact.email),
    getCalendarProfile(accessToken, contact.email),
    getNetworkProfile(accessToken, contact.email),
    getJournalProfile(userId, contact.full_name),
  ]);

  const depthProfile = getDepthProfile(contact);

  // Claude synthesis
  let classification = await synthesizeWithClaude(
    contact, gmailProfile, calendarProfile, depthProfile, networkProfile, journalProfile, userId
  );

  if (!classification) return null;

  // Apply post-processing guardrails
  classification = applyGuardrails(classification, gmailProfile, calendarProfile, journalProfile);

  // Calculate final score
  const finalScore = calculateFinalScore(classification, gmailProfile, calendarProfile, depthProfile, journalProfile);

  // ── Promote-only bucket + relationship_type logic ──
  // Rule: we NEVER remove a bucket or relationship_type the user has set.
  // We can only ADD a new bucket/type the classifier suggests, and only if tier_override is NOT true.
  //
  // This protects manual classifications from being silently overwritten by the nightly classifier.

  const suggestedBuckets = (type: string): string[] => {
    if (["family", "close_friend", "friend"].includes(type)) return ["personal"];
    if (["customer"].includes(type)) return ["personal", "professional"];
    if (["vendor", "colleague", "mentor", "mentee", "connector"].includes(type)) return ["professional"];
    return [];
  };

  const existingBuckets: string[] = Array.isArray(contact.dunbar_bucket) ? contact.dunbar_bucket : [];
  const existingTypes: string[] = Array.isArray(contact.relationship_types) && contact.relationship_types.length > 0
    ? contact.relationship_types
    : (contact.relationship_type ? [contact.relationship_type] : []);

  // Merge (promote-only): existing + any new suggestions, deduplicated.
  // NEVER removes existing entries. NEVER writes an empty array.
  const mergedBuckets = [
    ...new Set([...existingBuckets, ...suggestedBuckets(classification.relationship_type)]),
  ];
  const mergedTypes = [
    ...new Set([...existingTypes, classification.relationship_type].filter(Boolean)),
  ];

  // Build update payload. Skip bucket/type writes entirely if:
  //   - tier_override is true (user locked their classifications)
  //   - OR the merge would produce an empty array (never wipe existing data)
  const updatePayload: any = {
    relationship_strength: finalScore,
    relationship_health: classification.relationship_health,
    communication_style: classification.communication_style,
    initiation_balance: classification.initiation_balance,
    topics: classification.topics,
    key_context: classification.key_context,
    best_channel: classification.best_channel,
    best_time: classification.best_time,
    relationship_context: classification.next_action,
    calendar_intimacy_score: calendarProfile.calendarIntimacyScore,
    shared_events: calendarProfile.sharedEvents,
    classifier_confidence: classification.confidence,
    last_classified_at: new Date().toISOString(),
  };

  // Primary relationship_type write — only if the contact doesn't already have one set.
  // Users who picked a type manually keep that type. Classifier can only fill in blanks.
  if (!contact.relationship_type) {
    updatePayload.relationship_type = classification.relationship_type;
  }

  if (!contact.tier_override) {
    // Only write arrays if merge produced something non-empty (never wipe to [])
    if (mergedBuckets.length > 0 && mergedBuckets.length >= existingBuckets.length) {
      updatePayload.dunbar_bucket = mergedBuckets;
    }
    if (mergedTypes.length > 0 && mergedTypes.length >= existingTypes.length) {
      updatePayload.relationship_types = mergedTypes;
    }
  }

  await supabase.from("tom_contacts").update(updatePayload).eq("id", contactId);

  return {
    contact_name: contact.full_name,
    ...classification,
    final_score: finalScore,
    calendar_intimacy: calendarProfile.calendarIntimacyScore,
    shared_events: calendarProfile.totalEvents,
  };
}

// ── Reset all classifications (fresh start) ───────────────────────────────────
export async function resetAllClassifications(userId: string): Promise<number> {
  const { error } = await supabase
    .from("tom_contacts")
    .update({
      relationship_type: null,
      relationship_strength: null,
      relationship_health: null,
      last_classified_at: null,
      classifier_confidence: null,
      key_context: null,
      relationship_context: null,
    })
    .eq("user_id", userId);

  if (error) throw error;

  // Get count separately
  const { count } = await supabase
    .from("tom_contacts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  return count || 0;
}
// ── Classify top contacts in batch ───────────────────────────────────────────
export async function classifyTopContacts(
  userId: string,
  accessToken: string,
  limit = 50
): Promise<any[]> {
  const { data: contacts } = await supabase
    .from("tom_contacts")
    .select("id, full_name, email, email_count, last_emailed_at")
    .eq("user_id", userId)
    .not("email", "is", null)
    .is("last_classified_at", null)
    .order("email_count", { ascending: false })
    .limit(limit);

  if (!contacts || contacts.length === 0) return [];

  const results = [];
  for (const contact of contacts) {
    try {
      const result = await classifyRelationship(userId, contact.id, accessToken);
      if (result) {
        results.push(result);
        console.log(`Classified: ${contact.full_name} → ${result.relationship_type} (${result.final_score})`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`Failed to classify ${contact.full_name}:`, e);
    }
  }

  return results;
}