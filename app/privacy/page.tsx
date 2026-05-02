export default function PrivacyPage() {
  const font = "'DM Sans', 'Inter', Arial, sans-serif";

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", fontFamily: font, margin: "0 0 12px 0", borderBottom: "2px solid #bf5c38", paddingBottom: 8, display: "inline-block" }}>{title}</h2>
      <div style={{ fontSize: 15, color: "#444444", lineHeight: 1.8, fontFamily: font }}>{children}</div>
    </div>
  );

  const bullet = (text: string) => (
    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
      <span style={{ color: "#bf5c38", fontWeight: 700, flexShrink: 0 }}>—</span>
      <span>{text}</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0eb", fontFamily: font }}>

      {/* Header */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e8e0d8", padding: "20px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="https://humblehello.com" style={{ textDecoration: "none" }}>
            <img src="/logo.png" alt="humble hello." style={{ height: 28 }} />
          </a>
          <a href="https://humblehello.com" style={{ fontSize: 13, color: "#bf5c38", textDecoration: "none", fontWeight: 600 }}>
            Back to Humble Hello
          </a>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px" }}>

        {/* Title */}
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: "#bf5c38", fontFamily: font, margin: "0 0 8px 0" }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 13, color: "#888888", fontFamily: font, margin: 0 }}>Last Updated: April 18, 2026</p>
        </div>

        {/* Intro */}
        <div style={{ background: "#ffffff", border: "1px solid #e8e0d8", borderRadius: 12, padding: "24px 28px", marginBottom: 40, fontSize: 15, color: "#444444", lineHeight: 1.8 }}>
          Humble Hello ("Humble Hello," "we," or "us") is a personal relationship management platform that helps individuals stay meaningfully connected with the people in their lives. This Privacy Policy explains how we collect, use, and protect personal information in connection with our services at humblehello.com.
          <br /><br />
          Our use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: "#bf5c38" }}>Google API Services User Data Policy</a>, including the Limited Use requirements.
        </div>

        {section("1. Information We Collect", <>
          <p style={{ margin: "0 0 12px 0", fontWeight: 600, color: "#1a1a1a" }}>Information you provide directly:</p>
          {bullet("Account information: name, email address, and profile details when you sign up.")}
          {bullet("Contact data: information about the people in your network, including names, email addresses, phone numbers, physical addresses, birthdays, job titles, and other details you or your contacts provide.")}
          {bullet("Card profile: your mailing address, handwriting preferences, and card sending preferences.")}
          {bullet("Journal entries and notes about your relationships and interactions.")}
          <p style={{ margin: "16px 0 12px 0", fontWeight: 600, color: "#1a1a1a" }}>Information from connected services (with your permission):</p>
          {bullet("Gmail: email metadata and content to identify and enrich contacts, track communication history, and surface relationship insights.")}
          {bullet("Google Calendar: calendar event data to identify shared interactions and relationship signals.")}
          {bullet("Google Contacts: your existing contact list to build and sync your Humble Hello network.")}
          <p style={{ margin: "16px 0 12px 0", fontWeight: 600, color: "#1a1a1a" }}>Information provided by your contacts:</p>
          <p style={{ margin: 0 }}>When you send a verification request to a contact, they may voluntarily provide updated information including their address, phone number, birthday, job title, social media profiles, and personal interests. This is stored in your account only.</p>
        </>)}

        {section("2. How We Use Your Information", <>
          <p style={{ margin: "0 0 12px 0" }}>We use the information we collect to:</p>
          {bullet("Provide and improve the Humble Hello platform and its features.")}
          {bullet("Help you stay connected with the people in your network through timely reminders, relationship insights, and automated outreach.")}
          {bullet("Enrich and update contact records with accurate, current information.")}
          {bullet("Send handwritten cards, gifts, and personalized messages on your behalf.")}
          {bullet("Send you product updates, tips, and relevant communications about your account.")}
          {bullet("Ensure platform security and prevent fraud or abuse.")}
        </>)}

        {section("3. Contact Verification & Third-Party Data", <>
          <p style={{ margin: "0 0 12px 0" }}>Humble Hello allows users to send verification requests to their contacts to confirm or update personal information. When a contact receives a verification request and submits their information:</p>
          {bullet("Their information is shared only with the Humble Hello user who sent the request — not with other users or third parties.")}
          {bullet("Contacts may opt out of future requests at any time using the \"Remove me from this list\" link in any verification email.")}
          {bullet("Contacts may request deletion of their information by emailing privacy@humblehello.com.")}
          <p style={{ margin: "16px 0 0 0" }}>Humble Hello users are responsible for ensuring they have a legitimate relationship with the contacts they reach out to and must comply with all applicable laws, including CAN-SPAM and GDPR where applicable.</p>
        </>)}

        {section("4. Data Sharing", <>
          <p style={{ margin: "0 0 12px 0" }}>We do not sell your personal information or your contacts' personal information. We may share information with:</p>
          {bullet("Service providers: Supabase (database), Vercel (hosting), Handwrytten (card sending), Stripe (payments), and Inngest (automation). These providers are contractually required to protect your data.")}
          {bullet("Legal requirements: when required by law, court order, or to protect the rights and safety of our users or the public.")}
          {bullet("Business transfers: in connection with a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction.")}
        </>)}

        {section("5. Google API Data", <>
          <p style={{ margin: 0 }}>Humble Hello's use of data received from Google APIs is limited to providing and improving the features you authorize. We do not use Google user data to serve advertising, and we do not share Google user data with third parties except as necessary to operate the service. Our use complies with Google's Limited Use Policy.</p>
        </>)}

        {section("6. Data Retention", <>
          <p style={{ margin: 0 }}>We retain your account data for as long as your account is active. You may delete your account at any time by contacting us at privacy@humblehello.com. Contact records associated with your account will be deleted within 30 days of your account deletion request.</p>
        </>)}

        {section("7. Security", <>
          <p style={{ margin: 0 }}>We take reasonable technical and organizational measures to protect your information, including encrypted data transmission (TLS), access controls, and secure cloud infrastructure. However, no system is 100% secure. Contact us immediately if you suspect unauthorized access to your account.</p>
        </>)}

        {section("8. Your Rights", <>
          <p style={{ margin: "0 0 12px 0" }}>Depending on where you live, you may have the right to:</p>
          {bullet("Access the personal information we hold about you.")}
          {bullet("Correct inaccurate information.")}
          {bullet("Request deletion of your information.")}
          {bullet("Opt out of certain processing activities.")}
          <p style={{ margin: "12px 0 0 0" }}>To exercise any of these rights, email us at <a href="mailto:privacy@humblehello.com" style={{ color: "#bf5c38" }}>privacy@humblehello.com</a>. We will respond within 30 days.</p>
        </>)}

        {section("9. Children", <>
          <p style={{ margin: 0 }}>Humble Hello is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors.</p>
        </>)}

        {section("10. Changes to This Policy", <>
          <p style={{ margin: 0 }}>We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice on our platform. Your continued use of Humble Hello after any changes constitutes acceptance of the updated policy.</p>
        </>)}

        {section("11. Contact Us", <>
          <div style={{ background: "#ffffff", border: "1px solid #e8e0d8", borderRadius: 10, padding: "20px 24px", display: "inline-block" }}>
            <div style={{ fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>Humble Hello</div>
            <div><a href="mailto:privacy@humblehello.com" style={{ color: "#bf5c38" }}>privacy@humblehello.com</a></div>
            <div><a href="https://humblehello.com" style={{ color: "#bf5c38" }}>humblehello.com</a></div>
          </div>
        </>)}

      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e8e0d8", background: "#ffffff", padding: "24px", textAlign: "center" }}>
        <a href="https://humblehello.com">
          <img src="/logo.png" alt="humble hello." style={{ height: 24, opacity: 0.6 }} />
        </a>
      </div>

    </div>
  );
}