"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C, font } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";
export const dynamic = "force-dynamic";

type ProfileData = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  home_city: string;
  home_address_text: string;
  favorite_cities: string[];
  created_at: string;
};

type SelfContact = {
  company?: string;
  job_title?: string;
  key_context?: string;
  topics?: string[];
  relationship_type?: string;
  communication_style?: string;
  linkedin_url?: string;
  phone?: string;
};

const TIMEZONES = [
  "America/New_York", "America/Indiana/Indianapolis", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Phoenix",
  "America/Anchorage", "Pacific/Honolulu", "Europe/London",
  "Europe/Paris", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
];

function getInitials(name: string, email: string) {
  if (name) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return email?.[0]?.toUpperCase() || "?";
}

function memberSince(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const iStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const };
const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column" as const, gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [selfContact, setSelfContact] = useState<SelfContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Indiana/Indianapolis");
  const [homeCity, setHomeCity] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [favCities, setFavCities] = useState<string[]>([]);
  const [newCity, setNewCity] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then(r => { if (r.status === 401) { router.push("/connect"); return null; } return r.json(); })
      .then(data => {
        if (!data) return;
        setProfile(data);
        setName(data.name || "");
        setTimezone(data.timezone || "America/Indiana/Indianapolis");
        setHomeCity(data.home_city || "");
        setHomeAddress(data.home_address_text || "");
        setFavCities(data.favorite_cities || []);
        setLoading(false);
        // Try to find self contact
        if (data.email) {
          fetch(`/api/contacts/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: data.email, mode: "search" }),
          }).then(r => r.json()).then(d => {
            const match = d.results?.find((c: any) => c.email?.toLowerCase() === data.email?.toLowerCase());
            if (match) setSelfContact(match);
          }).catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone, home_city: homeCity, home_address_text: homeAddress, favorite_cities: favCities }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const addCity = () => {
    const city = newCity.trim();
    if (!city || favCities.includes(city)) return;
    setFavCities(c => [...c, city]);
    setNewCity("");
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ color: C.text3 }}>Loading your profile...</div>
    </div>
  );

  const initials = getInitials(name || profile?.name || "", profile?.email || "");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex" }}>
      <Sidebar activeId="profile" />
      <main style={{ flex: 1, overflowY: "auto" as const, padding: "32px 40px 100px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>

          {/* Hero */}
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 36, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 28px" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${C.terra}44, ${C.terra}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: C.terra, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 2 }}>{name || profile?.email?.split("@")[0]}</div>
              <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>{profile?.email}</div>
              {selfContact?.job_title && selfContact?.company && (
                <div style={{ fontSize: 13, color: C.text2 }}>{selfContact.job_title} · {selfContact.company}</div>
              )}
            </div>
            <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
              {profile?.created_at && (
                <>
                  <div style={{ fontSize: 11, color: C.text4 }}>Member since</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text2 }}>{memberSince(profile.created_at)}</div>
                </>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginTop: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Active</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

            {/* What Humble Hello knows about you */}
            {selfContact && (
              <Card title="What Humble Hello knows about you" subtitle="Inferred from your emails, calendar, and contact card">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {selfContact.company && (
                    <div>
                      <label style={lStyle}>Company</label>
                      <div style={{ fontSize: 13, color: C.text, padding: "10px 14px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>{selfContact.company}</div>
                    </div>
                  )}
                  {selfContact.job_title && (
                    <div>
                      <label style={lStyle}>Job Title</label>
                      <div style={{ fontSize: 13, color: C.text, padding: "10px 14px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>{selfContact.job_title}</div>
                    </div>
                  )}
                  {selfContact.communication_style && (
                    <div>
                      <label style={lStyle}>Communication Style</label>
                      <div style={{ fontSize: 13, color: C.text, padding: "10px 14px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}`, textTransform: "capitalize" as const }}>{selfContact.communication_style}</div>
                    </div>
                  )}
                  {selfContact.phone && (
                    <div>
                      <label style={lStyle}>Phone</label>
                      <div style={{ fontSize: 13, color: C.text, padding: "10px 14px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>{selfContact.phone}</div>
                    </div>
                  )}
                </div>
                {selfContact.topics && selfContact.topics.length > 0 && (
                  <div>
                    <label style={lStyle}>Your Topics & Interests</label>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                      {selfContact.topics.map(t => (
                        <span key={t} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: C.bg3, color: C.text2, border: `1px solid ${C.border2}`, textTransform: "capitalize" as const }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selfContact.key_context && (
                  <div>
                    <label style={lStyle}>About You</label>
                    <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, padding: "10px 14px", background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}` }}>{selfContact.key_context}</div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.text4 }}>This information is used to personalize your experience and draft messages. It is never shared.</div>
              </Card>
            )}

            {/* Personal info */}
            <Card title="Personal info" subtitle="Your basic information">
              <div>
                <label style={lStyle}>Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Email Address</label>
                <input value={profile?.email || ""} disabled style={{ ...iStyle, color: C.text3, background: C.bg3 }} />
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Connected via Google · cannot be changed here</div>
              </div>
              {selfContact?.linkedin_url && (
                <div>
                  <label style={lStyle}>LinkedIn</label>
                  <a href={selfContact.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.blue }}>{selfContact.linkedin_url}</a>
                </div>
              )}
            </Card>

            {/* Location */}
            <Card title="Location" subtitle="Used for recommendations and personalization">
              <div>
                <label style={lStyle}>Home City</label>
                <input value={homeCity} onChange={e => setHomeCity(e.target.value)} placeholder="e.g. Indianapolis, IN" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Home Address</label>
                <input value={homeAddress} onChange={e => setHomeAddress(e.target.value)} placeholder="e.g. 123 Main St, Indianapolis, IN 46201" style={iStyle} />
                <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Used for card and gift delivery</div>
              </div>
              <div>
                <label style={lStyle}>Favorite Travel Cities</label>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: favCities.length > 0 ? 10 : 0 }}>
                  {favCities.map(city => (
                    <div key={city} style={{ display: "flex", alignItems: "center", gap: 6, background: C.greenLight, border: `1px solid ${C.green}44`, borderRadius: 20, padding: "4px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>{city}</span>
                      <button onClick={() => setFavCities(c => c.filter(x => x !== city))} style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newCity} onChange={e => setNewCity(e.target.value)} onKeyDown={e => e.key === "Enter" && addCity()} placeholder="Add a city (e.g. Chicago, IL)" style={{ ...iStyle, flex: 1 }} />
                  <button onClick={addCity} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Add</button>
                </div>
              </div>
            </Card>

            {/* Timezone */}
            <Card title="Time & Language" subtitle="How Humble Hello schedules actions on your behalf">
              <div>
                <label style={lStyle}>Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{ ...iStyle, cursor: "pointer" }}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </Card>

          </div>
        </div>
      </main>

      {/* Save bar */}
      <div style={{ position: "fixed", bottom: 0, left: 200, right: 0, background: C.bg2, borderTop: `1px solid ${C.border}`, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 100 }}>
        <div style={{ fontSize: 13, color: saved ? C.green : C.text3, fontWeight: saved ? 600 : 400 }}>
          {saved ? "✓ Profile saved" : "Make changes above and save"}
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: saving ? C.bg3 : C.terra, color: saving ? C.text4 : "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: font }}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}