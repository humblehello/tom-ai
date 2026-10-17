"use client";
import { useState } from "react";
import { C, font } from "@/app/lib/theme";
import { useIsMobile } from "@/app/lib/useMediaQuery";

// ── Types ─────────────────────────────────────────────────────────────────────
export type EditableContact = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  zip?: string;
  company?: string;
  job_title?: string;
  home_address?: any;
  work_address?: any;
  relationship_type?: string;
  relationship_types?: string[];
  key_context?: string;
  notes?: string;
  notes_context?: string;
  topics?: string[];
  best_channel?: string;
  best_time?: string;
  communication_style?: string;
  met_where?: string;
  birthday?: string;
  all_emails?: string[];
  phones?: { number: string; type: "cell" | "work" | "home"; label?: string; primary?: boolean }[];
  linkedin_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  dunbar_tier?: number | null;
  dunbar_bucket?: string[];
  tier_override?: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const RELATIONSHIP_TYPE_OPTIONS = ["close_friend", "family", "friend", "customer", "vendor", "colleague", "mentor", "acquaintance"];
const DUNBAR_TIERS = [
  { tier: 1, name: "Core 5", cap: 5, color: "#bf5c38" },
  { tier: 2, name: "Inner Circle 15", cap: 15, color: "#6b9970" },
  { tier: 3, name: "Active 50", cap: 50, color: "#2a6496" },
  { tier: 4, name: "Network 150", cap: 150, color: "#6b5c9e" },
];
const DUNBAR_BUCKETS = [
  { id: "personal", label: "Personal", color: "#bf5c38" },
  { id: "professional", label: "Professional", color: "#6b9970" },
  { id: "prospect", label: "Prospect", color: "#3b82f6" },
];

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw.trim();
}
function fmtEmail(raw: string): string { return raw.trim().toLowerCase(); }
function fmtProperCase(raw: string): string {
  return raw.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function fmtBirthday(raw: string): string {
  if (!raw.trim()) return "";
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return `0000-${md[1].padStart(2,"0")}-${md[2].padStart(2,"0")}`;
  const mdDash = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mdDash) return `0000-${mdDash[1].padStart(2,"0")}-${mdDash[2].padStart(2,"0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return year > 1900 && year < 2100 && !s.match(/\d{4}/) ? `0000-${m}-${day}` : `${String(year).padStart(4,"0")}-${m}-${day}`;
  }
  return s;
}
function fmtTopics(raw: string): string[] {
  return [...new Set(raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))];
}
function fmtAddress(addr: any): any {
  if (!addr) return addr;
  return {
    ...addr,
    city: addr.city ? fmtProperCase(addr.city) : addr.city,
    region: addr.region ? addr.region.trim().toUpperCase() : addr.region,
    country: addr.country ? fmtProperCase(addr.country) : addr.country,
    streetAddress: addr.streetAddress ? fmtProperCase(addr.streetAddress) : addr.streetAddress,
  };
}
function tierColor(type?: string): string {
  switch (type) {
    case "family": case "close_friend": return C.purple;
    case "friend": return C.blue;
    case "customer": return C.green;
    case "mentor": return C.amber;
    default: return C.text3;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EditModal({ contact, onClose, onSave }: {
  contact: EditableContact;
  onClose: () => void;
  onSave: (u: Partial<EditableContact>) => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const gridTwo = isMobile ? "1fr" : "1fr 1fr";

  const [form, setForm] = useState({
    full_name: contact.full_name || "",
    company: contact.company || "",
    job_title: contact.job_title || "",
    emails: (() => {
      const all = contact.all_emails?.length ? contact.all_emails : [contact.email].filter(Boolean) as string[];
      const primary = contact.email || "";
      const others = all.filter(e => e !== primary);
      return [primary, ...others].filter(Boolean).slice(0, 3) as string[];
    })(),
    phones: (() => {
      if (contact.phones?.length) return contact.phones.slice(0, 3);
      if (contact.phone) return [{ number: contact.phone, type: "cell" as const, primary: true }];
      return [] as { number: string; type: "cell" | "work" | "home"; primary?: boolean }[];
    })(),
    birthday: contact.birthday ? (() => {
      const b = contact.birthday.trim();
      if (!b) return "";
      if (b.startsWith("0000-")) {
        const parts = b.split("-");
        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(b)) {
        const parts = b.split("-");
        return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
      }
      if (/^\d{2}-\d{2}$/.test(b)) {
        const parts = b.split("-");
        return `${parseInt(parts[0])}/${parseInt(parts[1])}`;
      }
      return b;
    })() : "",
    notes: contact.notes || "",
    notes_context: contact.notes_context || "",
    key_context: contact.key_context || "",
    topics: (contact.topics || []).join(", "),
    best_channel: contact.best_channel || "",
    best_time: contact.best_time || "",
    communication_style: contact.communication_style || "",
    met_where: contact.met_where || "",
    relationship_types: contact.relationship_types?.length
      ? contact.relationship_types
      : contact.relationship_type ? [contact.relationship_type] : [],
    dunbar_tier: contact.dunbar_tier || 0,
    dunbar_bucket: (() => {
      const buckets = [...(contact.dunbar_bucket || [])];
      const types = contact.relationship_types?.length
        ? contact.relationship_types
        : contact.relationship_type ? [contact.relationship_type] : [];
      const personalTypes = ["friend", "close_friend", "family"];
      const professionalTypes = ["customer", "vendor", "colleague"];
      if (types.some(t => personalTypes.includes(t)) && !buckets.includes("personal")) buckets.push("personal");
      if (types.some(t => professionalTypes.includes(t)) && !buckets.includes("professional")) buckets.push("professional");
      return buckets;
    })(),
    tier_override: contact.tier_override || false,
    home_street: contact.home_address?.streetAddress || "",
    home_city: contact.home_address?.city || "",
    home_region: contact.home_address?.region || "",
    home_zip: contact.home_address?.postalCode || contact.home_address?.zip || (contact as any).zip || "",
    home_country: contact.home_address?.country || "",
    work_street: contact.work_address?.streetAddress || "",
    work_city: contact.work_address?.city || "",
    work_region: contact.work_address?.region || "",
    work_zip: contact.work_address?.postalCode || contact.work_address?.zip || "",
    work_country: contact.work_address?.country || "",
    linkedin_url: contact.linkedin_url || "",
    twitter_url: contact.twitter_url || "",
    instagram_url: contact.instagram_url || "",
    facebook_url: contact.facebook_url || "",
  });

  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("basic");

  const toggleRelType = (type: string) => setForm(f => {
    const personalTypes = ["friend", "close_friend", "family"];
    const professionalTypes = ["customer", "vendor", "colleague"];
    const isAdding = !f.relationship_types.includes(type);
    if (isAdding && type === "acquaintance" && f.relationship_types.some(t => personalTypes.includes(t))) return f;
    let next = isAdding
      ? [...f.relationship_types.filter(t => !(personalTypes.includes(type) && t === "acquaintance")), type]
      : f.relationship_types.filter(t => t !== type);
    let buckets = [...(f.dunbar_bucket || [])];
    if (isAdding) {
      if (personalTypes.includes(type)) {
        if (!buckets.includes("personal")) buckets.push("personal");
        buckets = buckets.filter(b => b !== "prospect");
      }
      if (professionalTypes.includes(type)) {
        if (!buckets.includes("professional")) buckets.push("professional");
        buckets = buckets.filter(b => b !== "prospect");
      }
    }
    return { ...f, relationship_types: next, dunbar_bucket: buckets };
  });

  // Move a non-primary email to position 0 (making it primary)
  const makePrimary = (index: number) => {
    if (index === 0) return;
    setForm(f => {
      const next = [...f.emails];
      const [picked] = next.splice(index, 1);
      return { ...f, emails: [picked, ...next] };
    });
  };

  const handleSave = async () => {
    setSaving(true);

    // Home address — null clears, otherwise format
    const homeFieldsEmpty = !form.home_street.trim() && !form.home_city.trim() && !form.home_region.trim() && !form.home_zip.trim() && !form.home_country.trim();
    const homeAddr = homeFieldsEmpty ? null : {
      streetAddress: fmtProperCase(form.home_street),
      city: fmtProperCase(form.home_city),
      region: form.home_region.trim().toUpperCase(),
      postalCode: form.home_zip.trim(),
      country: fmtProperCase(form.home_country),
    };

    const workFieldsEmpty = !form.work_street.trim() && !form.work_city.trim() && !form.work_region.trim() && !form.work_zip.trim() && !form.work_country.trim();
    const workAddr = workFieldsEmpty ? null : {
      streetAddress: fmtProperCase(form.work_street),
      city: fmtProperCase(form.work_city),
      region: form.work_region.trim().toUpperCase(),
      postalCode: form.work_zip.trim(),
      country: fmtProperCase(form.work_country),
    };

    const cleanedEmails = form.emails.map(fmtEmail).filter(Boolean);

    const payload: Partial<EditableContact> = {
      full_name: fmtProperCase(form.full_name),
      company: fmtProperCase(form.company),
      job_title: fmtProperCase(form.job_title),
      phone: form.phones.find(p => p.type === "cell")?.number
        ? fmtPhone(form.phones.find(p => p.type === "cell")!.number)
        : form.phones[0]?.number ? fmtPhone(form.phones[0].number) : "",
      phones: form.phones.filter(p => p.number.trim()).map((p, i) => ({ ...p, number: fmtPhone(p.number), primary: i === 0 })),
      email: cleanedEmails[0] || "",
      all_emails: cleanedEmails,
      birthday: fmtBirthday(form.birthday),
      notes: form.notes.trim(),
      notes_context: form.notes_context.trim(),
      key_context: form.key_context.trim(),
      topics: fmtTopics(form.topics),
      best_channel: form.best_channel,
      best_time: form.best_time.trim(),
      communication_style: form.communication_style.trim(),
      met_where: fmtProperCase(form.met_where),
      relationship_types: form.relationship_types,
      relationship_type: form.relationship_types[0] || "",
      dunbar_tier: form.dunbar_tier ? form.dunbar_tier : null,
      dunbar_bucket: form.dunbar_bucket,
      // tier_override stays true if it was already true OR user picked a tier here.
      // Never flip it back to false from a save.
      tier_override: form.dunbar_tier ? true : (contact.tier_override || false),
      home_address: homeAddr ? fmtAddress(homeAddr) : null,
      work_address: workAddr ? fmtAddress(workAddr) : null,
      zip: form.home_zip.trim() || "",
      linkedin_url: form.linkedin_url.trim(),
      twitter_url: form.twitter_url.trim(),
      instagram_url: form.instagram_url.trim(),
      facebook_url: form.facebook_url.trim(),
    };
    await onSave(payload);
    setSaving(false);
  };

  const iStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const };
  const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };
  const sBtn = (key: string, label: string) => (
    <button key={key} onClick={() => setActiveSection(key)}
      style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: activeSection === key ? C.text : C.bg3, color: activeSection === key ? "#fff" : C.text3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" as const }}>
      {label}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: isMobile ? 0 : 16, width: "100%", maxWidth: 560, maxHeight: isMobile ? "100dvh" : "92vh", height: isMobile ? "100dvh" : "auto", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ padding: isMobile ? "16px 18px" : "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Edit Contact</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{contact.full_name}</div>
          </div>
          <button onClick={onClose} style={{
            background: C.bg3, border: "none", borderRadius: 8,
            padding: isMobile ? "10px 14px" : "6px 10px",
            cursor: "pointer", color: C.text3,
            fontSize: isMobile ? 22 : 18, lineHeight: 1,
            minWidth: isMobile ? 44 : "auto",
            minHeight: isMobile ? 44 : "auto",
          }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ padding: isMobile ? "10px 18px" : "12px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, WebkitOverflowScrolling: "touch" as const }}>
          {sBtn("basic", "Basic Info")}
          {sBtn("relationship", "Relationship")}
          {sBtn("address", "Addresses")}
          {sBtn("social", "Social")}
          {sBtn("context", "Context & Notes")}
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? 18 : 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16, WebkitOverflowScrolling: "touch" as const }}>

          {activeSection === "basic" && <>
            <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 12 }}>
              <div><label style={lStyle}>Full Name</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={iStyle} placeholder="Jane Smith" /></div>
              <div><label style={lStyle}>Company</label><input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={iStyle} placeholder="Acme Corp" /></div>
            </div>
            <div><label style={lStyle}>Job Title</label><input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} style={iStyle} placeholder="CEO" /></div>

            {/* Phones */}
            <div>
              <label style={lStyle}>Phone Numbers</label>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {form.phones.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: 8, alignItems: "center" }}>
                    <input value={p.number}
                      onChange={e => setForm(f => ({ ...f, phones: f.phones.map((ph, j) => j === i ? { ...ph, number: e.target.value } : ph) }))}
                      style={iStyle} placeholder="(317) 555-0123" />
                    <select value={p.type}
                      onChange={e => setForm(f => ({ ...f, phones: f.phones.map((ph, j) => j === i ? { ...ph, type: e.target.value as "cell" | "work" | "home", label: undefined } : ph) }))}
                      style={{ ...iStyle, cursor: "pointer", padding: "10px 8px" }}>
                      <option value="cell">📱 Cell</option>
                      <option value="work">☎️ Work</option>
                      <option value="home">🏠 Home</option>
                    </select>
                    <button onClick={() => setForm(f => ({ ...f, phones: f.phones.filter((_, j) => j !== i) }))}
                      style={{ height: 38, borderRadius: 7, border: `1px solid ${C.redLight}`, background: C.redLight, color: C.red, cursor: "pointer", fontFamily: font, fontSize: 13 }}>×</button>
                  </div>
                ))}
                {form.phones.length < 3 && (
                  <button onClick={() => setForm(f => ({ ...f, phones: [...f.phones, { number: "", type: "cell" as const, primary: false }] }))}
                    style={{ padding: "8px 14px", borderRadius: 7, border: `1px dashed ${C.border2}`, background: C.bg3, color: C.text3, fontSize: 12, cursor: "pointer", fontFamily: font, textAlign: "left" as const }}>
                    + Add phone number
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.text4, marginTop: 4 }}>Auto-formatted on save · Cell numbers used for texting</div>
            </div>

            {/* Emails — primary + per-row delete + "Make primary" on non-primary */}
            <div>
              <label style={lStyle}>Email Addresses</label>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {form.emails.map((e, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 8, alignItems: "center" }}>
                      <input value={e}
                        onChange={ev => setForm(f => ({ ...f, emails: f.emails.map((em, j) => j === i ? ev.target.value : em) }))}
                        style={{ ...iStyle, borderColor: i === 0 ? C.green : C.border2, borderWidth: i === 0 ? 2 : 1 }}
                        placeholder={i === 0 ? "Primary email" : "Additional email"} />
                      {i > 0 ? (
                        <button onClick={() => setForm(f => ({ ...f, emails: f.emails.filter((_, j) => j !== i) }))}
                          title="Remove"
                          style={{ height: 38, borderRadius: 7, border: `1px solid ${C.redLight}`, background: C.redLight, color: C.red, cursor: "pointer", fontFamily: font, fontSize: 13 }}>×</button>
                      ) : <div />}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 2 }}>
                      {i === 0 ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>★ Primary</span>
                      ) : (
                        <button onClick={() => makePrimary(i)}
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: `1px solid ${C.green}`, background: "transparent", color: C.green, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>
                          Make primary
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {form.emails.length < 3 && (
                  <button onClick={() => setForm(f => ({ ...f, emails: [...f.emails, ""] }))}
                    style={{ padding: "8px 14px", borderRadius: 7, border: `1px dashed ${C.border2}`, background: C.bg3, color: C.text3, fontSize: 12, cursor: "pointer", fontFamily: font, textAlign: "left" as const }}>
                    + Add email address
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.text4, marginTop: 4 }}>First email is primary · Use "Make primary" to reorder</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 12 }}>
              <div><label style={lStyle}>Birthday</label><input value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} style={iStyle} placeholder="MM/DD/YYYY" /></div>
              <div><label style={lStyle}>Met Where</label><input value={form.met_where} onChange={e => setForm(f => ({ ...f, met_where: e.target.value }))} style={iStyle} placeholder="Conference, intro, etc." /></div>
            </div>
          </>}

          {activeSection === "relationship" && <>
            <div>
              <label style={lStyle}>Relationship Types</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {RELATIONSHIP_TYPE_OPTIONS.map(t => {
                  const active = form.relationship_types.includes(t);
                  const col = tierColor(t);
                  return (
                    <button key={t} onClick={() => toggleRelType(t)}
                      style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${active ? col : C.border2}`, background: active ? col + "22" : C.bg3, color: active ? col : C.text3, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: font, textTransform: "capitalize" as const }}>
                      {active ? "✓ " : ""}{t.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 12 }}>
              <div>
                <label style={lStyle}>Best Channel</label>
                <select value={form.best_channel} onChange={e => setForm(f => ({ ...f, best_channel: e.target.value }))} style={{ ...iStyle, cursor: "pointer" }}>
                  <option value="">— Not set —</option>
                  {["email", "phone", "text", "linkedin", "in_person", "slack"].map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                </select>
              </div>
              <div><label style={lStyle}>Best Time to Reach</label><input value={form.best_time} onChange={e => setForm(f => ({ ...f, best_time: e.target.value }))} style={iStyle} placeholder="Mornings, weekends..." /></div>
            </div>
            <div><label style={lStyle}>Communication Style</label><input value={form.communication_style} onChange={e => setForm(f => ({ ...f, communication_style: e.target.value }))} style={iStyle} placeholder="Formal, casual, brief..." /></div>

            {/* Tier */}
            <div>
              <label style={lStyle}>Relationship Tier</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 4 }}>
                {DUNBAR_TIERS.map(t => {
                  const active = form.dunbar_tier === t.tier;
                  return (
                    <button key={t.tier} onClick={() => setForm(f => ({ ...f, dunbar_tier: active ? 0 : t.tier, tier_override: true }))}
                      style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${active ? t.color : C.border2}`, background: active ? t.color + "22" : C.bg3, color: active ? t.color : C.text3, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                      {active ? "✓ " : ""}{t.name}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: C.text4, marginTop: 4 }}>Core 5 must be set manually — AI will not auto-assign</div>
            </div>

            {/* Buckets */}
            <div>
              <label style={lStyle}>Buckets</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 4 }}>
                {DUNBAR_BUCKETS.map(b => {
                  const active = (form.dunbar_bucket || []).includes(b.id);
                  return (
                    <button key={b.id} onClick={() => {
                      const current = form.dunbar_bucket || [];
                      let next = active ? current.filter(x => x !== b.id) : [...current, b.id];
                      if (next.length === 0) return;
                      if (b.id === "prospect") next = ["prospect"];
                      if ((b.id === "personal" || b.id === "professional") && next.includes("prospect")) {
                        next = next.filter(x => x !== "prospect");
                      }
                      setForm(f => ({ ...f, dunbar_bucket: next }));
                    }}
                      style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${active ? b.color : C.border2}`, background: active ? b.color + "22" : C.bg3, color: active ? b.color : C.text3, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                      {active ? "✓ " : ""}{b.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={lStyle}>Topics They Care About</label>
              <input value={form.topics} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} style={iStyle} placeholder="golf, startups, family..." />
              <div style={{ fontSize: 10, color: C.text4, marginTop: 3 }}>Comma-separated</div>
            </div>
          </>}

          {activeSection === "address" && <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Home Address</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><label style={lStyle}>Street</label><input value={form.home_street} onChange={e => setForm(f => ({ ...f, home_street: e.target.value }))} style={iStyle} placeholder="123 Main St" /></div>
                <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 10 }}>
                  <div><label style={lStyle}>City</label><input value={form.home_city} onChange={e => setForm(f => ({ ...f, home_city: e.target.value }))} style={iStyle} placeholder="Indianapolis" /></div>
                  <div><label style={lStyle}>State</label><input value={form.home_region} onChange={e => setForm(f => ({ ...f, home_region: e.target.value }))} style={iStyle} placeholder="IN" /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 10 }}>
                  <div><label style={lStyle}>Zip</label><input value={form.home_zip} onChange={e => setForm(f => ({ ...f, home_zip: e.target.value }))} style={iStyle} placeholder="46201" /></div>
                  <div><label style={lStyle}>Country</label><input value={form.home_country} onChange={e => setForm(f => ({ ...f, home_country: e.target.value }))} style={iStyle} placeholder="United States" /></div>
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Work Address</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><label style={lStyle}>Street</label><input value={form.work_street} onChange={e => setForm(f => ({ ...f, work_street: e.target.value }))} style={iStyle} placeholder="456 Business Ave" /></div>
                <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 10 }}>
                  <div><label style={lStyle}>City</label><input value={form.work_city} onChange={e => setForm(f => ({ ...f, work_city: e.target.value }))} style={iStyle} placeholder="Chicago" /></div>
                  <div><label style={lStyle}>State</label><input value={form.work_region} onChange={e => setForm(f => ({ ...f, work_region: e.target.value }))} style={iStyle} placeholder="IL" /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 10 }}>
                  <div><label style={lStyle}>Zip</label><input value={form.work_zip} onChange={e => setForm(f => ({ ...f, work_zip: e.target.value }))} style={iStyle} placeholder="60601" /></div>
                  <div><label style={lStyle}>Country</label><input value={form.work_country} onChange={e => setForm(f => ({ ...f, work_country: e.target.value }))} style={iStyle} placeholder="United States" /></div>
                </div>
              </div>
            </div>
          </>}

          {activeSection === "social" && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Social Profiles</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <div><label style={lStyle}>LinkedIn</label><input value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} style={iStyle} placeholder="https://linkedin.com/in/username" /></div>
                <div><label style={lStyle}>Twitter / X</label><input value={form.twitter_url} onChange={e => setForm(f => ({ ...f, twitter_url: e.target.value }))} style={iStyle} placeholder="https://twitter.com/username" /></div>
                <div><label style={lStyle}>Instagram</label><input value={form.instagram_url} onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))} style={iStyle} placeholder="https://instagram.com/username" /></div>
                <div><label style={lStyle}>Facebook</label><input value={form.facebook_url} onChange={e => setForm(f => ({ ...f, facebook_url: e.target.value }))} style={iStyle} placeholder="https://facebook.com/username" /></div>
              </div>
            </div>
          )}

          {activeSection === "context" && <>
            <div><label style={lStyle}>Key Context</label><textarea value={form.key_context} onChange={e => setForm(f => ({ ...f, key_context: e.target.value }))} rows={3} style={{ ...iStyle, resize: "none", lineHeight: 1.6 }} placeholder="What makes this relationship unique..." /></div>
            <div><label style={lStyle}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...iStyle, resize: "none", lineHeight: 1.6 }} placeholder="General notes..." /></div>
            <div><label style={lStyle}>Notes Context</label><textarea value={form.notes_context} onChange={e => setForm(f => ({ ...f, notes_context: e.target.value }))} rows={3} style={{ ...iStyle, resize: "none", lineHeight: 1.6 }} placeholder="Additional context for AI..." /></div>
          </>}
        </div>

        {/* Footer */}
        <div style={{
          padding: isMobile ? "12px 16px calc(12px + env(safe-area-inset-bottom))" : "16px 24px",
          borderTop: `1px solid ${C.border}`,
          background: C.bg2,
          display: "flex",
          flexDirection: isMobile ? "column" as const : "row" as const,
          gap: isMobile ? 10 : 8,
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "center",
          flexShrink: 0,
        }}>
          {!isMobile && (
            <div style={{ fontSize: 11, color: C.text4 }}>Phone, name, address auto-formatted on save</div>
          )}
          <div style={{ display: "flex", gap: 8, width: isMobile ? "100%" : "auto" }}>
            <button onClick={onClose} style={{
              padding: isMobile ? "12px 20px" : "10px 20px",
              borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2,
              fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font,
              flex: isMobile ? 1 : "none",
            }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: isMobile ? "12px 20px" : "10px 20px",
              borderRadius: 8, border: "none", background: C.green, color: "#fff",
              fontSize: 14, fontWeight: 600,
              cursor: saving ? "default" : "pointer", fontFamily: font,
              opacity: saving ? 0.7 : 1,
              flex: isMobile ? 2 : "none",
            }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}