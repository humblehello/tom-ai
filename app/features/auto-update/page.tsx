import Link from "next/link";
import Image from "next/image";
import { AuthModalProvider, AuthTrigger } from "../../components/AuthModal";
import { FeaturesDropdown } from "../../components/FeaturesDropdown";

export const metadata = {
  title: "Auto-update — Humble Hello",
  description:
    "A contact list that stays current on its own.",
};

const M = {
  paper: "#faf6ef",
  paperDeep: "#f1e8d8",
  ink: "#1a1208",
  ink2: "#3d2c1c",
  ink3: "#7a6450",
  fire: "#bf5c38",
  fireSoft: "#f0d4c2",
  forest: "#3d6b42",
  forestSoft: "#d0e0d2",
  green: "#2f7a3a",
  greenDark: "#235c2c",
  rule: "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const ACCENT = M.forest;

export default function AutoUpdatePage() {
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
          <Nav />
          <Hero />
          <FourMechanisms />
          <Deliverability />
          <LifestyleMoment />
          <FinalCta />
          <Footer />
        </AuthModalProvider>
      </div>
    </>
  );
}

// ── Nav ─────────────────────────────────────────────────────────────────────
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
          <FeaturesDropdown active />
          <Link href="/plans" style={navLink}>Plans</Link>
          <span style={{ width: 1, height: 16, background: M.rule }} aria-hidden />
          <AuthTrigger mode="signin" style={navSignIn}>Sign in</AuthTrigger>
          <AuthTrigger mode="signup" style={navCtaGreen}>Try for free →</AuthTrigger>
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
const navCtaGreen: React.CSSProperties = {
  fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "#fff",
  textDecoration: "none", padding: "9px 18px", borderRadius: 8,
  background: M.green, letterSpacing: "0.01em", cursor: "pointer",
};

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ padding: "60px 28px 80px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/features" style={{ fontFamily: BODY, fontSize: 13, color: M.ink3, textDecoration: "none" }}>
            ← All features
          </Link>
        </div>

        <div className="hh-hero-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 64,
          alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 600,
              color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase",
              marginBottom: 18,
            }}>
              Auto-update
            </div>
            <h1 style={{
              fontFamily: HEAD, fontSize: "clamp(40px, 5.6vw, 68px)",
              lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.025em",
              color: M.ink, margin: 0,
            }}>
              A contact list that{" "}
              <span style={{ fontStyle: "italic", color: M.fire }}>stays current.</span>
            </h1>
            <p style={{
              fontFamily: BODY, fontSize: 19, lineHeight: 1.55, color: M.ink2,
              marginTop: 24, maxWidth: 500,
            }}>
              Phone numbers go stale. Titles change. Auto-update keeps it fresh — quietly, in the background.
            </p>

            <div style={{ marginTop: 36 }}>
              <AuthTrigger mode="signup" style={ctaGreenLarge}>
                Try for free →
              </AuthTrigger>
            </div>
          </div>

          <div className="hh-hero-image" style={{
            borderRadius: 14, overflow: "hidden",
            border: `1px solid ${M.rule}`,
            boxShadow: "0 30px 80px -30px rgba(26, 18, 8, 0.3)",
          }}>
            <Image
              src="/features/auto-update-contacts-list.png"
              alt="Humble Hello contacts page"
              width={1200}
              height={800}
              priority
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Four Mechanisms ─────────────────────────────────────────────────────────
function FourMechanisms() {
  const subs = [
    {
      n: "01",
      title: "Verification emails",
      body: "Friendly check-ins ask contacts to confirm what's right and fill in what's missing. Sent at human pace.",
      image: "/features/auto-update-verification-email.png",
      imageAlt: "Verification email mockup with missing fields highlighted",
    },
    {
      n: "02",
      title: "Email & calendar scanning",
      body: "We watch how you communicate — flagging who matters, what they care about. Nothing private leaves your account.",
      image: "/features/engage-dashboard.png",
      imageAlt: "Dashboard showing rich context pulled from email and calendar",
    },
    {
      n: "03",
      title: "LinkedIn enrichment",
      body: "Visit a profile, sync their current title, company, and location. User-initiated — never automated.",
      image: "/features/ri-sync-tab.png",
      imageAlt: "Humble Hello sidebar syncing LinkedIn data",
    },
    {
      n: "04",
      title: "Smart imports",
      body: "Drop a CSV, VCF, or photo of a business card. Hopper handles formatting, deduplication, and tagging.",
      image: "/features/auto-update-hopper.png",
      imageAlt: "The Hopper smart import interface",
    },
  ];

  return (
    <section style={{ padding: "80px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, borderBottom: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={sectionH2}>
            Four ways the data{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>stays clean.</span>
          </h2>
        </div>

        <div className="hh-mech-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24,
        }}>
          {subs.map((s) => (
            <div key={s.n} style={{
              background: "#fff",
              border: `1px solid ${M.rule}`,
              borderRadius: 14,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                aspectRatio: "16/10",
                overflow: "hidden",
                borderBottom: `1px solid ${M.rule}`,
                background: M.forestSoft,
              }}>
                <Image
                  src={s.image}
                  alt={s.imageAlt}
                  width={1000}
                  height={625}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                />
              </div>
              <div style={{ padding: "24px 28px 28px" }}>
                <div style={{
                  fontFamily: MONO, fontSize: 11, fontWeight: 600,
                  color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase",
                  marginBottom: 10,
                }}>
                  №{s.n}
                </div>
                <h3 style={{
                  fontFamily: HEAD, fontSize: 22, fontWeight: 700,
                  lineHeight: 1.25, color: M.ink, margin: 0, marginBottom: 10, letterSpacing: "-0.01em",
                }}>
                  {s.title}
                </h3>
                <p style={{
                  fontFamily: BODY, fontSize: 14, lineHeight: 1.6,
                  color: M.ink2, margin: 0,
                }}>
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Deliverability (compressed) ─────────────────────────────────────────────
function Deliverability() {
  return (
    <section style={{ padding: "80px 28px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(28px, 3.6vw, 40px)",
          lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0, marginBottom: 16,
        }}>
          Built so you don't get{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>flagged as spam.</span>
        </h2>
        <p style={{
          fontFamily: BODY, fontSize: 17, lineHeight: 1.6,
          color: M.ink2, marginTop: 0, marginBottom: 36,
          maxWidth: 580, marginLeft: "auto", marginRight: "auto",
        }}>
          Verification emails are the highest-volume thing the system sends. Every guardrail below
          protects your sender reputation.
        </p>

        <div className="hh-deliv-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
        }}>
          {[
            { n: "20/day", d: "Hard cap, staggered" },
            { n: "Auto-pause", d: "On bounce spikes" },
            { n: "Your inbox", d: "Never a shared IP" },
            { n: "1 follow-up", d: "Then we stop" },
          ].map((g) => (
            <div key={g.n} style={{
              padding: "20px 14px",
              background: "#fff",
              border: `1px solid ${M.rule}`,
              borderRadius: 10,
            }}>
              <div style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: M.fire, marginBottom: 4, letterSpacing: "-0.01em" }}>
                {g.n}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12, lineHeight: 1.45, color: M.ink3 }}>
                {g.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Lifestyle Moment ────────────────────────────────────────────────────────
function LifestyleMoment() {
  return (
    <section style={{ padding: "80px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div className="hh-lifestyle-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}>
          <div style={{
            borderRadius: 14, overflow: "hidden",
            aspectRatio: "4/5",
            border: `1px solid ${M.rule}`,
            boxShadow: "0 20px 50px -25px rgba(26, 18, 8, 0.3)",
          }}>
            <img
              src="https://images.unsplash.com/photo-1488998427799-e3362cec87c3?auto=format&fit=crop&w=1600&q=80"
              alt="Open notebook and pen on a wooden desk"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              loading="lazy"
            />
          </div>
          <div>
            <h2 style={{
              fontFamily: HEAD, fontSize: "clamp(26px, 3.4vw, 38px)",
              lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.01em",
              color: M.ink, margin: 0, marginBottom: 18,
            }}>
              The address book,{" "}
              <span style={{ fontStyle: "italic", color: M.fire }}>brought to life.</span>
            </h2>
            <p style={{
              fontFamily: HEAD, fontStyle: "italic", fontSize: 18, lineHeight: 1.6,
              color: M.ink2, margin: 0,
            }}>
              The reason every other feature works is that the data underneath is current. Auto-update is
              the quiet foundation — so cards arrive, drafts feel personal, and outreach actually lands.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section style={{ padding: "120px 28px", textAlign: "center" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(36px, 5.5vw, 60px)", lineHeight: 1.05, fontWeight: 700,
          letterSpacing: "-0.025em", color: M.ink, margin: 0,
        }}>
          Stop maintaining contacts.<br />
          <span style={{ fontStyle: "italic", color: M.fire }}>Let them maintain themselves.</span>
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 18, color: M.ink2, marginTop: 24, lineHeight: 1.55 }}>
          Connect Gmail or Outlook in thirty seconds. Free forever for the basics.
        </p>
        <div style={{ marginTop: 36 }}>
          <AuthTrigger mode="signup" style={ctaGreenLarge}>
            Try for free →
          </AuthTrigger>
        </div>
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

// ── Shared styles ───────────────────────────────────────────────────────────
const sectionH2: React.CSSProperties = {
  fontFamily: HEAD, fontSize: "clamp(32px, 4.4vw, 50px)",
  lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.025em",
  color: M.ink, margin: 0,
};

const ctaGreenLarge: React.CSSProperties = {
  display: "inline-block",
  background: M.green, color: "#fff",
  padding: "18px 40px", borderRadius: 12,
  fontFamily: BODY, fontSize: 16, fontWeight: 600,
  border: "none", cursor: "pointer", textDecoration: "none",
  boxShadow: "0 8px 24px -8px rgba(47, 122, 58, 0.4)",
};

// ── Global CSS ──────────────────────────────────────────────────────────────
const globalCss = `
  body { margin: 0; }
  a:hover { opacity: 0.85; }
  @media (max-width: 980px) {
    .hh-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
    .hh-hero-image { max-width: 540px; margin: 0 auto; }
  }
  @media (max-width: 980px) {
    .hh-mech-grid { grid-template-columns: 1fr !important; }
    .hh-lifestyle-grid { grid-template-columns: 1fr !important; gap: 32px !important; max-width: 540px; margin: 0 auto; }
    .hh-deliv-grid { grid-template-columns: repeat(2, 1fr) !important; }
   
    .hh-nav-links { gap: 14px !important; }
  }
  @media (max-width: 640px) {
    .hh-deliv-grid { grid-template-columns: 1fr !important; }
    .hh-nav-links a[href="/plans"], .hh-nav-links span[aria-hidden] { display: none !important; }
  }
`;