"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { C, font, fontHeading } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (priceEnvKey: string, planName: string) => {
    setLoading(planName);
    try {
      const priceMap: Record<string, string> = {
        pro_monthly: "price_1TIV6aBupCCDyTTUIPt6qUNv",
        pro_annual: "price_1TIV6aBupCCDyTTUSrebjytb",
        growth_monthly: "price_1TIV72BupCCDyTTUx6VzkCYb",
        growth_annual: "price_1TIV7sBupCCDyTTUD4StSWU0",
      };
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceMap[priceEnvKey], billing }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
    }
    setLoading(null);
  };

  // ── The automation ladder
  const ladder = [
    {
      level: 1,
      label: "Manual",
      tier: "Free",
      automationDots: 1,
      headline: "You do the work.",
      story: "Humble Hello surfaces who matters. You write, send, and remember.",
      accent: C.text3,
      bg: C.bg2,
      border: C.border,
    },
    {
      level: 2,
      label: "Personal",
      tier: "Hello Pro",
      automationDots: 3,
      headline: "It does the work for you.",
      story: "Drafts, scheduled sends, follow-ups, smart gifts. You approve, it runs.",
      accent: C.green,
      bg: C.greenLight,
      border: C.green,
    },
    {
      level: 3,
      label: "Business",
      tier: "Hello Growth",
      automationDots: 5,
      headline: "It scales the work.",
      story: "Audiences, campaigns, CRM sync. Turn relationships into revenue.",
      accent: C.purple,
      bg: C.purpleLight,
      border: C.purple,
    },
  ];

  // ── Cards: tighter copy, fixed Growth tier
  const plans = [
    {
      name: "Free",
      tagline: "Stay in touch",
      price: { monthly: 0, annual: 0 },
      limit: "Unlimited contacts",
      color: C.text3,
      bg: C.bg2,
      border: C.border,
      priceKey: null,
      features: [
        "Daily reach-out suggestions",
        "Auto-organize Core 5 / 15 / 50 / 150 tiers",
        "25 AI drafts per week",
        "Send cards & gifts ($4.75 each)",
        "Auto-running email verification",
        "Journal — capture life events",
        "Google Contacts two-way sync",
        "Relationship Index — 5 LinkedIn reads/mo",
      ],
      missing: [
        "Unlimited AI drafts (Pro)",
        "Scheduled sends + auto follow-ups (Pro)",
        "Smart gifting (Pro)",
        "Audiences + Campaigns (Growth)",
        "HubSpot + Salesforce sync (Growth)",
      ],
    },
    {
      name: "Hello Pro",
      tagline: "Never drop a relationship",
      price: { monthly: 25, annual: 22.50 },
      limit: "Unlimited contacts",
      color: C.green,
      bg: C.greenLight,
      border: C.green,
      priceKey: billing === "monthly" ? "pro_monthly" : "pro_annual",
      features: [
        "Everything in Free",
        "Unlimited AI drafts",
        "Scheduled sends + auto follow-ups",
        "Smart gifting on life events",
        "Email + SMS outreach",
        "Hopper bulk imports",
        "Outlook + Gmail support",
        "Relationship Index — 50 LinkedIn reads/mo",
      ],
      missing: [
        "Audiences + Campaigns",
        "Bulk messaging at scale",
        "HubSpot / Salesforce sync",
        "Pipeline + account insights",
      ],
    },
    {
      name: "Hello Growth",
      tagline: "Turn relationships into revenue",
      price: { monthly: 49, annual: 44.10 },
      limit: "Unlimited contacts",
      color: C.purple,
      bg: C.purpleLight,
      border: C.purple,
      priceKey: billing === "monthly" ? "growth_monthly" : "growth_annual",
      features: [
        "Everything in Pro",
        "Audiences — target the right prospects",
        "Campaigns — bulk emails, cards, gifts",
        "HubSpot + Salesforce sync",
        "Pipeline + account-level insights",
        "Auto-gifting on life events",
        "Contact tagging at scale",
        "Relationship Index — 200 LinkedIn reads/mo",
      ],
      missing: [],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex" }}>
      <Sidebar activeId="settings" />
      <main style={{ flex: 1, padding: "48px 32px 80px", overflowY: "auto" as const }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>

          {/* ──────────────────────────── HERO ──────────────────────────── */}
          <div style={{ textAlign: "center" as const, marginBottom: 56 }}>
            <div style={{ marginBottom: 32, display: "flex", justifyContent: "center" }}>
              <img
                src="/logo-terra.svg"
                alt="humble hello."
                style={{ height: 48, width: "auto" }}
              />
            </div>
            <div style={{
              fontFamily: fontHeading,
              fontSize: 44,
              fontWeight: 700,
              color: C.text,
              marginBottom: 12,
              lineHeight: 1.15,
              letterSpacing: "-0.015em",
            }}>
              Humble Hello enriches your network with deeper data, then uses it to engage on your behalf.
            </div>
            <div style={{
              fontSize: 16,
              color: C.text3,
              maxWidth: 480,
              margin: "0 auto",
              lineHeight: 1.5,
            }}>
               Your network. Enhanced. And working for you.
            </div>
          </div>

          {/* ──────────────────────────── AUTOMATION LADDER ──────────────────────────── */}
          

          {/* ──────────────────────────── BILLING TOGGLE ──────────────────────────── */}
          <div style={{ textAlign: "center" as const, marginBottom: 32 }}>
            <div style={{
              display: "inline-flex",
              background: C.bg2,
              borderRadius: 30,
              padding: 4,
              border: `1px solid ${C.border}`,
            }}>
              {(["monthly", "annual"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBilling(b)}
                  style={{
                    padding: "9px 24px",
                    borderRadius: 26,
                    border: "none",
                    background: billing === b ? C.text : "transparent",
                    color: billing === b ? "#fff" : C.text3,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: font,
                    transition: "all 0.15s",
                  }}
                >
                  {b === "monthly" ? "Monthly" : "Annual · save 10%"}
                </button>
              ))}
            </div>
          </div>

          {/* ──────────────────────────── COMPARISON CARDS ──────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
            marginBottom: 40,
          }}>
            {plans.map((plan) => (
              <div
                key={plan.name}
                style={{
                  background: plan.bg,
                  border: `2px solid ${plan.border}`,
                  borderRadius: 16,
                  padding: 28,
                  display: "flex",
                  flexDirection: "column" as const,
                  gap: 16,
                }}
              >
                <div>
                  <div style={{
                    fontFamily: fontHeading,
                    fontSize: 20,
                    fontWeight: 700,
                    color: plan.color,
                    marginBottom: 4,
                    letterSpacing: "0",
                  }}>
                    {plan.name}
                  </div>
                  <div style={{
                    fontSize: 13,
                    fontStyle: "italic" as const,
                    color: plan.color,
                    marginBottom: 6,
                  }}>
                    {plan.tagline}
                  </div>
                  <div style={{ fontSize: 11, color: C.text3 }}>{plan.limit}</div>
                </div>
                <div>
                  <span style={{ fontSize: 36, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>
                    ${billing === "monthly" ? plan.price.monthly : plan.price.annual}
                  </span>
                  <span style={{ fontSize: 13, color: C.text3 }}>/mo</span>
                  {billing === "annual" && plan.price.annual > 0 && (
                    <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>
                      Billed ${(plan.price.annual * 12).toFixed(0)}/year
                    </div>
                  )}
                </div>

                {plan.priceKey ? (
                  <button
                    onClick={() => handleUpgrade(plan.priceKey!, plan.name)}
                    disabled={loading === plan.name}
                    style={{
                      padding: "12px",
                      borderRadius: 10,
                      border: "none",
                      background: plan.color,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: loading === plan.name ? "default" : "pointer",
                      fontFamily: font,
                      opacity: loading === plan.name ? 0.7 : 1,
                      transition: "all 0.15s",
                    }}
                  >
                    {loading === plan.name ? "Loading…" : "Start 7-day free trial"}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push("/dashboard")}
                    style={{
                      padding: "12px",
                      borderRadius: 10,
                      border: `1px solid ${C.border2}`,
                      background: C.bg2,
                      color: C.text2,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: font,
                    }}
                  >
                    Current plan
                  </button>
                )}

                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {plan.features.map((f) => (
                    <div key={f} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 13,
                      color: C.text,
                      lineHeight: 1.45,
                    }}>
                      <span style={{ color: plan.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                  {plan.missing.map((f) => (
                    <div key={f} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 13,
                      color: C.text4,
                      lineHeight: 1.45,
                    }}>
                      <span style={{ flexShrink: 0 }}>—</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ──────────────────────────── FOOTER ──────────────────────────── */}
          <div style={{
            textAlign: "center" as const,
            fontSize: 13,
            color: C.text3,
            paddingTop: 24,
            borderTop: `1px solid ${C.border}`,
          }}>
            All paid plans include a 7-day free trial of Hello Growth. Cancel anytime.
          </div>
        </div>
      </main>
    </div>
  );
}