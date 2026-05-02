import { useState, useEffect } from "react";

export type PlanInfo = {
  plan: string;
  trial_ends_at: string | null;
  ai_drafts_used: number;
  plan_contact_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export function usePlan() {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plan")
      .then(r => r.json())
      .then(d => { setPlanInfo(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const isTrialing = planInfo?.plan === "trial";
  const isFree = planInfo?.plan === "free";
  const isPro = planInfo?.plan === "pro";
  const isGrowth = planInfo?.plan === "growth";

  const trialDaysLeft = planInfo?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(planInfo.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  const draftLimit = isFree ? 100 : isPro ? 250 : -1;
  const draftsRemaining = draftLimit === -1 ? 999 : Math.max(0, draftLimit - (planInfo?.ai_drafts_used || 0));
  const draftsPercent = draftLimit === -1 ? 0 : Math.min(100, ((planInfo?.ai_drafts_used || 0) / draftLimit) * 100);

  const planLabel = isTrialing ? "Trial" : isFree ? "Free" : isPro ? "Hello Pro" : isGrowth ? "Hello Growth" : "Free";
  const planColor = isTrialing ? "#6b9970" : isFree ? "#94a3b8" : isPro ? "#6b9970" : "#8b5cf6";

  return { planInfo, loading, isTrialing, isFree, isPro, isGrowth, trialDaysLeft, draftLimit, draftsRemaining, draftsPercent, planLabel, planColor };
}