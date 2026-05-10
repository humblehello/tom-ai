"use client";

import { ReactNode } from "react";

// ── Design system ───────────────────────────────────────────────────────────
export const M = {
  paper:      "#faf6ef",
  paperDeep:  "#f1e8d8",
  ink:        "#1a1208",
  ink2:       "#3d2c1c",
  ink3:       "#7a6450",
  ink4:       "#a89580",
  fire:       "#bf5c38",
  fireSoft:   "#f0d4c2",
  forest:     "#3d6b42",
  forestSoft: "#d0e0d2",
  green:      "#2f7a3a",
  rule:       "#e3d5c0",
  ruleStrong: "#c8b497",
};

export const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
export const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

// ── Locked defaults applied silently on Step 3 ──────────────────────────────
export const LOCKED_CARD_PROFILE = {
  auto_send_enabled: false,
  budget_cents: 2500,                       // $25 monthly card budget
  gift_budget_cents: 5000,                  // $50 gift budget
  gift_style: "practical",
  purchase_thank_you_threshold_cents: 0,
  tone: "warm",
  triggers: ["birthday"],
  auto_send_threshold: 2,
};

export const LOCKED_SNOOZE_DAYS = 30;

// ── Logo ────────────────────────────────────────────────────────────────────
export function Logo() {
  return (
    <span style={{
      fontFamily: "'ITCSouvenir', 'Libre Baskerville', serif",
      fontWeight: 700, fontSize: 26, color: M.fire, letterSpacing: "-0.01em",
    }}>
      humble hello.
    </span>
  );
}

// ── Big green primary button ────────────────────────────────────────────────
export function PrimaryButton({
  onClick, disabled, loading, children,
}: { onClick: () => void; disabled?: boolean; loading?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      width: "100%",
      background: disabled ? M.ruleStrong : M.green,
      color: "#fff",
      padding: "16px 28px",
      borderRadius: 12,
      fontFamily: BODY, fontSize: 16, fontWeight: 600,
      border: "none",
      cursor: (disabled || loading) ? "default" : "pointer",
      boxShadow: disabled ? "none" : "0 8px 24px -8px rgba(47, 122, 58, 0.4)",
      transition: "all 0.2s",
      letterSpacing: "0.01em",
    }}>
      {loading ? "Saving…" : children}
    </button>
  );
}

// ── Standard input ──────────────────────────────────────────────────────────
export function Input({
  value, onChange, placeholder, type = "text", required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder + (required ? " *" : "")}
      style={{
        width: "100%",
        padding: "14px 16px",
        borderRadius: 12,
        border: `1.5px solid ${M.rule}`,
        background: "#fff",
        fontSize: 15,
        color: M.ink,
        fontFamily: BODY,
        outline: "none",
        boxSizing: "border-box",
        transition: "border-color 0.15s",
      }}
      onFocus={e => { e.target.style.borderColor = M.fire; }}
      onBlur={e => { e.target.style.borderColor = M.rule; }}
    />
  );
}

// ── Field label ─────────────────────────────────────────────────────────────
export function Label({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{
        fontFamily: BODY, fontSize: 12, fontWeight: 600, color: M.ink2,
        textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        {children}
      </span>
      {sub && (
        <span style={{ fontSize: 12, color: M.ink4, marginLeft: 8, fontStyle: "italic" }}>
          ({sub})
        </span>
      )}
    </div>
  );
}

// ── Section heading ─────────────────────────────────────────────────────────
export function StepHeader({
  kicker, title, subtitle,
}: { kicker?: string; title: ReactNode; subtitle: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
      {kicker && (
        <div style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 600,
          color: M.fire, letterSpacing: "0.14em", textTransform: "uppercase",
          marginBottom: 14,
        }}>
          {kicker}
        </div>
      )}
      <h1 style={{
        fontFamily: HEAD, fontSize: "clamp(28px, 4vw, 40px)",
        lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.02em",
        color: M.ink, margin: "0 0 14px",
      }}>
        {title}
      </h1>
      <p style={{
        fontFamily: BODY, fontSize: 16, lineHeight: 1.6,
        color: M.ink2, margin: 0,
      }}>
        {subtitle}
      </p>
    </div>
  );
}

// ── Container card with paper background ────────────────────────────────────
export function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${M.rule}`,
      borderRadius: 14,
      padding: "32px 36px",
      boxShadow: "0 12px 32px -20px rgba(26, 18, 8, 0.1)",
    }}>
      {children}
    </div>
  );
}

// ── Page wrapper ────────────────────────────────────────────────────────────
export function PageWrap({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`body { margin: 0; }`}</style>
      <div style={{
        minHeight: "100vh",
        background: M.paper,
        fontFamily: BODY,
        color: M.ink,
        padding: "40px 24px",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </>
  );
}