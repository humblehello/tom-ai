"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C, font } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";

const iStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const };
const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{desc}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", flexShrink: 0, background: value ? C.green : C.border2, position: "relative" as const, transition: "background 0.2s" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: value ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </div>
    </div>
  );
}

function ConnectionRow({ icon, name, desc, connected, accountEmail, comingSoon, planRequired, onConnect, onDisconnect }: {
  icon: string;
  name: string;
  desc: string;
  connected?: boolean;
  accountEmail?: string | null;
  comingSoon?: boolean;
  planRequired?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{name}</div>
          <div style={{ fontSize: 11, color: C.text3 }}>{accountEmail ? accountEmail : desc}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {connected ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.greenLight, border: `1px solid ${C.green}44`, borderRadius: 20, padding: "4px 12px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Connected</span>
            </div>
            {onDisconnect && (
              <button onClick={onDisconnect} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, cursor: "pointer", fontFamily: font }}>
                Disconnect
              </button>
            )}
          </>
        ) : comingSoon ? (
          <span style={{ fontSize: 11, color: C.text4, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 20, padding: "4px 12px" }}>Coming soon</span>
        ) : planRequired ? (
          <span style={{ fontSize: 11, color: C.amber, background: C.amberLight, border: `1px solid ${C.amber}44`, borderRadius: 20, padding: "4px 12px" }}>{planRequired} required</span>
        ) : (
          <button onClick={onConnect} style={{ fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: 20, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, cursor: "pointer", fontFamily: font }}>Connect</button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [planData, setPlanData] = useState<any>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<{ last4: string; brand: string } | null>(null);
  const [cardElement, setCardElement] = useState<any>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [cardAdded, setCardAdded] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);

  // Settings state
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);
  const [autoOrderThreshold, setAutoOrderThreshold] = useState(10);
  const [approvalThreshold, setApprovalThreshold] = useState(50);
  const [giftStyle, setGiftStyle] = useState("thoughtful");
  const [snoozeDays, setSnoozeDays] = useState(14);
 const [cardSignoff, setCardSignoff] = useState("");
const [cardTone, setCardTone] = useState("warm");
const [cardThresholds, setCardThresholds] = useState<number[]>([2]);
const [cardAutoSend, setCardAutoSend] = useState(false);
const [cardTriggers, setCardTriggers] = useState<string[]>(["birthday"]);
const [cardBudgetCents, setCardBudgetCents] = useState(2500);     // $25 default
const [giftBudgetCents, setGiftBudgetCents] = useState(5000);     // $50 default
  const [suppressNoEmail, setSuppressNoEmail] = useState(true);
  const [networkOptIn, setNetworkOptIn] = useState(false);
  const [cardPurchaseThreshold, setCardPurchaseThreshold] = useState(500);
  const [giftPurchaseThreshold, setGiftPurchaseThreshold] = useState(10000);
  const [purchaseCardAutoSend, setPurchaseCardAutoSend] = useState(false);
  const [purchaseGiftAutoSend, setPurchaseGiftAutoSend] = useState(false);

  // Connection state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [microsoftEmail, setMicrosoftEmail] = useState<string | null>(null);
  const [primaryProvider, setPrimaryProvider] = useState<"google" | "microsoft">("google");
  const [msBanner, setMsBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/stripe/card-charge").then(r => r.json()).then(d => {
      if (d.has_payment_method) setPaymentMethod({ last4: d.last4, brand: d.brand });
    }).catch(() => {});

    Promise.all([
      fetch("/api/settings").then(r => r.json()).catch(() => null),
      fetch("/api/plan").then(r => r.json()).catch(() => null),
      fetch("/api/auth/me").then(r => r.json()).catch(() => null),
    ]).then(([settings, plan, me]) => {
      if (settings) {
        setNotifyEmail(settings.notify_email ?? true);
        setNotifyPush(settings.notify_push ?? false);
        setAutoOrderThreshold(settings.auto_order_threshold ?? 10);
        setApprovalThreshold(settings.approval_threshold ?? 50);
        setGiftStyle(settings.gift_style ?? "thoughtful");
        setSnoozeDays(settings.snooze_days ?? 5);
        setNetworkOptIn(settings.network_opt_in ?? false);
        setCardPurchaseThreshold(settings.card_purchase_threshold ?? 500);
        setGiftPurchaseThreshold(settings.gift_purchase_threshold ?? 10000);
        setPurchaseCardAutoSend(settings.purchase_card_auto_send ?? false);
        setPurchaseGiftAutoSend(settings.purchase_gift_auto_send ?? false);
      }
      if (plan) setPlanData(plan);
      if (me) {
        setGoogleConnected(!!me.refresh_token);
        setMicrosoftConnected(!!me.microsoft_refresh_token);
        setGoogleEmail(me.google_account_email ?? null);
        setMicrosoftEmail(me.microsoft_account_email ?? null);
        setPrimaryProvider(me.primary_email_provider || "google");
      }
     if (me?.card_profile) {
  const cp = me.card_profile;
  setCardSignoff(cp.signoff || "");
  setCardTone(cp.tone || "warm");
  setCardThresholds(cp.auto_send_thresholds || [cp.auto_send_threshold] || [2]);
  setCardAutoSend(cp.auto_send_enabled || false);
  setCardTriggers(cp.triggers || ["birthday"]);
  setCardBudgetCents(cp.budget_cents ?? 2500);
  setGiftBudgetCents(cp.gift_budget_cents ?? 5000);
}
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ms_connected")) {
      setMsBanner({ type: "success", text: "Microsoft account connected successfully." });
      window.history.replaceState({}, "", "/settings");
      setTimeout(() => setMsBanner(null), 5000);
    } else if (params.get("ms_error")) {
      setMsBanner({ type: "error", text: `Couldn't connect Microsoft: ${params.get("ms_error")}` });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const handleSave = async () => {
  setSaving(true);
  try {
    // Fetch current card_profile to preserve locked defaults
    // (gift_budget_cents, gift_style, purchase_thank_you_threshold_cents, etc.)
    const meRes = await fetch("/api/auth/me");
    const me = meRes.ok ? await meRes.json() : null;
    const currentCardProfile = me?.card_profile || {};

    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notify_email: notifyEmail,
        notify_push: notifyPush,
        auto_order_threshold: autoOrderThreshold,
        approval_threshold: approvalThreshold,
        gift_style: giftStyle,
        snooze_days: snoozeDays,
        network_opt_in: networkOptIn,
        card_purchase_threshold: cardPurchaseThreshold,
        gift_purchase_threshold: giftPurchaseThreshold,
        purchase_card_auto_send: purchaseCardAutoSend,
        purchase_gift_auto_send: purchaseGiftAutoSend,
      }),
    });
    await fetch("/api/profile", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    card_profile: {
      ...currentCardProfile,
      signoff: cardSignoff,
      tone: cardTone,
      auto_send_thresholds: cardThresholds,
      auto_send_enabled: cardAutoSend,
      triggers: cardTriggers,
      budget_cents: cardBudgetCents,
      gift_budget_cents: giftBudgetCents,
    },
  }),
});
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  } catch {}
  setSaving(false);
};

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setPortalLoading(false);
  };

  const handleConnectMicrosoft = () => {
    window.location.href = "/api/auth/microsoft";
  };

  const handleDisconnectMicrosoft = async () => {
    if (!confirm("Disconnect Microsoft account? You can reconnect anytime.")) return;
    try {
      await fetch("/api/auth/microsoft/disconnect", { method: "POST" });
      setMicrosoftConnected(false);
      setMicrosoftEmail(null);
      if (primaryProvider === "microsoft") setPrimaryProvider("google");
    } catch {
      alert("Failed to disconnect — please try again.");
    }
  };

  const handleSwitchPrimaryProvider = async (provider: "google" | "microsoft") => {
    setPrimaryProvider(provider);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_email_provider: provider }),
      });
    } catch {}
  };

  const plan = planData?.plan || "free";
  const trialDaysLeft = planData?.trial_ends_at ? Math.max(0, Math.ceil((new Date(planData.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0;
  const draftLimit = plan === "free" ? 100 : plan === "pro" ? 250 : -1;
  const draftsUsed = planData?.ai_drafts_used || 0;
  const draftsPercent = draftLimit === -1 ? 0 : Math.min(100, (draftsUsed / draftLimit) * 100);
  const contactLimit = planData?.plan_contact_limit || 1000;
  const planLabel = plan === "trial" ? "Hello Growth (Trial)" : plan === "pro" ? "Hello Pro" : plan === "growth" ? "Hello Growth" : "Free";
  const planColor = plan === "growth" ? C.purple : plan === "pro" ? C.green : plan === "trial" ? C.terra : C.text3;
  const planFeatures = (() => {
  if (plan === "growth" || plan === "trial") return "Unlimited drafts · 200 RI/mo · Campaigns + cards & gifts";
  if (plan === "pro") return "Unlimited drafts · 50 RI/mo · Cards & gifts";
  return "25 drafts/wk · 5 RI/mo · Unlimited contacts";
})();

  const GIFT_STYLES = [
    { value: "thoughtful", label: "Thoughtful", desc: "Personal, meaningful gifts tailored to the recipient" },
    { value: "practical", label: "Practical", desc: "Useful everyday items the person will actually use" },
    { value: "experiential", label: "Experiential", desc: "Experiences, activities, and gift cards" },
    { value: "luxurious", label: "Luxurious", desc: "Premium, high-end gifts that feel special" },
  ];

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const init = () => {
      if ((window as any).Stripe) {
        setStripe((window as any).Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!));
        clearInterval(interval);
      }
    };
    init();
    interval = setInterval(init, 150);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!stripe) return;
    if (paymentMethod && !showCardForm) return;

    let mounted = true;
    let attempts = 0;

    const tryMount = () => {
      if (!mounted) return;
      const el = document.getElementById("stripe-card-element");
      if (!el) {
        attempts++;
        if (attempts < 20) setTimeout(tryMount, 200);
        return;
      }
      el.innerHTML = "";
      const elements = stripe.elements();
      const card = elements.create("card", {
        style: {
          base: {
            fontSize: "13px",
            color: C.text,
            fontFamily: font,
            "::placeholder": { color: C.text4 },
          },
        },
      });
      card.mount(el);
      if (mounted) setCardElement(card);
    };

    setTimeout(tryMount, 100);
    return () => { mounted = false; };
  }, [stripe, showCardForm, paymentMethod]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ color: C.text3 }}>Loading settings...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex" }}>
      <Sidebar activeId="settings" />
      <main style={{ flex: 1, overflowY: "auto" as const, padding: "32px 40px 100px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Settings</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Configure how Humble Hello works for you</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

           <Card title="Plan & Billing" subtitle="Manage your Humble Hello subscription">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{planLabel}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: planColor, background: `${planColor}18`, padding: "2px 8px", borderRadius: 20 }}>
                      {plan === "trial" ? `${trialDaysLeft} days left` : plan === "free" ? "Free" : "Active"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{planFeatures}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(plan === "free" || plan === "trial") && (
                    <button onClick={() => router.push("/plans")} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                      Upgrade
                    </button>
                  )}
                  {(plan === "pro" || plan === "growth") && (
                    <button onClick={handlePortal} disabled={portalLoading} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                      {portalLoading ? "Loading..." : "Manage billing"}
                    </button>
                  )}
                </div>
              </div>

              {draftLimit !== -1 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>AI draft messages this month</span>
                    <span style={{ fontSize: 12, color: draftsPercent > 80 ? C.red : C.text3 }}>{draftsUsed} / {draftLimit}</span>
                  </div>
                  <div style={{ height: 6, background: C.bg3, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${draftsPercent}%`, background: draftsPercent > 80 ? C.red : C.terra, borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                  {draftsPercent > 80 && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                      Running low — <button onClick={() => router.push("/plans")} style={{ background: "none", border: "none", color: C.red, fontWeight: 700, cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}>upgrade for more</button>
                    </div>
                  )}
                </div>
              )}

              <div style={{ paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Card Payment Method</div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 12 }}>Used to pay monthly subscription & $4.75 per handwritten card sent via Humble Hello.</div>
                {paymentMethod ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "10px 14px" }}>
                      <span style={{ fontSize: 16 }}>💳</span>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600, textTransform: "capitalize" as const }}>{paymentMethod.brand} ···· {paymentMethod.last4}</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: C.greenLight, color: C.green, fontWeight: 600 }}>Active</span>
                    </div>
                    <button onClick={() => setShowCardForm(true)} style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, cursor: "pointer", fontFamily: font }}>Replace</button>
                  </div>
                ) : (
                  <div style={{ background: C.amberLight, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.amber }}>
                    ⚠️ No payment method on file — add one to send cards
                  </div>
                )}
                {(!paymentMethod || showCardForm) && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      key={`card-${showCardForm}-${!!paymentMethod}`}
                      id="stripe-card-element"
                      style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, marginBottom: 12, minHeight: 42 }}
                    />
                    {cardAdded && <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 8 }}>✓ Card saved successfully!</div>}
                    <button onClick={async () => {
                      if (!stripe || !cardElement) return;
                      setAddingCard(true);
                      try {
                        const setupRes = await fetch("/api/stripe/setup-payment", { method: "POST" });
                        const { client_secret } = await setupRes.json();
                        const result = await stripe.confirmCardSetup(client_secret, {
                          payment_method: { card: cardElement },
                        });
                        if (result.error) {
                          alert(result.error.message);
                        } else {
                          const pmRes = await fetch("/api/stripe/card-charge");
                          const pmData = await pmRes.json();
                          if (pmData.has_payment_method) {
                            setPaymentMethod({ last4: pmData.last4, brand: pmData.brand });
                            setCardAdded(true);
                            setShowCardForm(false);
                            setTimeout(() => setCardAdded(false), 3000);
                          }
                        }
                      } catch (e) {
                        alert("Failed to save card — please try again.");
                      }
                      setAddingCard(false);
                    }} disabled={addingCard || !stripe} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: addingCard ? C.bg3 : C.terra, color: addingCard ? C.text4 : "#fff", fontSize: 13, fontWeight: 600, cursor: addingCard ? "default" : "pointer", fontFamily: font }}>
                      {addingCard ? "Saving..." : "Save Card"}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: C.text4, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                Need more? <button onClick={() => router.push("/plans")} style={{ background: "none", border: "none", color: C.terra, fontWeight: 600, cursor: "pointer", fontSize: 12, padding: 0 }}>View all plans →</button>
              </div>
            </Card>

            <Card title="Card Profile" subtitle="How Humble Hello sends handwritten cards on your behalf">
              <div>
                <label style={lStyle}>Sign-off name</label>
                <input
                  value={cardSignoff}
                  onChange={e => setCardSignoff(e.target.value)}
                  placeholder="e.g. Tom"
                  style={iStyle}
                />
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>How your name appears at the bottom of every card</div>
              </div>
              <div>
                <label style={lStyle}>Card tone</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {["warm", "professional", "casual", "formal"].map(t => {
                    const active = cardTone === t;
                    return (
                      <button key={t} onClick={() => setCardTone(t)}
                        style={{ padding: "7px 16px", borderRadius: 20, border: `1.5px solid ${active ? C.terra : C.border2}`, background: active ? `${C.terra}18` : C.bg3, color: active ? C.terra : C.text3, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: font, textTransform: "capitalize" as const }}>
                        {active ? "✓ " : ""}{t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={lStyle}>Auto-send threshold</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {[
                    { value: 1, label: "Core 5" },
                    { value: 2, label: "Inner Circle 15" },
                    { value: 3, label: "Active 50" },
                  ].map(t => {
                    const active = (cardThresholds || []).includes(t.value);
                    return (
                      <button key={t.value} onClick={() => setCardThresholds(prev =>
                        active ? prev.filter(x => x !== t.value) : [...prev, t.value]
                      )}
                        style={{ padding: "7px 16px", borderRadius: 20, border: `1.5px solid ${active ? C.terra : C.border2}`, background: active ? `${C.terra}18` : C.bg3, color: active ? C.terra : C.text3, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                        {active ? "✓ " : ""}{t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Contacts in these tiers can auto-send — everyone else requires your approval</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Auto-send for contacts inside threshold</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>When off, all sends require your approval even for top-tier contacts</div>
                </div>
                <div onClick={() => setCardAutoSend(v => !v)} style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", flexShrink: 0, background: cardAutoSend ? C.green : C.border2, position: "relative" as const, transition: "background 0.2s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: cardAutoSend ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <div>
                <label style={lStyle}>Card triggers</label>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {[
                    { id: "birthday", label: "Birthday", desc: "Send a card on their birthday" },
                    { id: "job_change", label: "Job change / Promotion", desc: "Congratulate them on a new role" },
                    { id: "work_anniversary", label: "Work anniversary", desc: "Recognize their career milestone" },
                    { id: "life_event", label: "Life event", desc: "New baby, wedding, graduation, etc." },
                  ].map(trigger => {
                    const active = cardTriggers.includes(trigger.id);
                    return (
                      <div key={trigger.id} onClick={() => setCardTriggers(prev => active ? prev.filter(t => t !== trigger.id) : [...prev, trigger.id])}
                        style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? C.terra : C.border2}`, background: active ? `${C.terra}11` : C.bg3, transition: "all 0.15s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${active ? C.terra : C.border2}`, background: active ? C.terra : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {active && <div style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{trigger.label}</div>
                          <div style={{ fontSize: 11, color: C.text3 }}>{trigger.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Card budget */}
<div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
  <label style={lStyle}>Monthly card budget</label>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <input
      type="range"
      min={10}
      max={200}
      step={5}
      value={Math.round(cardBudgetCents / 100)}
      onChange={e => setCardBudgetCents(+e.target.value * 100)}
      style={{ flex: 1, accentColor: C.terra }}
    />
    <span style={{ fontSize: 14, fontWeight: 700, color: C.text, minWidth: 60 }}>
      ${Math.round(cardBudgetCents / 100)}
      <span style={{ fontSize: 11, color: C.text4, fontWeight: 400 }}>/mo</span>
    </span>
  </div>
  <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>
    Cap on auto-send card spend per month. ~{Math.floor(cardBudgetCents / 475)} cards at $4.75 each. Resets on the 1st.
  </div>
</div>

{/* Gift budget */}
<div>
  <label style={lStyle}>Per-gift budget</label>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <input
      type="range"
      min={10}
      max={500}
      step={5}
      value={Math.round(giftBudgetCents / 100)}
      onChange={e => setGiftBudgetCents(+e.target.value * 100)}
      style={{ flex: 1, accentColor: C.terra }}
    />
    <span style={{ fontSize: 14, fontWeight: 700, color: C.text, minWidth: 60 }}>
      ${Math.round(giftBudgetCents / 100)}
    </span>
  </div>
  <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>
    Maximum spend per gift sent. Anything above this requires your approval.
  </div>
</div>
              <div style={{ background: C.terraLight, border: `1px solid ${C.terra}44`, borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.terraDark, lineHeight: 1.6 }}>
                Humble Hello sends handwritten cards on your behalf — real pen, real stamp, delivered by mail. "Thinking of you" and "Thank you" cards are always manual via the Reach Out button.
              </div>
            </Card>

            <Card title="Engage" subtitle="How Humble Hello surfaces contacts for outreach">
              <div>
                <label style={lStyle}>Snooze duration</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" min={1} max={30} step={1} value={snoozeDays} onChange={e => setSnoozeDays(+e.target.value)} style={{ flex: 1, accentColor: C.terra }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, minWidth: 60 }}>{snoozeDays} days</span>
                </div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>When you dismiss a contact from Engage, they won't reappear for this many days</div>
              </div>
              <Toggle
                value={suppressNoEmail}
                onChange={setSuppressNoEmail}
                label="Suppress contacts with no recent email history"
                desc="Hide contacts with no email activity in 10+ months unless they're a friend, family, or top tier"
              />
            </Card>

            <Card title="Autonomy & Gifts" subtitle="Define when Humble Hello acts automatically vs asks for approval">
              <div>
                <label style={lStyle}>Auto-order threshold</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" min={0} max={100} step={5} value={autoOrderThreshold} onChange={e => setAutoOrderThreshold(+e.target.value)} style={{ flex: 1, accentColor: C.terra }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, minWidth: 40 }}>${autoOrderThreshold}</span>
                </div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Orders under this amount are placed automatically</div>
              </div>
              <div>
                <label style={lStyle}>Approval threshold</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" min={10} max={500} step={10} value={approvalThreshold} onChange={e => setApprovalThreshold(+e.target.value)} style={{ flex: 1, accentColor: C.terra }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, minWidth: 40 }}>${approvalThreshold}</span>
                </div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Orders over this amount require your one-tap approval</div>
              </div>
              <div style={{ background: C.greenLight, border: `1px solid ${C.green}44`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>Your autonomy rules</div>
                <div style={{ fontSize: 12, color: C.green, display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  <div>✓ Under ${autoOrderThreshold} — auto-orders, no notification</div>
                  <div>✓ ${autoOrderThreshold}–${approvalThreshold} — orders and notifies you</div>
                  <div>✓ Over ${approvalThreshold} — asks for your approval first</div>
                </div>
              </div>
              <div>
                <label style={lStyle}>Gift Style</label>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {GIFT_STYLES.map(gs => {
                    const active = giftStyle === gs.value;
                    return (
                      <div key={gs.value} onClick={() => setGiftStyle(gs.value)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? C.terra : C.border2}`, background: active ? `${C.terra}11` : C.bg3, transition: "all 0.15s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, border: `2px solid ${active ? C.terra : C.border2}`, background: active ? C.terra : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{gs.label}</div>
                          <div style={{ fontSize: 11, color: C.text3 }}>{gs.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card title="Purchase Thank-You Automation" subtitle="Automatically thank contacts when they make a purchase">
              <div>
                <label style={lStyle}>Send a thank-you card when purchase exceeds</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.text3 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    max={50000}
                    step={100}
                    value={cardPurchaseThreshold}
                    onChange={e => setCardPurchaseThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ ...iStyle, width: 140 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Set to $0 to trigger on every logged purchase</div>
              </div>
              <Toggle
                value={purchaseCardAutoSend}
                onChange={setPurchaseCardAutoSend}
                label="Auto-send thank-you card"
                desc="Skip approval and send automatically when card threshold is met"
              />
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                <label style={lStyle}>Send a thank-you gift when purchase exceeds</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.text3 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    max={50000}
                    step={1000}
                    value={giftPurchaseThreshold}
                    onChange={e => setGiftPurchaseThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ ...iStyle, width: 140 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Gifts coming soon — a card will be queued until the gifting store is live</div>
              </div>
              <Toggle
                value={purchaseGiftAutoSend}
                onChange={setPurchaseGiftAutoSend}
                label="Auto-send thank-you gift"
                desc="Skip approval and send automatically when gift threshold is met"
              />
              <div style={{ background: C.greenLight, border: `1px solid ${C.green}44`, borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.green, lineHeight: 1.6 }}>
                Log purchases on any contact card — Humble Hello will automatically queue a thank-you when the threshold is met.
              </div>
            </Card>

            <Card title="Notifications" subtitle="How Humble Hello keeps you in the loop">
              <div style={{ marginTop: -8 }}>
                <Toggle value={notifyEmail} onChange={setNotifyEmail} label="Email notifications" desc="Activity summaries and important alerts" />
                <Toggle value={notifyPush} onChange={setNotifyPush} label="Push notifications" desc="Browser and mobile push notifications" />
              </div>
            </Card>

            <Card title="Connections" subtitle="Services connected to Humble Hello">
              {msBanner && (
                <div style={{
                  background: msBanner.type === "success" ? C.greenLight : C.redLight,
                  border: `1px solid ${msBanner.type === "success" ? C.green : C.red}44`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  color: msBanner.type === "success" ? C.green : C.red,
                  fontWeight: 600,
                  marginBottom: 8,
                }}>
                  {msBanner.type === "success" ? "✓ " : "⚠ "}{msBanner.text}
                </div>
              )}

              <div style={{ marginTop: -8 }}>
                <ConnectionRow
                  icon="G"
                  name="Google"
                  desc="Gmail · Calendar · Contacts"
                  connected={googleConnected}
                  accountEmail={googleEmail}
                />
                <ConnectionRow
                  icon="M"
                  name="Microsoft 365"
                  desc="Outlook · Calendar · Contacts"
                  connected={microsoftConnected}
                  accountEmail={microsoftEmail}
                  onConnect={handleConnectMicrosoft}
                  onDisconnect={handleDisconnectMicrosoft}
                />
                <ConnectionRow icon="Z" name="ZoomInfo" desc="Contact enrichment & verification" connected />
                <ConnectionRow icon="📮" name="Post.com" desc="Send physical cards to contacts" comingSoon />
                <ConnectionRow icon="🎁" name="Humble Hello Marketplace" desc="Send gifts to contacts" comingSoon />
                <ConnectionRow icon="H" name="HubSpot" desc="Export contacts to your CRM" comingSoon />
                <ConnectionRow icon="S" name="Salesforce" desc="Export contacts to your CRM" comingSoon />
              </div>

              {googleConnected && microsoftConnected && (
                <div style={{ paddingTop: 16, borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                  <label style={lStyle}>Primary email provider</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["google", "microsoft"] as const).map(p => {
                      const active = primaryProvider === p;
                      const label = p === "google" ? "Google" : "Microsoft";
                      return (
                        <button
                          key={p}
                          onClick={() => handleSwitchPrimaryProvider(p)}
                          style={{
                            padding: "7px 16px",
                            borderRadius: 20,
                            border: `1.5px solid ${active ? C.terra : C.border2}`,
                            background: active ? `${C.terra}18` : C.bg3,
                            color: active ? C.terra : C.text3,
                            fontSize: 12,
                            fontWeight: active ? 700 : 400,
                            cursor: "pointer",
                            fontFamily: font,
                          }}
                        >
                          {active ? "✓ " : ""}{label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>
                    Cards, welcome emails, and campaigns send through this provider's mailbox.
                  </div>
                </div>
              )}
            </Card>

            <Card title="Data & Privacy" subtitle="Control your data and how it's used">
              <Toggle
                value={networkOptIn}
                onChange={async (val) => {
                  setNetworkOptIn(val);
                  await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ network_opt_in: val }),
                  }).catch(() => {});
                }}
                label="Join the Humble Hello network"
                desc="Allow your verified contact info to be discoverable to other Humble Hello users you're connected with"
              />
              <div style={{ fontSize: 11, color: C.text4, lineHeight: 1.6, padding: "10px 14px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>
                When contacts receive a verification email from Humble Hello, they can choose to join the network. Your data is never sold or shared without your explicit consent.
              </div>
              <button onClick={() => alert("Export coming soon")} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, alignSelf: "flex-start" as const }}>
                Export my data
              </button>
            </Card>

            <Card title="Danger Zone" subtitle="Irreversible actions — use with care">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
  <div>
    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Re-do onboarding</div>
    <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Walk through the welcome flow again — useful for testing or refreshing your setup</div>
  </div>
  <button onClick={async () => {
    if (!confirm("Re-do onboarding? You'll be taken back to the welcome flow. Your contacts and settings stay intact.")) return;
    try {
      const res = await fetch("/api/onboarding/reset", { method: "POST" });
      if (res.ok) {
        router.push("/onboarding");
      } else {
        alert("Couldn't reset onboarding. Try again or refresh the page.");
      }
    } catch {
      alert("Network error. Try again.");
    }
  }} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
    Re-do
  </button>
</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Reset Google sync token</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Forces a full re-sync of all Google contacts</div>
                </div>
                <button onClick={async () => {
                  if (!confirm("This will clear your sync token and re-sync all contacts. Continue?")) return;
                  await fetch("/api/contacts/google-sync", { method: "DELETE" });
                  alert("Sync token cleared — pull from Google to re-sync");
                }} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.amberLight, color: C.amber, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Reset
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Reset all classifications</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Clears all AI relationship scores — they'll be recalculated</div>
                </div>
                <button onClick={async () => {
                  if (!confirm("This will reset all relationship classifications. Continue?")) return;
                  await fetch("/api/relationships/reset", { method: "POST" });
                  alert("Classifications reset");
                }} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.amberLight, color: C.amber, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Reset
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Delete account</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Permanently delete your account and all data</div>
                </div>
                <button onClick={() => alert("Please contact support to delete your account")} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Delete
                </button>
              </div>
            </Card>

          </div>
        </div>
      </main>

      <div style={{ position: "fixed", bottom: 0, left: 200, right: 0, background: C.bg2, borderTop: `1px solid ${C.border}`, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 100 }}>
        <div style={{ fontSize: 13, color: saved ? C.green : C.text3, fontWeight: saved ? 600 : 400 }}>
          {saved ? "✓ Settings saved" : "Make changes above and save"}
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: saving ? C.bg3 : C.terra, color: saving ? C.text4 : "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: font }}>
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
}