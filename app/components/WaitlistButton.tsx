"use client";

import { createContext, useContext, useState, ReactNode } from "react";

const M = {
  paper: "#faf6ef",
  ink: "#1a1208",
  ink2: "#3d2c1c",
  ink3: "#7a6450",
  fire: "#bf5c38",
  green: "#2f7a3a",
  rule: "#e3d5c0",
  ruleStrong: "#c8b497",
};

const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";

// ── Context ─────────────────────────────────────────────────────────────
type WaitlistContextValue = {
  openWaitlist: () => void;
};

const WaitlistContext = createContext<WaitlistContextValue | null>(null);

export function useWaitlist() {
  const ctx = useContext(WaitlistContext);
  if (!ctx) throw new Error("useWaitlist must be used inside <WaitlistProvider>");
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <WaitlistContext.Provider value={{ openWaitlist: () => setOpen(true) }}>
      {children}
      {open && <WaitlistModal onClose={() => setOpen(false)} />}
    </WaitlistContext.Provider>
  );
}

// ── Beta Note (existing) ────────────────────────────────────────────────
export function BetaNote() {
  const { openWaitlist } = useWaitlist();

  return (
    <span style={{
      fontFamily: BODY,
      fontSize: 15,
      fontWeight: 700,
      color: M.ink,
      lineHeight: 1.5,
    }}>
      Currently in Beta. Join 200+ others and test with us.{" "}
      <button
        onClick={openWaitlist}
        style={{
          color: M.fire,
          fontWeight: 700,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "inherit",
          textDecoration: "underline",
        }}
      >
        Click here to join →
      </button>
    </span>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────
function WaitlistModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          first_name: firstName.trim() || null,
          use_case: useCase.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        setError(data.error || "Couldn't save. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    }
    setSubmitting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 18, 8, 0.5)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 460,
          padding: 32,
          boxShadow: "0 30px 60px -30px rgba(26, 18, 8, 0.5)",
        }}
      >
        {done ? (
          <>
            <h2 style={{
              fontFamily: HEAD,
              fontSize: 24,
              fontWeight: 700,
              color: M.ink,
              margin: 0,
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}>
              You're on the list.
            </h2>
            <p style={{
              fontFamily: BODY,
              fontSize: 15,
              color: M.ink2,
              lineHeight: 1.6,
              marginBottom: 24,
            }}>
              We'll reach out personally when there's room for you. In the meantime, your network keeps growing — Humble Hello will be ready when you are.
            </p>
            <button
              onClick={onClose}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: M.green,
                color: "#fff",
                fontFamily: BODY,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h2 style={{
              fontFamily: HEAD,
              fontSize: 24,
              fontWeight: 700,
              color: M.ink,
              margin: 0,
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}>
              Join the <span style={{ color: M.fire, fontStyle: "italic" }}>waitlist.</span>
            </h2>
            <p style={{
              fontFamily: BODY,
              fontSize: 14,
              color: M.ink3,
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              We're onboarding new users carefully. Tell us a bit about you and we'll be in touch.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address *"
                style={inputStyle}
              />
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First name"
                style={inputStyle}
              />
              <textarea
                value={useCase}
                onChange={e => setUseCase(e.target.value)}
                placeholder="What would you use Humble Hello for? (optional)"
                rows={3}
                style={{ ...inputStyle, resize: "none" as const, lineHeight: 1.5 }}
              />

              {error && (
                <div style={{
                  fontSize: 13,
                  color: M.fire,
                  fontFamily: BODY,
                  fontWeight: 500,
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: `1.5px solid ${M.ruleStrong}`,
                    background: "#fff",
                    color: M.ink2,
                    fontFamily: BODY,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  style={{
                    flex: 2,
                    padding: "12px",
                    borderRadius: 10,
                    border: "none",
                    background: M.green,
                    color: "#fff",
                    fontFamily: BODY,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: submitting ? "default" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "Saving..." : "Request access"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1.5px solid ${M.rule}`,
  background: M.paper,
  fontSize: 15,
  fontFamily: BODY,
  color: M.ink,
  outline: "none",
  boxSizing: "border-box" as const,
  width: "100%",
};