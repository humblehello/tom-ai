"use client";
import { useRouter } from "next/navigation";
import { C, font } from "@/app/lib/theme";

export default function UpgradeModal({ reason, onClose }: { reason: string; onClose: () => void }) {
  const router = useRouter();

  const isTrialExpired = reason === "trial_expired";
  const isDrafts = reason === "drafts";

  const title = isTrialExpired
    ? "Your trial has ended"
    : isDrafts
    ? "You've used all your AI drafts this month"
    : "Upgrade to unlock this feature";

  const body = isTrialExpired
    ? "Your 7-day trial is over. Upgrade to Pro or Growth to keep full access — or continue on the free plan with limited features."
    : isDrafts
    ? "Upgrade to Pro for 250 drafts/month, or Growth for unlimited."
    : "This feature is available on Pro and Growth plans.";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 420, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 24, textAlign: "center" as const, marginBottom: 12 }}>
          {isTrialExpired ? "⏰" : "🔒"}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, textAlign: "center" as const, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: C.text3, textAlign: "center" as const, lineHeight: 1.6, marginBottom: 24 }}>
          {body}
        </div>

        {/* Plan options */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 16 }}>
          <div style={{ background: C.bg3, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Pro</div>
                <div style={{ fontSize: 11, color: C.text3 }}>250 AI drafts · Scoring · Scheduling</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.terra }}>$25/mo</div>
            </div>
          </div>
          <div style={{ background: C.terraLight, borderRadius: 10, padding: "12px 16px", border: `1.5px solid ${C.terra}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.terra }}>Growth ⭐</div>
                <div style={{ fontSize: 11, color: C.terraDark }}>Unlimited drafts · Campaigns · Relationship Index</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.terra }}>$49/mo</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            {isTrialExpired ? "Use free plan" : "Maybe later"}
          </button>
          <button onClick={() => { onClose(); router.push("/pricing"); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
            Upgrade now
          </button>
        </div>
      </div>
    </div>
  );
}