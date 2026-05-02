"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

const C = {
  bg: "#faf7f2", bg2: "#ffffff", bg3: "#f3ede3",
  border: "#e8ddd0", border2: "#ddd0bf",
  text: "#241a0f", text2: "#574030", text3: "#8a6e5a", text4: "#b09880",
  terra: "#bf5c38", terraLight: "#f2d5c8", terraDark: "#9a4429",
  sage: "#6b9970", sageLight: "#d0e8d3", sageDark: "#3d6b42",
  gold: "#b8922a", goldLight: "#f0e0b0",
  navy: "#1c2b3a",
  red: "#e03131", redLight: "#ffe3e3",
};

const font = "'Lora', Georgia, serif";
const fontSans = "'DM Sans', sans-serif";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "You declined access. Humble Hello needs Google access to work.",
  no_code: "Something went wrong with Google's response. Please try again.",
  invalid_state: "Security check failed. Please try again.",
  token_exchange: "Couldn't complete sign-in. Please try again.",
  server_error: "Something went wrong on our end. Please try again.",
};

function ConnectContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [isConnecting, setIsConnecting] = useState(false);

  function handleConnect() {
    setIsConnecting(true);
    window.location.href = "/api/auth/google";
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        * { font-family: 'DM Sans', sans-serif !important; }
        h1, h2, .serif { font-family: 'Lora', Georgia, serif !important; }
      `}</style>
      <div style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: fontSans,
      }}>
        <div style={{ maxWidth: 1020, width: "100%", display: "flex", gap: 72, alignItems: "center" }}>

          {/* ── Left — branding ── */}
          <div style={{ flex: 1 }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 44 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: C.terra,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, fontWeight: 700, color: "white",
                fontFamily: font,
              }}>hh</div>
              <span style={{ fontSize: 18, fontWeight: 600, color: C.text, fontFamily: font }}>
                Humble Hello
              </span>
            </div>

            {/* Headline */}
            <h1 style={{
              fontSize: "clamp(36px, 4.5vw, 56px)",
              fontWeight: 700,
              color: C.text,
              lineHeight: 1.08,
              letterSpacing: "-1.5px",
              marginBottom: 20,
              fontFamily: font,
            }}>
              Be known for<br />
              how well you<br />
              <em style={{ color: C.terra, fontStyle: "italic" }}>treat people.</em>
            </h1>

            <p style={{
              fontSize: 16, color: C.text2,
              lineHeight: 1.75, maxWidth: 420,
              marginBottom: 40,
              fontFamily: fontSans,
            }}>
              Humble Hello helps you stay intentionally present with the people who matter most — friends, family, customers, and prospects.
            </p>

            {/* Feature blocks */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14, marginBottom: 40 }}>
              {[
                {
                  icon: "📬",
                  color: C.terra,
                  bg: C.terraLight,
                  title: "Never let a relationship go cold",
                  desc: "Humble Hello surfaces who to reach out to each day and drafts a personalized message — before relationships fade.",
                },
                {
                  icon: "🎁",
                  color: C.sage,
                  bg: C.sageLight,
                  title: "Send cards and gifts that land",
                  desc: "Birthdays, milestones, life events — Humble Hello surfaces the moments and handles cards and gift sends automatically.",
                },
                {
                  icon: "🧠",
                  color: C.gold,
                  bg: C.goldLight,
                  title: "Know your people, deeply",
                  desc: "Humble Hello enriches every contact with job history, interests, and relationship intelligence — automatically.",
                },
              ].map((f, i) => (
                <div key={i} style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  background: C.bg2, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "16px 18px",
                  transition: "border-color 0.2s",
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: f.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18,
                  }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4, fontFamily: fontSans }}>{f.title}</div>
                    <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.6, fontFamily: fontSans }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tagline */}
            <p style={{ fontSize: 13, color: C.text4, fontStyle: "italic", lineHeight: 1.7, fontFamily: font }}>
              "The people who matter deserve more than good intentions."
            </p>
          </div>

          {/* ── Right — sign in card ── */}
          <div style={{
            width: 390, flexShrink: 0,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: 40,
            boxShadow: "0 8px 40px rgba(36,26,15,0.08)",
          }}>
            <h2 style={{
              fontSize: 22, fontWeight: 700, color: C.text,
              letterSpacing: "-0.5px", marginBottom: 8,
              fontFamily: font,
            }}>
              Get started free
            </h2>
            <p style={{ fontSize: 14, color: C.text3, lineHeight: 1.65, marginBottom: 28, fontFamily: fontSans }}>
              Connect Google to let Humble Hello scan your email and calendar — and never let an important relationship slip again.
            </p>

            {error && (
              <div style={{
                background: C.redLight, border: `1px solid ${C.red}33`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 20,
                color: C.red, fontSize: 13, fontFamily: fontSans,
              }}>
                {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={isConnecting}
              style={{
                width: "100%", padding: "15px 24px",
                borderRadius: 100, border: "none",
                background: isConnecting ? C.terraLight : C.terra,
                color: isConnecting ? C.terraDark : "#fff",
                fontSize: 15, fontWeight: 600,
                cursor: isConnecting ? "default" : "pointer",
                letterSpacing: "-0.2px",
                transition: "all 0.2s",
                marginBottom: 12,
                fontFamily: fontSans,
                boxShadow: isConnecting ? "none" : "0 4px 16px rgba(191,92,56,0.28)",
              }}
            >
              {isConnecting ? "Connecting..." : "Continue with Google →"}
            </button>

            <p style={{ fontSize: 11, color: C.text4, textAlign: "center" as const, lineHeight: 1.6, marginBottom: 32, fontFamily: fontSans }}>
              Humble Hello never shares your data. Tokens are encrypted at rest.
            </p>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 16, fontFamily: fontSans }}>
                What Humble Hello does for you
              </div>
              {[
                { label: "Relationship scoring + health tracking", color: C.terra },
                { label: "AI-drafted personalized outreach", color: C.sage },
                { label: "Birthday + life event reminders", color: C.gold },
                { label: "Cards and gifts sent automatically", color: C.terra },
                { label: "Contact enrichment, always on", color: C.sage },
                { label: "Campaign builder for your pipeline", color: C.gold },
              ].map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text2, fontFamily: fontSans }}>{f.label}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: C.text4, textAlign: "center" as const, marginTop: 28, fontFamily: fontSans }}>
              © 2026 Humble Hello · humblehello.com
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectContent />
    </Suspense>
  );
}