"use client";

import { useState } from "react";
import {
  M, HEAD, BODY, MONO,
  PageWrap, PrimaryButton, StepHeader, Card,
} from "./shared";

interface Step2Props {
  firstName: string;
  onNext: () => Promise<void>;
}

export function Step2Privacy({ firstName, onNext }: Step2Props) {
  const [authentic, setAuthentic] = useState(false);
  const [terms, setTerms] = useState(false);
  const [network, setNetwork] = useState(true); // default ON, per spec
  const [submitting, setSubmitting] = useState(false);

  const canContinue = authentic && terms;

  async function handleSubmit() {
    if (!canContinue) return;
    setSubmitting(true);
    try {
      // Save consent + network preference, then kick off scan
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal: {
            authentic_outreach: true,
            terms_privacy_accepted: true,
            consent_at: new Date().toISOString(),
            consent_version: "1.0",
          },
          network_opt_in: network,
          network_opt_in_at: network ? new Date().toISOString() : null,
          network_consent_version: network ? "1.0" : null,
        }),
      });

      // Kick off the Inngest scan now that consent is given
      await fetch("/api/onboarding/start-scan", { method: "POST" });

      await onNext();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  return (
    <PageWrap>
      <StepHeader
        kicker={`Step 1 of 3 · Hi ${firstName || "there"}`}
        title={
          <>
            Before we{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>
              read your inbox.
            </span>
          </>
        }
        subtitle="Humble Hello scans your email and calendar to surface who matters to you. Here's exactly what that means."
      />

      <Card>
        {/* What we look at */}
        <PrivacyBlock
          label="What we look at"
          body="Senders, recipients, subject lines, calendar events, and the first 200 words of recent messages — used only to identify and rank your contacts."
          tone="neutral"
        />
        <PrivacyBlock
          label="What we don't look at"
          body="Email body content beyond ranking signals. Attachments. Threads after they're processed. We never use your data for anyone but you."
          tone="neutral"
        />
        <PrivacyBlock
          label="What we never do"
          body="Sell your data. Share your contact list. Email your contacts on our brand. Train AI models on your inbox."
          tone="strong"
        />

        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
          <Checkbox
            checked={authentic}
            onChange={setAuthentic}
            title="I commit to authentic outreach only"
            body="Real people I have a real relationship with. Not mass messaging or harvested lists."
          />
          <Checkbox
            checked={terms}
            onChange={setTerms}
            title={<>I agree to the <a href="/terms" target="_blank" style={termsLink}>Terms</a> and <a href="/privacy" target="_blank" style={termsLink}>Privacy Policy</a></>}
            body="I'm the data controller. Humble Hello is the processor. I can export or delete my data anytime."
          />
          <Checkbox
            checked={network}
            onChange={setNetwork}
            title="Help improve Humble Hello for everyone"
            body="Anonymized signals from your network improve enrichment for all users, like how Waze improves directions for every driver. You can opt out anytime in Settings."
            recommended
          />
        </div>

        <div style={{ marginTop: 32 }}>
          <PrimaryButton
            onClick={handleSubmit}
            disabled={!canContinue}
            loading={submitting}
          >
            Get started →
          </PrimaryButton>
        </div>

        <div style={{
          marginTop: 16,
          fontFamily: BODY,
          fontSize: 12,
          color: M.ink3,
          textAlign: "center",
          fontStyle: "italic",
          lineHeight: 1.5,
        }}>
          Continuing will start your inbox scan. We'll keep this brief — about
          30 seconds.
        </div>
      </Card>
    </PageWrap>
  );
}

// ── Privacy info block ──────────────────────────────────────────────────────
function PrivacyBlock({
  label, body, tone,
}: { label: string; body: string; tone: "neutral" | "strong" }) {
  return (
    <div style={{
      marginBottom: 16,
      padding: "14px 16px",
      borderRadius: 10,
      background: tone === "strong" ? M.paperDeep : "transparent",
      border: tone === "strong" ? `1px solid ${M.rule}` : "none",
    }}>
      <div style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        color: tone === "strong" ? M.fire : M.ink3,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: BODY,
        fontSize: 14,
        lineHeight: 1.6,
        color: M.ink2,
      }}>
        {body}
      </div>
    </div>
  );
}

// ── Checkbox row ────────────────────────────────────────────────────────────
function Checkbox({
  checked, onChange, title, body, recommended,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: React.ReactNode;
  body: string;
  recommended?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: checked ? "#fff" : "#fff",
        border: `1.5px solid ${checked ? M.green : M.rule}`,
        borderRadius: 10,
        cursor: "pointer",
        alignItems: "flex-start",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{
        flexShrink: 0,
        marginTop: 2,
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `1.5px solid ${checked ? M.green : M.ruleStrong}`,
        background: checked ? M.green : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {checked && (
          <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
            <path d="M3 8L7 12L13 5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: BODY,
          fontSize: 14,
          fontWeight: 600,
          color: M.ink,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}>
          {title}
          {recommended && (
            <span style={{
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 700,
              color: M.green,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "2px 6px",
              background: M.forestSoft,
              borderRadius: 4,
            }}>
              Recommended
            </span>
          )}
        </div>
        <div style={{
          fontFamily: BODY,
          fontSize: 13,
          lineHeight: 1.55,
          color: M.ink3,
        }}>
          {body}
        </div>
      </div>
    </label>
  );
}

const termsLink: React.CSSProperties = {
  color: M.fire,
  textDecoration: "none",
  borderBottom: `1px solid ${M.fireSoft}`,
};