import Link from "next/link";
import Image from "next/image";
import { AuthModalProvider, AuthTrigger } from "../../components/AuthModal";
import { FeaturesDropdown } from "../../components/FeaturesDropdown";

export const metadata = {
  title: "Sequences — Humble Hello",
  description:
    "Multi-step campaigns that combine email, handwritten cards, and gifts. Branching logic, real personalization, capped at 25 sends a day.",
};

const M = {
  paper: "#faf6ef",
  paperDeep: "#f1e8d8",
  ink: "#1a1208",
  ink2: "#3d2c1c",
  ink3: "#7a6450",
  fire: "#bf5c38",
  fireSoft: "#f0d4c2",
  purple: "#5b4ec1",
  purpleSoft: "#e2dffb",
  green: "#2f7a3a",
  rule: "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const ACCENT = M.purple;
const ACCENT_SOFT = M.purpleSoft;

export default function SequencesPage() {
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
          <SafetyCallout />
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
      <div style={{ maxWidth: 1080, margin: "0 auto", textAlign: "center" }}>
        <div style={{ marginBottom: 24, textAlign: "left" }}>
          <Link href="/features" style={{ fontFamily: BODY, fontSize: 13, color: M.ink3, textDecoration: "none" }}>
            ← All features
          </Link>
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 600,
          color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase",
          marginBottom: 18,
        }}>
          Sequences
        </div>
        <h1 style={{
          fontFamily: HEAD, fontSize: "clamp(40px, 6vw, 76px)",
          lineHeight: 1.02, fontWeight: 700, letterSpacing: "-0.025em",
          color: M.ink, margin: 0, maxWidth: 920, marginLeft: "auto", marginRight: "auto",
        }}>
          Multi-step campaigns.{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>That actually feel personal.</span>
        </h1>
        <p style={{
          fontFamily: BODY, fontSize: 20, lineHeight: 1.55, color: M.ink2,
          marginTop: 24, maxWidth: 600, marginLeft: "auto", marginRight: "auto",
        }}>
          Email Tuesday. If they don't reply, send a handwritten card Friday. If they engage, trigger a gift.
          Each step adapts. Every send is grounded in real context.
        </p>

        <div style={{ marginTop: 36 }}>
          <AuthTrigger mode="signup" style={ctaGreenLarge}>
            Try for free →
          </AuthTrigger>
        </div>

        <div style={{
          marginTop: 64,
          borderRadius: 14, overflow: "hidden",
          maxWidth: 1080, marginLeft: "auto", marginRight: "auto",
          border: `1px solid ${M.rule}`,
          boxShadow: "0 30px 80px -30px rgba(26, 18, 8, 0.3)",
        }}>
          <Image
            src="/features/sequences-builder-full.png"
            alt="Sequence builder showing email, branch logic, card step, wait, and follow-up"
            width={2400}
            height={1300}
            priority
            style={{ width: "100%", height: "auto", display: "block" }}
          />
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
      title: "Email, cards, and gifts in one flow",
      body: "Outreach sequences emails. Sendoso sequences gifts. Humble Hello sequences both — and the cards are real, not stickers on a digital coupon.",
      image: "/features/sequences-builder-full.png",
      imageAlt: "Sequence with email, card, and follow-up steps",
    },
    {
      n: "02",
      title: "Branch on what they actually do",
      body: "Clicked the link? Send the card. Didn't open? Try a different angle. Replied? Stop the campaign automatically — no awkward 'just following up.'",
      image: "/features/sequences-builder-full.png",
      imageAlt: "Branch logic showing if/else on click",
    },
    {
      n: "03",
      title: "Templates for the common cases",
      body: "Sales outreach. Re-engagement. Birthday and holiday. Referral asks. Event follow-up. Lapsed customer. Start from one and edit, or build from scratch.",
      image: "/features/sequences-templates-list.png",
      imageAlt: "Template picker showing eight starting templates",
    },
    {
      n: "04",
      title: "AI personalization on every step",
      body: "Tell the system the campaign goal once. It uses what you know about each contact to personalize every message — not just merge tags.",
      image: "/features/sequences-template-picker.png",
      imageAlt: "Campaign goal field used by AI to personalize messages",
    },
  ];

  return (
    <section style={{ padding: "80px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, borderBottom: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={sectionH2}>
            What makes Sequences{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>different.</span>
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
                background: ACCENT_SOFT,
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

// ── Safety Callout ──────────────────────────────────────────────────────────
function SafetyCallout() {
  return (
    <section style={{ padding: "80px 28px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(28px, 3.6vw, 40px)",
          lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0, marginBottom: 16,
        }}>
          Built so you don't{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>burn your inbox.</span>
        </h2>
        <p style={{
          fontFamily: BODY, fontSize: 17, lineHeight: 1.6,
          color: M.ink2, marginTop: 0, marginBottom: 36,
          maxWidth: 580, marginLeft: "auto", marginRight: "auto",
        }}>
          Most sequence tools optimize for volume. We optimize for sender reputation. Hard limits everywhere.
        </p>

        <div className="hh-deliv-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
        }}>
          {[
            { n: "25/day", d: "Hard send cap" },
            { n: "1 active", d: "Campaign at a time" },
            { n: "Replies stop", d: "Sequences automatically" },
            { n: "Auto-pause", d: "On bounce spikes" },
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
              src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1600&q=80"
              alt="Person planning at a desk with notebook"
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
              Outreach on autopilot.{" "}
              <span style={{ fontStyle: "italic", color: M.fire }}>That doesn't read like autopilot.</span>
            </h2>
            <p style={{
              fontFamily: HEAD, fontStyle: "italic", fontSize: 18, lineHeight: 1.6,
              color: M.ink2, margin: 0,
            }}>
              Run a referral campaign across 50 best customers. Welcome every new client through a four-step
              flow that includes a real card. Re-engage lapsed contacts without sounding like a SaaS.
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
          One campaign, fifty contacts.<br />
          <span style={{ fontStyle: "italic", color: M.fire }}>Every message, personal.</span>
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 18, color: M.ink2, marginTop: 24, lineHeight: 1.55 }}>
          Sequences are part of the Growth plan. Try Humble Hello free, upgrade when you're ready.
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
    .hh-mech-grid { grid-template-columns: 1fr !important; }
    .hh-lifestyle-grid { grid-template-columns: 1fr !important; gap: 32px !important; max-width: 540px; margin: 0 auto; }
    .hh-deliv-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .hh-nav-links a[href="/about"] { display: none; }
    .hh-nav-links { gap: 14px !important; }
  }
  @media (max-width: 640px) {
    .hh-deliv-grid { grid-template-columns: 1fr !important; }
    .hh-nav-links a[href="/plans"], .hh-nav-links span[aria-hidden] { display: none !important; }
  }
`;