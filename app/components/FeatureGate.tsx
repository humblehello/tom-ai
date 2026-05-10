"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccess, type Feature, type Plan } from "@/app/lib/plan";
import { C, font } from "@/app/lib/theme";

// ─────────────────────────────────────────────────────────────────────
// Per-feature copy. `data_label` enables "you have N <thing> saved"
// when the user has data behind the gate (post-trial returnees).
// ─────────────────────────────────────────────────────────────────────
const FEATURE_DISPLAY: Record<string, {
  label: string;
  data_label?: string;
  description_returning: string;
  description_new: string;
  required_plan: "pro" | "growth";
  icon: string;
}> = {
campaigns: {
    label: "Campaigns",
    data_label: "campaigns",
    description_returning: "Your campaigns are saved and ready. Reactivate Hello Growth to send bulk cards, gifts, and email sequences again.",
    description_new: "Your network is your pipeline. Are you working it? Send handwritten cards, curated gifts, and personalized email sequences to your entire network in minutes. Generate leads, reward customers, ask for referrals, and stay top-of-mind without the manual grind.",
    required_plan: "growth",
    icon: "📨",
  },
audience_builder: {
    label: "Audience Builder",
    data_label: "audiences",
    description_returning: "Your audiences are saved and waiting. Reactivate Hello Growth to filter, segment, and send.",
    description_new: "Not every contact needs the same message. Audience Builder lets you slice your network by industry, role, customer, last touch, life event — anything — so every campaign reaches exactly the right people. Better targeting means more replies, more meetings, more leads.",
    required_plan: "growth",
    icon: "🎯",
  },
  bulk_operations: {
    label: "Bulk Operations",
    description_returning: "Reactivate Hello Growth to manage your network at scale again.",
    description_new: "Update tags, send messages, and manage your network at scale — without losing the personal touch.",
    required_plan: "growth",
    icon: "⚡",
  },
  hubspot: {
    label: "HubSpot Sync",
    description_returning: "Reactivate Hello Growth to reconnect HubSpot.",
    description_new: "Two-way sync with HubSpot. Keep your CRM and Humble Hello aligned automatically.",
    required_plan: "growth",
    icon: "🔄",
  },
  salesforce: {
    label: "Salesforce Sync",
    description_returning: "Reactivate Hello Growth to reconnect Salesforce.",
    description_new: "Two-way sync with Salesforce. Account-level relationship intelligence in your CRM.",
    required_plan: "growth",
    icon: "🔄",
  },
  pipeline_visibility: {
    label: "Pipeline Visibility",
    description_returning: "Reactivate Hello Growth to see your pipeline view again.",
    description_new: "See your network through a sales lens — who's in motion, who's stalled, who needs attention.",
    required_plan: "growth",
    icon: "📊",
  },
  meeting_tracking: {
    label: "Meeting Tracking",
    description_returning: "Reactivate Hello Growth to resume meeting tracking.",
    description_new: "Auto-capture meetings from your calendar, link them to contacts, and surface follow-up reminders.",
    required_plan: "growth",
    icon: "📅",
  },
  account_insights: {
    label: "Account Insights",
    description_returning: "Reactivate Hello Growth to see account-level insights again.",
    description_new: "Company-level intelligence: who knows who, relationship strength by account, mutual connections.",
    required_plan: "growth",
    icon: "🏢",
  },
  auto_gifting_triggers: {
    label: "Auto-Gifting Triggers",
    description_returning: "Reactivate Hello Growth to resume auto-gifting.",
    description_new: "Detected life events trigger gift suggestions automatically — birthdays, promotions, work anniversaries.",
    required_plan: "growth",
    icon: "🎁",
  },
  email_scheduling: {
    label: "Scheduled Sends",
    description_returning: "Reactivate Hello Pro to start scheduling sends again.",
    description_new: "Hit inboxes when they're actually opened. Schedule emails for early mornings, post-meeting moments, or any time that lands.",
    required_plan: "pro",
    icon: "⏰",
  },
follow_up_sequences: {
    label: "Automated Follow-ups",
    description_returning: "Reactivate Hello Pro to resume your follow-up sequences.",
    description_new: "Stop dropping balls. Set follow-up cadences and let Hello Pro nudge you (or send for you) when the right moment comes.",
    required_plan: "pro",
    icon: "🔁",
  },
sms_outreach: {
    label: "SMS Outreach",
    description_returning: "Reactivate Hello Pro to send texts again.",
    description_new: "Reach people where they actually respond. Send SMS alongside email for 90% open rates and same-day replies.",
    required_plan: "pro",
    icon: "💬",
  },
smart_gifting: {
    label: "Smart Gifting",
    description_returning: "Reactivate Hello Pro to resume smart gifting.",
    description_new: "Birthdays, promotions, big wins. Hello Pro spots the moments that matter and suggests the right gift before you'd remember to send one.",
    required_plan: "pro",
    icon: "🎁",
  },
outlook_integration: {
    label: "Outlook Integration",
    description_returning: "Reactivate Hello Pro to reconnect Outlook.",
    description_new: "Use Outlook? Connect your account for full email and calendar sync — same experience as Gmail users.",
    required_plan: "pro",
    icon: "📧",
  },
hopper_imports: {
    label: "Hopper Smart Imports",
    description_returning: "Reactivate Hello Pro to use smart imports again.",
    description_new: "Got a CSV from a fundraising list, Eventbrite, or your old CRM? Drop it in. Hopper auto-maps fields, dedupes, and enriches.",
    required_plan: "pro",
    icon: "📥",
  },
  contact_tagging: {
    label: "Contact Tagging",
    description_returning: "Reactivate Hello Growth to manage tags at scale again.",
    description_new: "Tag contacts at scale: prospects, clients, partners. Use tags everywhere from filters to campaigns.",
    required_plan: "growth",
    icon: "🏷️",
  },
  relationship_index_extension: {
    label: "Relationship Index",
    description_returning: "Reactivate your plan to keep analyzing profiles.",
    description_new: "Know exactly how someone communicates before you've even met them. Five-factor personality analysis, decision-making style, motivators — straight from their LinkedIn profile.",
    required_plan: "pro",
    icon: "🧠",
  },
};

const PRICE_MAP: Record<string, string> = {
  pro_monthly: "price_1TIV6aBupCCDyTTUIPt6qUNv",
  pro_annual: "price_1TIV6aBupCCDyTTUSrebjytb",
  growth_monthly: "price_1TIV72BupCCDyTTUx6VzkCYb",
  growth_annual: "price_1TIV7sBupCCDyTTUD4StSWU0",
};

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────
export default function FeatureGate({
  feature,
  children,
}: {
  feature: Feature;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/plan").then((r) => r.json()).catch(() => ({})),
      fetch("/api/plan/feature-stats").then((r) => r.json()).catch(() => ({ stats: {} })),
    ])
      .then(([planData, statsData]) => {
        setPlan((planData.effective_plan || planData.plan || "free") as Plan);
        setStats(statsData.stats || {});
        setLoading(false);
      })
      .catch(() => {
        setPlan("free");
        setLoading(false);
      });
  }, []);

  const startCheckout = async (priceKey: string) => {
    setCheckoutLoading(priceKey);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: PRICE_MAP[priceKey], billing: "monthly" }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
    }
    setCheckoutLoading(null);
  };

  // While loading plan, just render children (no flicker)
  if (loading) return <>{children}</>;

  // No plan info → fail open
  if (!plan) return <>{children}</>;

  // Has access → render children normally
  if (canAccess(plan, feature)) return <>{children}</>;

  // ── Locked: render preview + modal overlay ─────────────────────────
  const display = FEATURE_DISPLAY[feature] || {
    label: feature,
    description_returning: "Reactivate your plan to use this feature again.",
    description_new: "This feature is part of a premium plan.",
    required_plan: "pro" as const,
    icon: "🔒",
  };

  const dataCount = stats[feature] || 0;
  const hasData = dataCount > 0;

  let bodyText: string;
  if (hasData && display.data_label) {
    const noun = dataCount === 1
      ? display.data_label.replace(/s$/, "")
      : display.data_label;
    bodyText = `You have ${dataCount} ${noun} saved. ${display.description_returning}`;
  } else {
    bodyText = display.description_new;
  }

  const requiredPlan = display.required_plan;

  return (
    <>
      {/* Preview: page renders behind, but interaction is blocked */}
      <div
        style={{
          pointerEvents: "none",
          userSelect: "none",
          filter: "blur(2px) saturate(0.6)",
          opacity: 0.5,
          transition: "all 0.2s",
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Modal overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 15, 20, 0.5)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 1000,
          fontFamily: font,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: "#fff",
            borderRadius: 20,
            padding: 32,
            boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
            textAlign: "center" as const,
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>{display.icon}</div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: requiredPlan === "growth" ? C.purple : C.green,
              background: requiredPlan === "growth" ? C.purpleLight : C.greenLight,
              padding: "4px 12px",
              borderRadius: 20,
              display: "inline-block",
              marginBottom: 14,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
            }}
          >
            {hasData ? "Your data is waiting" : `${requiredPlan === "growth" ? "Hello Growth" : "Hello Pro"} feature`}
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              marginBottom: 10,
              lineHeight: 1.25,
            }}
          >
            {display.label}
          </div>

          <div
            style={{
              fontSize: 14,
              color: C.text3,
              lineHeight: 1.55,
              marginBottom: 22,
            }}
          >
            {bodyText}
          </div>

          {/* Plan options — always show both Pro and Growth side by side */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 18, textAlign: "left" as const }}>
            <PlanOption
              name="Hello Pro"
              price="$25/mo"
              tag="Run your relationships"
              accent={C.green}
              accentBg={C.greenLight}
              available={requiredPlan === "pro"}
              loading={checkoutLoading === "pro_monthly"}
              onClick={() => startCheckout("pro_monthly")}
              recommended={requiredPlan === "pro"}
            />
            <PlanOption
              name="Hello Growth"
              price="$49/mo"
              tag="Turn relationships into revenue"
              accent={C.purple}
              accentBg={C.purpleLight}
              available={true}
              loading={checkoutLoading === "growth_monthly"}
              onClick={() => startCheckout("growth_monthly")}
              recommended={requiredPlan === "growth"}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => router.back()}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: 10,
                border: `1px solid ${C.border2}`,
                background: "#fff",
                color: C.text2,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: font,
              }}
            >
              Maybe later
            </button>
            <button
              onClick={() => router.push("/plans")}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: 10,
                border: "none",
                background: C.text,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: font,
              }}
            >
              See full pricing
            </button>
          </div>

          <div style={{ fontSize: 11, color: C.text4, marginTop: 14 }}>
            {hasData ? "Your data is safe · Cancel anytime" : "Cancel anytime"}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Side-by-side plan option row
// ─────────────────────────────────────────────────────────────────────
function PlanOption({
  name,
  price,
  tag,
  accent,
  accentBg,
  available,
  loading,
  onClick,
  recommended,
}: {
  name: string;
  price: string;
  tag: string;
  accent: string;
  accentBg: string;
  available: boolean;
  loading: boolean;
  onClick: () => void;
  recommended: boolean;
}) {
  return (
    <button
      onClick={available ? onClick : undefined}
      disabled={!available || loading}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        border: `1.5px solid ${recommended ? accent : C.border}`,
        background: recommended ? accentBg : "#fff",
        cursor: available && !loading ? "pointer" : "not-allowed",
        opacity: available ? 1 : 0.45,
        fontFamily: font,
        textAlign: "left" as const,
        transition: "all 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: accent }}>{name}</span>
          {recommended && <span style={{ fontSize: 10 }}>⭐</span>}
        </div>
        <div style={{ fontSize: 11, color: C.text3 }}>{tag}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, flexShrink: 0 }}>
        {loading ? "..." : price}
      </div>
    </button>
  );
}