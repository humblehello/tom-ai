export type Plan = "free" | "trial" | "pro" | "growth";

export const PLAN_FEATURES = {
  // ── Free + all plans ────────────────────────────────────────
  google_sync: ["free", "trial", "pro", "growth"],
  contact_enrichment: ["free", "trial", "pro", "growth"],
  verification_emails: ["free", "trial", "pro", "growth"],
  email_sending: ["free", "trial", "pro", "growth"],
  journal: ["free", "trial", "pro", "growth"],
  bounce_scan: ["free", "trial", "pro", "growth"],
  card_sends: ["free", "trial", "pro", "growth"],
  ai_drafts: ["free", "trial", "pro", "growth"], // limited per plan, see DRAFT_LIMITS
  auto_tier: ["free", "trial", "pro", "growth"],
  ai_scoring: ["free", "trial", "pro", "growth"], // 15/50/150 classification on Free
  hopper_imports: ["trial", "pro", "growth"],
  relationship_index_extension: ["free", "trial", "pro", "growth"], // all plans, different caps

  // ── Pro+ ────────────────────────────────────────────────────
  email_scheduling: ["trial", "pro", "growth"],
  follow_up_sequences: ["trial", "pro", "growth"],
  sms_outreach: ["trial", "pro", "growth"],
  smart_gifting: ["trial", "pro", "growth"],
  outlook_integration: ["trial", "pro", "growth"],

  // ── Growth only ─────────────────────────────────────────────
  campaigns: ["trial", "growth"],
  bulk_operations: ["trial", "growth"],
  audience_builder: ["trial", "growth"],
  hubspot: ["trial", "growth"],
  salesforce: ["trial", "growth"],
  contact_tagging: ["trial", "growth"],
  pipeline_visibility: ["trial", "growth"],
  meeting_tracking: ["trial", "growth"],
  account_insights: ["trial", "growth"],
  auto_gifting_triggers: ["trial", "growth"],
} as const;

export type Feature = keyof typeof PLAN_FEATURES;

export function canAccess(plan: Plan, feature: Feature): boolean {
  return (PLAN_FEATURES[feature] as readonly string[]).includes(plan);
}

// AI message draft limits — Free is per WEEK, Pro/Growth/Trial are unlimited
export const DRAFT_LIMITS: Record<Plan, number> = {
  free: 25,         // 25 per week (resets weekly)
  trial: 999999,    // unlimited during trial
  pro: 999999,      // unlimited
  growth: 999999,   // unlimited
};

// Reset window for AI drafts (in days)
export const DRAFT_RESET_DAYS: Record<Plan, number> = {
  free: 7,
  trial: 30,
  pro: 30,
  growth: 30,
};

// Relationship Index extension caps — used by /api/extension/contact-enrich
// Trial gets FREE-tier caps for the extension (Pro+ benefit, not part of trial)
export const RELATIONSHIP_INDEX_CAPS: Record<Plan, { monthly: number; daily_soft: number; daily_hard: number }> = {
  free:   { monthly: 5,   daily_soft: 5,  daily_hard: 5  },
  trial:  { monthly: 5,   daily_soft: 5,  daily_hard: 5  }, // free-tier for extension
  pro:    { monthly: 50,  daily_soft: 20, daily_hard: 40 },
  growth: { monthly: 200, daily_soft: 20, daily_hard: 40 },
};

// Contact storage: unlimited on all plans.
// Humble Hello's positioning is "never let your network forget about you" —
// capping contacts contradicts that ethos. Monetization is feature-based.
export const CONTACT_LIMITS: Record<Plan, number> = {
  free: 999999,
  trial: 999999,
  pro: 999999,
  growth: 999999,
};