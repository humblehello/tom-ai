"use client";

import Link from "next/link";
import { useState, useRef } from "react";

const M = {
  paper: "#faf6ef",
  ink: "#1a1208",
  ink2: "#3d2c1c",
  ink3: "#7a6450",
  fire: "#bf5c38",
  rule: "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, serif";
const BODY = "'Inter', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const features = [
  { name: "Auto-update", desc: "Keep contacts current", href: "/features/auto-update", accent: "#3d6b42" },
  { name: "Engage", desc: "Daily reach-out brief", href: "/features/engage", accent: "#bf5c38" },
  { name: "Cards & gifts", desc: "Real mail, real moments", href: "/features/cards-and-gifts", accent: "#a06410" },
  { name: "Relationship Index", desc: "How to communicate", href: "/features/relationship-index", accent: "#1b66a8" },
  { name: "Sequences", desc: "Multi-step campaigns", href: "/features/sequences", accent: "#5b4ec1" },
  { name: "Journal Chat", desc: "Tell us what you know", href: "/features/journal-chat", accent: "#a8456c" },
];

export function FeaturesDropdown({ active }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function handleLeave() {
    // small delay so user can move from trigger to menu without it closing
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ position: "relative" }}
    >
      <Link
        href="/features"
        style={{
          fontFamily: BODY, fontSize: 14, fontWeight: active ? 600 : 500,
          color: active ? M.ink : M.ink2,
          textDecoration: "none", letterSpacing: "0.01em",
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 0",
        }}
      >
        Features
        <svg
          width="10" height="10" viewBox="0 0 10 10" aria-hidden
          style={{
            transition: "transform 0.18s ease",
            transform: open ? "rotate(180deg)" : "rotate(0)",
          }}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 12px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: M.paper,
            border: `1px solid ${M.rule}`,
            borderRadius: 14,
            boxShadow: "0 24px 48px -16px rgba(26, 18, 8, 0.18), 0 8px 16px -8px rgba(26, 18, 8, 0.12)",
            padding: 8,
            minWidth: 320,
            zIndex: 60,
            animation: "hh-dropdown-in 0.15s ease",
          }}
        >
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="hh-dropdown-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                transition: "background 0.12s ease",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: f.accent, flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>
                <div style={{
                  fontFamily: BODY, fontSize: 14, fontWeight: 600,
                  color: M.ink, marginBottom: 2,
                }}>
                  {f.name}
                </div>
                <div style={{
                  fontFamily: BODY, fontSize: 12, color: M.ink3,
                }}>
                  {f.desc}
                </div>
              </span>
            </Link>
          ))}
          <div style={{
            margin: "6px 8px 4px", paddingTop: 8,
            borderTop: `1px solid ${M.rule}`,
          }}>
            <Link
              href="/features"
              className="hh-dropdown-item"
              style={{
                display: "block",
                padding: "8px 6px",
                borderRadius: 8,
                textDecoration: "none",
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                color: M.fire, letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              View all features →
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @keyframes hh-dropdown-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .hh-dropdown-item:hover {
          background: ${M.rule}66;
        }
      `}</style>
    </div>
  );
}