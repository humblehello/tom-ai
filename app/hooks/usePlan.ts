"use client";
import { useEffect, useState } from "react";
import { canAccess, Feature, Plan } from "@/app/lib/plan";

type PlanState = {
  plan: Plan;
  trialExpired: boolean;
  trialEndsAt: string | null;
  loading: boolean;
  can: (feature: Feature) => boolean;
};

export function usePlan(): PlanState {
  const [plan, setPlan] = useState<Plan>("free");
  const [trialExpired, setTrialExpired] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        setPlan((data.effective_plan || "free") as Plan);
        setTrialExpired(data.trial_expired || false);
        setTrialEndsAt(data.trial_ends_at || null);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    plan,
    trialExpired,
    trialEndsAt,
    loading,
    can: (feature: Feature) => canAccess(plan, feature),
  };
}