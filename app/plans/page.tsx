"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { AuthModalProvider, AuthTrigger } from "../components/AuthModal";
import { FeaturesDropdown } from "../components/FeaturesDropdown";

const M = {
  paper:      "#faf6ef",
  paperDeep:  "#f1e8d8",
  ink:        "#1a1208",
  ink2:       "#3d2c1c",
  ink3:       "#7a6450",
  ink4:       "#a89580",
  fire:       "#bf5c38",
  fireDeep:   "#8a3f25",
  fireSoft:   "#f0d4c2",
  forest:     "#3d6b42",
  forestSoft: "#d0e0d2",
  green:      "#2f7a3a",
  rule:       "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

type UserState =
  | "loading"
  | "visitor"
  | "free_eligible_for_trial"
  | "free_post_trial"
  | "in_trial"
  | "pro_active"
  | "growth_active"
  | "ending_at_period";

interface UserInfo {
  plan: string;
  trial_ends_at: string | null;
  subscription_cancel_at_period_end: boolean;
  subscription_period_end: string | null;
}

export default function PlansPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{globalCss}</style>

      <div style={{ background: M.paper, color: M.ink, fontFamily: BODY, minHeight: "100vh" }}>
        <AuthModalProvider>
          <PageContent />
        </AuthModalProvider>
      </div>
    </>
  );
}

function PageContent() {
  const router = useRouter();
  const [userState, setUserState] = useState<UserState>("loading");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [eligibleForTrial, setEligibleForTrial] = useState<boolean | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  // Detect user state on mount
  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          if (!cancelled) setUserState("visitor");
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const info: UserInfo = {
          plan: data.plan || "free",
          trial_ends_at: data.trial_ends_at,
          subscription_cancel_at_period_end: data.subscription_cancel_at_period_end || false,
          subscription_period_end: data.subscription_period_end,
        };
        setUser(info);

        // Determine state
        if (info.subscription_cancel_at_period_end) {
          setUserState("ending_at_period");
        } else if (info.plan === "trial" || (info.plan === "growth" && info.trial_ends_at && new Date(info.trial_ends_at) > new Date())) {
          setUserState("in_trial");
        } else if (info.plan === "pro") {
          setUserState("pro_active");
        } else if (info.plan === "growth") {
          setUserState("growth_active");
        } else {
          // Free tier — need to check trial eligibility
          const trialRes = await fetch("/api/stripe/trial-status");
          const trialData = await trialRes.json();
          if (cancelled) return;
          setEligibleForTrial(trialData.eligible_for_growth_trial);
          setUserState(trialData.eligible_for_growth_trial ? "free_eligible_for_trial" : "free_post_trial");
        }
      } catch {
        if (!cancelled) setUserState("visitor");
      }
    }
    loadState();
    return () => { cancelled = true; };
  }, []);

  async function handleUpgrade(tier: "pro" | "growth") {
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, billing }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Couldn't start checkout. Please try again.");
        setLoadingTier(null);
      }
    } catch {
      alert("Network error. Please try again.");
      setLoadingTier(null);
    }
  }

  async function handleManageBilling() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("Couldn't open billing portal. Please try again.");
    }
  }

  return (
    <>
      <Nav userState={userState} />
      <Hero userState={userState} user={user} />
      {userState !== "loading" && (
        <>
          <BillingToggle billing={billing} setBilling={setBilling} />
          <PlansGrid
            userState={userState}
            billing={billing}
            loadingTier={loadingTier}
            onUpgrade={handleUpgrade}
            onManageBilling={handleManageBilling}
          />
          <Comparison />
          <FAQ />
        </>
      )}
      <FinalCta userState={userState} />
      <Footer />
    </>
  );
}

// ── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ userState }: { userState: UserState }) {
  const isLoggedIn = !["visitor", "loading"].includes(userState);
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(250, 246, 239, 0.88)",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      borderBottom: `1px solid ${M.rule}`,
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{
            fontFamily: "'ITCSouvenir', 'Libre Baskerville', serif",
            fontWeight: 700, fontSize: 26, color: M.fire, letterSpacing: "-0.01em",
          }}>
            humble hello.
          </span>
        </Link>
        <div className="hh-nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <FeaturesDropdown />
          <Link href="/plans" style={{ ...navLink, color: M.ink, fontWeight: 600 }}>Plans</Link>
          <span style={{ width: 1, height: 16, background: M.rule }} aria-hidden />
          {isLoggedIn ? (
            <Link href="/dashboard" style={navCta}>Dashboard →</Link>
          ) : (
            <>
              <AuthTrigger mode="signin" style={navSignIn}>Sign in</AuthTrigger>
              <AuthTrigger mode="signup" style={navCta}>Try for free →</AuthTrigger>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

const navLink: React.CSSProperties = {
  fontFamily: BODY, fontSize: 14, fontWeight: 500, color: M.ink2,
  textDecoration: "none", letterSpacing: "0.01em",
};
const navSignIn: React.CSSProperties = {
  fontFamily: BODY, fontSize: 13, fontWeight: 600, color: M.ink,
  textDecoration: "none", padding: "8px 14px", borderRadius: 8,
  border: `1.5px solid ${M.ruleStrong}`, background: "transparent",
  letterSpacing: "0.01em", cursor: "pointer",
};
const navCta: React.CSSProperties = {
  fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "#fff",
  textDecoration: "none", padding: "9px 18px", borderRadius: 8,
  background: M.green, letterSpacing: "0.01em", cursor: "pointer",
};

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero({ userState, user }: { userState: UserState; user: UserInfo | null }) {
  // State-aware headline
  const headlineByState: Record<UserState, { kicker: string; title: React.ReactNode; sub: string }> = {
    loading: {
      kicker: "Plans & pricing",
      title: <>Loading…</>,
      sub: "",
    },
    visitor: {
      kicker: "Plans & pricing",
      title: <>One price.{" "}<em style={{ color: M.fire }}>No per-seat games.</em></>,
      sub: "We don't have a quote-required tier. We don't charge per seat. We don't ask for a credit card to try it. Cancel any time.",
    },
    free_eligible_for_trial: {
      kicker: "You're on Free",
      title: <>Try Growth{" "}<em style={{ color: M.fire }}>free for 7 days.</em></>,
      sub: "Get the full Growth experience — campaigns, audiences, unlimited drafts, 200 RI/mo. No credit card needed up front. Drops to Free if you don't keep it.",
    },
    free_post_trial: {
      kicker: "You're on Free",
      title: <>Ready to{" "}<em style={{ color: M.fire }}>level up?</em></>,
      sub: "You've used your trial. Now choose the plan that fits how you actually work.",
    },
    in_trial: {
      kicker: "You're on Trial",
      title: <>Your Growth trial is{" "}<em style={{ color: M.fire }}>active.</em></>,
      sub: user?.trial_ends_at ? `Ends ${formatDate(user.trial_ends_at)}. Add a payment method to keep Growth — or do nothing and drop to Free.` : "Add a payment method to keep Growth.",
    },
    pro_active: {
      kicker: "You're on Pro",
      title: <>Want to{" "}<em style={{ color: M.fire }}>do more?</em></>,
      sub: "Pro is great for staying close to the people who matter. Growth adds campaigns, audiences, and CRM sync for when you're scaling outreach.",
    },
    growth_active: {
      kicker: "You're on Growth",
      title: <>You've got{" "}<em style={{ color: M.fire }}>the full kit.</em></>,
      sub: "Unlimited drafts, 200 Relationship Index credits a month, campaigns, CRM sync. Manage your subscription below.",
    },
    ending_at_period: {
      kicker: "Subscription ending",
      title: <>You'll drop to{" "}<em style={{ color: M.fire }}>Free soon.</em></>,
      sub: user?.subscription_period_end ? `Your access ends ${formatDate(user.subscription_period_end)}. Resume your subscription to keep going.` : "Your access will end at the end of the current period.",
    },
  };

  const headline = headlineByState[userState];

  return (
    <section style={{ padding: "90px 28px 60px", textAlign: "center" as const }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <SectionLabel>{headline.kicker}</SectionLabel>

        <h1 style={{
          fontFamily: HEAD, fontSize: "clamp(40px, 6vw, 68px)",
          lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0,
        }}>
          {headline.title}
        </h1>

        {headline.sub && (
          <p style={{
            fontFamily: BODY, fontSize: 18, lineHeight: 1.65, color: M.ink2,
            marginTop: 28, maxWidth: 620, marginLeft: "auto", marginRight: "auto",
          }}>
            {headline.sub}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Billing toggle ──────────────────────────────────────────────────────────
function BillingToggle({ billing, setBilling }: { billing: "monthly" | "annual"; setBilling: (b: "monthly" | "annual") => void }) {
  return (
    <div style={{ textAlign: "center" as const, marginBottom: 24 }}>
      <div style={{
        display: "inline-flex",
        background: "#fff", border: `1px solid ${M.rule}`,
        borderRadius: 30, padding: 4,
      }}>
        {(["monthly", "annual"] as const).map(b => (
          <button
            key={b}
            onClick={() => setBilling(b)}
            style={{
              padding: "9px 24px", borderRadius: 26, border: "none",
              background: billing === b ? M.ink : "transparent",
              color: billing === b ? "#fff" : M.ink3,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: BODY, transition: "all 0.15s",
            }}
          >
            {b === "monthly" ? "Monthly" : "Annual · save 10%"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Plans Grid ──────────────────────────────────────────────────────────────
function PlansGrid({ userState, billing, loadingTier, onUpgrade, onManageBilling }: {
  userState: UserState;
  billing: "monthly" | "annual";
  loadingTier: string | null;
  onUpgrade: (tier: "pro" | "growth") => void;
  onManageBilling: () => void;
}) {
  const tiers = [
    {
      tier: "free" as const,
      name: "Free",
      price: { monthly: 0, annual: 0 },
      cadence: "forever",
      tagline: "For staying close to your nearest few.",
      features: [
        "Unlimited contacts",
        "Daily reach-out suggestions",
        "Auto-organize Core 5 / 15 / 50 / 150 tiers",
        "25 AI drafts per week",
        "5 Relationship Index/month",
        "Auto-running email verification",
        "Journal — capture life events",
        "Google Contacts two-way sync",
        "Outlook & Gmail support",
      ],
    },
    {
      tier: "pro" as const,
      name: "Pro",
      price: { monthly: 25, annual: 22.50 },
      cadence: "per month",
      tagline: "For the operator whose work runs on relationships.",
      featured: true,
      features: [
        "Everything in Free",
        "Unlimited AI drafts",
        "50 Relationship Index/month",
        "Send cards & gifts ($4.75 each)",
        "Scheduled sends + auto follow-ups",
        "Smart gifting on life events",
        "Email + SMS outreach",
        "Hopper bulk imports",
        "Chrome extension",
      ],
    },
    {
      tier: "growth" as const,
      name: "Growth",
      price: { monthly: 49, annual: 44.10 },
      cadence: "per month",
      tagline: "For sales pros, founders, and teams of one running like ten.",
      features: [
        "Everything in Pro",
        "200 Relationship Index/month",
        "Audiences — target the right prospects",
        "Campaigns — bulk emails, cards, gifts",
        "HubSpot + Salesforce sync",
        "Pipeline + account-level insights",
        "Auto-gifting on life events",
        "Contact tagging at scale",
      ],
    },
  ];

  return (
    <section style={{ padding: "20px 28px 100px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="hh-plans-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24,
          alignItems: "start",
        }}>
          {tiers.map(t => (
            <PlanCard
              key={t.tier}
              tier={t}
              billing={billing}
              userState={userState}
              loadingTier={loadingTier}
              onUpgrade={onUpgrade}
              onManageBilling={onManageBilling}
            />
          ))}
        </div>

        <p style={{
          fontFamily: BODY, fontSize: 13, color: M.ink3,
          marginTop: 32, textAlign: "center" as const, fontStyle: "italic" as const,
        }}>
          Cards & gifts are billed at cost ($4.75/card via Handwrytten · gifts vary). Card spend is yours, not ours.
        </p>
      </div>
    </section>
  );
}

function PlanCard({ tier, billing, userState, loadingTier, onUpgrade, onManageBilling }: any) {
  const featured = tier.featured;
  const price = billing === "monthly" ? tier.price.monthly : tier.price.annual;
  const action = getCardAction(tier.tier, userState);

  return (
    <div style={{
      position: "relative",
      background: featured ? M.ink : "#fff",
      color: featured ? M.paper : M.ink,
      border: `1px solid ${featured ? M.ink : M.rule}`,
      borderRadius: 18,
      padding: 36,
      transform: featured ? "translateY(-12px)" : "none",
      boxShadow: featured ? "0 30px 60px -30px rgba(26, 18, 8, 0.4)" : "0 12px 32px -20px rgba(26, 18, 8, 0.1)",
    }}>
      {featured && action.kind !== "current" && (
        <div style={{
          position: "absolute", top: -14, left: 36,
          background: M.fire, color: "#fff",
          fontSize: 11, fontWeight: 700, fontFamily: MONO,
          letterSpacing: "0.08em", textTransform: "uppercase" as const,
          padding: "6px 12px", borderRadius: 6,
        }}>
          Most chose this
        </div>
      )}

      {action.kind === "current" && (
        <div style={{
          position: "absolute", top: -14, left: 36,
          background: M.green, color: "#fff",
          fontSize: 11, fontWeight: 700, fontFamily: MONO,
          letterSpacing: "0.08em", textTransform: "uppercase" as const,
          padding: "6px 12px", borderRadius: 6,
        }}>
          Current plan
        </div>
      )}

      <div style={{ fontFamily: HEAD, fontSize: 24, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.01em" }}>
        {tier.name}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
        <span style={{ fontFamily: HEAD, fontSize: 52, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>
          ${price}
        </span>
        <span style={{ fontSize: 15, color: featured ? "rgba(250, 246, 239, 0.7)" : M.ink3 }}>
          /{tier.cadence}
        </span>
      </div>

      <p style={{
        fontSize: 14, lineHeight: 1.55, fontStyle: "italic" as const,
        color: featured ? "rgba(250, 246, 239, 0.85)" : M.ink3,
        marginBottom: 28, fontFamily: HEAD,
      }}>
        {tier.tagline}
      </p>

      <CtaButton
        action={action}
        tier={tier.tier}
        loading={loadingTier === tier.tier}
        onUpgrade={onUpgrade}
        onManageBilling={onManageBilling}
      />

      <div style={{
        height: 1,
        background: featured ? "rgba(250, 246, 239, 0.15)" : M.rule,
        marginTop: 28, marginBottom: 22,
      }} />

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {tier.features.map((f: string) => (
          <li key={f} style={{
            display: "flex", gap: 12, fontSize: 14, lineHeight: 1.5,
            color: featured ? "rgba(250, 246, 239, 0.92)" : M.ink2,
          }}>
            <span style={{
              color: featured ? M.fireSoft : M.fire,
              fontWeight: 700, flexShrink: 0, fontSize: 14, marginTop: 1,
            }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── CTA logic per state x tier ──────────────────────────────────────────────
type CardAction =
  | { kind: "current" }
  | { kind: "signup" }
  | { kind: "upgrade"; trial: boolean }
  | { kind: "downgrade" }
  | { kind: "manage" }
  | { kind: "resume" };

function getCardAction(tier: "free" | "pro" | "growth", userState: UserState): CardAction {
  switch (userState) {
    case "loading":
      return { kind: "signup" };

    case "visitor":
      return { kind: "signup" };

    case "free_eligible_for_trial":
      if (tier === "free") return { kind: "current" };
      if (tier === "growth") return { kind: "upgrade", trial: true };
      return { kind: "upgrade", trial: false };

    case "free_post_trial":
      if (tier === "free") return { kind: "current" };
      return { kind: "upgrade", trial: false };

    case "in_trial":
      if (tier === "growth") return { kind: "current" };
      if (tier === "pro") return { kind: "upgrade", trial: false };
      return { kind: "downgrade" };

    case "pro_active":
      if (tier === "pro") return { kind: "current" };
      if (tier === "growth") return { kind: "upgrade", trial: false };
      return { kind: "downgrade" };

    case "growth_active":
      if (tier === "growth") return { kind: "current" };
      return { kind: "downgrade" };

    case "ending_at_period":
      return { kind: "resume" };
  }
}

function CtaButton({ action, tier, loading, onUpgrade, onManageBilling }: any) {
  const baseStyle: React.CSSProperties = {
    display: "block", textAlign: "center" as const, width: "100%",
    padding: "13px 18px", borderRadius: 10,
    fontWeight: 600, fontSize: 14, fontFamily: BODY,
    textDecoration: "none", border: "none", cursor: "pointer",
  };

  if (loading) {
    return (
      <button style={{ ...baseStyle, background: M.ruleStrong, color: "#fff" }} disabled>
        Loading…
      </button>
    );
  }

  switch (action.kind) {
    case "current":
      return (
        <button style={{ ...baseStyle, background: "transparent", border: `1.5px solid ${M.ruleStrong}`, color: M.ink3, cursor: "default" }} disabled>
          Your current plan
        </button>
      );

    case "signup":
      return (
        <AuthTrigger mode="signup" style={{ ...baseStyle, background: M.green, color: "#fff" }}>
          Try for free →
        </AuthTrigger>
      );

    case "upgrade":
      if (tier === "free") {
        // Should never happen — Free tier from a Free user shows "current"
        return null;
      }
      return (
        <button
          style={{ ...baseStyle, background: M.green, color: "#fff" }}
          onClick={() => onUpgrade(tier)}
        >
          {action.trial ? "Try Growth free for 7 days →" : `Upgrade to ${tier === "pro" ? "Pro" : "Growth"} →`}
        </button>
      );

    case "downgrade":
    case "manage":
      return (
        <button
          style={{ ...baseStyle, background: "transparent", border: `1.5px solid ${M.ruleStrong}`, color: M.ink2 }}
          onClick={onManageBilling}
        >
          Manage subscription
        </button>
      );

    case "resume":
      return (
        <button
          style={{ ...baseStyle, background: M.green, color: "#fff" }}
          onClick={onManageBilling}
        >
          Resume subscription
        </button>
      );
  }

  return null;
}

// ── Comparison Table ────────────────────────────────────────────────────────
function Comparison() {
  const rows = [
    { f: "Verified contact data",                 hh: true,  hub: "Add-on",   sf: "Enterprise",  clay: true,    zi: true       },
    { f: "AI-personalized outreach drafts",        hh: true,  hub: "Limited",  sf: false,         clay: false,   zi: false      },
    { f: "Real handwritten cards & gifts",         hh: true,  hub: false,      sf: false,         clay: false,   zi: false      },
    { f: "Cards + email + gifts in one workflow",  hh: true,  hub: false,      sf: false,         clay: false,   zi: false      },
    { f: "Sequenced multi-channel campaigns",      hh: true,  hub: true,       sf: true,          clay: false,   zi: false      },
    { f: "Built for individuals & SMB",            hh: true,  hub: "Sort of",  sf: false,         clay: false,   zi: false      },
    { f: "No quote-required tiers",                hh: true,  hub: false,      sf: false,         clay: true,    zi: false      },
    { f: "Price for all of the above",             hh: "$49/mo",  hub: "$800/mo",  sf: "$1,500/mo",   clay: "$149/mo", zi: "$15k/yr" },
  ];

  return (
    <section id="compare" style={{ padding: "100px 28px", borderTop: `1px solid ${M.rule}`, background: M.paperDeep }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <SectionLabel>How we compare</SectionLabel>
        <h2 style={sectionH2}>
          Built for{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>the rest of us.</span>
        </h2>
        <p style={sectionLead}>
          The big tools were built for big budgets. Humble Hello was built for the small business owner, the sales rep, the operator running on relationships and grit.
        </p>

        <div className="hh-table-wrap" style={{
          marginTop: 56, border: `1px solid ${M.rule}`, borderRadius: 14,
          overflow: "auto", background: "#fff",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: BODY, minWidth: 720 }}>
            <thead>
              <tr style={{ background: M.paperDeep }}>
                <th style={tableHeadCell}>Capability</th>
                <th style={{ ...tableHeadCell, padding: "12px 20px" }}>
                  <img
                    src="/logo-terra.svg"
                    alt="humble hello."
                    style={{ height: 24, width: "auto", display: "inline-block", verticalAlign: "middle" }}
                  />
                </th>
                <th style={tableHeadCell}>HubSpot</th>
                <th style={tableHeadCell}>Salesforce</th>
                <th style={tableHeadCell}>Clay</th>
                <th style={tableHeadCell}>ZoomInfo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.f} style={{
                  borderTop: `1px solid ${M.rule}`,
                  background: i % 2 ? M.paper : "#fff",
                }}>
                  <td style={{ ...tableCell, fontWeight: 600, color: M.ink }}>{r.f}</td>
                  <td style={{ ...tableCell, background: M.fireSoft + "55" }}>
                    <Cell v={r.hh} highlight />
                  </td>
                  <td style={tableCell}><Cell v={r.hub} /></td>
                  <td style={tableCell}><Cell v={r.sf} /></td>
                  <td style={tableCell}><Cell v={r.clay} /></td>
                  <td style={tableCell}><Cell v={r.zi} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{
          marginTop: 16, fontSize: 12, color: M.ink4,
          fontStyle: "italic" as const, textAlign: "center" as const,
        }}>
          Pricing reflects publicly listed entry tiers as of 2026. Enterprise contracts may negotiate.
        </p>
      </div>
    </section>
  );
}

function Cell({ v, highlight }: { v: any; highlight?: boolean }) {
  if (v === true) return <span style={{ color: highlight ? M.fire : M.forest, fontWeight: 700, fontSize: 18 }}>✓</span>;
  if (v === false) return <span style={{ color: M.ink4, fontSize: 18 }}>—</span>;
  return <span style={{
    fontSize: 13, color: highlight ? M.fire : M.ink2,
    fontWeight: highlight ? 700 : 400,
  }}>{v}</span>;
}

// ── FAQ ─────────────────────────────────────────────────────────────────────
function FAQ() {
  const items = [
    { q: "Do I need a credit card to start?", a: "No. The Free tier is genuinely free, and we don't ask for a card until you choose to upgrade or send cards or gifts. Sign in with Google or Microsoft and you're in." },
    { q: "How does the Growth trial work?", a: "On your first signup, you can try Growth free for 7 days. No card required up front. If you don't add a payment method during the trial, you drop to Free automatically — no surprise charges. Trial is one-time only per account." },
    { q: "Can I cancel any time?", a: "Yes. Manage your subscription in Settings → Manage billing. Your subscription cancels at the end of your billing period — you keep access until then, and we don't charge after that." },
    { q: "What's a Relationship Index credit?", a: "A deeper read on a contact — pulling LinkedIn, scoring on five personality dimensions, generating outreach openers. Free includes 5/month, Pro 50/month, Growth 200/month." },
    { q: "What happens to my data if I leave?", a: "You can export everything to CSV anytime. If you cancel, your data sits dormant for 30 days then permanently deletes. We never sell it." },
    { q: "Why is this so much cheaper than Clay or HubSpot?", a: "Because we built Humble Hello for individuals and small businesses, not Fortune 500 sales teams. We don't have commissioned sales reps, an enterprise contract team, or per-seat licensing. You shouldn't pay for what you don't need." },
    { q: "Does the AI write messages 'as me'?", a: "Drafts are personalized using everything we know about you and the contact — but every message is yours to review, edit, or skip before it sends. We tell you when context is too thin and won't auto-send those." },
  ];

  return (
    <section id="faq" style={{ padding: "100px 28px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <SectionLabel>Frequently asked</SectionLabel>
        <h2 style={sectionH2}>
          Questions worth{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>real answers.</span>
        </h2>

        <div style={{ marginTop: 56, borderTop: `1px solid ${M.rule}` }}>
          {items.map((item, i) => (
            <details key={i} className="hh-faq-item" style={{
              borderBottom: `1px solid ${M.rule}`, padding: "24px 0",
            }}>
              <summary style={{
                cursor: "pointer", listStyle: "none",
                display: "flex", alignItems: "flex-start",
                gap: 16, fontFamily: HEAD,
                fontSize: 19, fontWeight: 700, color: M.ink,
                letterSpacing: "-0.01em", lineHeight: 1.4,
              }}>
                <span aria-hidden style={{
                  fontFamily: MONO, fontSize: 12, fontWeight: 600,
                  color: M.fire, flexShrink: 0, marginTop: 6,
                  letterSpacing: "0.06em",
                }}>0{i + 1}</span>
                <span style={{ flex: 1 }}>{item.q}</span>
                <span aria-hidden className="hh-faq-marker" style={{
                  fontSize: 22, color: M.ink3, flexShrink: 0, lineHeight: 1,
                  fontWeight: 300, marginLeft: 16,
                }}>+</span>
              </summary>
              <div style={{
                paddingLeft: 36, marginTop: 14,
                fontSize: 16, lineHeight: 1.7, color: M.ink2, fontFamily: BODY,
              }}>
                {item.a}
              </div>
            </details>
          ))}
        </div>

        <div style={{ marginTop: 48, textAlign: "center" as const, fontSize: 14, color: M.ink3 }}>
          Still have questions?{" "}
          <a href="mailto:tom@humblehello.com" style={{
            color: M.fire, textDecoration: "none", fontWeight: 600,
            borderBottom: `1px solid ${M.fireSoft}`, paddingBottom: 1,
          }}>Email Tom directly →</a>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCta({ userState }: { userState: UserState }) {
  if (userState === "loading") return null;
  const isLoggedIn = !["visitor"].includes(userState);

  return (
    <section style={{
      padding: "100px 28px", textAlign: "center" as const,
      background: M.paperDeep, borderTop: `1px solid ${M.rule}`,
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(32px, 4.6vw, 48px)",
          lineHeight: 1.12, fontWeight: 700, color: M.ink, margin: 0,
          letterSpacing: "-0.02em",
        }}>
          {isLoggedIn ? (
            <>Questions?{" "}<span style={{ fontStyle: "italic", color: M.fire }}>Tom's an email away.</span></>
          ) : (
            <>Try it free.{" "}<span style={{ fontStyle: "italic", color: M.fire }}>Decide later.</span></>
          )}
        </h2>

        <p style={{ fontSize: 17, color: M.ink2, marginTop: 22, lineHeight: 1.6, fontFamily: BODY }}>
          {isLoggedIn ? (
            <>Have a billing question or just want to talk through which plan fits? <a href="mailto:tom@humblehello.com" style={{ color: M.fire, textDecoration: "none", fontWeight: 600 }}>tom@humblehello.com</a></>
          ) : (
            <>Free forever for the basics. Connect Gmail or Outlook in 30 seconds and see what your network looks like with Humble Hello.</>
          )}
        </p>

        {!isLoggedIn && (
          <div style={{ marginTop: 36 }}>
            <AuthTrigger mode="signup" style={{
              display: "inline-block", padding: "14px 32px",
              background: M.green, color: "#fff",
              fontFamily: BODY, fontSize: 15, fontWeight: 600,
              borderRadius: 10, border: "none", cursor: "pointer",
              textDecoration: "none",
            }}>
              Try for free →
            </AuthTrigger>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: "60px 28px 40px", borderTop: `1px solid ${M.rule}`, background: M.paper }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="hh-footer-grid" style={{
          display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr",
          gap: 48, paddingBottom: 40, borderBottom: `1px solid ${M.rule}`,
        }}>
          <div>
            <Link href="/" style={{ textDecoration: "none" }}>
              <span style={{
                fontFamily: "'ITCSouvenir', 'Libre Baskerville', serif",
                fontWeight: 700, fontSize: 26, color: M.fire,
              }}>humble hello.</span>
            </Link>
            <p style={{
              fontFamily: HEAD, fontStyle: "italic",
              fontSize: 16, lineHeight: 1.55, color: M.ink2,
              marginTop: 16, marginBottom: 0, maxWidth: 280,
            }}>
              For the people you actually want to keep.
            </p>
          </div>

          <FooterCol title="Product" links={[
            { label: "Features", href: "/features" },
            { label: "Plans", href: "/plans" },
          ]} />

          <FooterCol title="Legal" links={[
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
            { label: "Contact", href: "mailto:tom@humblehello.com" },
          ]} />
        </div>

        <div style={{
          paddingTop: 24, display: "flex", flexWrap: "wrap" as const,
          justifyContent: "space-between", alignItems: "center", gap: 16,
          fontSize: 12, color: M.ink4, fontFamily: BODY,
        }}>
          <div>© {new Date().getFullYear()} Humble Hello · Made in Indianapolis</div>
          <div style={{ fontStyle: "italic" as const, color: M.ink3 }}>Hello, gently.</div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div style={{
        fontFamily: MONO, fontSize: 11, color: M.ink3,
        letterSpacing: "0.12em", textTransform: "uppercase" as const,
        fontWeight: 600, marginBottom: 16,
      }}>{title}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {links.map(l => (
          <li key={l.href}>
            <Link href={l.href} style={{ fontSize: 14, color: M.ink2, textDecoration: "none", fontFamily: BODY }}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      fontFamily: MONO, fontSize: 12, fontWeight: 600,
      color: M.fire,
      letterSpacing: "0.14em", textTransform: "uppercase" as const,
      marginBottom: 20,
    }}>
      <span aria-hidden style={{ width: 24, height: 1, background: M.fire }} />
      {children}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

const sectionH2: React.CSSProperties = {
  fontFamily: HEAD, fontSize: "clamp(32px, 4.4vw, 52px)",
  lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.02em",
  color: M.ink, margin: 0, maxWidth: 880,
};

const sectionLead: React.CSSProperties = {
  fontFamily: BODY, fontSize: 17, lineHeight: 1.65,
  color: M.ink2, marginTop: 22, maxWidth: 720,
};

const tableHeadCell: React.CSSProperties = {
  textAlign: "left" as const, padding: "16px 20px",
  fontSize: 13, fontWeight: 600, color: M.ink2,
};

const tableCell: React.CSSProperties = {
  textAlign: "left" as const, padding: "16px 20px",
  fontSize: 14, color: M.ink2,
};

const globalCss = `
  body { margin: 0; }
  a { color: inherit; }
  a:hover { opacity: 0.85; }

  .hh-faq-item summary { user-select: none; }
  .hh-faq-item summary::-webkit-details-marker { display: none; }
  .hh-faq-item[open] .hh-faq-marker { transform: rotate(45deg); }
  .hh-faq-marker { transition: transform 0.2s ease; }

  @media (max-width: 980px) {
    .hh-plans-grid { grid-template-columns: 1fr !important; gap: 40px !important; max-width: 480px; margin: 0 auto; }
    .hh-plans-grid > div { transform: none !important; }
    .hh-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
    .hh-nav-links { gap: 14px !important; }
  }

  @media (max-width: 640px) {
    .hh-nav-links { gap: 10px !important; }
    .hh-nav-links a[href="/plans"],
    .hh-nav-links span[aria-hidden] { display: none !important; }
    .hh-footer-grid { grid-template-columns: 1fr !important; }
  }
`;