import Link from "next/link";
import Image from "next/image";
import { AuthModalProvider, AuthTrigger } from "../../components/AuthModal";
import { FeaturesDropdown } from "../../components/FeaturesDropdown";

export const metadata = {
  title: "Relationship Index — Humble Hello",
  description:
    "Walk into every meeting knowing how to land. The Humble Hello Relationship Index reads a profile and tells you exactly how to communicate.",
};

const M = {
  paper: "#faf6ef",
  paperDeep: "#f1e8d8",
  ink: "#1a1208",
  ink2: "#3d2c1c",
  ink3: "#7a6450",
  ink4: "#a89580",
  fire: "#bf5c38",
  fireSoft: "#f0d4c2",
  blue: "#1b66a8",
  blueSoft: "#dceafa",
  blueDeep: "#0f4d80",
  green: "#2f7a3a",
  rule: "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const ACCENT = M.blue;
const ACCENT_SOFT = M.blueSoft;

export default function RelationshipIndexPage() {
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
          <WhatYouGet />
          <Archetypes />
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
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 64,
          alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 600,
              color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase",
              marginBottom: 18,
            }}>
              Relationship Index
            </div>
            <h1 style={{
              fontFamily: HEAD, fontSize: "clamp(40px, 5.6vw, 68px)",
              lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.025em",
              color: M.ink, margin: 0,
            }}>
              Walk in.{" "}
              <span style={{ fontStyle: "italic", color: M.fire }}>Land.</span>
            </h1>
            <p style={{
              fontFamily: BODY, fontSize: 19, lineHeight: 1.6, color: M.ink2,
              marginTop: 24, maxWidth: 540,
            }}>
              You're meeting someone you don't know well. The Relationship Index reads their profile and
              tells you exactly how they want to be approached, what to lead with, and what will lose them
              in the first thirty seconds.
            </p>

            <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="#" style={ctaChromeLarge} aria-disabled="true" title="Coming soon">
                <ChromeIcon />
                Add to Chrome
              </a>
              <AuthTrigger mode="signup" style={ctaSecondaryLarge}>
                Try Humble Hello free →
              </AuthTrigger>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: M.ink3, fontFamily: BODY, fontStyle: "italic" }}>
              Chrome extension launching soon
            </div>
          </div>

          <div className="hh-hero-card" style={{ position: "relative" }}>
            <PersonalityCard />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── PersonalityCard (the hero visual) ───────────────────────────────────────
function PersonalityCard() {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 18,
      border: `1px solid ${M.rule}`,
      boxShadow: "0 30px 60px -25px rgba(26, 18, 8, 0.25), 0 8px 16px -8px rgba(26, 18, 8, 0.1)",
      overflow: "hidden",
      maxWidth: 460,
      margin: "0 auto",
    }}>
      <div style={{
        padding: "12px 20px",
        background: M.paperDeep,
        borderBottom: `1px solid ${M.rule}`,
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 11, color: M.ink3, fontFamily: MONO, letterSpacing: "0.08em",
        textTransform: "uppercase", fontWeight: 600,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: M.fire, display: "inline-block" }} />
        humble hello · relationship index
      </div>

      <div style={{ padding: "28px 28px 20px", display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", overflow: "hidden",
          background: ACCENT_SOFT, flexShrink: 0,
        }}>
          <img
            src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80&crop=faces"
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
        <div>
          <div style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 700, color: M.ink, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
            Sarah Mitchell
          </div>
          <div style={{ fontFamily: BODY, fontSize: 13, color: M.ink3, marginTop: 2 }}>
            VP of Marketing · Acme Corp
          </div>
        </div>
      </div>

      <div style={{ padding: "0 28px 24px" }}>
        <div style={{
          background: ACCENT_SOFT,
          borderRadius: 12,
          padding: "16px 18px",
          border: `1px solid ${ACCENT}33`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 8 L8 2 L14 8 L8 14 Z" fill={ACCENT} />
            </svg>
            <span style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: M.ink, letterSpacing: "-0.01em" }}>
              Driver
            </span>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Bold · Decisive · Curious
          </div>
          <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.55, color: M.ink2, fontStyle: "italic" }}>
            Detail-obsessed marketing leader who values strategic vision followed by operational rigor.
            Won't trust you until you've shown your homework.
          </div>
        </div>
      </div>

      <div style={{ padding: "0 28px 20px" }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 600,
          color: M.ink3, letterSpacing: "0.14em", textTransform: "uppercase",
          marginBottom: 10,
        }}>
          How to communicate
        </div>
        <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.55, color: M.ink2 }}>
          Lead with strategic vision. Follow with operational rigor. Skip small talk —
          Sarah values substance over flash. Be ready with specifics.
        </div>
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 600,
          color: M.ink3, letterSpacing: "0.14em", textTransform: "uppercase",
          marginBottom: 10,
        }}>
          Three ways to start
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { tag: "Direct", text: "Sarah — saw your Q3 launch numbers. Wanted to share what's worked for us." },
            { tag: "Curious", text: "Sarah — read your post on attribution. The bit on cohort decay landed." },
            { tag: "Personal", text: "Sarah — congrats on the Forbes feature. The framing on brand-as-system was sharp." },
          ].map((o) => (
            <div key={o.tag} style={{
              padding: "10px 12px",
              background: M.paper,
              borderRadius: 8,
              border: `1px solid ${M.rule}`,
              fontSize: 12,
              lineHeight: 1.5,
              color: M.ink2,
              fontFamily: BODY,
            }}>
              <span style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 700, color: ACCENT,
                letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 8,
              }}>
                {o.tag}
              </span>
              {o.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── What You Get ────────────────────────────────────────────────────────────
function WhatYouGet() {
  return (
    <section style={{ padding: "100px 28px", background: M.paperDeep, borderTop: `1px solid ${M.rule}`, borderBottom: `1px solid ${M.rule}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h2 style={sectionH2}>
            Run an analysis.{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>Get four things.</span>
          </h2>
        </div>

        <div className="hh-features" style={{ display: "flex", flexDirection: "column", gap: 80 }}>
          <FeatureRow
            n="01"
            title="Their archetype"
            body="Five dimensions — Drive, Depth, Pace, Structure, Warmth — combine into one of eight clear archetypes. You see at a glance whether you're talking to a Driver, an Analyst, a Connector, or any of the other five."
            image="/features/ri-sync-tab.png"
            imageAlt="Archetype profile in the Humble Hello sidebar"
            imageSide="right"
          />
          <FeatureRow
            n="02"
            title="How to influence them"
            body="Tactical guidance for first contact, presentations, objections, closing, and follow-up. Each tip calibrated to their archetype — what wins a Driver loses a Connector, and the page tells you which is which."
            image="/features/ri-influence-tab.png"
            imageAlt="Influence tab with five tactical playbook moments"
            imageSide="left"
          />
          <FeatureRow
            n="03"
            title="Three openers, ready to copy"
            body="Direct, Curious, and Personal — three pre-written messages calibrated to start a real conversation. Pick the one that fits your context. One click copies it to your clipboard."
            image="/features/ri-outreach-tab.png"
            imageAlt="Three pre-written opening messages"
            imageSide="right"
          />
          <FeatureRow
            n="04"
            title="Saved automatically to the contact"
            body="Every analysis stores to that person's record. Future drafts in Engage and steps in Sequences pull from it automatically — so the next time you reach out, the system already knows how to talk to them."
            image="/features/auto-update-contact-card.png"
            imageAlt="Contact record showing data captured from analysis"
            imageSide="left"
          />
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ n, title, body, image, imageAlt, imageSide }: {
  n: string; title: string; body: string;
  image: string; imageAlt: string;
  imageSide: "left" | "right";
}) {
  const text = (
    <div>
      <div style={{
        fontFamily: MONO, fontSize: 11, fontWeight: 600,
        color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase",
        marginBottom: 12,
      }}>
        №{n}
      </div>
      <h3 style={{
        fontFamily: HEAD, fontSize: "clamp(24px, 3vw, 34px)",
        lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.015em",
        color: M.ink, margin: 0, marginBottom: 16,
      }}>
        {title}
      </h3>
      <p style={{
        fontFamily: BODY, fontSize: 16, lineHeight: 1.65,
        color: M.ink2, margin: 0,
      }}>
        {body}
      </p>
    </div>
  );

  const img = (
    <div style={{
      borderRadius: 14,
      overflow: "hidden",
      border: `1px solid ${M.rule}`,
      boxShadow: "0 24px 50px -25px rgba(26, 18, 8, 0.3)",
      background: "#fff",
      maxWidth: 380,
      maxHeight: 480,
      margin: imageSide === "right" ? "0 0 0 auto" : "0 auto 0 0",
    }}>
      <Image
        src={image}
        alt={imageAlt}
        width={760}
        height={960}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );

  return (
    <div className="hh-feature-row" style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 64,
      alignItems: "start",
      paddingTop: 32,
    }}>
      {imageSide === "left" ? <>{img}{text}</> : <>{text}{img}</>}
    </div>
  );
}

// ── Archetypes ──────────────────────────────────────────────────────────────
function Archetypes() {
  const archetypes = [
    { n: "Driver", d: "Bold, decisive, results-first" },
    { n: "Analyst", d: "Methodical, evidence-driven" },
    { n: "Connector", d: "Energetic, relationship-first" },
    { n: "Observer", d: "Reserved, thoughtful, careful" },
    { n: "Visionary", d: "Big-picture, future-focused" },
    { n: "Helper", d: "Supportive, service-minded" },
    { n: "Planner", d: "Structured, detail-oriented" },
    { n: "Challenger", d: "Direct, willing to push back" },
  ];

  return (
    <section style={{ padding: "100px 28px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          fontFamily: HEAD, fontSize: "clamp(28px, 3.6vw, 40px)",
          lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0, marginBottom: 16,
        }}>
          Eight archetypes.{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>Everyone you'll meet.</span>
        </h2>
        <p style={{
          fontFamily: BODY, fontSize: 17, lineHeight: 1.6,
          color: M.ink2, marginTop: 0, marginBottom: 48,
          maxWidth: 600, marginLeft: "auto", marginRight: "auto",
        }}>
          Built on the Five Factor Model — the personality framework with the deepest research base.
          Each archetype shapes how someone wants to be approached.
        </p>

        <div className="hh-arch-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
        }}>
          {archetypes.map((a) => (
            <div key={a.n} style={{
              padding: "20px 16px",
              background: "#fff",
              border: `1px solid ${M.rule}`,
              borderRadius: 12,
              textAlign: "left",
            }}>
              <div style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: ACCENT, marginBottom: 6, letterSpacing: "-0.01em" }}>
                {a.n}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12, lineHeight: 1.45, color: M.ink3 }}>
                {a.d}
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
          Stop guessing.<br />
          <span style={{ fontStyle: "italic", color: M.fire }}>Start understanding.</span>
        </h2>
        <p style={{ fontFamily: BODY, fontSize: 18, color: M.ink2, marginTop: 24, lineHeight: 1.55 }}>
          Install the Chrome extension. Run your first analysis in thirty seconds.
        </p>
        <div style={{ marginTop: 36, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="#" style={ctaChromeLarge} aria-disabled="true" title="Coming soon">
            <ChromeIcon />
            Add to Chrome
          </a>
          <AuthTrigger mode="signup" style={ctaSecondaryLarge}>
            Try Humble Hello free →
          </AuthTrigger>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: M.ink3, fontFamily: BODY, fontStyle: "italic" }}>
          Chrome extension launching soon
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

// ── Chrome icon + CTA styles ────────────────────────────────────────────────
function ChromeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.6" />
      <path d="M12 8.5h8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 13.5L5 21" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 13.5L19 21" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const sectionH2: React.CSSProperties = {
  fontFamily: HEAD, fontSize: "clamp(32px, 4.4vw, 50px)",
  lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.025em",
  color: M.ink, margin: 0,
};

const ctaChromeLarge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  background: M.green, color: "#fff",
  padding: "16px 28px", borderRadius: 12,
  fontFamily: BODY, fontSize: 16, fontWeight: 600,
  border: "none", cursor: "pointer", textDecoration: "none",
  boxShadow: "0 8px 24px -8px rgba(47, 122, 58, 0.4)",
  opacity: 0.92,
};

const ctaSecondaryLarge: React.CSSProperties = {
  display: "inline-block",
  background: "transparent",
  color: M.ink,
  padding: "16px 28px", borderRadius: 12,
  fontFamily: BODY, fontSize: 16, fontWeight: 600,
  border: `1.5px solid ${M.ruleStrong}`,
  cursor: "pointer", textDecoration: "none",
};

// ── Global CSS ──────────────────────────────────────────────────────────────
const globalCss = `
  body { margin: 0; }
  a:hover { opacity: 0.85; }
  @media (max-width: 980px) {
    .hh-hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
    .hh-hero-card { max-width: 460px; margin: 0 auto; }
    .hh-feature-row { grid-template-columns: 1fr !important; gap: 32px !important; max-width: 540px; margin: 0 auto; }
    .hh-feature-row > div:first-child { order: 1; }
    .hh-feature-row > div:last-child { order: 2; }
    .hh-lifestyle-grid { grid-template-columns: 1fr !important; gap: 32px !important; max-width: 540px; margin: 0 auto; }
    .hh-arch-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .hh-nav-links { gap: 14px !important; }
  }
  @media (max-width: 640px) {
    .hh-arch-grid { grid-template-columns: 1fr !important; }
    .hh-nav-links a[href="/plans"], .hh-nav-links span[aria-hidden] { display: none !important; }
  }
`;