"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { C, font } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";
import HopperSmartImport from "@/app/components/HopperSmartImport";
import SharedEditModal from "@/app/components/EditModal";
import { useIsMobile } from "@/app/lib/useMediaQuery";

type Contact = {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  zip?: string;
  company?: string;
  job_title?: string;
  home_address?: any;
  work_address?: any;
  relationship_type?: string;
  relationship_types?: string[];
  relationship_strength?: number;
  relationship_health?: string;
  relationship_tier?: string;
  key_context?: string;
  relationship_context?: string;
  best_channel?: string;
  best_time?: string;
  communication_style?: string;
  met_where?: string;
  last_emailed_at?: string;
  last_classified_at?: string;
  email_count?: number;
  gifting_eligible?: boolean;
  birthday?: string;
  notes?: string;
  notes_context?: string;
  topics?: string[];
  calendar_intimacy_score?: number;
  shared_events?: any[];
  classifier_confidence?: number;
  google_resource_name?: string;
  deletion_reason?: string;
  deletion_suggested?: boolean;
  card_eligible?: boolean;
  all_emails?: string[];
  all_phones?: string[];
  phones?: { number: string; type: "cell" | "work" | "home"; primary?: boolean }[];
  linkedin_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  last_purchase_amount?: number;
  last_purchase_at?: string;
  last_purchase_notes?: string;
  total_purchase_amount?: number;
  industry?: string;
  company_description?: string;
  seniority?: string;
  tags?: { tag: string; value: string; confidence: number; source: string }[];
  intelligence?: any;
  dunbar_tier?: number | null;
  dunbar_bucket?: string[];
  humble_score?: number;
  tier_override?: boolean;
};
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

const TIER_CADENCES: Record<number, { personal: number; professional: number; prospect: number }> = {
  1: { personal: 14, professional: 14, prospect: 14 },
  2: { personal: 25, professional: 25, prospect: 30 },
  3: { personal: 45, professional: 45, prospect: 999 },
  4: { personal: 60, professional: 60, prospect: 999 },
  5: { personal: 90, professional: 90, prospect: 999 },
};

const RELATIONSHIP_TYPES = ["all", "close_friend", "family", "friend", "customer", "vendor", "colleague", "mentor", "acquaintance"];
const RELATIONSHIP_TYPE_OPTIONS = ["close_friend", "family", "friend", "customer", "vendor", "colleague", "mentor", "acquaintance"];
const HEALTH_FILTERS = ["all", "thriving", "warm", "cooling", "cold", "dormant", "never"];
const SORT_OPTIONS = [
  { value: "last_contacted_recent", label: "Last Contacted (Recent)" },
  { value: "last_contacted_oldest", label: "Last Contacted (Oldest)" },
  { value: "strength", label: "Relationship Strength" },
  { value: "name", label: "Name A-Z" },
  { value: "name_z", label: "Name Z-A" },
  { value: "company", label: "Company A-Z" },
  { value: "email_count", label: "Most Emails" },
  { value: "birthday", label: "Birthday (Upcoming)" },
];
const CACHE_KEY = "tom_contacts_cache";
const CACHE_TTL = 1000 * 60 * 60;

function daysAgo(dateStr?: string): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}
function formatDaysAgo(days: number): string {
  if (days === 999) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
function tierColor(type?: string): string {
  switch (type) {
    case "family": return C.purple;
    case "close_friend": return C.purple;
    case "friend": return C.blue;
    case "customer": return C.green;
    case "mentor": case "mentee": return C.amber;
    case "connector": return C.pink;
    case "colleague": return C.text3;
    case "vendor": return C.text4;
    default: return C.text4;
  }
}
function healthColor(health?: string): { bg: string; text: string } {
  switch (health) {
    case "thriving": return { bg: C.greenLight, text: C.green };
    case "warm": return { bg: C.blueLight, text: C.blue };
    case "cooling": return { bg: C.amberLight, text: C.amber };
    case "cold": return { bg: C.redLight, text: C.red };
    case "dormant": return { bg: C.border, text: C.text3 };
    default: return { bg: C.bg3, text: C.text4 };
  }
}
function healthOrder(h?: string): number { return { thriving: 0, warm: 1, cooling: 2, cold: 3, dormant: 4 }[h || ""] ?? 5; }
function typeOrder(t?: string): number { return { family: 0, close_friend: 1, friend: 2, customer: 3, mentor: 4, colleague: 5, vendor: 6, acquaintance: 7 }[t || ""] ?? 8; }
function initials(name: string): string { return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(); }
function lastName(full_name: string): string {
  const parts = full_name.trim().split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : full_name;
}
function locationStr(c: Contact): string {
  const addr = c.home_address || c.work_address;
  if (!addr) return "zzz";
  return [addr.city, addr.region, addr.country].filter(Boolean).join(" ").toLowerCase();
}
function sortContacts(contacts: Contact[], sortBy: string): Contact[] {
  return [...contacts].sort((a, b) => {
    switch (sortBy) {
      case "last_contacted_recent": return daysAgo(a.last_emailed_at) - daysAgo(b.last_emailed_at);
      case "last_contacted_oldest": return daysAgo(b.last_emailed_at) - daysAgo(a.last_emailed_at);
      case "name": return lastName(a.full_name).localeCompare(lastName(b.full_name));
      case "name_z": return lastName(b.full_name).localeCompare(lastName(a.full_name));
      case "company": return (a.company || "zzz").localeCompare(b.company || "zzz");
      case "email_count": return (b.email_count || 0) - (a.email_count || 0);
      case "birthday": {
        const getBirthdayDays = (c: Contact) => {
          if (!c.birthday) return 999;
          const today = new Date();
          const bday = new Date(c.birthday);
          const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
          if (next < today) next.setFullYear(today.getFullYear() + 1);
          return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        };
        return getBirthdayDays(a) - getBirthdayDays(b);
      }
      case "recently_added": return b.id.localeCompare(a.id);
      default:
        if (a.last_classified_at && !b.last_classified_at) return -1;
        if (!a.last_classified_at && b.last_classified_at) return 1;
        return (b.relationship_strength || 0) - (a.relationship_strength || 0);
    }
  });
}
// ── Auto-formatters ──────────────────────────────────────────────────────────
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
  // Already ISO: 1986-10-01 or 0000-10-01
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
  // MM/DD or M/D (no year)
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return `0000-${md[1].padStart(2,"0")}-${md[2].padStart(2,"0")}`;
  // MM-DD (no year, dashes)
  const mdDash = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mdDash) return `0000-${mdDash[1].padStart(2,"0")}-${mdDash[2].padStart(2,"0")}`;
  // "October 1" or "October 1, 1986" or "Oct 1 1986"
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    // new Date("October 1") gives year 2001 — treat suspicious years as no-year
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

// ── Add Contact Modal ────────────────────────────────────────────────────────
function AddContactModal({ onClose, onSave }: { onClose: () => void; onSave: (c: Partial<Contact>) => Promise<void> }) {
  const isMobile = useIsMobile();
  const gridTwo = isMobile ? "1fr" : "1fr 1fr";
  const [form, setForm] = useState({ full_name: "", email: "", company: "", job_title: "", phone: "", relationship_type: "" });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    if (!form.company.trim()) e.company = "Company is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const iStyle = (err?: boolean) => ({ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${err ? C.red : C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const });
  const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4, display: "block" as const };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Add Contact</div>
          <button onClick={onClose} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.text3, fontSize: 18, lineHeight: 1 }}>x</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={lStyle}>Full Name *</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={iStyle(!!errors.full_name)} placeholder="Jane Smith" />{errors.full_name && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{errors.full_name}</div>}</div>
          <div><label style={lStyle}>Email *</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={iStyle(!!errors.email)} placeholder="jane@company.com" type="email" />{errors.email && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{errors.email}</div>}</div>
          <div><label style={lStyle}>Company *</label><input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={iStyle(!!errors.company)} placeholder="Acme Corp" />{errors.company && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{errors.company}</div>}</div>
          <div style={{ display: "grid", gridTemplateColumns: gridTwo, gap: 12 }}>
            <div><label style={lStyle}>Job Title</label><input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} style={iStyle()} placeholder="Title" /></div>
            <div><label style={lStyle}>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={iStyle()} placeholder="+1 555 000 0000" /></div>
          </div>
          <div><label style={lStyle}>Relationship Type</label>
            <select value={form.relationship_type} onChange={e => setForm(f => ({ ...f, relationship_type: e.target.value }))} style={{ ...iStyle(), cursor: "pointer" }}>
              <option value="">-- Select type --</option>
              {RELATIONSHIP_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Cancel</button>
          <button onClick={async () => { if (!validate()) return; setSaving(true); await onSave(form); setSaving(false); onClose(); }} disabled={saving} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: font, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Contact"}</button>
        </div>
      </div>
    </div>
  );
}
// ── Edit Modal ───────────────────────────────────────────────────────────────
// Now lives in /app/components/EditModal.tsx as SharedEditModal (see import at top)

// ── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ contact, onClose, onConfirm }: { contact: Contact; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 380, padding: 24, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Delete Contact?</div>
        <div style={{ fontSize: 13, color: C.text3, marginBottom: 20, lineHeight: 1.6 }}>This will permanently delete <strong style={{ color: C.text }}>{contact.full_name}</strong> from Humble Hello and Google Contacts. This cannot be undone.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Cancel</button>
          <button onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false); }} disabled={deleting} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: deleting ? "default" : "pointer", fontFamily: font, opacity: deleting ? 0.7 : 1 }}>{deleting ? "Deleting..." : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Hopper Card ──────────────────────────────────────────────────────────────
function HopperCard({ onDone, onOpenModal }: { onDone: () => void; onOpenModal?: () => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processFiles = useCallback(async (files: FileList) => {
    setProcessing(true); setResult(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("files", f));
      const res = await fetch("/api/contacts/hopper", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data.message || `${data.imported || 0} contacts imported`);
      onDone();
    } catch { setResult("Upload failed — try again"); }
    setProcessing(false);
    setTimeout(() => setResult(null), 4000);
  }, [onDone]);
  return (
    <div onDragOver={e => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={e => { e.preventDefault(); setIsDragOver(false); }} onDrop={e => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files); }} onClick={() => onOpenModal ? onOpenModal() : fileInputRef.current?.click()}
      style={{ background: isDragOver ? C.greenLight : C.bg2, border: `2px dashed ${isDragOver ? C.green : C.border2}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 80, textAlign: "center", userSelect: "none" as const }}>
      <input ref={fileInputRef} type="file" multiple accept=".csv,.vcf,.txt,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.webp" onChange={e => { if (e.target.files?.length) processFiles(e.target.files); }} style={{ display: "none" }} />
      {processing ? (<><div style={{ fontSize: 18 }}>⏳</div><div style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>Processing...</div></>)
        : result ? (<><div style={{ fontSize: 18 }}>✅</div><div style={{ fontSize: 11, fontWeight: 600, color: C.green }}>{result}</div></>)
        : (<><div style={{ fontSize: 20 }}>📥</div><div style={{ fontSize: 13, fontWeight: 700, color: isDragOver ? C.green : C.text }}>Hopper</div><div style={{ fontSize: 10, color: C.text4 }}>Drop CSV, VCF, Excel, or photo</div></>)}
    </div>
  );
}

// ── Clean Modal ──────────────────────────────────────────────────────────────
function CleanModal({ allContacts, onClose, onDeleted }: { allContacts: Contact[]; onClose: () => void; onDeleted: (ids: string[]) => void }) {
  const [filterNeverEmailed, setFilterNeverEmailed] = useState(true);
  const [filterNoPhone, setFilterNoPhone] = useState(false);
  const [filterNoCompany, setFilterNoCompany] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const filtered = allContacts.filter(c => {
    if (!filterNeverEmailed && !filterNoPhone && !filterNoCompany) return false;
    if (filterNeverEmailed && c.last_emailed_at) return false;
    if (filterNoPhone && c.phone) return false;
    if (filterNoCompany && c.company) return false;
    return true;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set(filtered.map(c => c.id))); }, [filterNeverEmailed, filterNoPhone, filterNoCompany, allContacts.length]);
  const toggleOne = (id: string) => setSelected(s => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} contacts? This cannot be undone.`)) return;
    setDeleting(true); setProgress(0);
    const ids = Array.from(selected); let done = 0;
    for (const id of ids) { await fetch(`/api/contacts/google-sync?contact_id=${id}`, { method: "DELETE" }); done++; setProgress(Math.round((done / ids.length) * 100)); }
    setDeleting(false); onDeleted(ids); onClose();
  };
  const activeFilters = [filterNeverEmailed, filterNoPhone, filterNoCompany].filter(Boolean).length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div><div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Clean Contacts</div><div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>Select filters, deselect keepers, then delete</div></div>
          <button onClick={onClose} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.text3, fontSize: 18, lineHeight: 1 }}>x</button>
        </div>
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          {[{ label: "Never Emailed", active: filterNeverEmailed, toggle: () => setFilterNeverEmailed(f => !f) }, { label: "No Phone", active: filterNoPhone, toggle: () => setFilterNoPhone(f => !f) }, { label: "No Company", active: filterNoCompany, toggle: () => setFilterNoCompany(f => !f) }].map(({ label, active, toggle }) => (
            <button key={label} onClick={toggle} style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${active ? C.red : C.border2}`, background: active ? C.redLight : C.bg3, color: active ? C.red : C.text3, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", fontFamily: font }}>{active ? "✓ " : ""}{label}</button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 12, color: C.text3, alignSelf: "center" }}>{activeFilters === 0 ? "Select at least one filter" : `${filtered.length.toLocaleString()} matched · ${selected.size} selected`}</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {activeFilters === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: C.text4, fontSize: 13 }}>Enable at least one filter above to see contacts</div>
            : filtered.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: C.text4, fontSize: 13 }}>No contacts match these filters</div>
            : (<>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 24px", borderBottom: `1px solid ${C.border}` }}>
                <input type="checkbox" checked={selected.size === filtered.length} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(c => c.id)) : new Set())} style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.red }} />
                <span style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>{selected.size === filtered.length ? "Deselect all" : "Select all"}</span>
              </div>
              {filtered.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: selected.has(c.id) ? "#fff8f8" : C.bg2 }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.red, flexShrink: 0 }} />
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.red, flexShrink: 0 }}>{initials(c.full_name || "?")}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name || "No name"}</div>
                    <div style={{ fontSize: 11, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[c.email, c.company, !c.phone ? "no phone" : null, !c.last_emailed_at ? "never emailed" : null].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </>)}
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          {deleting ? <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: C.text3, marginBottom: 6 }}>Deleting... {progress}%</div><div style={{ height: 4, background: C.bg3, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${progress}%`, background: C.red, borderRadius: 4, transition: "width 0.2s" }} /></div></div>
            : <div style={{ fontSize: 12, color: C.text4 }}>{selected.size > 0 ? `${selected.size} contact${selected.size === 1 ? "" : "s"} will be deleted` : "Nothing selected"}</div>}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Cancel</button>
            <button onClick={handleDeleteSelected} disabled={deleting || selected.size === 0} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: selected.size === 0 ? C.bg3 : C.red, color: selected.size === 0 ? C.text4 : "#fff", fontSize: 13, fontWeight: 600, cursor: deleting || selected.size === 0 ? "default" : "pointer", fontFamily: font, opacity: deleting ? 0.7 : 1 }}>{deleting ? "Deleting..." : `Delete ${selected.size > 0 ? selected.size : ""} Selected`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
// ── Tier Badge ───────────────────────────────────────────────────────────────
function TierBadge({ contact, allContacts, onUpdate }: { 
  contact: Contact; 
  allContacts: Contact[];
  onUpdate: (tier: number, override: boolean) => void;
}) {
  const [showWarning, setShowWarning] = useState(false);
  const currentTier = contact.dunbar_tier;
  const tierInfo = DUNBAR_TIERS.find(t => t.tier === currentTier);

  const handleTierCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const tiers = [null, 1, 2, 3, 4, 5];
    const currentIndex = currentTier ? tiers.indexOf(currentTier) : 0;
    const nextIndex = (currentIndex + 1) % tiers.length;
    const nextTier = tiers[nextIndex];

    if (nextTier === null) {
      onUpdate(0, false);
      return;
    }

    // Check soft cap
    if (nextTier === 1) {
      const coreCount = allContacts.filter(c => c.dunbar_tier === 1 && c.id !== contact.id).length;
      if (coreCount >= 5) {
        setShowWarning(true);
        return;
      }
    }

    onUpdate(nextTier, true);
  };

  return (
    <div style={{ position: "relative" as const }}>
      <button
        onClick={handleTierCycle}
        style={{
          padding: "2px 8px", borderRadius: 20, border: "none",
          background: tierInfo ? tierInfo.color + "22" : C.bg3,
          color: tierInfo ? tierInfo.color : C.text4,
          fontSize: 10, fontWeight: 700, cursor: "pointer",
          fontFamily: font, whiteSpace: "nowrap" as const,
          transition: "all 0.15s",
        }}
        title="Tap to change tier"
      >
        {tierInfo ? tierInfo.name : "Set Tier"}
      </button>

      {showWarning && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: C.bg2, borderRadius: 16, maxWidth: 420, padding: 28,
            boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: "center" as const }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8, textAlign: "center" as const }}>
              Your Core 5 is Full
            </div>
            <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.7, marginBottom: 20 }}>
              Research by Robin Dunbar shows humans can maintain at most <strong>5 truly intimate relationships</strong> — the people you'd call at 2am, your closest confidants.
              <br /><br />
              Adding a 6th Core contact dilutes the attention each person deserves. Consider whether someone else should move to Inner Circle 15 to make room for <strong>{contact.full_name}</strong>.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowWarning(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                Keep Core at 5
              </button>
              <button onClick={() => { onUpdate(1, true); setShowWarning(false); }}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#bf5c38", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                Add Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bucket Pills ─────────────────────────────────────────────────────────────
function BucketPills({ contact, onUpdate }: {
  contact: Contact;
  onUpdate: (buckets: string[]) => void;
}) {
  const currentBuckets = contact.dunbar_bucket || [];

  const toggleBucket = (e: React.MouseEvent, bucketId: string) => {
    e.stopPropagation();
    let next = currentBuckets.includes(bucketId)
      ? currentBuckets.filter(b => b !== bucketId)
      : [...currentBuckets, bucketId];
    if (next.length === 0) return;
    // Prospect is mutually exclusive with personal/professional
    if (bucketId === "prospect") next = ["prospect"];
    if ((bucketId === "personal" || bucketId === "professional") && next.includes("prospect")) {
      next = next.filter(b => b !== "prospect");
    }
    onUpdate(next);
  };

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
      {DUNBAR_BUCKETS.map(bucket => {
        const active = currentBuckets.includes(bucket.id);
        return (
          <button
            key={bucket.id}
            onClick={e => toggleBucket(e, bucket.id)}
            style={{
              padding: "1px 7px", borderRadius: 20, fontSize: 9, fontWeight: 600,
              border: `1px solid ${active ? bucket.color : C.border2}`,
              background: active ? bucket.color + "22" : "transparent",
              color: active ? bucket.color : C.text4,
              cursor: "pointer", fontFamily: font,
             transition: "all 0.15s",
            }}
          >
            {bucket.label}
          </button>
        );
      })}
    </div>
  );
}
// ── Contact Card ─────────────────────────────────────────────────────────────
function tierCardStyle(contact: Contact): { borderColor: string; background: string } {
  if ((contact as any).is_self) return { borderColor: "#b8922a", background: "#f0e0b0" }; // User — gold
  switch (contact.dunbar_tier) {
    case 1: return { borderColor: "#bf5c38", background: "#f2d5c8" };   // Core 5 — terracotta
    case 2: return { borderColor: "#6b9970", background: "#d0e8d3" };   // Inner 15 — sage green
    case 3: return { borderColor: "#2a6496", background: "#d0e0f0" };   // Active 50 — blue
    case 4: return { borderColor: C.border, background: C.bg2 };   // Network 150 — white/default
    default: return { borderColor: C.border, background: C.bg2 };       // Unranked — default
  }
}

function ContactCard({ contact, onClick, onReach, onEdit, onDelete, allContacts, onTierUpdate }: { 
  contact: Contact; 
  onClick: () => void; 
  onReach: (e: React.MouseEvent) => void; 
  onEdit: (e: React.MouseEvent) => void; 
  onDelete: (e: React.MouseEvent) => void;
  allContacts: Contact[];
  onTierUpdate: (id: string, tier: number, buckets: string[], override: boolean) => void;
}) {
  const health = healthColor(contact.relationship_health);
  const days = daysAgo(contact.last_emailed_at);
  const tColor = tierColor(contact.relationship_type);
  const tier = contact.dunbar_tier || 5;
  const CADENCE: Record<number, number> = { 1: 14, 2: 25, 3: 45, 4: 60, 5: 90 };
  const cadence = CADENCE[tier] || 90;
  const isEngaged = days < cadence;
  const daysOverdue = Math.max(0, days - cadence);
  const TIER_NAMES: Record<number, string> = { 1: "Core 5", 2: "Inner Circle", 3: "Active", 4: "Network", 5: "Acquaintance" };
  let whyNow = "";
  if (daysOverdue > cadence) whyNow = `${TIER_NAMES[tier]} · ${daysOverdue}d overdue — relationship at risk`;
  else if (tier <= 2) whyNow = `${TIER_NAMES[tier]} · due every ${cadence}d · ${daysOverdue}d past`;
  else if (days > 365) whyNow = `${Math.floor(days / 30)} months since last touch`;
  else if (days < 999) whyNow = `${TIER_NAMES[tier]} · ${daysOverdue}d past ${cadence}d cadence`;
  return (
    <div onClick={onClick} style={{ background: isEngaged ? C.bg2 : tierCardStyle(contact).background, border: `2px solid ${isEngaged ? C.green : tierCardStyle(contact).borderColor}`, borderRadius: 14, padding: "16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, transition: "border-color 0.15s, box-shadow 0.15s", height: 360 }} onMouseEnter={e => { e.currentTarget.style.opacity = "0.92"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }} onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: contact.last_classified_at ? `linear-gradient(135deg, ${tColor}33, ${tColor}66)` : C.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: contact.last_classified_at ? tColor : C.text4 }}>{initials(contact.full_name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.full_name}</div>
          {(contact.job_title || contact.company) && <div style={{ fontSize: 11, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{contact.job_title && contact.company ? `${contact.job_title} · ${contact.company}` : contact.job_title || contact.company}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <TierBadge
            contact={contact}
            allContacts={allContacts}
            onUpdate={(tier, override) => onTierUpdate(contact.id, tier, contact.dunbar_bucket || [], override)}
          />
          <span style={{ fontSize: 10, fontWeight: 600, color: days < 30 ? C.green : days < 90 ? C.amber : C.red }}>{formatDaysAgo(days)}</span>
          {(contact as any).verification_status === "verified" && (
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: "#6b9970" + "22", color: "#6b9970", fontWeight: 700 }}>
              Verified
            </span>
          )}
          
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" as const, gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
 {/* Email — primary only, "+N" badge if more */}
{contact.email && (() => {
  const allEmails = contact.all_emails?.length ? contact.all_emails : [contact.email].filter(Boolean) as string[];
  const primary = contact.email;
  const extra = Math.max(0, allEmails.length - 1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <span onClick={e => { e.stopPropagation(); window.open(`mailto:${primary}`); }} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 0 }}>
        <span style={{ color: C.text4, flexShrink: 0 }}>@</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.blue, minWidth: 0 }}>{primary}</span>
      </span>
      {(contact as any).email_status === "invalid" && (
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: C.redLight, color: C.red, fontWeight: 700, flexShrink: 0 }}>INVALID</span>
      )}
      {(contact as any).email_status === "departed" && (
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: C.amberLight, color: C.amber, fontWeight: 700, flexShrink: 0 }}>LEFT CO</span>
      )}
      {extra > 0 && (
        <span title={allEmails.filter(e => e !== primary).join(", ")}
          style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: C.blueLight, color: C.blue, fontWeight: 600, flexShrink: 0, cursor: "help" }}>
          +{extra}
        </span>
      )}
    </div>
  );
})()}

{/* Phones — show up to 2 with type label */}
{(() => {
  const phonesToShow = contact.phones?.length
    ? contact.phones.slice(0, 2)
    : contact.phone ? [{ number: contact.phone, type: "cell" }] : [];
  const typeIcon = (t: string) => t === "cell" ? "📱" : t === "work" ? "☎️" : "🏠";
  const typeLabel = (t: string) => t === "cell" ? "cell" : t === "work" ? "work" : "home";
  return phonesToShow.map((p, i) => (
    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <span onClick={e => { e.stopPropagation(); window.open(`tel:${p.number}`); }} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <span style={{ color: C.text4 }}>{typeIcon(p.type)}</span>
        <span style={{ color: C.blue }}>{fmtPhone(p.number)}</span>
      </span>
      <span style={{ fontSize: 9, color: C.text4, fontWeight: 600 }}>{typeLabel(p.type)}</span>
    </div>
  ));
})()}
        {contact.home_address && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.text3 }}><span style={{ color: C.text4 }}>⌂</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[contact.home_address.city, contact.home_address.region, (contact as any).zip || contact.home_address.postalCode || contact.home_address.zip].filter(Boolean).join(", ")}</span></div>}
        {contact.linkedin_url && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }} onClick={e => { e.stopPropagation(); window.open(contact.linkedin_url, "_blank"); }}><span style={{ color: C.text4 }}>in</span><span style={{ color: C.blue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>LinkedIn</span></div>}
      </div>
      {contact.topics && contact.topics.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {contact.topics.slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.bg3, color: C.text3, textTransform: "capitalize" }}>{t}</span>)}
          {contact.topics.length > 3 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.bg3, color: C.text4 }}>+{contact.topics.length - 3}</span>}
        </div>
      )}
      {(() => {
        const BLOCKED_TAGS = new Set(["business", "personal", "professional", "prospect", "work", "other", "general", "contact", "friend", "family", "customer", "vendor"]);
        const filteredTags = (contact.tags || []).filter((t: any) => t.confidence >= 80 && !BLOCKED_TAGS.has((t.value || t.tag).toLowerCase().replace(/_/g, " ")));
        return filteredTags.length > 0 ? (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {filteredTags.slice(0, 3).map((t: any, i: number) => <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.purpleLight, color: C.purple, fontWeight: 500 }}>{t.value || t.tag.replace(/_/g, " ")}</span>)}
            {filteredTags.length > 3 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.purpleLight, color: C.purple }}>+{filteredTags.length - 3}</span>}
          </div>
        ) : null;
      })()}
      {(contact.linkedin_url || contact.twitter_url || contact.instagram_url || contact.facebook_url) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {contact.linkedin_url && <button onClick={e => { e.stopPropagation(); window.open(contact.linkedin_url, "_blank"); }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.blue, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>in</button>}
          {contact.twitter_url && <button onClick={e => { e.stopPropagation(); window.open(contact.twitter_url, "_blank"); }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>X</button>}
          {contact.instagram_url && <button onClick={e => { e.stopPropagation(); window.open(contact.instagram_url, "_blank"); }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.pink, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>IG</button>}
          {contact.facebook_url && <button onClick={e => { e.stopPropagation(); window.open(contact.facebook_url, "_blank"); }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.blue, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>FB</button>}
        </div>
      )}
      {(contact.key_context || contact.notes) && <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{contact.key_context || contact.notes}</div>}
      {!isEngaged && whyNow && (
        <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, background: C.amberLight, padding: "4px 8px", borderRadius: 6 }}>
          {whyNow}
        </div>
      )}
      {/* Interactive bucket toggles */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" as const }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 9, color: C.text4, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Bucket:</span>
        {[
          { id: "personal", label: "Personal", color: "#bf5c38" },
          { id: "professional", label: "Professional", color: "#6b9970" },
          { id: "prospect", label: "Prospect", color: "#3b82f6" },
        ].map(b => {
          const active = (contact.dunbar_bucket || []).includes(b.id);
          return (
            <button key={b.id} onClick={() => {
              const current = contact.dunbar_bucket || [];
              const next = active ? current.filter(x => x !== b.id) : [...current, b.id];
              if (next.length === 0) return;
              onTierUpdate(contact.id, contact.dunbar_tier || 5, next, true);
            }}
              style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, border: "none",
                background: active ? b.color + "22" : C.bg3,
                color: active ? b.color : C.text4,
                cursor: "pointer", fontFamily: font, fontWeight: active ? 700 : 400,
                textTransform: "capitalize" as const }}>
              {b.label}
            </button>
          );
        })}
      </div>
      {/* Quick tier selector */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 9, color: C.text4, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Tier:</span>
        {[1,2,3,4].map(t => {
          const active = contact.dunbar_tier === t;
          const colors = ["#bf5c38","#6b9970","#2a6496","#6b5c9e"];
          const labels = ["C5","IC","A50","N150"];
          return (
            <button key={t} onClick={() => onTierUpdate(contact.id, t, contact.dunbar_bucket || [], true)}
              style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, border: "none",
                background: active ? colors[t-1] : C.bg3,
                color: active ? "#fff" : C.text4,
                cursor: "pointer", fontFamily: font, fontWeight: 600, transition: "all 0.1s" }}>
              {labels[t-1]}
            </button>
          );
        })}
      </div>
      </div>
      <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: `1px solid ${C.border}`, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={onReach} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none", background: isEngaged ? C.greenLight : C.green, color: isEngaged ? C.green : "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
          {isEngaged ? "Engaged ✓" : "Reach Out"}
        </button>
        <button onClick={onEdit} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Edit</button>
        {contact.email && (
          <button onClick={async e => {
            e.stopPropagation();
            const res = await fetch('/api/contacts/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contactIds: [contact.id], draftOnly: false })
            });
            const data = await res.json();
            if (data.sent > 0) alert(`✓ Verification sent to ${contact.email}`);
            else if (data.drafted > 0) alert(`Drafted — no email history with this contact yet`);
            else alert(data.message || 'Could not send verification');
          }} title="Send verification email" style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>✓?</button>
        )}
        <button onClick={onDelete} title="Delete contact" style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>🗑</button>
      </div>
    </div>
  );
}
// ── Log Purchase Modal ────────────────────────────────────────────────────────
function LogPurchaseModal({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: (updated: Partial<Contact>) => void }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ action: string; amount: number } | null>(null);

  const handleSave = async () => {
    const amt = parseInt(amount.replace(/[^0-9]/g, ""));
    if (!amt || amt <= 0) { alert("Please enter a valid amount"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/contacts/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id, amount: amt, notes: notes.trim() || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data);
        onSaved({ id: contact.id, last_purchase_amount: amt, last_purchase_at: new Date().toISOString() });
      }
    } catch {}
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 420, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Log a Purchase</div>
        <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>{contact.full_name}</div>
        {result ? (
          <div style={{ background: C.greenLight, borderRadius: 10, padding: 16, textAlign: "center" as const }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.green, marginBottom: 4 }}>
              ${result.amount.toLocaleString()} logged ✓
            </div>
            <div style={{ fontSize: 12, color: C.green }}>
              {result.action === "gift" ? "🎁 Gift queued for approval" : result.action === "card" ? "✉️ Thank-you card queued for approval" : "Purchase recorded"}
            </div>
            <button onClick={onClose} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const }}>Purchase Amount</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, color: C.text3 }}>$</span>
                <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 2500" autoFocus
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 15, fontFamily: font, outline: "none" }} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const }}>Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Annual order, promo products for event"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !amount}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: saving ? C.bg3 : C.green, color: saving ? C.text4 : "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: font }}>
                {saving ? "Saving..." : "Log Purchase"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
// ── Contact Detail Panel ─────────────────────────────────────────────────────
function ContactDetail({ contact, onClose, onReach, onEdit, onLogPurchase }: { contact: Contact; onClose: () => void; onReach: () => void; onEdit: () => void; onLogPurchase: () => void }) {
  const days = daysAgo(contact.last_emailed_at);
  const health = healthColor(contact.relationship_health);
  const tColor = tierColor(contact.relationship_type);
  const isMobile = useIsMobile();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? "100%" : 440, maxWidth: "100%", background: C.bg2, height: "100%", overflowY: "auto" as const, boxShadow: "-8px 0 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" as const }}>
        <div style={{ padding: "24px 24px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${tColor}33, ${tColor}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: tColor, flexShrink: 0 }}>{initials(contact.full_name)}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{contact.full_name}</div>
                <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{contact.job_title && contact.company ? `${contact.job_title} at ${contact.company}` : contact.company || contact.job_title || contact.email}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.text3, fontSize: 18, lineHeight: 1 }}>x</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {contact.relationship_type && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: tColor + "22", color: tColor, textTransform: "capitalize" as const }}>{contact.relationship_type.replace("_", " ")}</span>}
            {contact.relationship_health && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: health.bg, color: health.text }}>{contact.relationship_health}</span>}
            {contact.relationship_strength && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: C.bg3, color: C.text3 }}>Score {contact.relationship_strength}</span>}
            {contact.gifting_eligible && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: C.greenLight, color: C.green }}>Gift ready</span>}
          </div>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column" as const, gap: 20, flex: 1 }}>
          {contact.key_context && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Relationship Intelligence</div><div style={{ background: C.bg3, borderRadius: 10, padding: "14px 16px", fontSize: 13, color: C.text2, lineHeight: 1.7 }}>{contact.key_context}</div></div>}
          {contact.relationship_context && <div style={{ background: C.greenLight, borderRadius: 10, padding: "14px 16px", fontSize: 13, color: C.green, lineHeight: 1.6 }}>{contact.relationship_context}</div>}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 }}>Contact Info</div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {contact.email && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Email</span><a href={`mailto:${contact.email}`} style={{ color: C.blue, textDecoration: "none" }}>{contact.email}</a></div>}
              {contact.all_emails?.filter(e => e !== contact.email).map((e, i) => <div key={i} style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Alt email</span><a href={`mailto:${e}`} style={{ color: C.blue, textDecoration: "none" }}>{e}</a></div>)}
              {contact.phone && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Phone</span><a href={`tel:${contact.phone}`} style={{ color: C.blue, textDecoration: "none" }}>{contact.phone}</a></div>}
              {contact.home_address && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Home</span><span style={{ color: C.text2 }}>{[contact.home_address.streetAddress, contact.home_address.city, contact.home_address.region, contact.home_address.postalCode || contact.home_address.zip].filter(Boolean).join(", ")}</span></div>}
              {contact.work_address && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Work</span><span style={{ color: C.text2 }}>{[contact.work_address.streetAddress, contact.work_address.city, contact.work_address.region, contact.work_address.postalCode || contact.work_address.zip].filter(Boolean).join(", ")}</span></div>}
              {contact.birthday && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Birthday</span><span style={{ color: C.text2 }}>{(() => { const b = contact.birthday; if (b.startsWith("0000-")) { const [,m,d] = b.split("-"); return `${parseInt(m)}/${parseInt(d)}`; } const [y,m,d] = b.split("-"); return `${parseInt(m)}/${parseInt(d)}/${y}`; })()}</span></div>}
              {contact.best_channel && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Best via</span><span style={{ color: C.text2, textTransform: "capitalize" as const }}>{contact.best_channel}</span></div>}
              {contact.linkedin_url && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>LinkedIn</span><a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }}>View Profile</a></div>}
              {contact.twitter_url && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Twitter</span><a href={contact.twitter_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }}>View Profile</a></div>}
              {contact.instagram_url && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Instagram</span><a href={contact.instagram_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }}>View Profile</a></div>}
              {contact.facebook_url && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Facebook</span><a href={contact.facebook_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none" }}>View Profile</a></div>}
              {contact.industry && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Industry</span><span style={{ color: C.text2 }}>{contact.industry}</span></div>}
              {contact.seniority && <div style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ color: C.text4, width: 80, flexShrink: 0 }}>Seniority</span><span style={{ color: C.text2, textTransform: "capitalize" as const }}>{contact.seniority.replace("_", " ")}</span></div>}
            </div>
          </div>
          {contact.tags && contact.tags.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Intelligence Tags</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {contact.tags.filter((t: any) => t.confidence >= 80).map((t: any, i: number) => <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: C.purpleLight, color: C.purple, fontWeight: 500 }}>{t.value || t.tag.replace(/_/g, " ")}</span>)}
                {contact.tags.filter((t: any) => t.confidence < 80).map((t: any, i: number) => <span key={`low-${i}`} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: C.bg3, color: C.text4, fontWeight: 400 }}>{t.value || t.tag.replace(/_/g, " ")} ({t.confidence}%)</span>)}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 }}>Interaction History</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[{ label: "Emails", value: contact.email_count || 0 }, { label: "Last contact", value: days < 999 ? formatDaysAgo(days) : "—" }, { label: "Events", value: contact.shared_events?.length || 0 }].map(s => <div key={s.label} style={{ background: C.bg3, borderRadius: 8, padding: "12px", textAlign: "center" as const }}><div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{s.value}</div><div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{s.label}</div></div>)}
            </div>
          </div>
          {contact.topics && contact.topics.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Topics</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>{contact.topics.map(t => <span key={t} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: C.bg3, color: C.text2, textTransform: "capitalize" as const }}>{t}</span>)}</div></div>}
          {contact.notes && <div><div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>Notes</div><div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>{contact.notes}</div></div>}
          {contact.classifier_confidence && <div style={{ fontSize: 11, color: C.text4 }}>AI confidence: {contact.classifier_confidence}% · Last classified {daysAgo(contact.last_classified_at)}d ago</div>}
        </div>
        <div style={{ padding: 20, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
          <button onClick={onReach} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Reach Out</button>
          <button onClick={onEdit} style={{ flex: 1, padding: "12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Edit</button>
          <button onClick={onLogPurchase} style={{ flex: 1, padding: "12px", borderRadius: 8, border: `1px solid ${C.green}`, background: C.greenLight, color: C.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>$ Purchase</button>
        </div>
      </div>
    </div>
  );
}

// ── Reach Out Panel ──────────────────────────────────────────────────────────
function ReachOutPanel({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const [mode, setMode] = useState<"email" | "card">("email");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [generating, setGenerating] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cardOccasion, setCardOccasion] = useState("");
  const [cardSent, setCardSent] = useState(false);
  const [cardQueued, setCardQueued] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
const [scheduled, setScheduled] = useState(false);
const [emailProvider, setEmailProvider] = useState<"google" | "microsoft">("google");
const [draftMeta, setDraftMeta] = useState<{ confidence: number; mode: "personal" | "generic"; hint?: string } | null>(null);
const firstName = contact.full_name.split(" ")[0];

useEffect(() => {
  fetch("/api/auth/me")
    .then(r => r.json())
    .then(d => setEmailProvider((d.primary_email_provider as "google" | "microsoft") || "google"))
    .catch(() => {});
}, []);

  const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };
  const OCCASIONS = ["Thinking of you", "Thank you", "Congratulations", "Happy Birthday", "Just because", "Other"];

  useEffect(() => {
    if (mode !== "card") generateMessage();
  }, [contact.id]);

   const generatingRef = useRef<"email" | "card" | null>(null);

  const generateMessage = async (occasion?: string) => {
    generatingRef.current = "email";
    setGenerating(true);
    try {
      const res = await fetch("/api/relationships/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_name: contact.full_name, relationship_type: contact.relationship_type, relationship_health: contact.relationship_health, key_context: contact.key_context, days_since_contact: daysAgo(contact.last_emailed_at), next_action: contact.relationship_context, contact_id: contact.id, occasion: occasion || undefined }),
      });
      const data = await res.json();
      // Don't overwrite if we've switched to card mode
      if (generatingRef.current !== "email") return;
      setMessage(data.message || `Hey ${firstName} — wanted to say hello and see how you're doing.`);
      setSubject(data.subject || `Hey`);
      if (typeof data.confidence === "number") {
        setDraftMeta({ confidence: data.confidence, mode: data.mode || "personal", hint: data.hint });
      }
    } catch { 
      if (generatingRef.current !== "email") return;
      setMessage(`Hey ${firstName} — wanted to say hello and see how you're doing.`); 
      setSubject(`Hey`); 
    }
    setGenerating(false);
  };

  const handleSendEmail = async () => {
    if (!contact.email) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_id: contact.id, contact_email: contact.email, contact_name: contact.full_name, subject, body: message }) });
      const data = await res.json();
      if (data.success) setSent(true); else alert(`Failed to send — check your ${emailProvider === "microsoft" ? "Outlook" : "Gmail"} connection in Settings`);
    } catch { alert("Failed to send email"); }
    setSending(false);
  };

  const handleSchedule = async () => {
    if (!scheduleDate || !contact.email) return;
    const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    try {
      const res = await fetch("/api/email/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_id: contact.id, contact_email: contact.email, contact_name: contact.full_name, subject, body: message, scheduled_for: scheduledFor }) });
      const data = await res.json();
      if (data.success) setScheduled(true);
    } catch { alert("Failed to schedule email"); }
  };

 const handleSendCard = async () => {
    if (!cardOccasion) return;
    
    // Validate address before sending
    if (contact.home_address) {
      const addr = contact.home_address;
      const missing = [];
      if (!addr.streetAddress) missing.push("street address");
      if (!addr.city) missing.push("city");
      if (!addr.region) missing.push("state");
      if (!addr.postalCode && !addr.zip) missing.push("zip code");
      if (missing.length > 0) {
        alert(`This contact's address is incomplete — missing: ${missing.join(", ")}. Please update their address in Edit before sending.`);
        return;
      }
    }
    
    setSending(true);
    try {
      const res = await fetch("/api/cards/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id, contact_name: contact.full_name, occasion: cardOccasion, message, address: contact.home_address, trigger_type: "manual", requires_approval: !contact.home_address }),
      });
      const data = await res.json();
    if (data.ok && data.requires_approval) {
        setCardSent(true); // reuse this state but update the success message
      } else if (data.ok && data.requires_approval) {
        setCardQueued(true);
        setCardSent(true);
      } else if (data.ok) {
        setCardSent(true);
      } else if (data.needs_setup) {
        setShowPaymentModal(true);
      } else if (data.missing_address) {
        alert("This contact needs a home address before you can send a card. Add it in their Edit panel.");
      } else if (data.details?.message) {
        alert(`Card couldn't send: ${data.details.message}`);
      } else if (data.error) {
        alert(`Card couldn't send: ${data.error}`);
      }
    } catch (e) {
      alert("Dohh, Something went wrong sending the card. Lrt's try again.");
    }
    setSending(false);
  };

  if (sent) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 560, padding: 32, boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Email sent to {firstName}!</div>
        <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>It'll show up in your {emailProvider === "microsoft" ? "Outlook" : "Gmail"} sent folder.</div>
        <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Done</button>
      </div>
    </div>
  );

  if (scheduled) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 560, padding: 32, boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Email scheduled!</div>
        <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>Will send to {firstName} on {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {scheduleTime}.</div>
        <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Done</button>
      </div>
    </div>
  );

  if (cardSent) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 560, padding: 32, boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          {cardQueued ? "Card queued for approval ✓" : `Card on its way to ${firstName}!`}
        </div>
        <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>
          {cardQueued ? "Check the Approvals section on your dashboard to review and send." : "Handwritten and mailed via Handwrytten."}
        </div>
        <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.bg2, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 580, padding: 24, paddingBottom: "calc(24px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Reach out to {firstName}</div>
          <button onClick={onClose} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.text3, fontSize: 18 }}>x</button>
        </div>

        {/* Send Card / Send Gift buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setMode("card"); setMessage(""); setGenerating(false); generatingRef.current = "card"; }}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1.5px solid ${C.green}`, background: C.greenLight, color: C.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            Send Card
          </button>
          <button disabled
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text4, fontSize: 13, cursor: "not-allowed", fontFamily: font }}>
            Send Gift
          </button>
        </div>

        {mode === "card" ? (
          <>
            {!contact.home_address && (
              <div style={{ background: C.amberLight, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.amber }}>
                ⚠️ No home address on file — card will be queued for your approval before sending
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={lStyle}>What's the occasion?</label>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                {OCCASIONS.map(o => (
                      <button key={o} onClick={async () => { 
                        setCardOccasion(o); 
                        setGenerating(true);
                        setMessage("");
                        generatingRef.current = "card";
                        try {
                          const res = await fetch("/api/relationships/draft", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                              contact_name: contact.full_name, 
                              relationship_type: contact.relationship_type, 
                              key_context: contact.key_context, 
                              contact_id: contact.id,
                              occasion: o,
                            }),
                          });
                          const data = await res.json();
                          setMessage(data.message || "wishing you all the best.");
                        } catch { setMessage("wishing you all the best."); }
                        setGenerating(false);
                      }}
                    style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${cardOccasion === o ? C.terra : C.border2}`, background: cardOccasion === o ? `${C.terra}18` : C.bg3, color: cardOccasion === o ? C.terra : C.text3, fontSize: 12, fontWeight: cardOccasion === o ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                    {cardOccasion === o ? "✓ " : ""}{o}
                  </button>
                ))}
              </div>
            </div>
            {cardOccasion && (
              <>
                {generating ? (
                  <div style={{ background: C.bg3, borderRadius: 8, padding: 12, fontSize: 13, color: C.text3, marginBottom: 12 }}>Drafting your card message...</div>
                ) : (
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                    style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: C.text, fontFamily: font, resize: "none" as const, outline: "none", boxSizing: "border-box" as const, lineHeight: 1.6, marginBottom: 12 }} />
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleSendCard} disabled={sending || generating}
                    style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: sending ? C.greenLight : C.green, color: sending ? C.green : "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer", fontFamily: font }}>
                    {sending ? "Sending..." : contact.home_address ? "Send Card" : "Queue for Approval"}
                  </button>
                  <button onClick={async () => {
                    setGenerating(true);
                    setMessage("");
                    try {
                      const res = await fetch("/api/relationships/draft", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contact_name: contact.full_name, relationship_type: contact.relationship_type, key_context: contact.key_context, contact_id: contact.id, occasion: cardOccasion }),
                      });
                      const data = await res.json();
                      setMessage(data.message || "wishing you all the best.");
                    } catch { setMessage("wishing you all the best."); }
                    setGenerating(false);
                  }} disabled={generating}
                    style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 13, cursor: "pointer", fontFamily: font }}>↻</button>
                </div>
                <button onClick={() => setMode("email")} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: C.text4, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: font }}>
                  Switch to email instead
                </button>
              </>
            )}
            {!cardOccasion && (
              <button onClick={() => setMode("email")} style={{ width: "100%", marginTop: 4, background: "none", border: "none", color: C.text4, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: font }}>
                Switch to email instead
              </button>
            )}
          </>
        ) : (
          <>
            {generating ? (
              <div style={{ background: C.bg3, borderRadius: 8, padding: 16, fontSize: 13, color: C.text3, marginBottom: 16 }}>Drafting personalized message...</div>
            ) : (
              <>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }} />
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: C.text, fontFamily: font, resize: "none" as const, outline: "none", boxSizing: "border-box" as const, lineHeight: 1.6, marginBottom: 8 }} />
                {draftMeta && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                    padding: "8px 12px", borderRadius: 8,
                    background: draftMeta.mode === "personal" 
                      ? (draftMeta.confidence >= 0.85 ? C.greenLight : C.blueLight)
                      : C.amberLight,
                    border: `1px solid ${draftMeta.mode === "personal"
                      ? (draftMeta.confidence >= 0.85 ? C.green + "44" : C.blue + "44")
                      : C.amber + "44"}`,
                  }}>
                    <span style={{ 
                      fontSize: 11, fontWeight: 700,
                      color: draftMeta.mode === "personal" 
                        ? (draftMeta.confidence >= 0.85 ? C.green : C.blue)
                        : C.amber,
                    }}>
                      {draftMeta.mode === "personal" 
                        ? (draftMeta.confidence >= 0.85 ? "✦ Highly Personal" : "✓ Personalized")
                        : "💬 Generic"}
                    </span>
                    <span style={{ fontSize: 11, color: C.text3 }}>
                      {Math.round(draftMeta.confidence * 100)}% confidence
                    </span>
                    {draftMeta.hint && (
                      <span style={{ fontSize: 10, color: C.text4, marginLeft: "auto", textAlign: "right" as const, maxWidth: 280 }}>
                        {draftMeta.hint}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
            {showSchedule && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <input type="date" value={scheduleDate} min={new Date().toISOString().split("T")[0]} onChange={e => setScheduleDate(e.target.value)} style={{ flex: 2, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none" }} />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none" }} />
                <button onClick={handleSchedule} disabled={!scheduleDate} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: scheduleDate ? C.blue : C.bg3, color: scheduleDate ? "#fff" : C.text4, fontSize: 13, fontWeight: 600, cursor: scheduleDate ? "pointer" : "default", fontFamily: font }}>Schedule</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {(() => {
                const cellPhone = contact.phones?.find(p => p.type === "cell")?.number || (contact.phones?.length ? null : contact.phone);
                return cellPhone ? (
                  <button onClick={() => window.open(`sms:${cellPhone}?body=${encodeURIComponent(message)}`)}
                    style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Text</button>
                ) : null;
              })()}
              {contact.email && <button onClick={handleSendEmail} disabled={sending || generating} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: sending ? C.greenLight : C.green, color: sending ? C.green : "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer", fontFamily: font }}>{sending ? "Sending..." : "Send Email"}</button>}
              <button onClick={() => setShowSchedule(!showSchedule)} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${showSchedule ? C.blue : C.border2}`, background: showSchedule ? C.blueLight : C.bg2, color: showSchedule ? C.blue : C.text3, fontSize: 13, cursor: "pointer", fontFamily: font }}>Later</button>
              <button onClick={() => generateMessage(cardOccasion)} disabled={generating} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 13, cursor: "pointer", fontFamily: font }}>↻</button>
            </div>
            {contact.email && <div style={{ textAlign: "center", marginTop: 12 }}>
  <button onClick={() => {
    const url = emailProvider === "microsoft"
      ? `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(contact.email!)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
      : `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(contact.email!)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }} style={{ background: "none", border: "none", color: C.text4, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: font }}>
    Open in {emailProvider === "microsoft" ? "Outlook" : "Gmail"} instead
  </button>
</div>}
          </>
        )}
      </div>
    </div>
  );
}
// ── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [liveFiltered, setLiveFiltered] = useState<Contact[] | null>(null);
  const [searchIndex, setSearchIndex] = useState<Contact[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [filterHealth, setFilterHealth] = useState("all");
  const [filterGiftReady, setFilterGiftReady] = useState(false);
  const [filterNeedsAttention, setFilterNeedsAttention] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [reachContact, setReachContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [purchaseContact, setPurchaseContact] = useState<Contact | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showClean, setShowClean] = useState(false);
const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [aiSearchResults, setAiSearchResults] = useState<any[] | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<any>(null);
const [actionPreview, setActionPreview] = useState<any>(null);
  const [actionExecuting, setActionExecuting] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [bulkTag, setBulkTag] = useState<string>("");
  const [bulkExecuting, setBulkExecuting] = useState(false);
  const [mergeCount, setMergeCount] = useState<number | null>(null);
  const [showHopperModal, setShowHopperModal] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [emailProvider, setEmailProvider] = useState<"google" | "microsoft">("google");
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingContacts, setPendingContacts] = useState<any[]>([]);
  const [activeChips, setActiveChips] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 252;
  const loadContactsWithChips = async (chips: Set<string>, pageNum: number = 0) => {
  setLoading(true);
  try {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageNum * PAGE_SIZE));

    const activeTier = ["tier_1","tier_2","tier_3","tier_4","tier_5"].find(t => chips.has(t));
    if (activeTier) params.set("tier", activeTier.replace("tier_", ""));
    const activeBucket = ["bucket_personal","bucket_professional","bucket_prospect"].find(b => chips.has(b));
    if (activeBucket) params.set("bucket", activeBucket.replace("bucket_", ""));
    const activeType = ["friends","customers","family","vendors","colleagues"].find(t => chips.has(t));
    if (activeType) params.set("type", activeType);
    if (chips.has("needs_attention")) params.set("needs_attention", "true");

    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    const newContacts = data.contacts || [];
    setContacts(newContacts);
    setTotalCount(data.total || 0);
    setHasMore(data.has_more || false);
  } catch (e) { console.error(e); }
  setLoading(false);
};

  useEffect(() => {
  fetch("/api/contacts?limit=5000&offset=0")
    .then(r => r.json())
    .then(d => setSearchIndex(d.contacts || []))
    .catch(() => {});
  fetch("/api/contacts/merge-queue")
    .then(r => r.json())
    .then(d => setMergeCount(d.items?.length || 0))
    .catch(() => {});

  // Load provider first, then load the right pending count
  fetch("/api/auth/me")
    .then(r => r.json())
    .then(d => {
      const provider = (d.primary_email_provider as "google" | "microsoft") || "google";
      setEmailProvider(provider);
      const pendingUrl = provider === "microsoft" 
        ? "/api/contacts/microsoft-pending" 
        : "/api/contacts/google-pending";
      return fetch(pendingUrl);
    })
    .then(r => r?.json())
    .then(d => setPendingCount(d?.count || 0))
    .catch(() => {});
}, []);

useEffect(() => {
  localStorage.removeItem(CACHE_KEY);
  loadContactsWithChips(activeChips, page);
}, [page, activeChips]);

const loadContacts = async (type = "all", health = "all", gift = false, attention = false, forceRefresh = false) => {
  const currentPage = forceRefresh ? 0 : page;

  if (!forceRefresh && !gift) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp, total } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL && data.length > 0) {
          setContacts(data);
          setTotalCount(total || data.length);
          setHasMore(data.length < (total || data.length));
          setLoading(false);
          return;
        }
      }
    } catch (e) {}
  }

  setLoading(true);
  if (forceRefresh) setPage(0);

  try {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(currentPage * PAGE_SIZE));
    if (gift) params.set("eligible", "true");

    // Pass active filters server-side
    const activeTier = ["tier_1","tier_2","tier_3","tier_4","tier_5"].find(t => activeChips.has(t));
    if (activeTier) params.set("tier", activeTier.replace("tier_", ""));
    const activeBucket = ["bucket_personal","bucket_professional","bucket_prospect"].find(b => activeChips.has(b));
    if (activeBucket) params.set("bucket", activeBucket.replace("bucket_", ""));
    const activeType = ["friends","customers","family","vendors","colleagues"].find(t => activeChips.has(t));
    if (activeType) params.set("type", activeType);
    if (activeChips.has("needs_attention")) params.set("needs_attention", "true");

    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    const newContacts = data.contacts || [];
    const total = data.total || 0;

    setContacts(newContacts);
    setTotalCount(total);
    setHasMore(data.has_more || false);

    if (!gift && newContacts.length > 0) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: newContacts,
          timestamp: Date.now(),
          total,
        }));
      } catch (e) {}
    }
  } catch (e) { console.error(e); }
  setLoading(false);
};

const handlePullFromProvider = async () => {
  setSyncing(true); setSyncResult(null);
  try {
    if (emailProvider === "microsoft") {
      const res = await fetch("/api/contacts/microsoft-sync");
      const data = await res.json();
      setSyncResult({ synced: data.synced || 0, birthdays: 0, direction: "pull" });
      fetch("/api/contacts/microsoft-pending")
        .then(r => r.json())
        .then(d => setPendingCount(d.count || 0))
        .catch(() => {});
    } else {
      let pageToken = ""; let totalSynced = 0; let totalBirthdays = 0; let pages = 0;
      do {
        const url = `/api/contacts/google-sync${pageToken ? `?pageToken=${pageToken}` : ""}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.sync_token_expired) break;
        totalSynced += data.synced || 0;
        totalBirthdays += data.birthdays_found || 0;
        pageToken = data.nextPageToken || "";
        pages++;
      } while (pageToken && pages < 300);
      setSyncResult({ synced: totalSynced, birthdays: totalBirthdays, direction: "pull" });
      fetch("/api/contacts/google-pending")
        .then(r => r.json())
        .then(d => setPendingCount(d.count || 0))
        .catch(() => {});
    }
    localStorage.removeItem(CACHE_KEY);
    loadContacts("all", "all", false, false, true);
  } catch (e) { console.error(e); }
  setSyncing(false);
};

const handlePushToProvider = async () => {
  setPushing(true);
  try {
    const endpoint = emailProvider === "microsoft" 
      ? "/api/contacts/microsoft-backfill" 
      : "/api/contacts/google-backfill";
    const res = await fetch(endpoint, { method: "POST" });
    const data = await res.json();
    setSyncResult({ 
      pushed: data.pushed || data.missing || 0, 
      direction: "push",
      queued: data.queued || false,
    });
  } catch (e) { console.error(e); }
  setPushing(false);
};

  const handleSaveEdit = async (updated: Partial<Contact>) => {
    if (!editContact) return;
    const res = await fetch(`/api/contacts/${editContact.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    const data = await res.json();
    const savedContact = data.contact ? { ...editContact, ...data.contact } : { ...editContact, ...updated };
    setContacts(cs => {
      const next = cs.map(c => c.id === editContact.id ? savedContact : c);
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.data = next;
          localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}
      return next;
    });
    setSelectedContact(null);
    setEditContact(null);
  };

  const handleTierUpdate = async (id: string, tier: number, buckets: string[], override: boolean) => {
    const updates: any = {
      dunbar_tier: tier || null,
      dunbar_bucket: buckets,
      tier_override: override,
    };
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setContacts(cs => {
      const next = cs.map(c => c.id === id ? { ...c, ...updates } : c);
      if (aiSearchResults) {
        setAiSearchResults(prev => prev ? prev.map(c => c.id === id ? { ...c, ...updates } : c) : prev);
      }
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.data = next;
          localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}
      return next;
    });
  };

  const handleAddContact = async (newContact: Partial<Contact>) => {
    const res = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newContact) });
    const data = await res.json();
    if (data.contact) setContacts(cs => [data.contact, ...cs]);
    localStorage.removeItem(CACHE_KEY);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/contacts/google-sync?contact_id=${deleteTarget.id}`, { method: "DELETE" });
    setContacts(cs => cs.filter(c => c.id !== deleteTarget.id));
    if (selectedContact?.id === deleteTarget.id) setSelectedContact(null);
    setDeleteTarget(null);
    localStorage.removeItem(CACHE_KEY);
  };

  const handleAiSearch = async () => {
    if (!search.trim()) return;
    setAiSearching(true);
    setAiSearchResults(null);
    setAiSearchQuery(search.trim());
    try {
      const res = await fetch("/api/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: search.trim() }),
      });
      const data = await res.json();
      setAiSearchResults(data.results || []);
    } catch (e) { console.error(e); setAiSearchResults([]); }
    setAiSearching(false);
  };

const clearAiSearch = () => {
    setAiSearchResults(null);
    setActionPreview(null);
    setAiSearchQuery("");
    setSearch("");
    setAiMode(false);
    setLiveFiltered(null);
  };

const handleSearch = async (q: string, searchMode: "search" | "ai" = "search") => {
    if (!q.trim()) { clearAiSearch(); return; }
    setAiSearching(true);
    setAiSearchResults(null);
    setActionPreview(null);
    setAiSearchQuery(q.trim());
    try {
      const res = await fetch("/api/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ query: q.trim(), mode: searchMode }),
      });
      const data = await res.json();
      if (data.mode === "action") {
        setActionPreview(data);
        setExcludedIds(new Set());
        setAiSearchResults(null);
      } else {
        setAiSearchResults(data.results || []);
      }
    } catch (e) { console.error(e); setAiSearchResults([]); }
    setAiSearching(false);
  };

  const handleExecuteAction = async () => {
    if (!actionPreview) return;
    const contactIds = actionPreview.affected
      .filter((c: any) => !excludedIds.has(c.id))
      .map((c: any) => c.id);
    if (contactIds.length === 0) return;
    setActionExecuting(true);
    try {
      const res = await fetch("/api/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execute: true,
          action: { intent: actionPreview.intent, params: actionPreview.params },
          contact_ids: contactIds,
        }),
      });
      const data = await res.json();
      setActionPreview(null);
      setSearch("");
      localStorage.removeItem(CACHE_KEY);
      loadContacts("all", "all", false, false, true);
      alert(`Done — ${data.updated} contacts updated`);
    } catch (e) { alert("Action failed"); }
    setActionExecuting(false);
  };
  const toggleChip = (chip: string) => {
    setActiveChips(prev => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
    localStorage.removeItem(CACHE_KEY);
    setPage(0);
  };

const toggleSelectMode = () => { setSelectMode(s => !s); setSelectedIds(new Set()); };
  const toggleSelectContact = (id: string) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelectedIds(new Set((aiSearchResults || contacts).map((c: any) => c.id)));

  const handleBulkDelete = async () => {
    if (!confirm(`Permanently delete ${selectedIds.size} contacts? This cannot be undone.`)) return;
    setBulkExecuting(true);
    for (const id of Array.from(selectedIds)) {
      await fetch(`/api/contacts/google-sync?contact_id=${id}`, { method: "DELETE" });
    }
    setContacts(cs => cs.filter(c => !selectedIds.has(c.id)));
    if (aiSearchResults) setAiSearchResults(prev => prev ? prev.filter(c => !selectedIds.has(c.id)) : null);
    setSelectedIds(new Set());
    setSelectMode(false);
    localStorage.removeItem(CACHE_KEY);
    setBulkExecuting(false);
  };
const handleBulkSetTier = async (tier: number) => {
    if (!tier) return;
    if (tier === 1) {
      const currentCore = contacts.filter(c => c.dunbar_tier === 1 && !selectedIds.has(c.id)).length;
      if (currentCore + selectedIds.size > 5) {
        if (!confirm(`This will put ${currentCore + selectedIds.size} contacts in Core 5, exceeding the recommended cap of 5. Dunbar's research suggests this dilutes your closest relationships. Continue anyway?`)) return;
      }
    }
    setBulkExecuting(true);
    for (const id of Array.from(selectedIds)) {
      await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dunbar_tier: tier, tier_override: true }) });
    }
    setContacts(cs => cs.map(c => selectedIds.has(c.id) ? { ...c, dunbar_tier: tier, tier_override: true } : c));
    setSelectedIds(new Set());
    setSelectMode(false);
    localStorage.removeItem(CACHE_KEY);
    setBulkExecuting(false);
  };

  const handleBulkToggleBucket = async (bucket: string) => {
    if (!bucket) return;
    setBulkExecuting(true);
    for (const id of Array.from(selectedIds)) {
      const contact = contacts.find(c => c.id === id);
      const current = contact?.dunbar_bucket || [];
      const next = current.includes(bucket)
        ? current.filter(b => b !== bucket)
        : [...current, bucket];
      if (next.length === 0) continue;
      await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dunbar_bucket: next, tier_override: true }) });
      setContacts(cs => cs.map(c => c.id === id ? { ...c, dunbar_bucket: next } : c));
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    localStorage.removeItem(CACHE_KEY);
    setBulkExecuting(false);
  };

  const handleBulkSetType = async (type: string) => {
    if (!type) return;
    setBulkExecuting(true);
    for (const id of Array.from(selectedIds)) {
      await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationship_type: type }) });
    }
    setContacts(cs => cs.map(c => selectedIds.has(c.id) ? { ...c, relationship_type: type } : c));
    setSelectedIds(new Set());
    setSelectMode(false);
    localStorage.removeItem(CACHE_KEY);
    setBulkExecuting(false);
  };

const handleBulkAddTag = async (tag: string) => {
    if (!tag.trim()) return;
    setBulkExecuting(true);
    for (const id of Array.from(selectedIds)) {
      const contact = contacts.find(c => c.id === id);
      const existingTags = contact?.tags || [];
      const newTag = { tag: tag.trim(), value: tag.trim(), confidence: 100, source: "manual" };
      await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: [...existingTags, newTag] }) });
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    localStorage.removeItem(CACHE_KEY);
    setBulkExecuting(false);
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      // Run all three in parallel
      const [calRes, sigRes, apolloRes] = await Promise.allSettled([
        fetch("/api/contacts/enrich-signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "calendar", batch_size: 200 }),
        }).then(r => r.json()),
        fetch("/api/contacts/enrich-signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "signatures", batch_size:250 }),
        }).then(r => r.json()),
        fetch("/api/contacts/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_size: 30 }),
        }).then(r => r.json()),
      ]);

      const cal = calRes.status === "fulfilled" ? calRes.value : {};
      const sig = sigRes.status === "fulfilled" ? sigRes.value : {};

      setEnrichResult({
        calendar: cal.calendar?.contacts_updated || 0,
        signatures: sig.signatures?.updated || 0,
        events: cal.calendar?.events_processed || 0,
      });

      // Reload contacts to show new data
      localStorage.removeItem(CACHE_KEY);
      loadContacts("all", "all", false, false, true);
    } catch (e) {
      console.error(e);
    }
    setEnriching(false);
    setTimeout(() => setEnrichResult(null), 8000);
  };

  const needsAttentionCount = contacts.filter(c => daysAgo(c.last_emailed_at) >= 90).length;

// All filtering + search is fully client-side for instant results
let filtered = contacts;

// Keep existing needs attention filter for the stat card click
if (filterNeedsAttention && !activeChips.has("needs_attention")) {
  filtered = filtered.filter(c => daysAgo(c.last_emailed_at) >= 90);
}
if (filterGiftReady) filtered = filtered.filter(c => c.gifting_eligible || c.home_address);

  const displayContacts = aiSearchResults
    ? sortContacts(aiSearchResults.map(r => contacts.find(c => c.id === r.id) ? { ...contacts.find(c => c.id === r.id)!, match_reason: r.match_reason, is_ai_match: r.is_ai_match } : r), sortBy)
    : liveFiltered !== null
    ? sortContacts(liveFiltered, sortBy)
    : sortContacts(filtered, sortBy);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
     <Sidebar activeId="contacts" />

      <main style={{ flex: 1, padding: isMobile ? "16px 14px" : "24px 32px", overflowY: "auto" as const, width: isMobile ? "100%" : "auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between", marginBottom: isMobile ? 16 : 24, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: C.text }}>Contacts</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{totalCount.toLocaleString()} contacts</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: isMobile ? "wrap" as const : "nowrap" as const, overflowX: isMobile ? "auto" as const : "visible" as const, paddingBottom: isMobile ? 4 : 0 }}>
            <button onClick={handleEnrich} disabled={enriching}
              style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: enriching ? C.bg3 : C.purple, color: enriching ? C.text4 : "#fff", fontSize: 13, fontWeight: 600, cursor: enriching ? "default" : "pointer", fontFamily: font, transition: "all 0.15s" }}>
              {enriching ? "Enriching..." : "⚡ Enrich"}
            </button>
           <button onClick={handlePushToProvider} disabled={pushing}
  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: pushing ? C.bg3 : C.green, color: pushing ? C.text4 : "#fff", fontSize: 13, fontWeight: 600, cursor: pushing ? "default" : "pointer", fontFamily: font }}>
  {pushing ? "Pushing..." : `↑ Push to ${emailProvider === "microsoft" ? "Outlook" : "Google"}`}
</button>
<button onClick={pendingCount > 0 ? async () => {
  setShowPendingModal(true);
  const endpoint = emailProvider === "microsoft" 
    ? "/api/contacts/microsoft-pending" 
    : "/api/contacts/google-pending";
  const res = await fetch(endpoint);
  const data = await res.json();
  setPendingContacts(data.contacts || []);
} : handlePullFromProvider} disabled={syncing}
  style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${pendingCount > 0 ? C.amber : C.border2}`, background: syncing ? C.bg3 : pendingCount > 0 ? C.amberLight : C.bg2, color: syncing ? C.text4 : pendingCount > 0 ? C.amber : C.text2, fontSize: 13, fontWeight: 700, cursor: syncing ? "default" : "pointer", fontFamily: font }}>
  {syncing ? "Pulling..." : pendingCount > 0 ? `Approve Contacts (${pendingCount})` : `↓ Pull from ${emailProvider === "microsoft" ? "Outlook" : "Google"}`}
</button>
            <button onClick={() => setShowClean(true)}
              style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.redLight}`, background: C.redLight, color: C.red, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
              Clean
            </button>
            <button
              onClick={() => router.push("/merge-review")}
              style={{ position: "relative", padding: "10px 18px", borderRadius: 8, border: `1px solid ${mergeCount ? C.green : C.border2}`, background: mergeCount ? C.greenLight : C.bg2, color: mergeCount ? C.green : C.text2, fontSize: 13, fontWeight: mergeCount ? 700 : 400, cursor: "pointer", fontFamily: font, transition: "all 0.15s" }}>
              Merge
              {mergeCount !== null && mergeCount > 0 && (
                <span style={{ position: "absolute", top: -8, right: -8, background: C.green, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 6px", minWidth: 18, textAlign: "center", lineHeight: 1.4 }}>
                  {mergeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {syncResult && (
          <div style={{ background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: C.green }}>
            {syncResult.direction === "push"
              ? syncResult.queued
                ? `Queued ${syncResult.pushed} contacts for ${emailProvider === "microsoft" ? "Outlook" : "Google"} sync. Running in background — should finish in ~${Math.ceil((syncResult.pushed * 0.5) / 60)} minutes.`
                : `Push started — ${syncResult.pushed} contacts queued for ${emailProvider === "microsoft" ? "Outlook" : "Google"} sync`
              : `Pulled from ${emailProvider === "microsoft" ? "Outlook" : "Google"} — ${syncResult.synced} new contacts${syncResult.birthdays ? ` · ${syncResult.birthdays} birthdays found` : ""}`}
          </div>
        )}

        {enrichResult && (
          <div style={{ background: C.purpleLight, border: `1px solid ${C.purple}44`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: C.purple }}>
            Enrichment complete — {enrichResult.calendar} contacts updated from {enrichResult.events} calendar events · {enrichResult.signatures} signatures parsed
          </div>
        )}

        {enriching && (
          <div style={{ background: C.purpleLight, border: `1px solid ${C.purple}44`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: C.purple }}>
            Running enrichment — scanning calendar events, parsing email signatures, extracting intelligence...
          </div>
        )}

        {/* Stats row: 4 cards including Hopper — 2×2 on mobile, 4 across on desktop */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 8 : 12, marginBottom: isMobile ? 16 : 24 }}>
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{totalCount.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>Total Contacts</div>
          </div>
          <div onClick={() => { const next = !filterNeedsAttention; setFilterNeedsAttention(next); }} style={{ background: filterNeedsAttention ? C.amberLight : C.bg2, border: `1px solid ${filterNeedsAttention ? C.amber : C.border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={e => { if (!filterNeedsAttention) { e.currentTarget.style.borderColor = C.amber; e.currentTarget.style.background = "#fff8e6"; } }} onMouseLeave={e => { if (!filterNeedsAttention) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg2; } }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: filterNeedsAttention ? C.amber : needsAttentionCount > 0 ? C.amber : C.text }}>{needsAttentionCount}</div>
            <div style={{ fontSize: 12, color: filterNeedsAttention ? C.amber : C.text3, marginTop: 2, fontWeight: filterNeedsAttention ? 700 : 400 }}>{filterNeedsAttention ? "Active filter" : "Needs Attention"}</div>
            <div style={{ fontSize: 10, color: C.text4, marginTop: 1 }}>90+ days no contact</div>
          </div>
          <div onClick={() => setShowAddContact(true)} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", justifyContent: "center" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.background = C.greenLight; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg2; }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.green }}>+</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>Add Contact</div>
          </div>
          <HopperCard onDone={() => { localStorage.removeItem(CACHE_KEY); loadContacts("all", "all", false, false, true); }} onOpenModal={() => setShowHopperModal(true)} />
        </div>

{/* Search + Filters — on mobile: search is full-width on its own row, controls scroll horizontally below */}
        <div style={{ display: "flex", gap: isMobile ? 8 : 10, marginBottom: isMobile ? 14 : 20, flexWrap: "wrap" as const }}>
          <div style={{ flex: 1, minWidth: isMobile ? "100%" : 200, position: "relative" as const }}>
            <input value={search} onChange={e => {
                const val = e.target.value;
                setSearch(val);
                if (aiSearchResults) setAiSearchResults(null);
               if (!val.trim()) {
                  setLiveFiltered(null);
                } else {
                  const q = val.toLowerCase();
                  setLiveFiltered(searchIndex.filter(c =>
                    c.full_name?.toLowerCase().includes(q) ||
                    c.email?.toLowerCase().includes(q) ||
                    c.company?.toLowerCase().includes(q) ||
                    c.job_title?.toLowerCase().includes(q) ||
                    c.phone?.includes(q)
                  ));
                }
              }}
              onKeyDown={e => { if (e.key === "Enter") handleSearch(search, "search"); }}
              placeholder="Search all fields — press Enter to search all contacts..."
              style={{ width: "100%", padding: "10px 36px 10px 14px", borderRadius: 8, border: `1px solid ${aiSearchResults ? C.purple : search ? C.green : C.border2}`, background: C.bg2, color: C.text, fontSize: 13, outline: "none", fontFamily: font, boxSizing: "border-box" as const }} />
            {(search || aiSearchResults) && <button onClick={clearAiSearch} style={{ position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.text3, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>x</button>}
          </div>
          <button onClick={() => { setAiMode(true); handleSearch(search, "ai"); }} disabled={!search.trim() || aiSearching}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: aiSearching ? C.bg3 : C.purple, color: aiSearching ? C.text4 : "#fff", fontSize: 13, fontWeight: 600, cursor: aiSearching || !search.trim() ? "default" : "pointer", fontFamily: font, whiteSpace: "nowrap" as const }}>
            {aiSearching ? "Thinking..." : "✦ AI Search"}
          </button>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, fontSize: 13, outline: "none", fontFamily: font, cursor: "pointer" }}>{SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
         {/* Tier filter dropdown */}
          <select
            value={["tier_1","tier_2","tier_3","tier_4","tier_5"].find(t => activeChips.has(t))?.replace("tier_","") || ""}
            onChange={e => {
              const val = e.target.value;
              setActiveChips(prev => {
                const next = new Set(prev);
                ["tier_1","tier_2","tier_3","tier_4","tier_5"].forEach(t => next.delete(t));
                if (val) next.add(`tier_${val}`);
                return next;
              });
              localStorage.removeItem(CACHE_KEY);
              setPage(0);
            }}
            style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${["tier_1","tier_2","tier_3","tier_4","tier_5"].some(t => activeChips.has(t)) ? "#bf5c38" : C.border2}`, background: C.bg2, color: ["tier_1","tier_2","tier_3","tier_4","tier_5"].some(t => activeChips.has(t)) ? "#bf5c38" : C.text, fontSize: 13, outline: "none", fontFamily: font, cursor: "pointer" }}>
            <option value="">All Tiers</option>
            {DUNBAR_TIERS.map(t => <option key={t.tier} value={String(t.tier)}>{t.name}</option>)}
          </select>
          {/* Bucket filter dropdown */}
          <select
            value={["bucket_personal","bucket_professional","bucket_prospect"].find(b => activeChips.has(b))?.replace("bucket_","") || ""}
            onChange={e => {
              const val = e.target.value;
              setActiveChips(prev => {
                const next = new Set(prev);
                ["friends","customers","family","vendors","colleagues","needs_attention"].forEach(c => next.delete(c));
                if (val) next.add(val);
                return next;
              });
              localStorage.removeItem(CACHE_KEY);
              setPage(0);
            }}
            style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${["bucket_personal","bucket_professional","bucket_prospect"].some(b => activeChips.has(b)) ? C.green : C.border2}`, background: C.bg2, color: ["bucket_personal","bucket_professional","bucket_prospect"].some(b => activeChips.has(b)) ? C.green : C.text, fontSize: 13, outline: "none", fontFamily: font, cursor: "pointer" }}>
            <option value="">All Buckets</option>
            {DUNBAR_BUCKETS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          {/* Type filter dropdown */}
          <select
            value={activeChips.has("friends") ? "friends" : activeChips.has("customers") ? "customers" : activeChips.has("needs_attention") ? "needs_attention" : ""}
            onChange={e => {
              const val = e.target.value;
              setActiveChips(prev => {
                const next = new Set(prev);
                ["friends","customers","family","vendors","colleagues","needs_attention"].forEach(c => next.delete(c));
                if (val) next.add(val);
                return next;
              });
            }}
            style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${["friends","customers","family","vendors","colleagues","needs_attention"].some(c => activeChips.has(c)) ? C.blue : C.border2}`, background: C.bg2, color: ["friends","customers","family","vendors","colleagues","needs_attention"].some(c => activeChips.has(c)) ? C.blue : C.text, fontSize: 13, outline: "none", fontFamily: font, cursor: "pointer" }}>
            <option value="">All Types</option>
            <option value="friends">Friends</option>
            <option value="customers">Customers</option>
            <option value="family">Family</option>
            <option value="vendors">Vendors</option>
            <option value="colleagues">Colleagues</option>
            <option value="needs_attention">Needs Attention</option>
          </select>
          <button onClick={toggleSelectMode} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${selectMode ? C.blue : C.blueLight}`, background: selectMode ? C.blueLight : C.blueLight, color: selectMode ? C.blue : C.blue, fontSize: 13, fontWeight: selectMode ? 700 : 400, cursor: "pointer", fontFamily: font }}>
            {selectMode ? `✓ ${selectedIds.size} selected` : "Select"}
          </button>
          <button onClick={() => setViewMode(v => v === "card" ? "list" : "card")}
            style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            {viewMode === "card" ? "☰ List" : "⊞ Cards"}
          </button>
</div>
   {aiSearchResults && (
          <div style={{ background: C.purpleLight, border: `1px solid ${C.purple}22`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, color: C.purple }}>
              <strong>Search:</strong> "{aiSearchQuery}" — {aiSearchResults.length} contacts found
              {aiSearchResults.filter(r => r.is_ai_match).length > 0 && <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.8 }}>({aiSearchResults.filter(r => r.is_ai_match).length} semantic, {aiSearchResults.filter(r => !r.is_ai_match).length} keyword)</span>}
            </div>
            <button onClick={clearAiSearch} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.purple}44`, background: "transparent", color: C.purple, cursor: "pointer", fontFamily: font }}>Clear</button>
          </div>
        )}

        {actionPreview && (
          <div style={{ background: C.bg2, border: `1px solid ${C.amber}`, borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", background: C.amberLight, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>⚡ Action Preview</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{actionPreview.description} — {actionPreview.affected.length - excludedIds.size} of {actionPreview.affected.length} contacts selected</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={clearAiSearch} style={{ padding: "8px 14px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={handleExecuteAction} disabled={actionExecuting || actionPreview.affected.length === excludedIds.size}
                  style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: actionExecuting ? C.bg3 : C.amber, color: actionExecuting ? C.text4 : "#fff", fontSize: 12, fontWeight: 700, cursor: actionExecuting ? "default" : "pointer", fontFamily: font }}>
                  {actionExecuting ? "Applying..." : `Apply to ${actionPreview.affected.length - excludedIds.size} Contacts`}
                </button>
              </div>
            </div>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {actionPreview.affected.map((c: any) => {
                const excluded = excludedIds.has(c.id);
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: excluded ? C.bg3 : C.bg2, opacity: excluded ? 0.5 : 1 }}>
                    <input type="checkbox" checked={!excluded} onChange={() => setExcludedIds(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} style={{ width: 15, height: 15, cursor: "pointer", accentColor: C.amber, flexShrink: 0 }} />
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.amberLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.amber, flexShrink: 0 }}>{initials(c.full_name || "?")}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.full_name}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{c.company}{c.job_title ? ` · ${c.job_title}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, textAlign: "right" as const, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.change_preview}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? <div style={{ textAlign: "center" as const, padding: "60px 0", color: C.text3, fontSize: 14 }}>Loading contacts...</div>
          : aiSearching ? <div style={{ textAlign: "center" as const, padding: "60px 0", color: C.text3, fontSize: 14 }}>Searching with AI...</div>
          : displayContacts.length === 0 ? <div style={{ textAlign: "center" as const, padding: "60px 0", color: C.text3, fontSize: 14 }}>{search ? `No contacts found for "${search}"` : "No contacts found"}</div>
          : (<>
            {viewMode === "list" && !isMobile ? (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                {selectMode && displayContacts.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg3 }}>
                    <input type="checkbox" checked={selectedIds.size === displayContacts.length} onChange={e => e.target.checked ? selectAll() : setSelectedIds(new Set())} style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.purple }} />
                    <span style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>Select all {displayContacts.length} contacts</span>
                  </div>
                )}
                {displayContacts.map((c: any, idx: number) => (
                  <div key={c.id} onClick={() => setSelectedContact(c)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: idx < displayContacts.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg3}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {selectMode && (
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelectContact(c.id)} onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, accentColor: C.purple, cursor: "pointer", flexShrink: 0 }} />
                    )}
                    {/* Avatar */}
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.terra + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.terra, flexShrink: 0 }}>
                      {c.full_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    {/* Name + title */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name}</div>
                      <div style={{ fontSize: 11, color: C.text3, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{[c.job_title, c.company].filter(Boolean).join(" · ")}</div>
                    </div>
                    {/* Email */}
                    <div style={{ width: 200, fontSize: 12, color: C.blue, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{c.email}</div>
                    {/* Phone */}
                    <div style={{ width: 120, fontSize: 12, color: C.text3, flexShrink: 0 }}>{c.phone || "—"}</div>
                    {/* City/State */}
                    <div style={{ width: 130, fontSize: 12, color: C.text3, flexShrink: 0, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[c.home_address?.city || c.work_address?.city, c.home_address?.region || c.work_address?.region].filter(Boolean).join(", ") || "—"}
                    </div>
                    {/* Tier */}
                    <div style={{ width: 60, flexShrink: 0 }}>
                      {c.dunbar_tier && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: ["#bf5c38","#6b9970","#2a6496","#6b5c9e"][c.dunbar_tier - 1] + "22", color: ["#bf5c38","#6b9970","#2a6496","#6b5c9e"][c.dunbar_tier - 1], fontWeight: 700 }}>
                          {["C5","IC","A50","N150"][c.dunbar_tier - 1]}
                        </span>
                      )}
                    </div>
                    {/* Last contacted */}
                    <div style={{ width: 80, fontSize: 11, color: C.text4, textAlign: "right" as const, flexShrink: 0 }}>
                      {c.last_emailed_at ? `${Math.floor((Date.now() - new Date(c.last_emailed_at).getTime()) / 86400000)}d ago` : "Never"}
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={e => { e.stopPropagation(); setEditContact(c); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text3, fontSize: 11, cursor: "pointer", fontFamily: font }}>Edit</button>
                      <button onClick={e => { e.stopPropagation(); setDeleteTarget(c); }} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 11, cursor: "pointer", fontFamily: font }}>Delete</button>
                      {c.email && (
                        <button onClick={async e => {
                          e.stopPropagation();
                          const res = await fetch('/api/contacts/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contactIds: [c.id], draftOnly: false })
                          });
                          const data = await res.json();
                          if (data.sent > 0) alert(`Verification sent to ${c.email}`);
                          else if (data.drafted > 0) alert(`Drafted — no email history yet`);
                          else alert(data.message || 'Could not send');
                        }} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 11, cursor: "pointer", fontFamily: font }}>✓?</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: isMobile ? 10 : 12, alignItems: "start" }}>
              {selectMode && displayContacts.length > 0 && (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, padding: "8px 4px" }}>
                  <input type="checkbox" checked={selectedIds.size === displayContacts.length} onChange={e => e.target.checked ? selectAll() : setSelectedIds(new Set())} style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.purple }} />
                  <span style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>Select all {displayContacts.length} contacts</span>
                </div>
              )}
              {displayContacts.map((c: any) => (
                <div key={c.id} style={{ position: "relative" as const }}>
                  {selectMode && (
                    <div onClick={() => toggleSelectContact(c.id)} style={{ position: "absolute" as const, top: 12, left: 12, zIndex: 10, cursor: "pointer" }}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelectContact(c.id)} onClick={e => e.stopPropagation()} style={{ width: 18, height: 18, accentColor: C.purple, cursor: "pointer" }} />
                    </div>
                  )}
                  {c.match_reason && (
                    <div style={{ position: "absolute" as const, top: -8, left: 12, right: 12, zIndex: 1, background: C.purple, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, textAlign: "center" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {c.match_reason}
                    </div>
                  )}
                  <ContactCard contact={c} onClick={() => selectMode ? toggleSelectContact(c.id) : setSelectedContact(c)} onReach={e => { e.stopPropagation(); if (!selectMode) setReachContact(c); }} onEdit={e => { e.stopPropagation(); if (!selectMode) setEditContact(c); }} onDelete={e => { e.stopPropagation(); if (!selectMode) setDeleteTarget(c); }} allContacts={contacts} onTierUpdate={handleTierUpdate} />
                </div>
              ))}
            </div>
            )}
           {!aiSearchResults && (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "24px 0" }}>
    <button
      onClick={() => setPage(p => Math.max(0, p - 1))}
      disabled={page === 0}
      style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: page === 0 ? C.bg3 : C.bg2, color: page === 0 ? C.text4 : C.text2, fontSize: 13, fontWeight: 600, cursor: page === 0 ? "default" : "pointer", fontFamily: font }}>
      ← Previous
    </button>
    <span style={{ fontSize: 13, color: C.text3 }}>
      {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()}
    </span>
    <button
      onClick={() => setPage(p => p + 1)}
      disabled={!hasMore}
      style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: !hasMore ? C.bg3 : C.bg2, color: !hasMore ? C.text4 : C.text2, fontSize: 13, fontWeight: 600, cursor: !hasMore ? "default" : "pointer", fontFamily: font }}>
      Next →
    </button>
  </div>
)}
          </>)}
      </main>

      {selectMode && selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: isMobile ? 8 : 24, left: isMobile ? 8 : "50%", right: isMobile ? 8 : "auto", transform: isMobile ? "none" : "translateX(-50%)", zIndex: 2000, background: C.sidebar, borderRadius: 16, padding: isMobile ? "10px 12px" : "12px 20px", display: "flex", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 8 : 12, boxShadow: "0 8px 40px rgba(0,0,0,0.3)", fontFamily: font, flexDirection: isMobile ? "column" : "row", flexWrap: isMobile ? "wrap" as const : "nowrap" as const, maxHeight: isMobile ? "60vh" : "auto", overflowY: isMobile ? "auto" as const : "visible" as const }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginRight: 4 }}>{selectedIds.size} selected</span>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />
          <select onChange={e => { if (e.target.value) { handleBulkSetType(e.target.value); (e.target as HTMLSelectElement).value = ""; } }} disabled={bulkExecuting}
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            <option value="">Set Type...</option>
            {RELATIONSHIP_TYPE_OPTIONS.map(t => <option key={t} value={t} style={{ color: C.text, background: C.bg2 }}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <select onChange={e => { if (e.target.value) { handleBulkSetTier(parseInt(e.target.value)); (e.target as HTMLSelectElement).value = ""; } }} disabled={bulkExecuting}
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            <option value="">Set Tier...</option>
            {DUNBAR_TIERS.map(t => <option key={t.tier} value={t.tier} style={{ color: C.text, background: C.bg2 }}>{t.name}</option>)}
          </select>
          <select onChange={e => { if (e.target.value) { handleBulkToggleBucket(e.target.value); (e.target as HTMLSelectElement).value = ""; } }} disabled={bulkExecuting}
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            <option value="">Set Bucket...</option>
            {DUNBAR_BUCKETS.map(b => <option key={b.id} value={b.id} style={{ color: C.text, background: C.bg2 }}>{b.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && bulkTag.trim()) { handleBulkAddTag(bulkTag); setBulkTag(""); } }} placeholder="Add tag..." style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontFamily: font, outline: "none", width: 120 }} />
            <button onClick={() => { if (bulkTag.trim()) { handleBulkAddTag(bulkTag); setBulkTag(""); } }} disabled={!bulkTag.trim() || bulkExecuting} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: C.purpleLight, color: C.purple, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Tag</button>
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />
          <button onClick={handleBulkDelete} disabled={bulkExecuting} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontSize: 12, fontWeight: 700, cursor: bulkExecuting ? "default" : "pointer", fontFamily: font, opacity: bulkExecuting ? 0.7 : 1 }}>
            {bulkExecuting ? "Working..." : `🗑 Delete ${selectedIds.size}`}
          </button>
          <button onClick={toggleSelectMode} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.1)", color: C.text4, fontSize: 12, cursor: "pointer", fontFamily: font }}>Cancel</button>
        </div>
      )}
      {selectedContact && !reachContact && !editContact && !purchaseContact && <ContactDetail contact={selectedContact} onClose={() => setSelectedContact(null)} onReach={() => setReachContact(selectedContact)} onEdit={() => setEditContact(selectedContact)} onLogPurchase={() => setPurchaseContact(selectedContact)} />}
      {purchaseContact && <LogPurchaseModal contact={purchaseContact} onClose={() => setPurchaseContact(null)} onSaved={(updated) => { setContacts(cs => cs.map(c => c.id === updated.id ? { ...c, ...updated } : c)); setPurchaseContact(null); }} />}
      {reachContact && <ReachOutPanel contact={reachContact} onClose={() => { setReachContact(null); setSelectedContact(null); }} />}
      {editContact && <SharedEditModal contact={editContact} onClose={() => setEditContact(null)} onSave={handleSaveEdit} />}
      {deleteTarget && <DeleteConfirm contact={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirm} />}
      {showAddContact && <AddContactModal onClose={() => setShowAddContact(false)} onSave={handleAddContact} />}
      {showClean && <CleanModal allContacts={contacts} onClose={() => setShowClean(false)} onDeleted={(ids) => { setContacts(cs => cs.filter(c => !ids.includes(c.id))); localStorage.removeItem(CACHE_KEY); }} />}

      {/* Pending Contacts Approval Modal */}
      {showPendingModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowPendingModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>New contacts from {emailProvider === "microsoft" ? "Outlook" : "Google"}</div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{pendingCount} contacts waiting for approval</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={async () => {
                  const endpoint = emailProvider === "microsoft" ? "/api/contacts/microsoft-pending" : "/api/contacts/google-pending";
                  await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_all" }) });
                  setPendingCount(0);
                  setPendingContacts([]);
                  setShowPendingModal(false);
                  localStorage.removeItem(CACHE_KEY);
                  loadContacts("all", "all", false, false, true);
                }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Approve all
                </button>
                <button onClick={async () => {
                  const endpoint = emailProvider === "microsoft" ? "/api/contacts/microsoft-pending" : "/api/contacts/google-pending";
                  await fetch(endpoint, { method: "DELETE" });
                  setPendingCount(0);
                  setPendingContacts([]);
                  setShowPendingModal(false);
                }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Dismiss all
                </button>
                <button onClick={() => setShowPendingModal(false)} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.text3, fontSize: 18 }}>×</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" as const, padding: "8px 0" }}>
              {pendingContacts.length === 0 ? (
                <div style={{ textAlign: "center" as const, padding: "40px 0", color: C.text3, fontSize: 13 }}>Loading...</div>
              ) : pendingContacts.map((c: any) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.amberLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.amber, flexShrink: 0 }}>{(c.full_name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.full_name}</div>
                    <div style={{ fontSize: 11, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{[c.email, c.company, c.job_title].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={async () => {
                      const endpoint = emailProvider === "microsoft" ? "/api/contacts/microsoft-pending" : "/api/contacts/google-pending";
                      await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", id: c.id }) });
                      setPendingContacts(prev => prev.filter(p => p.id !== c.id));
                      setPendingCount(prev => prev - 1);
                      localStorage.removeItem(CACHE_KEY);
                      loadContacts("all", "all", false, false, true);
                    }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: C.green, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Add</button>
                    <button onClick={async () => {
                      const endpoint = emailProvider === "microsoft" ? "/api/contacts/microsoft-pending" : "/api/contacts/google-pending";
                      await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss", id: c.id }) });
                      setPendingContacts(prev => prev.filter(p => p.id !== c.id));
                      setPendingCount(prev => prev - 1);
                    }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 12, cursor: "pointer", fontFamily: font }}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <button onClick={handlePullFromProvider} disabled={syncing} style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                {syncing ? "Pulling..." : `↓ Pull from ${emailProvider === "microsoft" ? "Outlook" : "Google"} for more`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hopper Modal */}
      {showHopperModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowHopperModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>The Hopper</div>
              <button onClick={() => setShowHopperModal(false)} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.text3, fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <HopperSmartImport />
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 }}>Quick Import</div>
                <HopperCard onDone={() => { localStorage.removeItem(CACHE_KEY); loadContacts("all", "all", false, false, true); setShowHopperModal(false); }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
