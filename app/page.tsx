"use client";
import Link from "next/link";
import Image from "next/image";
import { AuthModalProvider, AuthTrigger } from "./components/AuthModal";
import { FeaturesDropdown } from "./components/FeaturesDropdown";
import { BetaNote, WaitlistProvider, useWaitlist } from "./components/WaitlistButton";

const M = {
  paper: "#faf6ef",
  paperDeep: "#f1e8d8",
  ink: "#1a1208",
  ink2: "#3d2c1c",
  ink3: "#7a6450",
  ink4: "#a89580",
  fire: "#bf5c38",
  fireDeep: "#8a3f25",
  fireSoft: "#f0d4c2",
  forest: "#3d6b42",
  forestSoft: "#d0e0d2",
  green:      "#2f7a3a",
  rule:       "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

export default function HomePage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{globalCss}</style>

      <div style={{ background: M.paper, color: M.ink, fontFamily: BODY, minHeight: "100vh" }}>
        <AuthModalProvider>
          <WaitlistProvider>
            <Nav />
            <Hero />
            <TrustStrip />
            <FeatureCards />
            <LifestyleBreak />
            <FinalCta />
            <Footer />
          </WaitlistProvider>
        </AuthModalProvider>
      </div>
    </>
  );
}

function FinalCtaButton() {
  const { openWaitlist } = useWaitlist();
  return (
    <button onClick={openWaitlist} style={{
      display: "inline-block",
      background: M.green, color: "#fff",
      padding: "16px 36px", borderRadius: 12,
      fontFamily: BODY, fontSize: 16, fontWeight: 600,
      border: "none", cursor: "pointer",
      boxShadow: "0 8px 24px -8px rgba(47, 122, 58, 0.4)",
    }}>
      Join the beta →
    </button>
  );
}

function FinalCtaInlineLink() {
  const { openWaitlist } = useWaitlist();
  return (
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
      Click here to claim a spot →
    </button>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(250, 246, 239, 0.88)",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      borderBottom: `1px solid ${M.rule}`,
    }}>
      <div style={{
        maxWidth: 1180, margin: "0 auto", padding: "18px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{
            fontFamily: "'ITCSouvenir', 'Libre Baskerville', serif",
            fontWeight: 700, fontSize: 26, color: M.fire, letterSpacing: "-0.01em",
          }}>
            humble hello.
          </span>
        </Link>
        <div className="hh-nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <FeaturesDropdown />
          <Link href="/plans" style={navLink}>Plans</Link>
          <span style={{ width: 1, height: 16, background: M.rule }} aria-hidden />
          <AuthTrigger mode="signin" style={navSignIn}>Sign in</AuthTrigger>
     <WaitlistCta />
        </div>
      </div>
    </nav>
  );
}

const navLink: React.CSSProperties = {
  fontFamily: BODY, fontSize: 14, fontWeight: 500, color: M.ink2,
  textDecoration: "none", letterSpacing: "0.01em",
};
const navSignIn: React.CSSProperties = {
  fontFamily: BODY, fontSize: 13, fontWeight: 600, color: M.ink,
  textDecoration: "none", padding: "8px 14px", borderRadius: 8,
  border: `1.5px solid ${M.ruleStrong}`, background: "transparent",
  letterSpacing: "0.01em", cursor: "pointer",
};
const navCta: React.CSSProperties = {
  fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "#fff",
  textDecoration: "none", padding: "9px 18px", borderRadius: 8,
  background: M.green, letterSpacing: "0.01em",
};
function WaitlistCta() {
  const { openWaitlist } = useWaitlist();
  return (
    <button onClick={openWaitlist} style={{ ...navCta, border: "none", cursor: "pointer" }}>
      Try for free →
    </button>
  );
}
// ── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden", padding: "80px 28px 100px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="hh-hero-grid" style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 64,
          alignItems: "center",
        }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "7px 14px", border: `1px solid ${M.ruleStrong}`,
              borderRadius: 999, fontSize: 12, fontWeight: 500,
              color: M.ink3, background: "rgba(255,255,255,0.6)",
              marginBottom: 36, fontFamily: BODY,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: M.forest }} />
              For the people you actually want to keep.
            </div>

            <h1 style={{
              fontFamily: HEAD, fontSize: "clamp(36px, 5.6vw, 68px)",
              lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.02em",
              color: M.ink, margin: 0,
            }}>
              Clean your contacts.
              <br />
              <span style={{ fontStyle: "italic", color: M.fire }}>
                Then let AI help you use them.
              </span>
            </h1>

            <p style={{
              fontFamily: BODY, fontSize: 18, lineHeight: 1.65, color: M.ink2,
              marginTop: 28, maxWidth: 540,
            }}>
              Humble Hello keeps your contact list current and helps you stay in touch with the people in
              it — whether they're customers, vendors, voters, or friends.
            </p>

            <div style={{ marginTop: 36, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <ProviderButton provider="google" />
              <ProviderButton provider="microsoft" />
            </div>

            <div style={{
              marginTop: 22, fontSize: 13, color: M.ink3, fontFamily: BODY,
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Check /> Free forever
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Check /> No credit card
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Check /> Connect in 30 seconds
              </span>
            </div>

            <div style={{ marginTop: 24 }}>
              <BetaNote />
            </div>
          </div>

          <div className="hh-hero-image" style={{ position: "relative" }}>
            <div style={{
              borderRadius: 16, overflow: "hidden",
              aspectRatio: "4/5",
              boxShadow: "0 30px 60px -30px rgba(26, 18, 8, 0.4), 0 12px 24px -12px rgba(26, 18, 8, 0.2)",
              border: `1px solid ${M.rule}`,
            }}>
              <img
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80"
                alt="People gathered around a laptop"
                loading="eager"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trust Strip ─────────────────────────────────────────────────────────────
function TrustStrip() {
  const guards = [
    { n: "20/day", t: "Verification cap", d: "Sent at human pace, staggered across business hours." },
    { n: "Auto-pause", t: "On bounces", d: "If deliverability dips, sends pause before damage spreads." },
    { n: "Your inbox", t: "Not a shared IP", d: "Sends from your own Gmail or Outlook. Your reputation, your control." },
    { n: "1 follow-up", t: "Per contact, ever", d: "Ask once. Follow up once. Move on. No four-touch sequences." },
  ];
  return (
    <section style={{ padding: "60px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, borderBottom: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <SectionLabel>Built carefully</SectionLabel>
          <h2 style={{
            fontFamily: HEAD, fontSize: "clamp(26px, 3.4vw, 36px)",
            lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em",
            color: M.ink, margin: 0, marginTop: 8,
          }}>
            Designed to <span style={{ fontStyle: "italic", color: M.fire }}>not get flagged.</span>
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.6, color: M.ink3, marginTop: 14, maxWidth: 580, marginLeft: "auto", marginRight: "auto" }}>
            Spam tools are built for volume. Humble Hello is built for the people you actually know.
          </p>
        </div>

        <div className="hh-trust-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
        }}>
          {guards.map((g) => (
            <div key={g.t} style={{
              background: "#fff", border: `1px solid ${M.rule}`, borderRadius: 12, padding: "20px 18px",
            }}>
              <div style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: M.fire, marginBottom: 4, letterSpacing: "-0.01em" }}>
                {g.n}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: M.ink, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {g.t}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.5, color: M.ink3 }}>
                {g.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Feature Cards ───────────────────────────────────────────────────────────
function FeatureCards() {
  const features = [
    {
      n: "01",
      name: "Auto-update",
      promise: "A contact list that stays current — on its own.",
      thumb: "/features/auto-update-contacts-list.png",
      thumbAlt: "Contacts page",
      href: "/features/auto-update",
      accent: M.forest,
      accentSoft: M.forestSoft,
    },
    {
      n: "02",
      name: "Engage",
      promise: "Show up at the right time, with the right words.",
      thumb: "/features/engage-dashboard.png",
      thumbAlt: "Daily reach-out brief",
      href: "/features/engage",
      accent: M.fire,
      accentSoft: M.fireSoft,
    },
    {
      n: "03",
      name: "Cards & gifts",
      promise: "Real mail. For real moments. Never marketing fluff.",
      thumb: "/features/cards-send-modal.png",
      thumbAlt: "Card send modal",
      href: "/features/cards-and-gifts",
      accent: "#a06410",
      accentSoft: "#fae8c4",
    },
    {
      n: "04",
      name: "Relationship index",
      promise: "Understand how to communicate with anyone.",
      thumb: "/features/ri-sync-tab.png",
      thumbAlt: "Relationship Index sidebar",
      href: "/features/relationship-index",
      accent: "#1b66a8",
      accentSoft: "#dceafa",
    },
    {
      n: "05",
      name: "Sequences",
      promise: "Multi-step campaigns that actually feel personal.",
      thumb: "/features/sequences-builder-full.png",
      thumbAlt: "Sequence builder",
      href: "/features/sequences",
      accent: "#5b4ec1",
      accentSoft: "#e2dffb",
    },
    {
      n: "06",
      name: "Journal chat",
      promise: "Tell us what you know about your people. Once.",
      thumb: "/features/journal-chat.png",
      thumbAlt: "Journal chat interface",
      href: "/features/journal-chat",
      accent: "#a8456c",
      accentSoft: "#f9d8e0",
    },
  ];

  return (
    <section style={{ padding: "100px 28px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <SectionLabel>What's inside</SectionLabel>
          <h2 style={sectionH2}>
            The six things <span style={{ fontStyle: "italic", color: M.fire }}>Humble Hello does.</span>
          </h2>
        </div>

        <div className="hh-feature-cards" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24,
        }}>
          {features.map((f) => (
            <Link
              key={f.n}
              href={f.href}
              className="hh-feature-card"
              style={{
                background: "#fff",
                border: `1px solid ${M.rule}`,
                borderRadius: 14,
                overflow: "hidden",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
              }}
            >
              <div style={{
                aspectRatio: "16/10",
                overflow: "hidden",
                background: f.accentSoft,
                borderBottom: `1px solid ${M.rule}`,
                position: "relative",
              }}>
                <Image
                  src={f.thumb}
                  alt={f.thumbAlt}
                  width={800}
                  height={500}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                />
              </div>
              <div style={{ padding: "24px 24px 28px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{
                  fontFamily: MONO, fontSize: 11, fontWeight: 600,
                  color: f.accent, letterSpacing: "0.14em", textTransform: "uppercase",
                  marginBottom: 10,
                }}>
                  №{f.n} — {f.name}
                </div>
                <div style={{
                  fontFamily: HEAD, fontSize: 19, fontWeight: 700,
                  lineHeight: 1.3, color: M.ink, marginBottom: 16, letterSpacing: "-0.01em",
                  flex: 1,
                }}>
                  {f.promise}
                </div>
                <div style={{
                  fontFamily: BODY, fontSize: 13, fontWeight: 600,
                  color: f.accent, letterSpacing: "0.01em",
                }}>
                  Learn more →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Lifestyle Break ─────────────────────────────────────────────────────────
function LifestyleBreak() {
  return (
    <section style={{ padding: "60px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, borderBottom: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 980, margin: "0 auto", textAlign: "center" }}>
        <div style={{
          borderRadius: 16, overflow: "hidden",
          aspectRatio: "21/9",
          marginBottom: 36,
          border: `1px solid ${M.rule}`,
          boxShadow: "0 20px 50px -25px rgba(26, 18, 8, 0.3)",
        }}>
          <img
            src="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=2400&q=80"
            alt="Hands and laptop showing the platform"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
          />
        </div>
        <p style={{
          fontFamily: HEAD, fontStyle: "italic",
          fontSize: "clamp(22px, 3vw, 32px)",
          lineHeight: 1.4, color: M.ink2, margin: 0,
          maxWidth: 720, marginLeft: "auto", marginRight: "auto",
          letterSpacing: "-0.01em",
        }}>
          The point isn't more outreach. It's automated outreach,{" "}
          <span style={{ color: M.fire }}>with better data, to the right people.</span>
        </p>
      </div>
    </section>
  );
}

// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section style={{ padding: "120px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, textAlign: "center" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(36px, 5vw, 56px)", lineHeight: 1.08, fontWeight: 700,
          letterSpacing: "-0.02em", color: M.ink, margin: 0,
        }}>
          Free to start.<br />
          <span style={{ fontStyle: "italic", color: M.fire }}>Connect in thirty seconds.</span>
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 18, color: M.ink2, marginTop: 24, lineHeight: 1.6 }}>
          Free forever for the basics. Pro $25/mo. Growth $49/mo when you're ready for sequences.
        </p>
        <div style={{ marginTop: 36 }}>
          <FinalCtaButton />
        </div>
        <p style={{
          fontFamily: BODY, fontSize: 15, fontWeight: 600, color: M.ink,
          marginTop: 24, lineHeight: 1.5,
        }}>
          Currently in Beta. We're letting in 50 new users a week.{" "}
          <FinalCtaInlineLink />
        </p>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: "60px 28px 40px", borderTop: `1px solid ${M.rule}`, background: M.paper }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize: 13, color: M.ink3 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'ITCSouvenir', 'Libre Baskerville', serif", fontWeight: 700, fontSize: 22, color: M.fire }}>
            humble hello.
          </span>
        </Link>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Link href="/features" style={{ color: M.ink2, textDecoration: "none" }}>Features</Link>
          <Link href="/plans" style={{ color: M.ink2, textDecoration: "none" }}>Plans</Link>
          <Link href="/privacy" style={{ color: M.ink2, textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: M.ink2, textDecoration: "none" }}>Terms</Link>
        </div>
        <div>© {new Date().getFullYear()} Humble Hello</div>
      </div>
    </footer>
  );
}

// ── Building Blocks ─────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      fontFamily: MONO, fontSize: 12, fontWeight: 600, color: M.fire,
      letterSpacing: "0.14em", textTransform: "uppercase",
      marginBottom: 12,
    }}>
      <span aria-hidden style={{ width: 24, height: 1, background: M.fire }} />
      {children}
    </div>
  );
}

const sectionH2: React.CSSProperties = {
  fontFamily: HEAD, fontSize: "clamp(28px, 3.6vw, 42px)",
  lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em",
  color: M.ink, margin: 0,
};

function ProviderButton({ provider }: { provider: "google" | "microsoft" }) {
  const { openWaitlist } = useWaitlist();
  const isGoogle = provider === "google";
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 20px",
    borderRadius: 10,
    background: "#fff",
    border: `1.5px solid ${M.ruleStrong}`,
    color: M.ink,
    fontFamily: BODY,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    boxShadow: "0 1px 0 rgba(26, 18, 8, 0.04)",
    transition: "all 0.15s ease",
    cursor: "pointer",
  };
  return (
    <button onClick={openWaitlist} className="hh-provider-btn" style={style}>
      {isGoogle ? <GoogleIcon /> : <MicrosoftIcon />}
      Continue with {isGoogle ? "Google" : "Microsoft"}
    </button>
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

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill={M.forestSoft} />
      <path d="M5 8.4L7 10.2L11 6" stroke={M.forest} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Global CSS ──────────────────────────────────────────────────────────────
const globalCss = `
  body { margin: 0; }
  a:hover { opacity: 0.85; }
  .hh-feature-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 20px 40px -20px rgba(26, 18, 8, 0.18);
    border-color: ${M.ruleStrong} !important;
  }
  .hh-provider-btn:hover {
    border-color: ${M.ink} !important;
    transform: translateY(-1px);
  }
  @media (max-width: 980px) {
    .hh-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
    .hh-hero-image { max-width: 480px; margin: 0 auto; }
    .hh-feature-cards { grid-template-columns: repeat(2, 1fr) !important; }
    .hh-trust-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .hh-nav-links { gap: 14px !important; }
  }
  @media (max-width: 640px) {
    .hh-feature-cards { grid-template-columns: 1fr !important; }
    .hh-trust-grid { grid-template-columns: 1fr !important; }
    .hh-nav-links a[href="/plans"], .hh-nav-links span[aria-hidden] { display: none !important; }
  }
`;