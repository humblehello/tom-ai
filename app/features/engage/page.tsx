import Link from "next/link";
import Image from "next/image";
import { AuthModalProvider, AuthTrigger } from "../../components/AuthModal";
import { FeaturesDropdown } from "../../components/FeaturesDropdown";

export const metadata = {
  title: "Engage — Humble Hello",
  description:
    "Show up at the right time, with the right words. The daily reach-out brief, AI drafts grounded in real context, and life-event detection.",
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
  rule: "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const ACCENT = M.fire;

export default function EngagePage() {
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
          <FourCapabilities />
          <CadenceCallout />
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
              Engage
            </div>
            <h1 style={{
              fontFamily: HEAD, fontSize: "clamp(40px, 5.6vw, 68px)",
              lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.025em",
              color: M.ink, margin: 0,
            }}>
              The right words.{" "}
              <span style={{ fontStyle: "italic", color: M.fire }}>At the right time.</span>
            </h1>
            <p style={{
              fontFamily: BODY, fontSize: 19, lineHeight: 1.55, color: M.ink2,
              marginTop: 24, maxWidth: 500,
            }}>
              Three to five contacts surfaced each morning. AI drafts grounded in what you actually know about them.
              Not throughput — meaningful touch.
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
              src="/features/engage-dashboard.png"
              alt="Engage dashboard with daily reach-out brief"
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
// ── Four Capabilities ───────────────────────────────────────────────────────
function FourCapabilities() {
  const subs = [
    {
      n: "01",
      title: "Daily reach-out brief",
      body: "Three to five people you should touch today, sorted by urgency. Each with a reason. Set a goal of one or three; we make it happen.",
      image: "/features/engage-dashboard.png",
      imageAlt: "Daily reach-out brief showing contacts with reasons and reach-out buttons",
    },
    {
      n: "02",
      title: "Drafts grounded in real context",
      body: "Every message references something specific — a project they mentioned, a milestone you celebrated. No 'hope you're well' filler.",
      image: "/features/cards-send-modal.png",
      imageAlt: "AI-drafted message with the contact's context visible",
    },
    {
      n: "03",
      title: "Life-event detection",
      body: "New job, baby, promotion, move, anniversary. Surfaced from email, calendar, and LinkedIn — flagged with confidence and source.",
      image: "/features/engage-approval-sidebar.png",
      imageAlt: "Approval sidebar showing detected life events and birthday triggers",
    },
    {
      n: "04",
      title: "Honest gaps",
      body: "When context is too thin to write something genuine, we say so — and prompt you for the missing piece, instead of inventing details.",
      image: "/features/journal-chat.png",
      imageAlt: "Journal chat asking a context question to fill in a gap",
    },
  ];

  return (
    <section style={{ padding: "80px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, borderBottom: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={sectionH2}>
            Four ways Engage{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>helps you show up.</span>
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
                background: M.fireSoft,
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

// ── Cadence Callout ─────────────────────────────────────────────────────────
function CadenceCallout() {
  return (
    <section style={{ padding: "80px 28px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(28px, 3.6vw, 40px)",
          lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0, marginBottom: 16,
        }}>
          Calibrated to{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>how close they actually are.</span>
        </h2>
        <p style={{
          fontFamily: BODY, fontSize: 17, lineHeight: 1.6,
          color: M.ink2, marginTop: 0, marginBottom: 36,
          maxWidth: 580, marginLeft: "auto", marginRight: "auto",
        }}>
          Your inner circle gets touched more. Your wider network less. The cadence is the difference between
          thoughtful and overwhelming.
        </p>

        <div className="hh-deliv-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
        }}>
          {[
            { n: "Core 5", d: "Every 14 days" },
            { n: "Inner 15", d: "Monthly" },
            { n: "Active 50", d: "Every 6 weeks" },
            { n: "Network 150", d: "Quarterly" },
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


// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section style={{ padding: "120px 28px", textAlign: "center" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(36px, 5.5vw, 60px)", lineHeight: 1.05, fontWeight: 700,
          letterSpacing: "-0.025em", color: M.ink, margin: 0,
        }}>
          Three messages a day.<br />
          <span style={{ fontStyle: "italic", color: M.fire }}>The relationships of a lifetime.</span>
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 18, color: M.ink2, marginTop: 24, lineHeight: 1.55 }}>
          Connect Gmail or Outlook. Tomorrow's brief is waiting.
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
    .hh-mech-grid { grid-template-columns: 1fr !important; }
    .hh-deliv-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .hh-nav-links { gap: 14px !important; }
  }
  @media (max-width: 640px) {
    .hh-deliv-grid { grid-template-columns: 1fr !important; }
    .hh-nav-links a[href="/plans"], .hh-nav-links span[aria-hidden] { display: none !important; }
  }
`;