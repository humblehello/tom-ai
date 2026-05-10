import Link from "next/link";
import { FeaturesDropdown } from "../components/FeaturesDropdown";
import { AuthModalProvider, AuthTrigger } from "../components/AuthModal";

export const metadata = {
  title: "Privacy · Humble Hello",
  description:
    "How Humble Hello collects, uses, and protects your data. Plain English. No dark patterns.",
};

const M = {
  paper:      "#faf6ef",
  paperDeep:  "#f1e8d8",
  ink:        "#1a1208",
  ink2:       "#3d2c1c",
  ink3:       "#7a6450",
  ink4:       "#a89580",
  fire:       "#bf5c38",
  fireSoft:   "#f0d4c2",
  green:      "#2f7a3a",
  rule:       "#e3d5c0",
  ruleStrong: "#c8b497",
};

const HEAD = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const VERSION = "1.0";
const EFFECTIVE_DATE = "May 10, 2026";

export default function PrivacyPage() {
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
          <Header />
          <Body />
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
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{
            fontFamily: "'ITCSouvenir', 'Libre Baskerville', serif",
            fontWeight: 700, fontSize: 26, color: M.fire, letterSpacing: "-0.01em",
          }}>
            humble hello.
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <FeaturesDropdown />
          <Link href="/plans" style={navLink}>Plans</Link>
          <span style={{ width: 1, height: 16, background: M.rule }} aria-hidden />
          <AuthTrigger mode="signin" style={navSignIn}>Sign in</AuthTrigger>
          <AuthTrigger mode="signup" style={navCta}>Try for free →</AuthTrigger>
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
  background: M.green, letterSpacing: "0.01em", cursor: "pointer",
};

// ── Header ──────────────────────────────────────────────────────────────────
function Header() {
  return (
    <section style={{ padding: "80px 28px 40px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 600,
          color: M.fire, letterSpacing: "0.14em", textTransform: "uppercase",
          marginBottom: 18,
        }}>
          Privacy
        </div>
        <h1 style={{
          fontFamily: HEAD, fontSize: "clamp(36px, 5.4vw, 56px)",
          lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0,
        }}>
          Privacy, in{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>plain English.</span>
        </h1>
        <p style={{
          fontFamily: BODY, fontSize: 17, lineHeight: 1.65,
          color: M.ink2, marginTop: 24,
        }}>
          Humble Hello reads sensitive things — your inbox, your calendar, your contacts.
          You deserve to know exactly what we do with that data, and what we don't. This page
          is the answer. No legal-ese theater.
        </p>
        <div style={{
          marginTop: 32, padding: "12px 16px",
          background: M.paperDeep, border: `1px solid ${M.rule}`, borderRadius: 8,
          fontSize: 12, color: M.ink3, fontFamily: MONO,
        }}>
          Version {VERSION} · Effective {EFFECTIVE_DATE}
        </div>
      </div>
    </section>
  );
}

// ── Body ────────────────────────────────────────────────────────────────────
function Body() {
  return (
    <section style={{ padding: "20px 28px 100px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Section title="The short version">
          <P>
            Humble Hello scans your inbox, calendar, and contacts to help you stay in touch
            with the people who matter. We use your data <strong>only</strong> to power your
            experience. We don't sell it. We don't share it without your explicit consent.
            We don't train AI models on your inbox content. You can export or delete
            everything at any time.
          </P>
        </Section>

        <Section title="Who we are">
          <P>
            Humble Hello is operated by Humble Hello, LLC ("Humble Hello," "we," "us"), based
            in Indianapolis, Indiana. Contact:{" "}
            <a href="mailto:tom@humblehello.com" style={emailLink}>tom@humblehello.com</a>.
          </P>
        </Section>

        <Section title="What we collect, and why">
          <SubH>From you directly</SubH>
          <P>
            When you sign up, we collect your name, email address, profile photo, and (during
            onboarding) your home address. The address is required only because we send physical
            cards on your behalf, and we need a return address.
          </P>

          <SubH>From your connected accounts (Google, Microsoft)</SubH>
          <P>
            With your explicit consent, we read:
          </P>
          <Bullets items={[
            "Email metadata: senders, recipients, subject lines, timestamps. Used to identify and rank your contacts.",
            "Email body content (recent messages): used to detect life events, infer relationships, and personalize drafts. We do not retain full email bodies long-term.",
            "Calendar events: attendees, titles, dates. Used to identify who you actually meet with.",
            "Contacts: names, emails, phones, addresses, notes. Used as the foundation of your contact list, with two-way sync back to your provider.",
          ]} />

          <SubH>From your usage</SubH>
          <P>
            Standard application logs: IP address, device type, pages visited, actions taken.
            Used to keep the service running and debug issues. Retained for 30 days unless
            relevant to a security investigation.
          </P>

          <SubH>From payment</SubH>
          <P>
            If you upgrade, our payment processor (Stripe) collects your payment method.
            We never see your full card number.
          </P>
        </Section>

        <Section title="What we never do">
          <Bullets items={[
            "We never sell your data. Not to advertisers, data brokers, or anyone else.",
            "We never email your contacts on Humble Hello's brand. All outreach goes from your address.",
            "We never train AI models on your inbox content. When we use AI (Anthropic Claude) to draft messages or analyze contacts, requests are sent on a per-request basis and are not used for model training.",
            "We never share your contact list with other Humble Hello users without your explicit opt-in to the Humble Hello Network (more on that below).",
          ]} />
        </Section>

        <Section title="The Humble Hello Network (optional)">
          <P>
            During onboarding, you have the option to contribute anonymized contact data to the
            Humble Hello Network — a shared pool of verified contact information that improves
            enrichment for everyone, like how Waze improves directions for every driver. This
            is opt-in. You can change your preference any time in Settings.
          </P>
          <P>
            When you opt in, we contribute factual contact data (name, current company, current
            email, current phone) on contacts you have an established relationship with. We do
            not contribute personal notes, journal entries, or anything you've marked private.
            We honor any contact's request to be removed from the network within 30 days.
          </P>
        </Section>

        <Section title="Your rights">
          <P>
            Regardless of where you live, you can:
          </P>
          <Bullets items={[
            "Access your data: see everything we have about you in Settings → Data",
            "Export your data: download a complete copy in CSV/JSON format",
            "Delete your data: cancel your account and we permanently delete everything within 30 days",
            "Correct your data: edit any contact, profile, or setting at any time",
            "Opt out of the Humble Hello Network: toggle it off in Settings",
            "Opt out of marketing emails: unsubscribe link in every marketing email",
          ]} />
          <P>
            <strong>If you're in the EU, UK, or California:</strong> you have additional rights under
            GDPR and CCPA, including the right to lodge a complaint with your data protection
            authority and the right to portability. Contact{" "}
            <a href="mailto:tom@humblehello.com" style={emailLink}>tom@humblehello.com</a> with
            any rights request — we respond within 30 days.
          </P>
          <P>
            <strong>Do Not Sell or Share My Personal Information:</strong> we don't sell or share your
            personal information for cross-context behavioral advertising. The Humble Hello Network
            is opt-in, contribution-based, and not a sale under CCPA.
          </P>
        </Section>

        <Section title="How we share data with vendors">
          <P>
            We use a small set of vendors to operate Humble Hello. Each is contractually bound
            to use your data only to provide their service to us:
          </P>
          <Bullets items={[
            "Supabase (database hosting, US)",
            "Vercel (application hosting, US)",
            "Inngest (background job processing, US)",
            "Anthropic (AI drafting and contact analysis, US)",
            "Stripe (payment processing, US)",
            "Handwrytten (handwritten card fulfillment, US)",
            "Google Workspace (transactional email, US)",
            "ZoomInfo (contact enrichment, US)",
          ]} />
          <P>
            We do not transfer data to vendors outside the United States. If you're an EU user,
            data is stored in the US under Standard Contractual Clauses.
          </P>
        </Section>

        <Section title="Retention">
          <P>
            We retain your data while your account is active. When you cancel, your account
            data sits dormant for 30 days (in case you change your mind), then is permanently
            deleted. Application logs are retained for 30 days. Payment records are retained
            for 7 years per US tax law.
          </P>
        </Section>

        <Section title="Security">
          <P>
            All data is encrypted in transit (TLS 1.3) and at rest (AES-256). OAuth tokens are
            stored encrypted with row-level security. We do not store your Google or Microsoft
            password — authentication happens via OAuth. Access to production systems is
            restricted to the founder.
          </P>
          <P>
            If we ever experience a data breach affecting your account, we'll notify you within
            72 hours.
          </P>
        </Section>

        <Section title="Chrome Extension">
          <P>
            The Humble Hello Chrome Extension is a separate product feature from the core web
            application but operates under the same overall privacy practices described above.
            This section describes how it specifically accesses, processes, and transmits data
            on LinkedIn.
          </P>

          <SubH>What the Extension does</SubH>
          <P>
            The Extension allows authenticated Humble Hello users to:
          </P>
          <Bullets items={[
            "View AI-generated communication insights for the LinkedIn profile they are currently viewing",
            "Save or update that profile as a contact in their Humble Hello account",
            "Optionally capture publicly visible Contact info (email, phone, birthday, address, websites) into their own Humble Hello contact records when the user opens LinkedIn's Contact info modal themselves",
          ]} />
          <P>
            The Extension only operates on linkedin.com pages and only when explicitly invoked
            by the user.
          </P>

          <SubH>What data the Extension reads</SubH>
          <P>
            When you click the Humble Hello icon while viewing a LinkedIn profile, the Extension
            reads publicly visible information from that profile page, including:
          </P>
          <Bullets items={[
            "Name, headline, location, and profile photo",
            "Current and past work experience (titles, companies, dates, descriptions)",
            "Education history (schools, degrees, dates, activities and societies)",
            "Skills, languages, certifications, awards, volunteer work",
            "Public posts and activity snippets",
            "Connection count and recommendation count",
          ]} />
          <P>
            Additionally, when you open LinkedIn's Contact info modal yourself, the Extension may
            read email address, phone number, birthday (month and day), address, personal websites,
            and linked social handles — but only if displayed by LinkedIn. The Extension never
            clicks the Contact info link on your behalf. It only reads what you have already opened.
          </P>

          <SubH>What the Extension does NOT read</SubH>
          <Bullets items={[
            "Your LinkedIn private messages or InMail",
            "LinkedIn pages you are not actively viewing",
            "Other browser tabs, your browsing history, or pages outside linkedin.com",
            "LinkedIn data behind paywalls, hidden settings, or unauthorized areas",
            "Any LinkedIn user's data without your explicit action (clicking the extension icon or saving a contact)",
          ]} />

          <SubH>Where Extension data is sent</SubH>
          <P>
            When you use the Extension, profile data may be transmitted to: Humble Hello's servers
            (humblehello.com) to run AI analysis, save contacts, and synchronize with your existing
            contacts; Anthropic's Claude API (api.anthropic.com) to generate communication insights —
            Anthropic processes the data on a per-request basis and does not retain it for model
            training; and the Google Contacts API (people.googleapis.com) if you have authorized
            Google Contacts sync, so contacts saved via the Extension are mirrored to your Google
            Contacts. The Extension does not transmit data to any other third parties. It contains
            no advertising trackers, analytics SDKs, or remote code execution.
          </P>

          <SubH>Authentication and revocation</SubH>
          <P>
            The Extension uses an API key generated when you first connect it to your Humble Hello
            account. This key is stored locally in your browser via Chrome's secure storage and is
            sent only to humblehello.com. You can revoke access at any time by disconnecting from
            the Extension's popup, removing the Extension from chrome://extensions, rotating your
            API key in your account, or closing your account.
          </P>

          <SubH>Compliance with LinkedIn</SubH>
          <P>
            The Extension is designed to operate within LinkedIn's User Agreement. It does not
            automate clicks, scrape data without user initiation, or bypass LinkedIn's access
            controls. All data captured is publicly displayed information you are already viewing
            through your own authenticated LinkedIn session.
          </P>

          <SubH>Your responsibility for contact data</SubH>
          <P>
            When you save a LinkedIn profile as a contact in Humble Hello, you are processing
            personal information about another individual. As described in our Terms of Service,
            you are responsible for ensuring you have an appropriate basis to do so under the laws
            applicable to you and your contacts. Humble Hello acts as a data processor for the
            contact data you save; you are the data controller for those records.
          </P>
        </Section>

        <Section title="Children">
          <P>
            Humble Hello is not intended for users under 18. We do not knowingly collect data
            from minors. If you believe a minor has signed up, contact us and we'll delete
            their account.
          </P>
        </Section>

        <Section title="Changes">
          <P>
            We'll update this policy as the product evolves. When we make material changes, we'll
            email you and update the version number at the top of this page. Your continued use
            after a material change constitutes acceptance.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions, requests, complaints, or feedback:{" "}
            <a href="mailto:tom@humblehello.com" style={emailLink}>tom@humblehello.com</a>
          </P>
          <P>
            Humble Hello, LLC<br />
            Indianapolis, IN, USA
          </P>
        </Section>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: "60px 28px 40px", borderTop: `1px solid ${M.rule}`, background: M.paper }}>
      <div style={{ maxWidth: 1180, margin: "0 auto",
        display: "flex", flexWrap: "wrap" as const, justifyContent: "space-between",
        alignItems: "center", gap: 16, fontSize: 12, color: M.ink4, fontFamily: BODY,
      }}>
        <div>© {new Date().getFullYear()} Humble Hello · Made in Indianapolis</div>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/privacy" style={{ color: M.ink3, textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: M.ink3, textDecoration: "none" }}>Terms</Link>
          <a href="mailto:tom@humblehello.com" style={{ color: M.ink3, textDecoration: "none" }}>Contact</a>
        </div>
      </div>
    </footer>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 56 }}>
      <h2 style={{
        fontFamily: HEAD, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em",
        color: M.ink, margin: "0 0 18px", lineHeight: 1.2,
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SubH({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontFamily: BODY, fontSize: 15, fontWeight: 700,
      color: M.ink, marginTop: 24, marginBottom: 8,
    }}>
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: BODY, fontSize: 16, lineHeight: 1.7,
      color: M.ink2, marginTop: 0, marginBottom: 16,
    }}>
      {children}
    </p>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ marginTop: 0, marginBottom: 16, paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          fontFamily: BODY, fontSize: 16, lineHeight: 1.7,
          color: M.ink2, marginBottom: 8,
        }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

const emailLink: React.CSSProperties = {
  color: M.fire,
  textDecoration: "none",
  borderBottom: `1px solid ${M.fireSoft}`,
};

const globalCss = `
  body { margin: 0; }
  a:hover { opacity: 0.85; }
`;