"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Design system ────────────────────────────────────────────────────────────
const C = {
  bg: "#faf7f2", bg2: "#ffffff", bg3: "#f3ede3", bg4: "#ece3d6",
  border: "#e8ddd0", border2: "#ddd0bf",
  text: "#241a0f", text2: "#574030", text3: "#8a6e5a", text4: "#b09880",
  terra: "#bf5c38", terraLight: "#f2d5c8", terraDark: "#9a4429", terraMuted: "#e8c4b0",
  sage: "#6b9970", sageLight: "#d0e8d3", sageDark: "#3d6b42",
  gold: "#b8922a", goldLight: "#f0e0b0",
  navy: "#1c2b3a", navy2: "#253748",
  green: "#6b9970", greenLight: "#d0e8d3",
  blue: "#2a6496", blueLight: "#d0e0f0",
  red: "#c0392b", redLight: "#fde8e6",
  amber: "#b8922a", amberLight: "#f0e0b0",
  pink: "#a84468", pinkLight: "#f5d0e0",
  purple: "#6b5c9e", purpleLight: "#e5dff5",
};
const font = "'DM Sans', 'Helvetica Neue', sans-serif";
const fontSerif = "'Lora', Georgia, serif";

// ── Data ─────────────────────────────────────────────────────────────────────
const INTERESTS_1 = [
  { label: "Sports & Fitness", options: ["Football", "Basketball", "Golf", "Soccer", "Tennis", "Running", "Cycling", "Gym & Lifting", "Baseball", "Hockey", "Auto Racing", "Swimming", "Other"] },
  { label: "Food & Drink", options: ["Fine Dining", "Home Cooking", "Wine", "Craft Beer", "Coffee", "Foodie Travel", "BBQ", "Vegetarian/Vegan"] },
  { label: "Travel", options: ["Adventure Travel", "Luxury Travel", "Road Trips", "International", "Beach Getaways", "City Breaks", "Camping & Hiking"] },
];

const INTERESTS_2 = [
  { label: "Arts & Culture", options: ["Live Music", "Theater", "Museums", "Photography", "Film & Cinema", "Comedy Shows", "Art Collecting"] },
  { label: "Reading & Learning", options: ["Business Books", "Biographies", "Fiction", "Podcasts", "Online Courses", "History", "Science & Tech"] },
  { label: "Family & Community", options: ["Family First", "Youth Sports Coaching", "Volunteering", "Faith & Spirituality", "Neighborhood Community"] },
  { label: "Tech & Business", options: ["Startups & Entrepreneurship", "Investing", "AI & Technology", "Real Estate", "Marketing", "Leadership"] },
  { label: "Outdoors & Nature", options: ["Hiking", "Fishing", "Hunting", "Gardening", "National Parks", "Boating & Sailing"] },
];

const TIMEZONES = [
  "America/New_York", "America/Indiana/Indianapolis", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Phoenix",
  "America/Anchorage", "Pacific/Honolulu", "Europe/London",
  "Europe/Paris", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
];

const TIPS = [
  { label: "Did you know?", body: "People who reach out to 3 contacts per day see 4x more inbound opportunities within 90 days." },
  { label: "Building your profile", body: "Every interest you share helps Humble Hello find common ground with your contacts and craft messages that feel genuinely personal." },
  { label: "Harvard research", body: "The 85-year Grant Study found that the quality of your relationships is the single greatest predictor of life satisfaction and career success." },
  { label: "Your inner circle", body: "Most career opportunities come from your closest 15 relationships — not your broader network. Nurture the people closest to you first." },
  { label: "Consistency wins", body: "A quick check-in every few weeks beats a long catch-up once a year. Humble Hello makes consistency effortless." },
  { label: "Direct mail matters", body: "Contacts who receive a birthday card are 60% more likely to respond to future outreach within 30 days." },
  { label: "The journal advantage", body: "Users who journal 2x per week have 40% more meaningful interactions logged — and their AI drafts get dramatically better over time." },
  { label: "Handwritten cards work", body: "A handwritten card is remembered longer than an email. Humble Hello handles the writing, printing, and mailing automatically." },
  { label: "Already working", body: "Humble Hello is scanning your inbox and calendar right now — building your contact profiles and learning who matters most in your world." },
  { label: "Almost there", body: "Users who complete setup are 5x more likely to be actively engaged at 30 days. You're about to join them." },
  { label: "Relationships decay", body: "Without contact, relationship scores drop -2 points per week. Humble Hello makes sure no one important quietly slips away." },
  { label: "The power of timing", body: "Reaching out on a birthday, promotion, or life event is 3x more likely to deepen a relationship than a random check-in." },
];

const PROCESSING_LABELS = [
  "Saving your profile...", "Learning your interests...", "Mapping your network...",
  "Configuring your tiers...", "Personalizing your experience...", "Building your contact intelligence...",
  "Calibrating your cadence...", "Setting up your card profile...", "Reviewing your preferences...",
  "Locking in your settings...", "Almost ready...", "Finalizing your relationship OS...",
];

const PASTEL_CARDS = [
  { bg: "#fef3c7", border: "#fde68a", text: "#92400e", label: "#d97706" },
  { bg: C.blueLight, border: "#93c5fd", text: "#1e3a5f", label: C.blue },
  { bg: C.greenLight, border: "#86efac", text: "#14532d", label: C.sage },
  { bg: C.pinkLight, border: "#f9a8d4", text: "#831843", label: C.pink },
  { bg: C.purpleLight, border: "#c4b5fd", text: "#3b1f8c", label: C.purple },
  { bg: "#ffedd5", border: "#fdba74", text: "#7c2d12", label: "#ea580c" },
  { bg: "#cffafe", border: "#67e8f9", text: "#164e63", label: "#0891b2" },
  { bg: C.goldLight, border: "#fcd34d", text: "#713f12", label: C.gold },
  { bg: "#f0fdf4", border: "#6ee7b7", text: "#064e3b", label: "#059669" },
  { bg: "#fdf4ff", border: "#e879f9", text: "#581c87", label: "#a21caf" },
  { bg: "#fff1f2", border: "#fda4af", text: "#881337", label: "#e11d48" },
];

const TOTAL_STEPS = 18; // approximate — updated dynamically

// ── Shared components ────────────────────────────────────────────────────────
function Logo({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.25,
      background: `linear-gradient(135deg, ${C.terra}, ${C.terraDark})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 800, color: "#fff",
      fontFamily: fontSerif, flexShrink: 0,
      boxShadow: `0 4px 16px rgba(191,92,56,0.25)`,
    }}>hh</div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step - 1) / (total - 1)) * 100);
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.terra, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Step {step} of {total}</span>
        <span style={{ fontSize: 10, color: C.text4, fontWeight: 600 }}>{pct}% complete</span>
      </div>
      <div style={{ height: 3, background: C.bg4, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.terra}, ${C.terraDark})`, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ animation: "fadeUp 0.35s ease forwards" }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dotBounce { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-7px);opacity:1} }
        @keyframes popIn { 0%{transform:scale(0.85);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes glowPulse { 0%,100%{box-shadow:0 0 0 0 rgba(191,92,56,0.2)} 50%{box-shadow:0 0 0 12px rgba(191,92,56,0)} }
      `}</style>
      {children}
    </div>
  );
}

function StepLabel({ step, label }: { step: number; label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.terra, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 10 }}>
      Step {step} — {label}
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 10px", letterSpacing: "-0.02em", lineHeight: 1.25, fontFamily: font }}>{children}</h2>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: C.text3, margin: "0 0 24px", lineHeight: 1.65 }}>{children}</p>;
}

function StatCard({ stat, body, color = C.terra }: { stat: string; body: string; color?: string }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color} 0%, ${C.terraDark} 100%)`,
      borderRadius: 16, padding: "18px 22px", marginBottom: 20,
      position: "relative" as const, overflow: "hidden",
    }}>
      <div style={{ position: "absolute" as const, top: -16, right: -16, width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4, letterSpacing: "-0.02em" }}>{stat}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function Btn({ label, onClick, color = C.terra, disabled = false, loading = false }: {
  label: string; onClick: () => void; color?: string; disabled?: boolean; loading?: boolean;
}) {
  const isGreen = color === "green";
  const bg = disabled ? C.bg4 : isGreen ? C.sage : color;
  const shadow = disabled ? "none" : isGreen ? `0 4px 16px rgba(107,153,112,0.35)` : `0 4px 16px rgba(191,92,56,0.3)`;
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      width: "100%", padding: "15px", borderRadius: 12, border: "none",
      background: bg, color: disabled ? C.text4 : "#fff",
      fontSize: 15, fontWeight: 700, cursor: disabled ? "default" : "pointer",
      boxShadow: shadow, transition: "all 0.2s", letterSpacing: "-0.01em",
      fontFamily: font,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
      {loading ? "Saving..." : label}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "13px", borderRadius: 12,
      border: `1px solid ${C.border}`, background: C.bg2,
      color: C.text3, fontSize: 14, fontWeight: 600, cursor: "pointer",
      fontFamily: font, marginTop: 10,
    }}>Back</button>
  );
}

function InfoCard({ title, body, accent = C.terra }: { title: string; body: string; accent?: string }) {
  return (
    <div style={{ background: C.bg3, borderRadius: 14, padding: "16px 18px", marginBottom: 14, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: sub ? 4 : 0 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.text4, lineHeight: 1.6 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0, marginTop: 2,
        background: value ? C.terra : C.border2, cursor: "pointer",
        position: "relative" as const, transition: "background 0.2s",
      }}>
        <div style={{
          position: "absolute" as const, top: 2, left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)", transition: "left 0.2s",
        }} />
      </div>
    </div>
  );
}

function CheckItem({ value, onChange, label, body }: { value: boolean; onChange: (v: boolean) => void; label: string; body: string }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px",
      borderRadius: 12, cursor: "pointer",
      border: `1.5px solid ${value ? C.terra : C.border}`,
      background: value ? C.terraLight : C.bg2, transition: "all 0.15s", marginBottom: 10,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
        border: `2px solid ${value ? C.terra : C.border2}`,
        background: value ? C.terra : C.bg2,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {value && <div style={{ width: 8, height: 6, borderLeft: `2px solid #fff`, borderBottom: `2px solid #fff`, transform: "rotate(-45deg)", marginTop: -2 }} />}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  );
}

// ── Transition screen ────────────────────────────────────────────────────────
function Transition({ tipIndex, onDone }: { tipIndex: number; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const tip = TIPS[tipIndex % TIPS.length];
  const pastel = PASTEL_CARDS[tipIndex % PASTEL_CARDS.length];
  const procLabel = PROCESSING_LABELS[tipIndex % PROCESSING_LABELS.length];

  useEffect(() => {
    setProgress(0);
    const duration = 4800;
    const start = Date.now();
    const iv = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) { clearInterval(iv); setTimeout(onDone, 250); }
    }, 16);
    return () => clearInterval(iv);
  }, [tipIndex]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font }}>
      <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
        <Logo size={56} />
        <div style={{ marginTop: 32, marginBottom: 32 }}>
          <div style={{ background: pastel.bg, border: `1.5px solid ${pastel.border}`, borderRadius: 18, padding: "22px 26px", animation: "popIn 0.4s ease forwards" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: pastel.label, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>{tip.label}</div>
            <p style={{ fontSize: 17, fontWeight: 600, color: pastel.text, lineHeight: 1.6, margin: 0 }}>{tip.body}</p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 36 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%", background: C.terra,
              animation: `dotBounce 1.4s ease-in-out ${i * 0.18}s infinite`,
            }} />
          ))}
        </div>
        <div style={{ height: 3, background: C.bg4, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.terra}, ${C.terraDark})`, borderRadius: 3, transition: "width 0.05s linear" }} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.terra, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginTop: 10 }}>{procLabel}</div>
      </div>
    </div>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

// 1 — Commitment
function S1({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <Wrap>
      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <Logo size={72} />
        <div style={{ marginTop: 24, marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "0 0 10px", letterSpacing: "-0.03em", lineHeight: 1.2, fontFamily: font }}>
            {name ? `${name.split(" ")[0]}, are you ready?` : "Are you ready?"}
          </h1>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.terra, margin: "0 0 20px" }}>
            Never let your network forget about you.
          </p>

          {/* Tactical empathy opener */}
          <div style={{ background: C.navy, borderRadius: 16, padding: "20px 24px", marginBottom: 24, textAlign: "left" }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.8, fontStyle: "italic" }}>
              "The most successful people don’t just build relationships—they consistently nurture them, staying present, adding value, and showing up long after the first connection is made."
            </p>
          </div>

                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, textAlign: "left", marginBottom: 28 }}>
            {[
              { label: "Keep contacts updated", body: "Humble Hello enriches your contact data so you can stay visible to the people who matter" },
              { label: "Show up at the right moment", body: "Birthdays, promotions, life events — Humble Hello surfaces them and helps you act before it's too late." },
              { label: "Build relationships on autopilot", body: "The more Humble Hello learns, the more it can do for you — so you can focus on the moments that count." },
            ].map((item, i) => (
              <div key={i} style={{
                background: C.bg2, borderRadius: 14, padding: "14px 18px",
                border: `1px solid ${C.border}`,
                display: "flex", alignItems: "flex-start", gap: 14,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.terra, flexShrink: 0, marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6 }}>{item.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Btn label="I'm ready. Let's Get Set Up!" onClick={onNext} color="green" />
        <p style={{ fontSize: 11, color: C.text4, marginTop: 12 }}>Takes about 6 minutes. Worth every second.</p>
      </div>
    </Wrap>
  );
}

// 2 — The Promise
function S2({ onNext, onBack }: any) {
  return (
    <Wrap>
      <div style={{ textAlign: "center", padding: "8px 0 0" }}>

        {/* Empathy-first opener */}
        <div style={{ background: C.bg3, borderRadius: 16, padding: "20px 24px", marginBottom: 28, textAlign: "left", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.terra, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>The Promise</div>
          <p style={{ fontSize: 15, color: C.text2, margin: 0, lineHeight: 1.8, fontStyle: "italic" }}>
            "Engaging with those you haven't talked too in a while is powerful. I'm excited for you to see how easy it is & how people react!" ~ Tom Rector, Founder
          </p>
        </div>

        <p style={{ fontSize: 14, color: C.text3, margin: "0 auto 28px", lineHeight: 1.75, maxWidth: 360 }}>
          
        </p>

        {/* The 150 number */}
        <div style={{ background: C.navy, borderRadius: 18, padding: "28px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: C.terra, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8, fontFamily: fontSerif }}>150</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Is your magic number.</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
            Research shows humans can only effectively maintain around 150 meaniful relationships.
          </div>
        </div>

        <div style={{ background: C.terraLight, border: `1px solid ${C.terraMuted}`, borderRadius: 14, padding: "16px 20px", marginBottom: 28, textAlign: "left" }}>
          <p style={{ fontSize: 13, color: C.terraDark, margin: 0, lineHeight: 1.7, fontWeight: 600 }}>
            Humble Hello doesn't try to manage all 2,000+. It helps you focus on the 150 who actually matter — and makes sure none of them are forgotten.
          </p>
        </div>

        <Btn label="Set Up Your Profile" onClick={onNext} color="green" />
        <BackBtn onClick={onBack} />
      </div>
    </Wrap>
  );
}


// 3 — User Contact
function S3({ data, onChange, onNext, onBack, loading }: any) {
  return (
    <Wrap>
      <StepLabel step={3} label="Tell Us About You" />
      <Headline>Let's build your profile.</Headline>
      <Sub>This helps Humble Hello personalize your experience.</Sub>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12, marginBottom: 24 }}>

        {/* Name */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Full name</label>
          <input value={data.name || ""} onChange={e => onChange("name", e.target.value)}
            placeholder="First and last name"
            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
        </div>

        {/* Home address */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Home address</label>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            <input value={data.self_street || ""} onChange={e => onChange("self_street", e.target.value)}
              placeholder="Street address"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <input value={data.self_city || ""} onChange={e => onChange("self_city", e.target.value)}
                placeholder="City"
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
              <input value={data.self_state || ""} onChange={e => onChange("self_state", e.target.value)}
                placeholder="State"
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
              <input value={data.self_zip || ""} onChange={e => onChange("self_zip", e.target.value)}
                placeholder="ZIP"
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
            </div>
          </div>
        </div>

        {/* Phone numbers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Mobile number</label>
            <input value={data.self_mobile || ""} onChange={e => onChange("self_mobile", e.target.value)}
              placeholder="(317) 555-0100"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Work number</label>
            <input value={data.self_work_phone || ""} onChange={e => onChange("self_work_phone", e.target.value)}
              placeholder="(317) 555-0200"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
          </div>
        </div>

        {/* Emails */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Personal email</label>
            <input value={data.self_personal_email || ""} onChange={e => onChange("self_personal_email", e.target.value)}
              placeholder="you@gmail.com"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Work email</label>
            <input value={data.self_work_email || ""} onChange={e => onChange("self_work_email", e.target.value)}
              placeholder="you@company.com"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Timezone</label>
          <select value={data.timezone || "America/Indiana/Indianapolis"} onChange={e => onChange("timezone", e.target.value)}
            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg2, outline: "none", fontFamily: font }}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace("America/Indiana/", "").replace("America/", "").replace("Europe/", "").replace("Asia/", "").replace("Pacific/", "").replace("Australia/", "").replace(/_/g, " ")}</option>)}
          </select>
        </div>

      {/* Work divider */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 4, height: 14, borderRadius: 2, background: C.blue, flexShrink: 0 }} />
            Work Info
          </div>
        </div>

        {/* Company + Job Title */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Company</label>
            <input value={data.self_company || ""} onChange={e => onChange("self_company", e.target.value)}
              placeholder="e.g. Humble Hello"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Job Title</label>
            <input value={data.self_job_title || ""} onChange={e => onChange("self_job_title", e.target.value)}
              placeholder="e.g. Founder"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
          </div>
        </div>

        {/* Work address */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Work address</label>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            <input value={data.self_work_street || ""} onChange={e => onChange("self_work_street", e.target.value)}
              placeholder="Street address"
              style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <input value={data.self_work_city || ""} onChange={e => onChange("self_work_city", e.target.value)}
                placeholder="City"
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
              <input value={data.self_work_state || ""} onChange={e => onChange("self_work_state", e.target.value)}
                placeholder="State"
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
              <input value={data.self_work_zip || ""} onChange={e => onChange("self_work_zip", e.target.value)}
                placeholder="ZIP"
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
            </div>
          </div>
        </div>

        {/* LinkedIn */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>LinkedIn URL <span style={{ color: C.text4, fontWeight: 400, textTransform: "none" as const }}>(optional)</span></label>
          <input value={data.self_linkedin || ""} onChange={e => onChange("self_linkedin", e.target.value)}
            placeholder="linkedin.com/in/yourname"
            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
        </div>

      </div>

      <Btn label="Continue" onClick={onNext} color="green" loading={loading} disabled={!data.name?.trim()} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}
// 4 — Interests
function S4({ data, onChange, onNext, onBack }: any) {
  const selected = (data.interests || []) as string[];
  const [custom, setCustom] = useState("");

  const toggle = (v: string) => onChange("interests", selected.includes(v) ? selected.filter((x: string) => x !== v) : [...selected, v]);

  const addCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange("interests", [...selected, trimmed]);
    setCustom("");
  };

  const INTERESTS = [
    { label: "Sports & Outdoors", options: ["Football", "Basketball", "Golf", "Soccer", "Tennis", "Running", "Cycling", "Hiking", "Fishing", "Auto Racing", "Swimming", "Baseball", "Hockey"] },
    { label: "Food, Travel & Experiences", options: ["Fine Dining", "Home Cooking", "Wine", "Craft Beer", "Coffee", "Adventure Travel", "Luxury Travel", "Road Trips", "Live Music", "Comedy Shows"] },
    { label: "Family, Faith & Community", options: ["Family First", "Faith & Spirituality", "Volunteering", "Coaching Youth Sports", "Neighborhood Community"] },
    { label: "Business & Learning", options: ["Entrepreneurship", "Investing", "Real Estate", "Leadership", "AI & Technology", "Business Books", "Podcasts", "Marketing"] },
    { label: "Arts, Culture & Lifestyle", options: ["Photography", "Film & Cinema", "Theater", "Museums", "Fitness & Wellness", "Reading & Writing", "Collecting"] },
  ];

  return (
    <Wrap>
      <StepLabel step={4} label="Your Interests" />
      <Headline>Your interests help define & connect you.</Headline>
      <Sub>
        When Humble Hello knows your interests stronger messages are drafted.
      </Sub>

      {selected.length > 0 && (
        <div style={{ background: C.sageLight, border: `1px solid ${C.sage}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: C.sageDark, fontWeight: 600 }}>{selected.length} selected — your messages are already getting more personal</span>
        </div>
      )}

      {INTERESTS.map((cat, catIndex) => (
        <div key={cat.label} style={{ marginBottom: 24, paddingTop: catIndex > 0 ? 20 : 0, borderTop: catIndex > 0 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ 
            fontSize: 11, fontWeight: 800, color: C.text2, 
            textTransform: "uppercase" as const, letterSpacing: "0.08em", 
            marginBottom: 10, display: "flex", alignItems: "center", gap: 8 
          }}>
            <div style={{ width: 4, height: 14, borderRadius: 2, background: C.terra, flexShrink: 0 }} />
            {cat.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {cat.options.map(opt => {
              const active = selected.includes(opt);
              return (
                <button key={opt} onClick={() => toggle(opt)} style={{
                  fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 20, cursor: "pointer",
                  border: `1.5px solid ${active ? C.terra : C.border}`,
                  background: active ? C.terra : C.bg2,
                  color: active ? "#fff" : C.text2, transition: "all 0.15s", fontFamily: font,
                }}>{opt}</button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Anything else?</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={custom} onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustom()}
            placeholder="Add your own..."
            style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text, outline: "none", background: C.bg2, fontFamily: font }} />
          <button onClick={addCustom} style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Add</button>
        </div>
      </div>

      <Btn label={selected.length === 0 ? "Skip for now" : "Continue"} onClick={onNext} color="green"/>
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 5 — Interests pt 1
function S5({ data, onChange, onNext, onBack }: any) {
  const selected = (data.interests || []) as string[];
  const toggle = (v: string) => onChange("interests", selected.includes(v) ? selected.filter((x: string) => x !== v) : [...selected, v]);
  return (
    <Wrap>
      <StepLabel step={5} label="Your Interests" />
      <Headline>What are you into?</Headline>
      <Sub>When you share an interest with a contact, Humble Hello finds it and weaves it into your messages naturally.</Sub>
      {INTERESTS_1.map(cat => (
        <div key={cat.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>{cat.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {cat.options.map(opt => {
              const active = selected.includes(opt);
              return (
                <button key={opt} onClick={() => toggle(opt)} style={{
                  fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 20, cursor: "pointer",
                  border: `1.5px solid ${active ? C.terra : C.border}`,
                  background: active ? C.terra : C.bg2,
                  color: active ? "#fff" : C.text2, transition: "all 0.15s", fontFamily: font,
                }}>{opt}</button>
              );
            })}
          </div>
        </div>
      ))}
      {selected.length > 0 && (
        <div style={{ background: C.sageLight, border: `1px solid ${C.sage}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: C.sageDark, fontWeight: 600 }}>{selected.length} selected — your AI drafts are already getting smarter</span>
        </div>
      )}
      <Btn label={selected.length === 0 ? "Skip for now" : "Continue"} onClick={onNext} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 6 — Interests pt 2
function S6({ data, onChange, onNext, onBack }: any) {
  const selected = (data.interests || []) as string[];
  const toggle = (v: string) => onChange("interests", selected.includes(v) ? selected.filter((x: string) => x !== v) : [...selected, v]);
  return (
    <Wrap>
      <StepLabel step={6} label="More Interests" />
      <Headline>Anything else?</Headline>
      <Sub>The more you share, the more personal your experience becomes.</Sub>
      {INTERESTS_2.map(cat => (
        <div key={cat.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>{cat.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {cat.options.map(opt => {
              const active = selected.includes(opt);
              return (
                <button key={opt} onClick={() => toggle(opt)} style={{
                  fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 20, cursor: "pointer",
                  border: `1.5px solid ${active ? C.terra : C.border}`,
                  background: active ? C.terra : C.bg2,
                  color: active ? "#fff" : C.text2, transition: "all 0.15s", fontFamily: font,
                }}>{opt}</button>
              );
            })}
          </div>
        </div>
      ))}
      {selected.length > 0 && (
        <div style={{ background: C.sageLight, border: `1px solid ${C.sage}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: C.sageDark, fontWeight: 600 }}>{selected.length} total interests selected</span>
        </div>
      )}
      <Btn label="Continue" onClick={onNext} color="green"/>
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 7 — Network Science
function S7({ onNext, onBack }: any) {
  const tiers = [
    { n: 5, label: "Core 5", color: C.terra, desc: "Your most sacred relationships. You'd call these people at 2am." },
    { n: 15, label: "Inner 15", color: C.terraMuted, desc: "Your closest circle — allies, close friends, trusted advisors." },
    { n: 50, label: "Active 50", color: C.bg4, desc: "People you actively maintain — colleagues, clients, good friends." },
    { n: 150, label: "Network 150", color: C.border, desc: "Your extended network — people you respect and want to stay visible with." },
  ];
  return (
    <Wrap>
      <StepLabel step={7} label="The Science" />
      <Headline>Humble Hello organizes your world into tiers.</Headline>
      <div style={{ background: C.bg2, borderRadius: 16, padding: "20px", marginBottom: 20, border: `1px solid ${C.border}` }}>
        {tiers.map((t, i) => (
          <div key={t.n} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: i < tiers.length - 1 ? 16 : 0 }}>
            <div style={{
              width: 44 + i * 8, height: 44 + i * 8, borderRadius: "50%",
              background: t.color, flexShrink: 0, minWidth: 44,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: i < 2 ? "#fff" : C.text3 }}>{t.n}</span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.label}</span>
              </div>
              <span style={{ fontSize: 11, color: C.text3 }}>{t.desc}</span>
            </div>
          </div>
        ))}
      </div>
      <Btn label="Got it — let's ID my Core 5" onClick={onNext}color="green"/>
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 8 — Buckets
function S8({ data, onChange, onNext, onBack }: any) {
  const selected = (data.buckets || ["personal"]) as string[];
  const toggle = (b: string) => {
    if (selected.includes(b)) { if (selected.length > 1) onChange("buckets", selected.filter(x => x !== b)); }
    else onChange("buckets", [...selected, b]);
  };
  const buckets = [
    { id: "personal", label: "Personal", desc: "Friends, family, mentors — the people who know your real story", color: C.terra },
    { id: "business", label: "Business", desc: "Colleagues, clients, partners — the relationships that move your career", color: C.blue },
    { id: "prospects", label: "Prospects", desc: "People you want to build trust with — before you need anything from them", color: C.sage },
  ];
  return (
    <Wrap>
      <StepLabel step={6} label="Configure Your Buckets" />
      <Headline>Humble Hello sorts your contacts into 3 buckets</Headline>
      <Sub>Select the areas where you want Humble Hello to help you stay intentional.</Sub>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12, marginBottom: 28 }}>
        {buckets.map(b => {
          const active = selected.includes(b.id);
          return (
            <div key={b.id} onClick={() => toggle(b.id)} style={{
              display: "flex", alignItems: "center", gap: 16, padding: "16px 18px",
              borderRadius: 14, cursor: "pointer",
              border: `2px solid ${active ? b.color : C.border}`,
              background: active ? C.bg3 : C.bg2, transition: "all 0.15s",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                border: `2px solid ${active ? b.color : C.border2}`,
                background: active ? b.color : C.bg2,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {active && <div style={{ width: 8, height: 6, borderLeft: "2px solid #fff", borderBottom: "2px solid #fff", transform: "rotate(-45deg)", marginTop: -2 }} />}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: active ? b.color : C.text }}>{b.label}</div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{b.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Btn label="Continue" onClick={onNext}color="green" disabled={selected.length === 0} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 9 — Core 5 Intro
function S9({ onNext, onBack }: any) {
  return (
    <Wrap>
      <StepLabel step={9} label="Your Core 5" />
      <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.terra}, ${C.terraDark})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 800, color: "#fff",
          margin: "0 auto 20px", animation: "glowPulse 2.5s ease infinite",
        }}>5</div>
        <Headline>Your most important relationships</Headline>
        <Sub>
          Research identifies your innermost circle as the 5 people you have the deepest emotional connection with. These are the people who know your real story — and who you'd drop everything for.
        </Sub>
      </div>
      <InfoCard title="Who belongs here?" body="These are people you trust completely, check in with regularly, share real thoughts with, and would call in a crisis. Think: spouse, best friend, closest family member, a mentor who shaped you." accent={C.terra} />
      <InfoCard title="Why it matters" body="Humble Hello gives your Core 5 the highest priority — most frequent touch points, first in the Hopper, always top of mind. These relationships are too important to leave to chance." accent={C.gold} />
      <Btn label="Let's identify my Core 5" onClick={onNext} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 10 — Core 5 Personal
function S10({ data, onChange, onNext, onBack }: any) {
  const names = (data.core5?.personal || ["", "", "", "", ""]) as string[];
  const update = (i: number, v: string) => {
    const updated = [...names]; updated[i] = v;
    onChange("core5", { ...data.core5, personal: updated });
  };
  const filled = names.filter(n => n.trim()).length;

  const prompts = [
    "Who would you call at 2am?",
    "Who knows your real story?",
    "Who would drop everything for you?",
    "Who do you think about most?",
    "Who deserves more of your time?",
  ];

  return (
    <Wrap>
      <StepLabel step={7} label="Configure Personal Core 5" />
      <Headline>These are your Core 5 — the people with the deepest claim on your time and attention.</Headline>
      <Sub> Who in your personal life would notice if you went quiet for six months?</Sub>
      <p style={{ fontSize: 11, color: C.text4, fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.5 }}>Think: spouse/partner, best friends, close family, a mentor who shaped you</p>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 20 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: names[i]?.trim() ? C.terra : C.bg4,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, color: names[i]?.trim() ? "#fff" : C.text4,
              transition: "all 0.2s",
            }}>{i + 1}</div>
            <input value={names[i] || ""} onChange={e => update(i, e.target.value)}
              placeholder={prompts[i]}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10,
                border: `1.5px solid ${names[i]?.trim() ? C.terra : C.border}`,
                fontSize: 13, color: C.text, outline: "none",
                background: names[i]?.trim() ? C.terraLight : C.bg2,
                transition: "all 0.15s", fontFamily: font,
              }} />
          </div>
        ))}
      </div>
      {filled > 0 && <div style={{ fontSize: 12, color: C.terra, fontWeight: 700, marginBottom: 16 }}>{filled} of 5 added{filled === 5 ? " — that's your Core 5." : ""}</div>}
            <Btn label="Continue" onClick={onNext} color="green"/>
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 11 — Core 5 Business
function S11({ data, onChange, onNext, onBack }: any) {
  const names = (data.core5?.business || ["", "", "", "", ""]) as string[];
  const update = (i: number, v: string) => {
    const updated = [...names]; updated[i] = v;
    onChange("core5", { ...data.core5, business: updated });
  };
  const filled = names.filter(n => n.trim()).length;

  const prompts = [
    "Who is most critical to your success right now?",
    "Who do you most need to stay close to?",
    "Who opens doors for you?",
    "Who would you fight to keep in your corner?",
    "Who deserves more of your professional attention?",
  ];

  return (
    <Wrap>
      <StepLabel step={8} label="Configure Business Core 5" />
      <Headline>These are the relationships your career is built on.</Headline>
      <Sub>Who in your professional world can you least afford to fall out of touch?</Sub>
      <p style={{ fontSize: 11, color: C.text4, fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.5 }}>Think: a key client, strategic partner, executive sponsor, or trusted advisor</p>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 20 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: names[i]?.trim() ? C.blue : C.bg4,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, color: names[i]?.trim() ? "#fff" : C.text4,
              transition: "all 0.2s",
            }}>{i + 1}</div>
            <input value={names[i] || ""} onChange={e => update(i, e.target.value)}
              placeholder={prompts[i]}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10,
                border: `1.5px solid ${names[i]?.trim() ? C.blue : C.border}`,
                fontSize: 13, color: C.text, outline: "none",
                background: names[i]?.trim() ? C.blueLight : C.bg2,
                transition: "all 0.15s", fontFamily: font,
              }} />
          </div>
        ))}
      </div>
      {filled > 0 && <div style={{ fontSize: 12, color: C.blue, fontWeight: 700, marginBottom: 16 }}>{filled} of 5 added{filled === 5 ? " — Business Core 5 locked in." : ""}</div>}
      <Btn label="Continue" onClick={onNext}color="green" />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 12 — Core 5 Prospects
function S12({ data, onChange, onNext, onBack }: any) {
  const names = (data.core5?.prospects || ["", "", "", "", ""]) as string[];
  const update = (i: number, v: string) => {
    const updated = [...names]; updated[i] = v;
    onChange("core5", { ...data.core5, prospects: updated });
  };
  const filled = names.filter(n => n.trim()).length;

  const prompts = [
    "Who do you think about but never reach out to?",
    "Who could change your trajectory?",
    "Who have you met once but want to know better?",
    "Who do you want in your corner in 2 years?",
    "Who would you love an introduction to?",
  ];

  return (
    <Wrap>
      <StepLabel step={9} label="Configure Prospects Core 5" />
      <Headline>Your Core 5 prospects are leads you are trying to develop.</Headline>
            <p style={{ fontSize: 11, color: C.text4, fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.5 }}>Think: a potential client, investor, industry leader, or someone whose world you want to be part of</p>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 20 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: names[i]?.trim() ? C.sage : C.bg4,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, color: names[i]?.trim() ? "#fff" : C.text4,
              transition: "all 0.2s",
            }}>{i + 1}</div>
            <input value={names[i] || ""} onChange={e => update(i, e.target.value)}
              placeholder={prompts[i]}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10,
                border: `1.5px solid ${names[i]?.trim() ? C.sage : C.border}`,
                fontSize: 13, color: C.text, outline: "none",
                background: names[i]?.trim() ? C.sageLight : C.bg2,
                transition: "all 0.15s", fontFamily: font,
              }} />
          </div>
        ))}
      </div>
      {filled > 0 && <div style={{ fontSize: 12, color: C.sage, fontWeight: 700, marginBottom: 16 }}>{filled} of 5 added{filled === 5 ? " — Prospects Core 5 set." : ""}</div>}
      <Btn label="Continue" onClick={onNext}color="green" />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 13 — Engage Intro
function S13({ onNext, onBack }: any) {
  return (
    <Wrap>
      <StepLabel step={13} label="The Engage System" />
      <Headline>Never wonder who to reach out to again.</Headline>
      <Sub>Humble Hello tracks every interaction, scores every relationship, and tells you exactly who needs attention — before they feel forgotten.</Sub>
      <InfoCard title="The Hopper" body="Your personal outreach queue. Pre-drafted messages, ready to send with one tap. Humble Hello writes them — you approve, edit, or skip. It learns from every choice you make." accent={C.terra} />
      <InfoCard title="Relationship Scoring" body="Every contact has a score based on frequency, recency, depth, and priority. Scores decay -2 points per week without contact. You'll always know who's slipping." accent={C.gold} />
      <InfoCard title="Smart Suggestions" body="Humble Hello is already scanning your inbox and calendar — adding new contacts and enriching existing ones. The more it learns, the smarter your suggestions become." accent={C.blue} />
      <StatCard stat="4x more opportunities" body="Users who engage 3 contacts per day see 4x more inbound opportunities within 90 days." color={C.navy} />
      <Btn label="Got it" onClick={onNext} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 14 — Journal Intro
function S14({ onNext, onBack }: any) {
  return (
    <Wrap>
      <StepLabel step={14} label="The Journal" />
      <Headline>Your secret weapon for better relationships.</Headline>
      <Sub>The journal is not a diary — it's a relationship memory that works while you sleep.</Sub>
      <div style={{ background: C.navy, borderRadius: 16, padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.terra, marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>How it works</div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: "0 0 14px", lineHeight: 1.7, fontStyle: "italic" }}>
          "Had coffee with Sarah — she just got promoted at Salesforce."
        </p>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {["Sarah's contact card is automatically updated", "The interaction is logged to her relationship score", "A congratulations card is queued for your approval"].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.sage, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <InfoCard title="Clarify your thoughts" body="Participating in the journal not only helps you clarify your thoughts — it automatically enriches and updates your contact records with every entry you write." accent={C.purple} />
      <StatCard stat="40% more interactions" body="Users who journal 2x per week have 40% more meaningful interactions logged and dramatically better AI drafts." color={C.terra} />
      <Btn label="Got it" onClick={onNext} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 15 — Cards Intro
function S15({ onNext, onBack }: any) {
  return (
    <Wrap>
      <StepLabel step={15} label="Cards & Gifts" />
      <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
        
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.2, fontFamily: font }}>
          A handwritten card<br />the most powerful thing<br />you can send someone.
        </h2>
        <p style={{ fontSize: 14, color: C.text3, margin: "0 0 8px", lineHeight: 1.7 }}>
          A real, handwritten card — in your words, mailed automatically.
        </p>
      </div>

      {/* Empathy hook */}
     
      {/* Big stat */}
      <div style={{ background: C.navy, borderRadius: 18, padding: "24px", marginBottom: 16, textAlign: "center" as const }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: C.terra, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8 }}>7x</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>more memorable than an email</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>87% of recipients say a handwritten card made them feel genuinely valued by the sender</div>
      </div>

      {/* Social proof */}

      {/* How it works — punchy */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 24 }}>
        {[
          { num: "1", text: "Humble Hello drafts a personalized note using everything it knows about you and your contact" },
          { num: "2", text: "You get a preview — approve, tweak, or skip. Takes 5 seconds" },
          { num: "3", text: "Printed, addressed, and mailed the same day. $4.75 all in" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 14,
            background: C.bg2, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: C.terra, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, flexShrink: 0,
            }}>{item.num}</div>
            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, paddingTop: 4 }}>{item.text}</div>
          </div>
        ))}
      </div>

      <Btn label="Set up my card profile" onClick={onNext}color="green" />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 16 — Configure Cards: Signoff + Tone
function S16({ data, onChange, onNext, onBack }: any) {
  return (
    <Wrap>
      <StepLabel step={16} label="Configure Cards & Gifts" />
      <Headline>How do you write your cards?</Headline>
            <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Your signature</label>
        <input value={data.card_signoff || ""} onChange={e => onChange("card_signoff", e.target.value)}
          placeholder={`e.g. "Tom", "Tom Rector", or "Your Friend, Tom"`}
          style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const, background: C.bg2, fontFamily: font }} />
      </div>
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Card tone</label>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {["Warm & personal", "Professional", "Friendly & casual"].map(tone => {
            const active = data.card_tone === tone;
            return (
              <div key={tone} onClick={() => onChange("card_tone", tone)} style={{
                padding: "13px 16px", borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${active ? C.terra : C.border}`,
                background: active ? C.terraLight : C.bg2, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: active ? C.terraDark : C.text }}>{tone}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Btn label="Continue" onClick={onNext} disabled={!data.card_signoff?.trim()} color="green"/>
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 17 — Card Budget
function S17({ data, onChange, onNext, onBack }: any) {
  const budget = data.card_budget || 50;
  const cards = Math.floor(budget / 4.75);
  return (
    <Wrap>
      <StepLabel step={17} label="Configure Cards & Gifts" />
      <Headline>Set your monthly card budget.</Headline>
      <Sub>Humble Hello will never exceed this amount. Each handwritten card costs $4.75 including postage.</Sub>
      <div style={{ background: C.bg2, borderRadius: 16, padding: "20px", border: `1px solid ${C.border}`, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.text4, fontWeight: 600, marginBottom: 4 }}>Monthly budget</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.terra, letterSpacing: "-0.03em" }}>${budget}<span style={{ fontSize: 14, color: C.text4, fontWeight: 600 }}>/mo</span></div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 11, color: C.text4, fontWeight: 600, marginBottom: 4 }}>Cards per month</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.sage }}>~{cards}</div>
          </div>
        </div>
        <input type="range" min={10} max={200} step={5} value={budget}
          onChange={e => onChange("card_budget", +e.target.value)}
          style={{ width: "100%", accentColor: C.terra }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 10, color: C.text4 }}>$10</span>
          <span style={{ fontSize: 10, color: C.text4 }}>$200</span>
        </div>
      </div>
      <div style={{ background: C.goldLight, border: `1px solid ${C.gold}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, marginBottom: 4 }}>When your budget is reached</div>
        <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>Auto-sends pause for the rest of the month and pending cards are queued for your review. You'll get a notification so you can approve individually or increase your budget. Resets on the 1st of each month.</div>
      </div>
      <Btn label="Continue" onClick={onNext} />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 18 — Auto Send + Budget
function S18({ data, onChange, onNext, onBack }: any) {
  const autoSend = data.card_auto_send ?? false;
  const budget = data.card_budget || 50;
  const cards = Math.floor(budget / 4.75);

  return (
    <Wrap>
      <StepLabel step={18} label="Configure Cards & Gifts" />
      <Headline>Auto-send birthday cards?</Headline>
      <Sub>Humble Hello can automatically send a handwritten birthday card to any contact who has a birthday and mailing address on file.</Sub>

      <div style={{
        background: autoSend ? C.terraLight : C.bg2,
        border: `2px solid ${autoSend ? C.terra : C.border}`,
        borderRadius: 16, padding: "20px", marginBottom: 20,
        transition: "all 0.2s", cursor: "pointer",
      }} onClick={() => onChange("card_auto_send", !autoSend)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: autoSend ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: autoSend ? C.terraDark : C.text, marginBottom: 4 }}>
              Yes — send birthday cards automatically
            </div>
            <div style={{ fontSize: 12, color: autoSend ? C.terraDark : C.text3, opacity: 0.8 }}>
              Drafted in your voice, mailed on time, $4.75 per card
            </div>
          </div>
          <div style={{
            width: 44, height: 24, borderRadius: 12, flexShrink: 0,
            background: autoSend ? C.terra : C.border2,
            position: "relative" as const, transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute" as const, top: 2, left: autoSend ? 22 : 2,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)", transition: "left 0.2s",
            }} />
          </div>
        </div>

        {autoSend && (
          <div style={{ borderTop: `1px solid ${C.terraMuted}`, paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.terraDark, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>Monthly budget cap</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: C.terra, letterSpacing: "-0.03em" }}>
                  ${budget}<span style={{ fontSize: 14, color: C.terraDark, fontWeight: 600, opacity: 0.7 }}>/mo</span>
                </div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 11, color: C.terraDark, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>Cards per month</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.sageDark }}>~{cards}</div>
              </div>
            </div>
            <input type="range" min={10} max={200} step={5} value={budget}
              onChange={e => { e.stopPropagation(); onChange("card_budget", +e.target.value); }}
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", accentColor: C.terra }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: C.terraDark, opacity: 0.6 }}>$10</span>
              <span style={{ fontSize: 10, color: C.terraDark, opacity: 0.6 }}>$200</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: C.terraDark, opacity: 0.75, lineHeight: 1.5 }}>
              When your budget is reached, auto-sends pause and pending cards queue for your review. Resets the 1st of each month.
            </div>
          </div>
        )}
      </div>

      {!autoSend && (
        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6 }}>
            No problem — all card sends will be manual. Humble Hello will draft cards and notify you for approval before anything goes out.
          </div>
        </div>
      )}

      <StatCard stat="Never miss a birthday" body="Contacts who receive a birthday card are 60% more likely to respond to future outreach within 30 days." color={C.navy} />
      <Btn label="Continue" onClick={onNext} color="green" />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 19 — Legal
function S19({ data, onChange, onNext, onBack }: any) {
  const allRequired = data.tos && data.privacy && data.contacts_legit && data.no_spam && data.transactional_email;
  return (
    <Wrap>
      <StepLabel step={19} label="Our Commitment to Each Other" />
      <Headline>Before we go live.</Headline>
      <Sub>Humble Hello is built on trust. The following isn't fine print — it's the foundation of how we work together.</Sub>

      <CheckItem value={data.contacts_legit} onChange={v => onChange("contacts_legit", v)}
        label="My contacts are real people I know"
        body="I commit to using Humble Hello only with real individuals I have a genuine relationship with and a legitimate reason to reach out to. I will not use this platform to contact people who haven't consented to hear from me." />
      <CheckItem value={data.no_spam} onChange={v => onChange("no_spam", v)}
        label="I commit to authentic outreach only"
        body="I commit to using Humble Hello for genuine relationship building — not mass messaging, harvested lists, or commercial prospecting. Every message I send will be one I'd be proud to put my name on." />
      <CheckItem value={data.privacy} onChange={v => onChange("privacy", v)}
        label="Privacy Policy"
        body="I understand my contacts' data is used only to power my Humble Hello experience. Humble Hello does not sell contact data. I am the data controller — Humble Hello is the processor. I can export or delete my data at any time." />
      <CheckItem value={data.tos} onChange={v => onChange("tos", v)}
        label="Terms of Service"
        body="I have read and agree to Humble Hello's Terms of Service. I understand I am responsible for how I use this platform and the outreach I send." />

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.text4, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>Required</div>
        <CheckItem value={data.transactional_email} onChange={v => onChange("transactional_email", v)}
          label="Transactional emails"
          body="I agree to receive transactional emails from Humble Hello including account notifications, card approval requests, relationship SMS nudges, and system alerts. These are essential to the success of the platform." />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.text4, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>Opt In</div>
        <CheckItem value={data.marketing_email} onChange={v => onChange("marketing_email", v)}
          label="Tips & product updates"
          body="I'd like to receive Humble Hello product updates and network insights. You can unsubscribe anytime." />
        <CheckItem value={data.contributor_network} onChange={v => onChange("contributor_network", v)}
          label="Humble Hello Contributor Network"
          body="Signals from your contacts help improve enrichment for all users — like how Waze improves directions for every driver. To benefit from the community you must opt in. You may opt out in Settings and your contact info will be removed from the network." />
      </div>

      {!allRequired && (
        <div style={{ background: C.goldLight, border: `1px solid ${C.gold}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.text2, fontWeight: 600 }}>Please acknowledge all required items above to continue.</div>
        </div>
      )}
      <Btn label="I commit. Let's go." onClick={onNext} disabled={!allRequired}color="green" />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 20 — Wow Moment
function S20({ onNext, onBack, loading }: any) {
  return (
    <Wrap>
      <StepLabel step={20} label="Your First Move" />
      <Headline>Let's send your first message!</Headline>
      <Sub>Humble Hello has pre-drafted 3 reach-outs from your network. Send one before you head to your dashboard — this is how it starts.</Sub>
      <div style={{ background: C.bg3, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}`, marginBottom: 20, textAlign: "center" as const }}>
        <div style={{ fontSize: 13, color: C.text3 }}>Pre-drafted messages loading...</div>
        <div style={{ fontSize: 11, color: C.text4, marginTop: 6 }}>This feature is coming soon — your Inner 15 reach-outs will appear here.</div>
      </div>
      <Btn label="Go to my dashboard" onClick={onNext} loading={loading} color="green" />
      <BackBtn onClick={onBack} />
    </Wrap>
  );
}

// 21 — Done
function S21() {
  const router = useRouter();
  return (
    <Wrap>
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: `linear-gradient(135deg, ${C.terra}, ${C.terraDark})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, fontWeight: 800, color: "#fff",
          margin: "0 auto 24px", fontFamily: fontSerif,
          boxShadow: `0 8px 32px rgba(191,92,56,0.3)`,
          animation: "glowPulse 2.5s ease infinite",
        }}>hh</div>

        {/* Hero moment — celebrate the user */}
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 12px", letterSpacing: "-0.02em", fontFamily: font, lineHeight: 1.25 }}>
          You just did something most people never do.
        </h2>
        <p style={{ fontSize: 15, color: C.text3, margin: "0 0 8px", lineHeight: 1.7 }}>
          You chose to be intentional about your relationships.<br />That's not a small thing.
        </p>
        <p style={{ fontSize: 16, fontWeight: 700, color: C.terra, margin: "0 0 32px" }}>
          Never let your network forget about you.
        </p>

        {/* What's happening right now */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 28, textAlign: "left" as const }}>
          {[
            { label: "Already scanning your inbox & calendar", body: "Contact profiles are being built and enriched in the background right now.", color: C.sage },
            { label: "Your Core 5 is protected", body: "Humble Hello will make sure these relationships never quietly slip away.", color: C.terra },
            { label: "Cards & gifts configured", body: "The next birthday in your network — handled. Automatically.", color: C.gold },
            { label: "The Hopper is warming up", body: "Pre-drafted reach-outs from your network will appear in your dashboard within hours.", color: C.blue },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: C.bg2, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 5 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{item.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: C.navy, borderRadius: 16, padding: "18px 22px", marginBottom: 28, textAlign: "left" as const }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.terra, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Where we're headed together</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.7, fontStyle: "italic" }}>
            "The more Humble Hello learns about you and your contacts, the more it can automate conversations and relationships on your behalf — keeping them alive, authentic, and never forgotten."
          </p>
        </div>

        <button onClick={() => router.push("/dashboard?welcome=1")} style={{
          width: "100%", padding: "18px", borderRadius: 12, border: "none",
          background: C.sage, color: "#fff", fontSize: 16, fontWeight: 800,
          cursor: "pointer", boxShadow: `0 4px 20px rgba(107,153,112,0.35)`,
          letterSpacing: "-0.01em", fontFamily: font, transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 28px rgba(107,153,112,0.45)`; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 4px 20px rgba(107,153,112,0.35)`; }}>
          Take me to my dashboard
        </button>
        <p style={{ fontSize: 12, color: C.text4, marginTop: 12 }}>Your relationships are waiting. Let's go.</p>
      </div>
    </Wrap>
  );
}
// ── Main ─────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");

  const [profile, setProfile] = useState({
    name: "", home_city: "Indianapolis, IN",
    timezone: "America/Indiana/Indianapolis",
    interests: [] as string[],
    buckets: ["personal"] as string[],
    core5: {} as Record<string, string[]>,
    self_mobile: "", self_work_phone: "",
    self_personal_email: "", self_work_email: "",
    self_street: "", self_city: "", self_state: "", self_zip: "",
    self_work_street: "", self_work_city: "", self_work_state: "", self_work_zip: "",
    self_job_title: "", self_company: "", self_linkedin: "",
  });

  const [card, setCard] = useState({
    card_signoff: "", card_tone: "Warm & personal",
    card_budget: 50, card_auto_send: true,
  });

  const [legal, setLegal] = useState({
    tos: false, privacy: false,
    contacts_legit: false, no_spam: false,
    transactional_email: false,
    marketing_email: false,
    contributor_network: false,
  });

  useEffect(() => {
    fetch("/api/profile")
      .then(r => { if (r.status === 401) { router.push("/connect"); return null; } return r.json(); })
      .then(data => {
        if (!data) return;
        if (data.onboarding_complete) { router.push("/dashboard"); return; }
        if (data.name) { setUserName(data.name); setProfile(p => ({ ...p, name: data.name })); }
      }).catch(() => { });
  }, []);
// Compute dynamic step sequence based on bucket selection
  const getStepSequence = () => {
    const buckets = profile.buckets;
    const seq = [
      "welcome",
      "promise",
      "profile",
      "interests",
      "science",
      "buckets",
      "core5personal",
    ];
    if (buckets.includes("business")) seq.push("core5business");
    if (buckets.includes("prospects")) seq.push("core5prospects");
    seq.push(
      "cards_intro",
      "cards_signoff",
      "cards_autosend",
      "legal",
      "wow",
      "done",
    );
    return seq;
  };

  const sequence = getStepSequence();
  const currentScreen = sequence[step - 1] || "done";
  const totalDynamic = sequence.length;

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits[0] === "1") return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    return raw;
  };

  const up = (key: string, val: any) => setProfile(p => ({ ...p, [key]: val }));
    const upCard = (key: string, val: any) => setCard(p => ({ ...p, [key]: val }));
  const upLegal = (key: string, val: any) => setLegal(p => ({ ...p, [key]: val }));

  const saveProfile = async () => {
    const homeAddress = profile.self_street ? {
      streetAddress: profile.self_street,
      city: profile.self_city,
      region: profile.self_state,
      postalCode: profile.self_zip,
      country: "US",
    } : null;
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, home_address: homeAddress }) });
  };

  const saveSelfContact = async () => {
    await fetch("/api/contacts/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      full_name: profile.name,
      phone: profile.self_mobile ? formatPhone(profile.self_mobile) : null,
      work_phone: profile.self_work_phone ? formatPhone(profile.self_work_phone) : null,
      personal_email: profile.self_personal_email || null,
      work_email: profile.self_work_email || null,
      job_title: profile.self_job_title || null,
      company: profile.self_company || null,
      linkedin_url: profile.self_linkedin || null,
      home_address: {
        streetAddress: profile.self_street,
        city: profile.self_city,
        region: profile.self_state,
        postalCode: profile.self_zip,
        country: "US",
      },
      work_address: {
        streetAddress: profile.self_work_street,
        city: profile.self_work_city,
        region: profile.self_work_state,
        postalCode: profile.self_work_zip,
        country: "US",
      },
      is_self: true,
    })});
  };

  const saveCore5 = async () => {
    if (Object.keys(profile.core5).length === 0) return;
    await fetch("/api/contacts/core5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ core5: profile.core5 }),
    });
  };

  const saveCard = async () => {
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card_profile: card }) });
  };

  const finish = async () => {
    setSaving(true);
    try {
      const networkPayload = legal.contributor_network ? {
        network_opt_in: true,
        network_opt_in_at: new Date().toISOString(),
        network_consent_version: "1.0",
        network_share_personal_signals: true,
        network_share_pi_profile: false, // default false until PI is built
      } : {};

      await Promise.all([
        fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboarding_complete: true, legal, ...networkPayload }) }),
        saveCore5(),
      ]);

      // Fire welcome email + card sequence
      await fetch("/api/onboarding-complete", { method: "POST" });

      advance();
    } catch { setSaving(false); }
  };

  const advance = () => { setTransitioning(true); setTipIndex(t => t + 1); };
  const onDone = () => { setTransitioning(false); setStep(s => s + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const back = () => { setStep(s => s - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const next = async () => {
    if (currentScreen === "profile") { setSaving(true); await saveProfile(); await saveSelfContact(); setSaving(false); }
    if (currentScreen === "cards_autosend") { setSaving(true); await saveCard(); setSaving(false); }
    if (currentScreen === "wow") { await finish(); return; }
    advance();
  };

  if (transitioning) return <Transition tipIndex={tipIndex} onDone={onDone} />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 24px 80px" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <Logo size={32} />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Humble <span style={{ color: C.terra }}>Hello</span></span>
        </div>

        {step > 1 && currentScreen !== "done" && <ProgressBar step={step} total={totalDynamic} />}

        {currentScreen === "welcome" && <S1 name={userName} onNext={advance} />}
        {currentScreen === "promise" && <S2 onNext={next} onBack={back} />}
        {currentScreen === "profile" && <S3 data={profile} onChange={up} onNext={next} onBack={back} loading={saving} />}
        {currentScreen === "interests" && <S4 data={profile} onChange={up} onNext={next} onBack={back} />}
        {currentScreen === "science" && <S7 onNext={next} onBack={back} />}
        {currentScreen === "buckets" && <S8 data={profile} onChange={up} onNext={next} onBack={back} />}
        {currentScreen === "core5personal" && <S10 data={profile} onChange={up} onNext={next} onBack={back} />}
        {currentScreen === "core5business" && <S11 data={profile} onChange={up} onNext={next} onBack={back} />}
        {currentScreen === "core5prospects" && <S12 data={profile} onChange={up} onNext={next} onBack={back} />}
        {currentScreen === "cards_intro" && <S15 onNext={next} onBack={back} />}
    {currentScreen === "cards_signoff" && <S16 data={card} onChange={upCard} onNext={next} onBack={back} />}
        {currentScreen === "cards_address" && <S17 data={card} onChange={upCard} onNext={next} onBack={back} />}
        {currentScreen === "cards_autosend" && <S18 data={card} onChange={upCard} onNext={next} onBack={back} />}
        {currentScreen === "legal" && <S19 data={legal} onChange={upLegal} onNext={next} onBack={back} />}
        {currentScreen === "wow" && <S20 onNext={next} onBack={back} loading={saving} />}
        {currentScreen === "done" && <S21 />}
      </div>
    </div>
  );
}