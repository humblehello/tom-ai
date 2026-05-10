"use client";

import { useEffect, useState } from "react";

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
const HEAD = "'Libre Baskerville', Georgia, serif";
const BODY = "'Inter', sans-serif";

type Mode = "signin" | "signup";

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    function handleOpen(e: Event) {
      const detail = (e as CustomEvent).detail as Mode;
      setMode(detail);
    }
    window.addEventListener("hh:open-auth", handleOpen);
    return () => window.removeEventListener("hh:open-auth", handleOpen);
  }, []);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMode(null);
    }
    if (mode) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [mode]);

  return (
    <>
      {children}
      {mode && <AuthModal mode={mode} onClose={() => setMode(null)} />}
    </>
  );
}

function AuthModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const isSignIn = mode === "signin";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 18, 8, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "hh-fade-in 0.18s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: M.paper,
          borderRadius: 18,
          padding: "44px 40px 32px",
          maxWidth: 440,
          width: "100%",
          position: "relative",
          boxShadow: "0 30px 60px -20px rgba(26, 18, 8, 0.4)",
          animation: "hh-modal-in 0.22s ease",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            border: "none",
            background: "transparent",
            color: M.ink3,
            cursor: "pointer",
            fontSize: 22,
            lineHeight: 1,
            borderRadius: 8,
          }}
        >
          ×
        </button>

        <h2
          style={{
            fontFamily: HEAD,
            fontSize: 30,
            fontWeight: 700,
            color: M.ink,
            margin: 0,
            marginBottom: 10,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {isSignIn ? (
            <>Welcome <span style={{ fontStyle: "italic", color: M.fire }}>back.</span></>
          ) : (
            <>Get <span style={{ fontStyle: "italic", color: M.fire }}>started.</span></>
          )}
        </h2>

        <p
          style={{
            fontFamily: BODY,
            fontSize: 15,
            color: M.ink2,
            margin: 0,
            marginBottom: 28,
            lineHeight: 1.55,
          }}
        >
          {isSignIn
            ? "Sign in with the account you used to create Humble Hello."
            : "Connect Google or Microsoft to begin. Free forever, no credit card."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ModalProviderButton provider="google" />
          <ModalProviderButton provider="microsoft" />
        </div>

        <p
          style={{
            fontFamily: BODY,
            fontSize: 12,
            color: M.ink3,
            textAlign: "center",
            marginTop: 24,
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          By continuing, you agree to our{" "}
          <a href="/terms" style={{ color: M.ink2, textDecoration: "underline" }}>Terms</a>
          {" "}and{" "}
          <a href="/privacy" style={{ color: M.ink2, textDecoration: "underline" }}>Privacy Policy</a>.
        </p>
      </div>

      <style>{`
        @keyframes hh-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes hh-modal-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function ModalProviderButton({ provider }: { provider: "google" | "microsoft" }) {
  const isGoogle = provider === "google";
  const href = isGoogle ? "/api/auth/google" : "/api/auth/microsoft";
  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "14px 20px",
    borderRadius: 10,
    background: "#fff",
    border: `1.5px solid ${M.ruleStrong}`,
    color: M.ink,
    fontFamily: BODY,
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
    transition: "all 0.15s ease",
  };
  return (
    <a href={href} style={baseStyle}>
      {isGoogle ? <GoogleIcon /> : <MicrosoftIcon />}
      Continue with {isGoogle ? "Google" : "Microsoft"}
    </a>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect width="8.5" height="8.5" fill="#F25022" />
      <rect x="9.5" width="8.5" height="8.5" fill="#7FBA00" />
      <rect y="9.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}

export function openAuthModal(mode: Mode) {
  window.dispatchEvent(new CustomEvent("hh:open-auth", { detail: mode }));
}

export function AuthTrigger({
  mode,
  children,
  style,
}: {
  mode: Mode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={() => openAuthModal(mode)}
      style={{
        cursor: "pointer",
        background: "transparent",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}