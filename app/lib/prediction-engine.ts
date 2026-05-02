import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Types ────────────────────────────────────────────────────────────────────
type Signal = {
  type: "calendar" | "gmail" | "contact" | "inventory" | "life_event";
  data: any;
};

type DetectedEvent = {
  user_id: string;
  event_type: string;
  title: string;
  description: string;
  urgency: "high" | "medium" | "low";
  source: string;
  source_ref?: string;
};

type PendingAction = {
  user_id: string;
  event_id: string;
  action_type: string;
  title: string;
  description: string;
  draft_content?: string;
  auto_execute: boolean;
};

// ── Need score calculator ────────────────────────────────────────────────────
// Need score = urgency × stakes × preparation_gap
// Higher score = Humble Hello acts more aggressively
function calculateNeedScore(
  urgencyHours: number,      // hours until event
  stakesScore: number,       // 1-10 how important
  preparationGap: number     // 0-1 how unprepared
): number {
  const urgency = urgencyHours <= 2 ? 10
    : urgencyHours <= 24 ? 8
    : urgencyHours <= 48 ? 6
    : urgencyHours <= 72 ? 4
    : urgencyHours <= 168 ? 2 : 1;

  return urgency * stakesScore * preparationGap;
}

// ── Stage 1: Collect signals ─────────────────────────────────────────────────
export async function collectSignals(userId: string): Promise<Signal[]> {
  const signals: Signal[] = [];

  // Get user profile and settings
  const { data: user } = await supabase
    .from("tom_users")
    .select("*")
    .eq("id", userId)
    .single();

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!user) return signals;

  // Get upcoming calendar events (next 72 hours)
  try {
    const { getValidAccessToken } = await import("./google");
    const accessToken = await getValidAccessToken(userId);

    const now = new Date();
    const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${in72h.toISOString()}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const calData = await calRes.json();
    const events = calData.items || [];

    events.forEach((event: any) => {
      signals.push({ type: "calendar", data: event });
    });
  } catch (e) {
    console.error("Calendar signal collection failed:", e);
  }

  // Get recent Gmail threads (last 7 days)
  try {
    const { getValidAccessToken } = await import("./google");
    const accessToken = await getValidAccessToken(userId);

    const gmailRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:7d",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const gmailData = await gmailRes.json();
    const messages = gmailData.messages || [];

    signals.push({ type: "gmail", data: { message_count: messages.length, messages: messages.slice(0, 20) } });
  } catch (e) {
    console.error("Gmail signal collection failed:", e);
  }

  // Get life events coming up in next 30 days
  const today = new Date();
  const in30days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const todayMMDD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const in30MMDD = `${String(in30days.getMonth() + 1).padStart(2, "0")}-${String(in30days.getDate()).padStart(2, "0")}`;

  const { data: lifeEvents } = await supabase
    .from("life_events")
    .select("*")
    .eq("user_id", userId);

  (lifeEvents || []).forEach(event => {
    const eventMMDD = event.event_date.slice(5); // MM-DD
    if (eventMMDD >= todayMMDD && eventMMDD <= in30MMDD) {
      signals.push({ type: "life_event", data: event });
    }
  });

  // Get recurring inventory due for reorder
  const { data: inventory } = await supabase
    .from("recurring_inventory")
    .select("*")
    .eq("user_id", userId)
    .lte("next_order_date", in30days.toISOString().split("T")[0]);

  (inventory || []).forEach(item => {
    signals.push({ type: "inventory", data: item });
  });

  return signals;
}

// ── Stage 2: Detect events ───────────────────────────────────────────────────
export async function detectEvents(
  userId: string,
  signals: Signal[]
): Promise<DetectedEvent[]> {
  const events: DetectedEvent[] = [];
  const now = new Date();

  // Detect calendar-based events
  const calendarSignals = signals.filter(s => s.type === "calendar");

  for (const signal of calendarSignals) {
    const event = signal.data;
    const eventStart = new Date(event.start?.dateTime || event.start?.date);
    const hoursUntil = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    const attendees = event.attendees || [];
    const isExternal = attendees.some((a: any) =>
      !a.email?.includes("gmail.com") && a.email !== event.organizer?.email
    );
    const title = event.summary || "Meeting";

    // External meetings need briefs
    if (isExternal && hoursUntil <= 48 && hoursUntil > 0) {
      const needScore = calculateNeedScore(hoursUntil, 8, 0.9);
      events.push({
        user_id: userId,
        event_type: "meeting_brief",
        title: `Meeting brief: ${title}`,
        description: `External meeting in ${Math.round(hoursUntil)} hours with ${attendees.length} attendees`,
        urgency: hoursUntil <= 4 ? "high" : hoursUntil <= 24 ? "medium" : "low",
        source: "calendar",
        source_ref: event.id,
      });
    }

    // Detect travel signals from calendar
    const travelKeywords = ["flight", "hotel", "trip", "travel", "conference", "offsite"];
    const isTravelEvent = travelKeywords.some(k =>
      title.toLowerCase().includes(k) ||
      (event.description || "").toLowerCase().includes(k)
    );

    if (isTravelEvent && hoursUntil <= 168 && hoursUntil > 0) {
      events.push({
        user_id: userId,
        event_type: "travel_prep",
        title: `Trip prep: ${title}`,
        description: `Travel detected in ${Math.round(hoursUntil / 24)} days — restaurant recommendations and prep needed`,
        urgency: hoursUntil <= 48 ? "high" : "medium",
        source: "calendar",
        source_ref: event.id,
      });
    }
  }

  // Detect life events needing action
  const lifeEventSignals = signals.filter(s => s.type === "life_event");

  for (const signal of lifeEventSignals) {
    const lifeEvent = signal.data;
    const eventDate = new Date(`${now.getFullYear()}-${lifeEvent.event_date.slice(5)}`);
    const daysUntil = Math.round((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const relationshipStakes: Record<string, number> = {
      family: 10,
      close_friend: 9,
      customer: 7,
      colleague: 5,
      contact: 3,
    };
    const stakes = relationshipStakes[lifeEvent.relationship_type] || 5;
    const needScore = calculateNeedScore(daysUntil * 24, stakes, 0.9);

    if (daysUntil <= 14 && daysUntil >= 0) {
      events.push({
        user_id: userId,
        event_type: "life_event_action",
        title: `${lifeEvent.event_type} — ${lifeEvent.contact_name}`,
        description: `${lifeEvent.event_type} for ${lifeEvent.contact_name} in ${daysUntil} days · ${lifeEvent.relationship_type}`,
        urgency: daysUntil <= 3 ? "high" : daysUntil <= 7 ? "medium" : "low",
        source: "life_events",
        source_ref: lifeEvent.id,
      });
    }
  }

  // Detect inventory needing reorder
  const inventorySignals = signals.filter(s => s.type === "inventory");

  for (const signal of inventorySignals) {
    const item = signal.data;
    const daysUntil = item.next_order_date
      ? Math.round((new Date(item.next_order_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    events.push({
      user_id: userId,
      event_type: "inventory_reorder",
      title: `Reorder: ${item.item_name}`,
      description: `${item.item_name} is due for reorder${daysUntil > 0 ? ` in ${daysUntil} days` : " now"}`,
      urgency: daysUntil <= 0 ? "high" : daysUntil <= 7 ? "medium" : "low",
      source: "inventory",
      source_ref: item.id,
    });
  }

  return events;
}

// ── Stage 3: Prepare actions ─────────────────────────────────────────────────
export async function prepareActions(
  userId: string,
  events: DetectedEvent[],
  savedEventIds: Record<string, string>
): Promise<PendingAction[]> {
  const actions: PendingAction[] = [];

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  const autoThreshold = settings?.auto_order_threshold || 10;
  const approvalThreshold = settings?.approval_threshold || 50;

  for (const event of events) {
    const eventId = savedEventIds[event.source_ref || event.title];
    if (!eventId) continue;

    if (event.event_type === "meeting_brief") {
      // Prepare meeting brief via Claude
      const brief = await generateMeetingBrief(userId, event);
      actions.push({
        user_id: userId,
        event_id: eventId,
        action_type: "meeting_brief",
        title: event.title,
        description: "Meeting brief prepared — review before your call",
        draft_content: brief,
        auto_execute: false,
      });
    }

    if (event.event_type === "life_event_action") {
      // Prepare card/gift based on relationship type
      const action = await prepareLifeEventAction(userId, event, autoThreshold);
      if (action) {
        actions.push({ ...action, user_id: userId, event_id: eventId });
      }
    }

    if (event.event_type === "travel_prep") {
      // Prepare restaurant recommendations
      const recs = await prepareTravelRecs(event);
      actions.push({
        user_id: userId,
        event_id: eventId,
        action_type: "travel_recommendations",
        title: event.title,
        description: "Restaurant recommendations for your trip",
        draft_content: recs,
        auto_execute: false,
      });
    }

    if (event.event_type === "inventory_reorder") {
      actions.push({
        user_id: userId,
        event_id: eventId,
        action_type: "inventory_reorder",
        title: event.title,
        description: event.description,
        draft_content: JSON.stringify({ item: event.source_ref }),
        auto_execute: true, // Auto-execute inventory reorders
      });
    }
  }

  return actions;
}

// ── Stage 4: Route actions ───────────────────────────────────────────────────
export async function routeActions(
  userId: string,
  actions: PendingAction[]
): Promise<void> {
  for (const action of actions) {
    if (action.auto_execute) {
      // Execute automatically
      await supabase.from("pending_actions").insert({
        ...action,
        status: "auto_executed",
        executed_at: new Date().toISOString(),
      });
      console.log(`Auto-executed: ${action.title}`);
    } else {
      // Queue for user approval
      await supabase.from("pending_actions").insert({
        ...action,
        status: "pending",
      });
      console.log(`Queued for approval: ${action.title}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function generateMeetingBrief(userId: string, event: DetectedEvent): Promise<string> {
  try {
    const { getValidAccessToken } = await import("./google");
    const accessToken = await getValidAccessToken(userId);

    // Get Gmail history for context
    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(event.title)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const gmailData = await gmailRes.json();
    const emailHistory = gmailData.messages?.length
      ? `Found ${gmailData.messages.length} related emails`
      : "No prior email history found";

    // Web search for context
    let webContext = "";
    try {
      const searchRes = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(event.title + " company news 2026")}&count=3`,
        { headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_KEY || "" } }
      );
      const searchData = await searchRes.json();
      webContext = searchData.web?.results?.slice(0, 2)
        .map((r: any) => `${r.title}: ${r.description}`)
        .join("\n") || "";
    } catch (e) {
      // Web search optional
    }

    // Generate brief via Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Generate a concise meeting brief for: ${event.title}
          
Email history: ${emailHistory}
Web context: ${webContext}

Format as:
**[Meeting title]**
[1-2 sentence context]

**Walk in knowing:** [2-3 bullet points]
**Start the conversation with:** [One icebreaker based on recent news or context]
**Open threads:** [Any unresolved items if known]

Keep it under 150 words. Be specific and actionable.`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    return claudeData.content?.[0]?.text || "Brief generation failed";
  } catch (e) {
    console.error("Meeting brief generation failed:", e);
    return "Brief unavailable — check back before your meeting";
  }
}

async function prepareLifeEventAction(
  userId: string,
  event: DetectedEvent,
  autoThreshold: number
): Promise<Omit<PendingAction, "user_id" | "event_id"> | null> {
  const { data: lifeEvent } = await supabase
    .from("life_events")
    .select("*")
    .eq("id", event.source_ref)
    .single();

  if (!lifeEvent) return null;

  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("gift_style")
    .eq("user_id", userId)
    .single();

  // Generate personal note via Claude
  const noteRes = await fetch("https://api.anthropic.com/v1/messages", {
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
        content: `Write a warm, personal card message for ${lifeEvent.contact_name} for their ${lifeEvent.event_type}.
Relationship: ${lifeEvent.relationship_type}
Notes: ${lifeEvent.notes || "None"}
Keep it genuine, warm, and under 50 words. No generic phrases.`,
      }],
    }),
  });

  const noteData = await noteRes.json();
  const cardNote = noteData.content?.[0]?.text || `Thinking of you on your ${lifeEvent.event_type}!`;

  const isAutoExecute = ["contact", "colleague"].includes(lifeEvent.relationship_type);

  return {
    action_type: "send_card",
    title: `Send card to ${lifeEvent.contact_name}`,
    description: `${lifeEvent.event_type} card for ${lifeEvent.contact_name} · ${lifeEvent.relationship_type}`,
    draft_content: JSON.stringify({
      recipient: lifeEvent.contact_name,
      event_type: lifeEvent.event_type,
      message: cardNote,
      relationship: lifeEvent.relationship_type,
    }),
    auto_execute: isAutoExecute,
  };
}

async function prepareTravelRecs(event: DetectedEvent): Promise<string> {
  try {
    // Extract destination from event title
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Based on this travel event: "${event.title} - ${event.description}"

Suggest 3 trending restaurants for this trip. Format as:
1. **[Restaurant name]** — [cuisine type] — [one sentence why it's great]
2. **[Restaurant name]** — [cuisine type] — [one sentence why it's great]  
3. **[Restaurant name]** — [cuisine type] — [one sentence why it's great]

Reply: "Want me to make a reservation at any of these? Just reply with the number or say 'show me something less expensive'."`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    return claudeData.content?.[0]?.text || "Restaurant recommendations unavailable";
  } catch (e) {
    return "Restaurant recommendations unavailable";
  }
}

// ── Main engine entry point ──────────────────────────────────────────────────
export async function runPredictionEngine(userId: string): Promise<{
  eventsDetected: number;
  actionsQueued: number;
  actionsAutoExecuted: number;
}> {
  console.log(`Running prediction engine for user ${userId}`);

  try {
    // Stage 1: Collect signals
    const signals = await collectSignals(userId);
    console.log(`Collected ${signals.length} signals`);

    // Stage 2: Detect events
    const events = await detectEvents(userId, signals);
    console.log(`Detected ${events.length} events`);

    if (events.length === 0) {
      return { eventsDetected: 0, actionsQueued: 0, actionsAutoExecuted: 0 };
    }

    // Check for duplicate events (already detected in last 24 hours)
    const { data: recentEvents } = await supabase
      .from("detected_events")
      .select("source_ref, event_type")
      .eq("user_id", userId)
      .gte("detected_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const recentKeys = new Set(
      (recentEvents || []).map(e => `${e.event_type}_${e.source_ref}`)
    );

    // Filter out duplicates
    const newEvents = events.filter(e =>
      !recentKeys.has(`${e.event_type}_${e.source_ref}`)
    );

    if (newEvents.length === 0) {
      console.log("No new events detected");
      return { eventsDetected: 0, actionsQueued: 0, actionsAutoExecuted: 0 };
    }

    // Save detected events and get their IDs
    const savedEventIds: Record<string, string> = {};
    for (const event of newEvents) {
      const { data: saved } = await supabase
        .from("detected_events")
        .insert(event)
        .select("id")
        .single();
      if (saved) {
        savedEventIds[event.source_ref || event.title] = saved.id;
      }
    }

    // Stage 3: Prepare actions
    const actions = await prepareActions(userId, newEvents, savedEventIds);
    console.log(`Prepared ${actions.length} actions`);

    // Stage 4: Route actions
    await routeActions(userId, actions);

    const autoExecuted = actions.filter(a => a.auto_execute).length;
    const queued = actions.filter(a => !a.auto_execute).length;

    return {
      eventsDetected: newEvents.length,
      actionsQueued: queued,
      actionsAutoExecuted: autoExecuted,
    };
  } catch (e) {
    console.error("Prediction engine error:", e);
    return { eventsDetected: 0, actionsQueued: 0, actionsAutoExecuted: 0 };
  }
}