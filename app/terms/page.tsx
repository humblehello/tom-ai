import Link from "next/link";
import { FeaturesDropdown } from "../components/FeaturesDropdown";
import { AuthModalProvider, AuthTrigger } from "../components/AuthModal";

export const metadata = {
  title: "Terms · Humble Hello",
  description:
    "Terms of service for Humble Hello. Plain English. Fair to both sides.",
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

export default function TermsPage() {
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
          Terms of Service
        </div>
        <h1 style={{
          fontFamily: HEAD, fontSize: "clamp(36px, 5.4vw, 56px)",
          lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.02em",
          color: M.ink, margin: 0,
        }}>
          The deal,{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>fairly stated.</span>
        </h1>
        <p style={{
          fontFamily: BODY, fontSize: 17, lineHeight: 1.65,
          color: M.ink2, marginTop: 24,
        }}>
          These are the terms under which you use Humble Hello. We've kept them as short and
          readable as we can while still covering what we need to. If anything is unclear,
          email us — we'd rather explain it than have you guess.
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

        <Section title="1. Agreement">
          <P>
            These Terms of Service ("Terms") are a legally binding agreement between you
            and Humble Hello, LLC ("Humble Hello," "we," "us"), governing your access to
            and use of humblehello.com, the Humble Hello web application, the Humble Hello
            Chrome Extension, our APIs, and any related services (together, the "Service").
          </P>
          <P>
            By creating an account, signing in, or otherwise using the Service, you agree
            to these Terms and to our{" "}
            <Link href="/privacy" style={emailLink}>Privacy Policy</Link>.
            If you don't agree, don't use the Service.
          </P>
        </Section>

        <Section title="2. Eligibility and your account">
          <P>
            You must be at least 18 years old to use Humble Hello. By creating an account,
            you confirm you are.
          </P>
          <P>
            You're responsible for the security of your account, including keeping your
            login credentials and any API keys confidential. If you believe your account
            has been compromised, contact us immediately at{" "}
            <a href="mailto:tom@humblehello.com" style={emailLink}>tom@humblehello.com</a>.
          </P>
          <P>
            You may use Humble Hello as an individual or on behalf of an organization. If
            you're using it for an organization, you confirm you have authority to bind
            that organization to these Terms.
          </P>
        </Section>

        <Section title="3. Your content and your contacts">
          <P>
            You retain ownership of all content you provide to or generate through
            Humble Hello, including your contacts, journal entries, drafts, notes, and
            any data we sync from your connected accounts ("Your Content").
          </P>
          <P>
            You grant us a limited license to host, store, process, transmit, and display
            Your Content solely to provide the Service to you. We don't use Your Content
            for any other purpose.
          </P>
          <SubH>You are the data controller for your contacts</SubH>
          <P>
            When you import contacts, sync from Google or Microsoft, save someone via the
            Chrome Extension, or otherwise add a contact to Humble Hello, you are
            processing personal information about another individual. <strong>You are the
            data controller for that information; Humble Hello is the data processor.</strong>{" "}
            This means you are responsible for ensuring you have a lawful basis under
            applicable laws (GDPR, CCPA, CAN-SPAM, and others) to collect, store, and
            communicate with that contact. We provide the tools; you decide how to use
            them.
          </P>
        </Section>

        <Section title="4. Acceptable use">
          <P>
            Humble Hello is built for genuine relationship-building, not bulk prospecting,
            cold outreach to harvested lists, or anything that would feel spammy to the
            recipient. When you signed up, you committed to authentic outreach only — we
            take that seriously.
          </P>
          <P>
            You agree not to use the Service to:
          </P>
          <Bullets items={[
            "Send messages to people who haven't given you a reasonable basis to contact them",
            "Send unsolicited commercial email in violation of CAN-SPAM, GDPR, or similar laws",
            "Mass-import purchased or scraped contact lists",
            "Impersonate another person or misrepresent your identity",
            "Reverse-engineer, decompile, or attempt to extract the source code of the Service",
            "Bypass authentication, rate limits, or other technical controls",
            "Scrape or extract data from the Service in bulk, except for your own data via official export tools",
            "Resell, sublicense, or repackage the Service or any data within it",
            "Use the Service for any unlawful purpose or to facilitate unlawful activity",
            "Interfere with the Service's operation, including by introducing malware or attempting denial-of-service",
            "Use the Chrome Extension to automate clicks, scrape LinkedIn data without user initiation, or bypass LinkedIn's access controls",
          ]} />
          <P>
            We reserve the right to suspend or terminate accounts that violate these
            rules. Repeated violations or use of the Service for fraudulent or illegal
            purposes will result in immediate termination without refund.
          </P>
        </Section>

        <Section title="5. Plans, billing, and cancellation">
          <SubH>Free, Pro, and Growth tiers</SubH>
          <P>
            Humble Hello offers a Free tier with usage limits, and paid tiers (Pro and
            Growth) with expanded features and limits. Current pricing is listed at{" "}
            <Link href="/plans" style={emailLink}>humblehello.com/plans</Link> and may
            change with notice.
          </P>

          <SubH>Subscriptions</SubH>
          <P>
            Paid subscriptions renew automatically — monthly or annually — until you cancel.
            Charges are made by Stripe to the payment method on file. You can cancel any
            time from Settings; your subscription remains active through the end of the
            paid period, after which it will not renew.
          </P>
          <P>
            We don't offer refunds for partial periods. If you cancel mid-month, you keep
            access until your billing period ends.
          </P>

          <SubH>Cards and gifts</SubH>
          <P>
            Handwritten cards and gifts sent through Humble Hello are billed at cost,
            separately from your subscription. Card costs (currently $4.75 per card via
            Handwrytten) and gift costs are charged to your payment method when sent.
            Card and gift spend is yours, not ours — we don't mark it up.
          </P>

          <SubH>Trials</SubH>
          <P>
            Free trials of paid tiers are available. At the end of a trial, your account
            converts to the Free tier unless you've added payment and selected a paid
            plan. We won't bill you without your explicit selection.
          </P>

          <SubH>Failed payments</SubH>
          <P>
            If a payment fails, we'll attempt to retry and notify you. After repeated
            failures, your account will be downgraded to the Free tier. Your data is
            preserved; you don't lose anything.
          </P>
        </Section>

        <Section title="6. The Service we provide">
          <P>
            We do our best to keep Humble Hello running well, but we don't guarantee it'll
            be perfect or uninterrupted. The Service is provided "as is" and "as available."
            We may add, change, or remove features at any time. When we make material
            changes, we'll let you know.
          </P>
          <P>
            We rely on third-party services to operate Humble Hello (Google, Microsoft,
            Stripe, Anthropic, Handwrytten, Supabase, Vercel, and others). If those
            services fail or change their terms in ways that affect us, we may need to
            change or limit features accordingly.
          </P>
          <P>
            We may suspend or terminate the Service at our discretion, including for
            scheduled maintenance, abuse investigations, or in response to legal demands.
            We'll give you reasonable notice when practical.
          </P>
        </Section>

        <Section title="7. Termination and data after termination">
          <P>
            You can cancel your account at any time from Settings. We may terminate your
            account if you violate these Terms, fail to pay, or engage in fraudulent or
            illegal activity.
          </P>
          <P>
            After termination:
          </P>
          <Bullets items={[
            "Your account data sits dormant for 30 days, in case you change your mind",
            "After 30 days, all data is permanently deleted from our active systems",
            "Backups containing your data are aged out within 90 days",
            "Payment records are retained for 7 years per US tax law",
            "If you opted into the Humble Hello Network, contact data you contributed remains in the network unless you specifically request its removal",
          ]} />
          <P>
            You can export all of your data via Settings before canceling, or by emailing{" "}
            <a href="mailto:tom@humblehello.com" style={emailLink}>tom@humblehello.com</a>.
          </P>
        </Section>

        <Section title="8. Intellectual property">
          <P>
            Humble Hello, including the application, the Chrome Extension, our name, our
            logo, our content, and the underlying technology, is owned by Humble Hello,
            LLC and protected by copyright, trademark, and other laws. We grant you a
            limited, non-exclusive, non-transferable license to use the Service in
            accordance with these Terms.
          </P>
          <P>
            You may not copy, modify, distribute, sell, lease, or create derivative works
            from the Service or our content, except as expressly permitted.
          </P>
          <P>
            Feedback is welcome and appreciated. If you give us feedback or suggestions,
            you grant us the right to use them without restriction.
          </P>
        </Section>

        <Section title="9. Third-party services">
          <P>
            Humble Hello connects to and integrates with third-party services like Google
            Workspace, Microsoft 365, Stripe, LinkedIn, and others. Your use of those
            services is governed by their own terms, not ours. We're not responsible for
            their availability, accuracy, or actions.
          </P>
          <P>
            If a third-party service revokes our access (for example, if you disconnect
            your Google account), related Humble Hello features may stop working. We'll
            do our best to handle this gracefully.
          </P>
        </Section>

        <Section title="10. Disclaimers">
          <P>
            <strong>The Service is provided "as is" without warranties of any kind, express
            or implied.</strong> We don't guarantee that the Service will be error-free,
            uninterrupted, secure, or that it will meet your specific requirements.
          </P>
          <P>
            We don't guarantee the accuracy of contact data, AI-generated drafts,
            relationship scores, life-event detections, or any other output of the Service.
            You're responsible for reviewing what we surface and using your judgment before
            acting on it.
          </P>
          <P>
            Cards, gifts, and other physical items are fulfilled by third parties. We
            don't guarantee delivery times, content, or quality beyond what those vendors
            warrant.
          </P>
        </Section>

        <Section title="11. Limitation of liability">
          <P>
            <strong>To the maximum extent permitted by law, Humble Hello and its founder will
            not be liable for any indirect, incidental, consequential, special, exemplary,
            or punitive damages</strong> — including lost profits, lost data, or loss of
            business — arising out of or relating to your use of the Service, even if we've
            been advised of the possibility of such damages.
          </P>
          <P>
            <strong>Our total liability for any claim arising under these Terms is limited
            to the greater of $100 or the amount you paid us in the 12 months before the
            claim arose.</strong>
          </P>
          <P>
            Some jurisdictions don't allow these limitations. If you're in one, our
            liability is limited to the maximum extent permitted by law.
          </P>
        </Section>

        <Section title="12. Indemnification">
          <P>
            You agree to indemnify and hold Humble Hello, LLC and its founder harmless
            from any claims, losses, liabilities, damages, and expenses (including
            reasonable legal fees) arising out of:
          </P>
          <Bullets items={[
            "Your use of the Service",
            "Your violation of these Terms",
            "Your violation of any law or regulation, including data-protection laws",
            "Your violation of any third party's rights, including privacy or intellectual property rights",
            "Your processing of personal information about your contacts",
            "Any content you submit, send, or share through the Service",
          ]} />
        </Section>

        <Section title="13. Governing law and disputes">
          <P>
            These Terms are governed by the laws of the State of Indiana, without regard
            to its conflict-of-law principles. Any dispute arising out of or relating to
            these Terms or the Service must be brought in the state or federal courts
            located in Marion County, Indiana, and you consent to the personal
            jurisdiction of those courts.
          </P>
          <P>
            Before filing a lawsuit, please contact us at{" "}
            <a href="mailto:tom@humblehello.com" style={emailLink}>tom@humblehello.com</a>{" "}
            to try to resolve the issue. We genuinely prefer talking it out.
          </P>
        </Section>

        <Section title="14. Changes to these Terms">
          <P>
            We may update these Terms as the Service evolves. When we make material
            changes, we'll email you and update the version number at the top of this
            page. Your continued use after a material change constitutes acceptance of
            the updated Terms.
          </P>
          <P>
            If you don't agree with a change, your remedy is to stop using the Service
            and cancel your account.
          </P>
        </Section>

        <Section title="15. Miscellaneous">
          <P>
            <strong>Entire agreement.</strong> These Terms, together with our Privacy
            Policy, are the entire agreement between you and us regarding the Service.
          </P>
          <P>
            <strong>Severability.</strong> If any provision is found to be unenforceable,
            the rest of the Terms remain in effect.
          </P>
          <P>
            <strong>Waiver.</strong> Our failure to enforce a provision isn't a waiver of
            our right to enforce it later.
          </P>
          <P>
            <strong>Assignment.</strong> You may not assign these Terms without our written
            consent. We may assign them in connection with a merger, acquisition, or sale
            of assets.
          </P>
          <P>
            <strong>No agency.</strong> We're independent contractors. Nothing here creates
            a partnership, joint venture, employment, or agency relationship between us.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions about these Terms?{" "}
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