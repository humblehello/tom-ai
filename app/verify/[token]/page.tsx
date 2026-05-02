"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { C, font } from "@/app/lib/theme";

type VerificationData = {
  contact_name: string;
  contact_email: string;
  sender_name: string;
  current_info: any;
};

export default function VerifyPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showOptOutConfirm, setShowOptOutConfirm] = useState(false);
  const [optedOut, setOptedOut] = useState(false);

  // Basic
  const [phone, setPhone] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  // Addresses
  const [homeStreet, setHomeStreet] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeState, setHomeState] = useState("");
  const [homeZip, setHomeZip] = useState("");
  const [workStreet, setWorkStreet] = useState("");
  const [workCity, setWorkCity] = useState("");
  const [workState, setWorkState] = useState("");
  const [workZip, setWorkZip] = useState("");

  // Social
  const [linkedin, setLinkedin] = useState("");
  const [twitter, setTwitter] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");

  // Interests
  const [topicsInput, setTopicsInput] = useState("");
  const [topics, setTopics] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/contacts/verify/${token}`);
        const json = await res.json();
        if (json.error) { setError(json.error); setLoading(false); return; }
        setData(json);
        const info = json.current_info;
        setPhone(info.phone || "");
        setPersonalEmail(info.personal_email || "");
        setWorkPhone(info.work_phone || "");
        setBirthday(info.birthday || "");
        setTitle(info.job_title || "");
        setCompany(info.company || "");
        setWorkEmail(info.work_email || "");
        setHomeStreet(info.home_address?.streetAddress || "");
        setHomeCity(info.home_address?.city || "");
        setHomeState(info.home_address?.region || "");
        setHomeZip(info.home_address?.postalCode || "");
        setWorkStreet(info.work_address?.streetAddress || "");
        setWorkCity(info.work_address?.city || "");
        setWorkState(info.work_address?.region || "");
        setWorkZip(info.work_address?.postalCode || "");
        setLinkedin(info.linkedin_url || "");
        setTwitter(info.twitter_url || "");
        setInstagram(info.instagram_url || "");
        setFacebook(info.facebook_url || "");
        setTopics(info.topics || []);
        setLoading(false);

        if (window.location.search.includes("optout=1")) {
          setShowOptOutConfirm(true);
        }
        if (window.location.search.includes("confirm=true")) {
          setSubmitting(true);
          fetch(`/api/contacts/verify/${token}/output`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmed_correct: true }),
          }).then(() => setSubmitted(true)).finally(() => setSubmitting(false));
        }
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/verify/${token}/output`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_address: homeStreet ? { streetAddress: homeStreet, city: homeCity, region: homeState, postalCode: homeZip, country: "US" } : null,
          work_address: workStreet ? { streetAddress: workStreet, city: workCity, region: workState, postalCode: workZip, country: "US" } : null,
          phone, personal_email: personalEmail, work_email: workEmail, work_phone: workPhone,
          birthday, job_title: title, company,
          linkedin_url: linkedin, twitter_url: twitter,
          instagram_url: instagram, facebook_url: facebook,
          topics,
        }),
      });
      const json = await res.json();
      if (json.success) setSubmitted(true);
    } catch {
      alert("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  const handleOptOut = async () => {
    try {
      await fetch(`/api/contacts/verify/${token}/output`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opt_out: true }),
      });
    } catch {}
    setOptedOut(true);
  };

  const addTopic = () => {
    const parts = topicsInput.split(",").map(t => t.trim()).filter(t => t && !topics.includes(t));
    if (parts.length) {
      setTopics([...topics, ...parts]);
      setTopicsInput("");
    }
  };

  const iStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: `1px solid ${C.border2}`, background: C.bg3,
    color: C.text, fontSize: 13, fontFamily: font,
    outline: "none", boxSizing: "border-box",
  };

  const lStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.text3,
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
    marginBottom: 8, display: "block",
  };

  const cardStyle: React.CSSProperties = {
    background: C.bg2, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "20px", marginBottom: 10,
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.text3,
    textTransform: "uppercase" as const, letterSpacing: "0.1em",
    marginBottom: 10, marginTop: 20, display: "block",
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ color: C.text3, fontSize: 14 }}>Loading...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ textAlign: "center" }}><p style={{ fontSize: 14, color: C.text3 }}>{error}</p></div>
    </div>
  );

if (optedOut) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
        <img src="/logo.png" alt="humble hello." style={{ height: 28, marginBottom: 24 }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Got it — you're all set</div>
        <p style={{ fontSize: 14, color: C.text3 }}>Your request has been processed. Sorry to bother you!</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Thank you, {data?.contact_name?.split(" ")[0]}!
        </div>
        <p style={{ fontSize: 14, color: C.text3, marginBottom: 32 }}>Your info has been updated.</p>
        <div style={{ height: 1, background: C.border, marginBottom: 32 }} />
        <p style={{ fontSize: 13, color: C.text3, marginBottom: 16 }}>
          Want to stay better connected with the people in your life?
        </p>
        <a href="https://humblehello.com" style={{ textDecoration: "none", display: "inline-block" }}>
          <img src="/logo.png" alt="humble hello." style={{ height: 32, display: "block", margin: "0 auto 10px" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#bf5c38", display: "block" }}>Join for free</span>
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, padding: "40px 20px" }}>
      <div style={{ maxWidth: 540, margin: "0 auto" }}>

        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: "center" as const }}>
          <a href="https://humblehello.com">
            <img src="/logo.png" alt="humble hello." style={{ height: 40 }} />
          </a>
        </div>

        {/* Intro */}
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px", marginBottom: 16 }}>
          <p style={{ fontSize: 15, color: C.text, margin: "0 0 6px 0", fontWeight: 600 }}>
            Hi {data?.contact_name?.split(" ")[0]},
          </p>
          <p style={{ fontSize: 15, color: C.text2, lineHeight: 1.7, margin: 0 }}>
            Thank you for helping me keep your info up to date.
          </p>
        </div>

        {/* BASIC INFO */}
        <span style={sectionTitle}>Basic Info</span>
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lStyle}>Mobile Number</label>
              <input style={iStyle} placeholder="(317) 555-0123" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <label style={lStyle}>Work Phone</label>
              <input style={iStyle} placeholder="(317) 555-0124" value={workPhone} onChange={e => setWorkPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lStyle}>Personal Email</label>
              <input style={iStyle} placeholder="personal@gmail.com" value={personalEmail} onChange={e => setPersonalEmail(e.target.value)} />
            </div>
            <div>
              <label style={lStyle}>Work Email</label>
              <input style={iStyle} placeholder="work@company.com" value={workEmail} onChange={e => setWorkEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={lStyle}>Birthday</label>
            <input style={iStyle} placeholder="MM/DD or MM/DD/YYYY" value={birthday} onChange={e => setBirthday(e.target.value)} />
          </div>
        </div>

        {/* PROFESSIONAL */}
        <span style={sectionTitle}>Professional</span>
        <div style={cardStyle}>
          <div style={{ marginBottom: 10 }}>
            <label style={lStyle}>Job Title</label>
            <input style={iStyle} placeholder="CEO" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label style={lStyle}>Company</label>
            <input style={iStyle} placeholder="Acme Inc." value={company} onChange={e => setCompany(e.target.value)} />
          </div>
        </div>

        {/* HOME ADDRESS */}
        <span style={sectionTitle}>Home Address</span>
        <div style={cardStyle}>
          <input style={{ ...iStyle, marginBottom: 8 }} placeholder="Street address" value={homeStreet} onChange={e => setHomeStreet(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <input style={iStyle} placeholder="City" value={homeCity} onChange={e => setHomeCity(e.target.value)} />
            <input style={iStyle} placeholder="State" value={homeState} onChange={e => setHomeState(e.target.value)} />
            <input style={iStyle} placeholder="ZIP" value={homeZip} onChange={e => setHomeZip(e.target.value)} />
          </div>
        </div>

        {/* WORK ADDRESS */}
        <span style={sectionTitle}>Work Address</span>
        <div style={cardStyle}>
          <input style={{ ...iStyle, marginBottom: 8 }} placeholder="Street address" value={workStreet} onChange={e => setWorkStreet(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <input style={iStyle} placeholder="City" value={workCity} onChange={e => setWorkCity(e.target.value)} />
            <input style={iStyle} placeholder="State" value={workState} onChange={e => setWorkState(e.target.value)} />
            <input style={iStyle} placeholder="ZIP" value={workZip} onChange={e => setWorkZip(e.target.value)} />
          </div>
        </div>

        {/* SOCIAL */}
        <span style={sectionTitle}>Social</span>
        <div style={cardStyle}>
          <div style={{ marginBottom: 10 }}>
            <label style={lStyle}>LinkedIn</label>
            <input style={iStyle} placeholder="https://linkedin.com/in/username" value={linkedin} onChange={e => setLinkedin(e.target.value)} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lStyle}>Twitter / X</label>
            <input style={iStyle} placeholder="https://twitter.com/username" value={twitter} onChange={e => setTwitter(e.target.value)} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lStyle}>Instagram</label>
            <input style={iStyle} placeholder="https://instagram.com/username" value={instagram} onChange={e => setInstagram(e.target.value)} />
          </div>
          <div>
            <label style={lStyle}>Facebook</label>
            <input style={iStyle} placeholder="https://facebook.com/username" value={facebook} onChange={e => setFacebook(e.target.value)} />
          </div>
        </div>

        {/* INTERESTS */}
        <span style={sectionTitle}>Interests & Topics</span>
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: C.text3, margin: "0 0 12px 0", lineHeight: 1.6 }}>
            What do you enjoy talking about or care about? This helps keep conversations meaningful.
          </p>
          {topics.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 10 }}>
              {topics.map((t, i) => (
                <span key={i} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: C.bg3, color: C.text2, display: "flex", alignItems: "center", gap: 6 }}>
                  {t}
                  <button onClick={() => setTopics(topics.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: C.text4, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>x</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...iStyle, flex: 1 }} placeholder="e.g. golf, startups, travel, cooking..." value={topicsInput}
              onChange={e => setTopicsInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } }} />
            <button onClick={addTopic}
              style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, flexShrink: 0 }}>
              Add
            </button>
          </div>
        </div>

                {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: "100%", padding: "13px", borderRadius: 8, background: submitting ? C.greenLight : C.green, color: submitting ? C.green : "#fff", border: "none", fontSize: 15, fontWeight: 600, cursor: submitting ? "default" : "pointer", fontFamily: font, marginBottom: 10 }}>
          {submitting ? "Saving..." : "Update My Info"}
        </button>

        {/* Looks correct */}
        <button onClick={async () => {
          setSubmitting(true);
          await fetch(`/api/contacts/verify/${token}/output`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmed_correct: true }),
          });
          setSubmitted(true);
          setSubmitting(false);
        }} style={{ width: "100%", padding: "11px", borderRadius: 8, background: "transparent", color: C.text3, border: `1px solid ${C.border2}`, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font, marginBottom: 24 }}>
          Everything looks correct
        </button>

        {/* Opt out — multi option */}
        <div style={{ paddingBottom: 32 }}>
          {!showOptOutConfirm ? (
            <div style={{ textAlign: "center" as const }}>
              <button onClick={() => setShowOptOutConfirm(true)}
                style={{ background: "none", border: "none", color: C.text4, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: font }}>
                Remove me from this list
              </button>
            </div>
          ) : (
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 6px 0" }}>What would you like to do?</p>
              <p style={{ fontSize: 12, color: C.text3, margin: "0 0 16px 0" }}>Choose the option that best fits your situation.</p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>

                {/* Option 1 — Keep info, stop emails */}
                <button onClick={async () => {
                  await fetch(`/api/contacts/verify/${token}/output`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ opt_out: true, opt_out_type: "stop_emails" }),
                  });
                  setOptedOut(true);
                }} style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, cursor: "pointer", fontFamily: font, textAlign: "left" as const, lineHeight: 1.5 }}>
                  Keep my info but stop sending me these requests
                </button>

                {/* Option 2 — Delete everything */}
                <button onClick={async () => {
                  await fetch(`/api/contacts/verify/${token}/output`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ opt_out: true, opt_out_type: "delete_all" }),
                  });
                  setOptedOut(true);
                }} style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 13, cursor: "pointer", fontFamily: font, textAlign: "left" as const, lineHeight: 1.5 }}>
                  I don't know {data?.sender_name || "this person"} — please delete my info completely
                </button>

                {/* Option 3 — Learn more */}
                <button onClick={() => { window.location.href = "https://humblehello.com"; }}
                  style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 13, cursor: "pointer", fontFamily: font, textAlign: "left" as const, lineHeight: 1.5 }}>
                  Tell me more about keeping my contacts up to date and increasing engagement
                </button>

                {/* Option 4 — Just kidding */}
                <button onClick={() => setShowOptOutConfirm(false)}
                  style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.green}`, background: C.greenLight, color: C.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, textAlign: "left" as const, lineHeight: 1.5 }}>
                  Just kidding, take me back!
                </button>

              </div>
            </div>
          )}
        </div>
     {/* Footer */}
        <div style={{ textAlign: "center" as const, paddingBottom: 16, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
          <a href="https://humblehello.com" style={{ textDecoration: "none", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6 }}>
            <img src="/logo.png" alt="humble hello." style={{ height: 36 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#bf5c38", fontFamily: font }}>Join for free</span>
          </a>
        </div>

        {/* Disclaimer */}
        <p style={{ fontSize: 11, color: C.text4, textAlign: "center" as const, margin: "0 0 40px 0", lineHeight: 1.6 }}>
          Your information is shared with the person who sent this request to help them stay in touch with you.
          By submitting, you agree to our <a href="https://humblehello.com/privacy" style={{ color: C.text3 }}>Privacy Policy</a>.
        </p>
       
             </div>
    </div>
  );
}