"use client";

import {
  M, HEAD, BODY, MONO,
  PageWrap, Logo,
} from "./shared";

export function Step1Welcome() {
  return (
    <PageWrap>
      <div style={{ textAlign: "center", paddingTop: 24 }}>
        <h1 style={{
          fontFamily: HEAD,
          fontSize: "clamp(36px, 5.6vw, 56px)",
          lineHeight: 1.04,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: M.ink,
          margin: 0,
        }}>
          Clean your contacts.
          <br />
          <span style={{ fontStyle: "italic", color: M.fire }}>
            Then actually use them.
          </span>
        </h1>

        <p style={{
          fontFamily: BODY,
          fontSize: 17,
          lineHeight: 1.6,
          color: M.ink2,
          margin: "28px auto 0",
          maxWidth: 460,
        }}>
          Humble Hello keeps your contact list current and helps you stay in
          touch with the people who matter. Connect your inbox in 30 seconds.
        </p>

        <div style={{
          marginTop: 44,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 360,
          marginLeft: "auto",
          marginRight: "auto",
        }}>
          <ProviderButton provider="google" />
          <ProviderButton provider="microsoft" />
        </div>

        <div style={{
          marginTop: 32,
          fontSize: 13,
          color: M.ink3,
          fontFamily: BODY,
        }}>
          Free forever for the basics · No credit card required
        </div>
      </div>
    </PageWrap>
  );
}

function ProviderButton({ provider }: { provider: "google" | "microsoft" }) {
  const isGoogle = provider === "google";
  const href = isGoogle ? "/api/auth/google" : "/api/auth/microsoft";

  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "14px 20px",
        borderRadius: 12,
        background: "#fff",
        border: `1.5px solid ${M.ruleStrong}`,
        color: M.ink,
        fontFamily: BODY,
        fontSize: 15,
        fontWeight: 600,
        textDecoration: "none",
        boxShadow: "0 1px 0 rgba(26, 18, 8, 0.04)",
        transition: "all 0.15s",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = M.ink;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = M.ruleStrong;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
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