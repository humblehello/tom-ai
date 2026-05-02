import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Scoring weights ──────────────────────────────────────────────────────────
// Total max score = 100
// Recency:     40 pts  (how recently you interacted)
// Frequency:   30 pts  (how often you interact)
// Depth:       20 pts  (quality signals: address, phone, notes, birthday)
// Priority:    10 pts  (manual override bonus)

function recencyScore(lastInteractionAt: string | null, lastMeaningfulTouchAt: string | null): number {
  // Prefer last_meaningful_touch_at — it's a higher quality signal
  // (journal mentions, personal emails, cards sent, calendar 1:1s)
  // Fall back to last_emailed_at if no meaningful touch recorded
  const bestDate = lastMeaningfulTouchAt || lastInteractionAt;
  if (!bestDate) return 0;

  const daysSince = Math.floor(
    (Date.now() - new Date(bestDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Meaningful touch gets a 20% bonus over raw email interaction
  const bonus = lastMeaningfulTouchAt ? 1.2 : 1.0;

  let base = 0;
  if (daysSince <= 7) base = 5;
  else if (daysSince <= 14) base = 12;
  else if (daysSince <= 30) base = 20;
  else if (daysSince <= 60) base = 40;  // Sweet spot
  else if (daysSince <= 90) base = 35;  // Still warm
  else if (daysSince <= 180) base = 25; // Getting cold
  else if (daysSince <= 365) base = 10; // Cold
  else base = 2;                        // Very cold

  return Math.min(40, Math.round(base * bonus));
}

function frequencyScore(emailCount: number | null, email: string | null): number {
  const count = emailCount || 0;

  // Dampen work/vendor emails — these are transactional not relational
  const workDomains = ["thumbprint.com", "gmail.com"];
  const isWorkEmail = email ? workDomains.some(d => email.includes(d)) : false;
  const dampener = isWorkEmail ? 0.4 : 1.0;

  let score = 0;
  if (count >= 50) score = 15;
  else if (count >= 20) score = 12;
  else if (count >= 10) score = 9;
  else if (count >= 5) score = 6;
  else if (count >= 2) score = 3;
  else if (count >= 1) score = 1;

  return Math.round(score * dampener);
}

function depthScore(contact: any): number {
  let score = 0;
  if (contact.home_address) score += 8;
  if (contact.phone) score += 6;
  if (contact.birthday) score += 5;
  if (contact.notes) score += 4;
  if (contact.company || contact.job_title) score += 2;
  return Math.min(score, 25);
}

function priorityScore(contact: any): number {
  return contact.priority_override ? 10 : 0;
}

function calculateTier(score: number, lastInteractionAt: string | null): string {
  const daysSince = lastInteractionAt
    ? Math.floor((Date.now() - new Date(lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (score >= 60 && daysSince <= 60) return "A+";
  if (score >= 35 && daysSince <= 90) return "A";
  if (score >= 15 && daysSince <= 180) return "B";
  return "C";
}

// ── Transactional dampener ───────────────────────────────────────────────────
// High email frequency with a work contact should NOT push them to Inner 15
function isTransactional(contact: any): boolean {
  const type = contact.relationship_type || "";
  const transactionalTypes = ["vendor", "client", "colleague", "acquaintance"];
  if (transactionalTypes.includes(type)) return true;

  // If only work email, no personal contact info — likely transactional
  const hasPersonalSignals =
    contact.home_address ||
    contact.birthday ||
    (contact.phone && !contact.work_phone) ||
    contact.personal_email;

  if (!hasPersonalSignals && contact.email_count > 20) return true;

  return false;
}

// ── Frequency pattern — spike vs consistent ──────────────────────────────────
// Recent spike (active project) should not inflate tier
function consistencyBonus(contact: any): number {
  const recentCount = contact.recent_email_count || 0;  // last 30d
  const totalCount = contact.email_count || 0;
  if (totalCount === 0) return 0;
  // If >60% of all emails happened in last 30d — likely a project spike
  const spikeRatio = recentCount / totalCount;
  if (spikeRatio > 0.6 && totalCount > 10) return -10; // penalize spike
  return 0;
}

// ── Dunbar tier auto-assignment ──────────────────────────────────────────────
// Called after scoring — respects tier_override and journal classifications
function assignDunbarTier(contact: any, score: number): number | null {
  // Never touch manually locked tiers
  if (contact.tier_override === true) return contact.dunbar_tier;

  // Journal-classified contacts are locked
  if (contact.journal_classified === true && contact.relationship_override === true) {
    return contact.dunbar_tier;
  }
  // Never demote tiers 1, 2, or 3 — AI can only promote, never remove
  if (contact.dunbar_tier === 1 || contact.dunbar_tier === 2 || contact.dunbar_tier === 3) {
    return contact.dunbar_tier;
  }

   const transactional = isTransactional(contact);
  const type = contact.relationship_type || "";
  const lastTouch = contact.last_meaningful_touch_at || contact.last_emailed_at || contact.last_interaction_at;
  const daysSince = lastTouch
    ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Transactional contacts: cap at tier 3 (Active 50)
  if (transactional) {
    if (score >= 35 && daysSince <= 90) return 3;
    if (score >= 15 && daysSince <= 365) return 4;
    return null;
  }

  // Family always gets Inner 15 minimum
  if (type === "family") {
    return daysSince <= 30 ? 1 : 2;
  }

  // Close friends: Inner 15 if score high enough
  if (type === "close_friend") {
    if (score >= 60 && daysSince <= 60) return 2;
    if (score >= 35) return 2;
    return 3;
  }

  // Trusted colleagues: Active 50 max unless very strong signals
  if (type === "trusted_colleague" || type === "mentor") {
    if (score >= 65 && daysSince <= 30) return 2;
    if (score >= 40 && daysSince <= 90) return 3;
    return 4;
  }

  // General scoring thresholds
  if (score >= 75 && daysSince <= 30) return 2;  // Inner 15
  if (score >= 45 && daysSince <= 90) return 3;  // Active 50
  if (score >= 20 && daysSince <= 365) return 4; // Network 150
  return null; // unranked
}

// ── Score a single contact ───────────────────────────────────────────────────
export function scoreContact(contact: any): {
  score: number;
  tier: string;
  breakdown: { recency: number; frequency: number; depth: number; priority: number };
} {
  const recency = recencyScore(
    contact.last_emailed_at || contact.last_interaction_at,
    contact.last_meaningful_touch_at || null
  );
  const frequency = frequencyScore(contact.email_count || contact.interaction_count, contact.email);
  const depth = depthScore(contact);
  const priority = priorityScore(contact);
  const score = recency + frequency + depth + priority;
  const tier = calculateTier(score, contact.last_emailed_at || contact.last_interaction_at);

  return { score, tier, breakdown: { recency, frequency, depth, priority } };
}

// ── Score all contacts for a user ────────────────────────────────────────────
export async function scoreAllContacts(userId: string): Promise<{
  scored: number;
  tiers: { "A+": number; A: number; B: number; C: number };
  dunbar: { core5: number; inner15: number; active50: number; network150: number };
}> {
  const tiers = { "A+": 0, A: 0, B: 0, C: 0 };
  const dunbar = { core5: 0, inner15: 0, active50: 0, network150: 0 };
  let scored = 0;
  let offset = 0;
  const batchSize = 500;

  while (true) {
    const { data: contacts, error } = await supabase
      .from("tom_contacts")
      .select(
        `id, email, last_emailed_at, last_interaction_at, last_meaningful_touch_at,
         email_count, recent_email_count, interaction_count,
         home_address, phone, personal_email, work_phone, birthday, notes,
         company, job_title, gifting_eligible, priority_override,
         relationship_type, relationship_override, journal_classified,
         dunbar_tier, tier_override, dunbar_bucket, work_email,
         calendar_intimacy_score`
      )
      .eq("user_id", userId)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error("Error fetching contacts for scoring:", error);
      break;
    }

    if (!contacts || contacts.length === 0) break;

    const updates = contacts.map(contact => {
      const { score, tier } = scoreContact(contact);
      tiers[tier as keyof typeof tiers]++;

      // Auto-assign dunbar tier
      const newDunbarTier = assignDunbarTier(contact, score);

      if (newDunbarTier === 1) dunbar.core5++;
      else if (newDunbarTier === 2) dunbar.inner15++;
      else if (newDunbarTier === 3) dunbar.active50++;
      else if (newDunbarTier === 4) dunbar.network150++;

      const update: any = {
        id: contact.id,
        user_id: userId,
        relationship_score: score,
        relationship_tier: tier,
        last_interaction_at: contact.last_emailed_at || contact.last_interaction_at || null,
      };

      // ── Dunbar tier auto-assignment ────────────────────────────────────
      // Rule: NEVER replace an existing tier. Tiers 1 & 2 are NEVER auto-assigned.
      const hasExistingTier = contact.dunbar_tier !== null && contact.dunbar_tier !== undefined;
      const wouldAssignProtected = newDunbarTier === 1 || newDunbarTier === 2;
      if (
        newDunbarTier !== null &&
        !hasExistingTier &&
        !contact.tier_override &&
        !contact.relationship_override &&
        !wouldAssignProtected
      ) {
        update.dunbar_tier = newDunbarTier;
        update.dunbar_auto_assigned_at = new Date().toISOString();
        // Do NOT stamp tier_override = true on auto-assignments. That flag should
        // only mean "the user made a deliberate choice."
      }

      // ── Dunbar bucket auto-fill (promote-only) ──────────────────────────
      // Rule: never wipe an existing bucket. Only fill in if currently null/empty.
      // ["prospect"] is a deliberate user choice — preserve it.
      // Skip entirely if tier_override is true (user's picks are sacred).
      const currentBucket = contact.dunbar_bucket;
      const bucketIsEmpty = !currentBucket ||
        (Array.isArray(currentBucket) && currentBucket.length === 0);

      const hasRelationshipSignals =
        contact.relationship_type &&
        contact.relationship_type !== 'acquaintance' &&
        (contact.email_count >= 3 || contact.calendar_intimacy_score > 0);

      if (!contact.tier_override && hasRelationshipSignals && bucketIsEmpty) {
        const personalTypes = ["friend", "close_friend", "family"];
        const professionalTypes = ["customer", "vendor", "colleague", "mentor"];
        if (personalTypes.includes(contact.relationship_type)) {
          update.dunbar_bucket = ["personal"];
        } else if (professionalTypes.includes(contact.relationship_type)) {
          update.dunbar_bucket = ["professional"];
        }
      }

      return update;
    });

    const upsertChunkSize = 100;
    for (let i = 0; i < updates.length; i += upsertChunkSize) {
      const chunk = updates.slice(i, i + upsertChunkSize);
      const { error: upsertError } = await supabase
        .from("tom_contacts")
        .upsert(chunk, { onConflict: "id" });

      if (upsertError) {
        console.error("Error upserting scored contacts:", upsertError);
      }
    }

    scored += contacts.length;
    offset += batchSize;

    if (contacts.length < batchSize) break;
  }

  return { scored, tiers, dunbar };
}

// ── Get top contacts for "Who matters this week" ─────────────────────────────
export async function getTopContacts(userId: string, limit = 10): Promise<any[]> {
  const { data } = await supabase
    .from("tom_contacts")
    .select(
      "id, full_name, email, phone, relationship_score, relationship_tier, last_interaction_at, last_emailed_at, company, job_title, notes, home_address"
    )
    .eq("user_id", userId)
    .not("relationship_tier", "eq", "C")
    .order("relationship_score", { ascending: false })
    .limit(limit);

  return data || [];
}

// ── Get contacts going cold (haven't heard from in a while) ──────────────────
export async function getColdContacts(userId: string, limit = 10): Promise<any[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("tom_contacts")
    .select(
      "id, full_name, email, phone, relationship_score, relationship_tier, last_interaction_at, last_emailed_at, company, job_title"
    )
    .eq("user_id", userId)
    .in("relationship_tier", ["A+", "A"])
    .lt("last_emailed_at", ninetyDaysAgo)
    .order("relationship_score", { ascending: false })
    .limit(limit);

  return data || [];
}