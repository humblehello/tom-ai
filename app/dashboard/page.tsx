"use client";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import JournalChat from "@/app/components/JournalChat";
import { C, font } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";
import UpgradeModal from "@/app/components/UpgradeModal";
import { useIsMobile } from "@/app/lib/useMediaQuery";
import SharedEditModal from "@/app/components/EditModal";

type Contact = {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  relationship_type?: string;
  relationship_strength?: number;
  relationship_health?: string;
  key_context?: string;
  relationship_context?: string;
  last_emailed_at?: string;
  last_reached_out_at?: string;
  last_meaningful_touch_at?: string;
  company?: string;
  job_title?: string;
  topics?: string[];
  email_count?: number;
  relationship_types?: string[];
  dunbar_tier?: number | null;
  dunbar_bucket?: string[];
  humble_score?: number;
  tier_override?: boolean;
  tags?: { tag: string; value: string; confidence: number; source: string }[];
 home_address?: any;
  work_address?: any;
  all_emails?: string[];
  phones?: { number: string; type: "cell" | "work" | "home"; primary?: boolean }[];
  linkedin_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  birthday?: string;
  notes?: string;
  notes_context?: string;
  best_channel?: string;
  best_time?: string;
  communication_style?: string;
  met_where?: string;
  zip?: string;
  engage_snoozed_until?: string | null;
  engage_permanently_excluded?: boolean;
  email_status?: string;
  _urgency?: number;
  _whyNow?: string;
};

type LifeEvent = {
  id: string;
  contact_name: string;
  event_type: string;
  event_date: string;
  days?: number;
};

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function daysAgo(dateStr?: string): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ── Seeded shuffle ────────────────────────────────────────────────────────────
// Same seed = same order. Used to keep the engage list stable within a day.
// mulberry32 is a tiny deterministic PRNG that only needs a 32-bit integer seed.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
// Today's seed — integer days since epoch. Changes once per local day.
function todaySeed(): number {
  const d = new Date();
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / (1000 * 60 * 60 * 24)
  );
}
function daysUntil(dateStr: string): number {
  const today = new Date();
  const event = new Date(dateStr);
  const thisYear = new Date(today.getFullYear(), event.getMonth(), event.getDate());
  if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
  return Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
function healthColor(h?: string): { bg: string; text: string } {
  switch (h) {
    case "thriving": return { bg: C.greenLight, text: C.green };
    case "warm": return { bg: C.blueLight, text: C.blue };
    case "cooling": return { bg: C.amberLight, text: C.amber };
    case "cold": return { bg: C.redLight, text: C.red };
    default: return { bg: C.border, text: C.text3 };
  }
}

function findConnectorPair(contacts: Contact[], dismissed: Set<string>): [Contact, Contact] | null {
  const eligible = contacts.filter(c => (c.relationship_strength || 0) >= 30);
  if (eligible.length < 2) return null;
  let best: [Contact, Contact] | null = null;
  let bestScore = -1;
  for (let i = 0; i < Math.min(eligible.length, 30); i++) {
    for (let j = i + 1; j < Math.min(eligible.length, 30); j++) {
      const a = eligible[i], b = eligible[j];
      const key = [a.id, b.id].sort().join("-");
      if (dismissed.has(key)) continue;
      if (a.company && b.company && a.company.toLowerCase() === b.company.toLowerCase()) continue;
      const shared = (a.topics || []).filter(t => (b.topics || []).includes(t));
      let score = shared.length * 10;
      if (a.relationship_type !== b.relationship_type) score += 5;
      if (a.company && b.company) score += 3;
      if (score > bestScore) { bestScore = score; best = [a, b]; }
    }
  }
  return best;
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveDateTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return <>{date} · {time}</>;
}

// ── Compact Hopper ────────────────────────────────────────────────────────────
function CompactHopper() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList) => {
    setProcessing(true);
    setResult(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("files", f));
      const res = await fetch("/api/contacts/hopper", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data.message || `${data.imported || 0} contacts imported`);
    } catch { setResult("Upload failed"); }
    setProcessing(false);
    setTimeout(() => setResult(null), 5000);
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 }}>The Hopper</div>
      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{ border: `2px dashed ${isDragOver ? C.green : C.border2}`, borderRadius: 8, padding: "12px", background: isDragOver ? C.greenLight : C.bg3, cursor: "pointer", transition: "all 0.15s", textAlign: "center" as const }}
      >
        <input ref={fileInputRef} type="file" multiple accept=".csv,.vcf,.txt,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.webp" onChange={e => { if (e.target.files?.length) processFiles(e.target.files); }} style={{ display: "none" }} />
        {processing ? (
          <div style={{ fontSize: 12, color: C.text3 }}>Processing...</div>
        ) : result ? (
          <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{result}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: isDragOver ? C.green : C.text, marginBottom: 2 }}>Drop contacts here</div>
            <div style={{ fontSize: 11, color: C.text4 }}>CSV, VCF, Excel, or photo</div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tier constants ────────────────────────────────────────────────────────────
type WidgetId = "cards_review" | "reflection" | "events" | "health" | "campaign";
const DEFAULT_ORDER: WidgetId[] = ["cards_review", "reflection", "events", "health", "campaign"];
const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };
const TIER_CADENCE: Record<number, number> = { 1: 30, 2: 60, 3: 120, 4: 180, 5: 365 };
const TIER_WEIGHT: Record<number, number> = { 1: 1000, 2: 500, 3: 200, 4: 100, 5: 50 };
const TIER_NAMES: Record<number, string> = { 1: "Core 5", 2: "Inner Circle", 3: "Active", 4: "Network", 5: "Acquaintance" };

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
  return s;
}
function fmtTopics(raw: string): string[] {
  return [...new Set(raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))];
}
function fmtAddress(addr: any): any {
  if (!addr) return addr;
  return { ...addr, city: addr.city ? fmtProperCase(addr.city) : addr.city, region: addr.region ? addr.region.trim().toUpperCase() : addr.region, country: addr.country ? fmtProperCase(addr.country) : addr.country, streetAddress: addr.streetAddress ? fmtProperCase(addr.streetAddress) : addr.streetAddress };
}

function buildReengage(classified: Contact[], dismissed: Set<string>, page: number = 0): Contact[] {
  const now = Date.now();

  const scored = classified
    .filter(c => {
      // Client-side dismiss (transient, within this session) — still supported
      if (dismissed.has(c.id)) return false;
      if (!c.email && !c.phone) return false;

      // NEW: respect DB-backed permanent exclusion
      if (c.engage_permanently_excluded) return false;

      // NEW: respect DB-backed snooze
      if (c.engage_snoozed_until) {
        const snoozeEnd = new Date(c.engage_snoozed_until).getTime();
        if (!isNaN(snoozeEnd) && snoozeEnd > now) return false;
      }

      // Skip bounced/invalid emails
      if (c.email_status === "invalid" || c.email_status === "departed") return false;

      const tier = c.dunbar_tier || 5;
      const cadence = TIER_CADENCE[tier] || 365;
      const lastTouch = c.last_meaningful_touch_at || c.last_reached_out_at || c.last_emailed_at;
      const days = lastTouch ? Math.floor((now - new Date(lastTouch).getTime()) / 86400000) : 999;

      // Dormant re-engagement lane:
      // Contacts with real email history (5+) that have gone silent 180+ days still surface
      // even if they'd otherwise be excluded by the "too long since touch" filter below.
      const isDormantReengage = (c.email_count || 0) >= 5 && days >= 180;

      // Exclude contacts with no recent history unless they're personal, top tier, or dormant-reengageable
      const isPersonal = ["friend", "close_friend", "family"].includes(c.relationship_type || "");
      const isTopTier = tier <= 3;
      if (days > 400 && !isPersonal && !isTopTier && !isDormantReengage) return false;

      return days >= cadence;
    })
    .map(c => {
      const tier = c.dunbar_tier || 5;
      const cadence = TIER_CADENCE[tier] || 365;
      const lastTouch = c.last_meaningful_touch_at || c.last_reached_out_at || c.last_emailed_at;
      const days = lastTouch ? Math.floor((now - new Date(lastTouch).getTime()) / 86400000) : 999;
      const daysOverdue = Math.max(0, days - cadence);
      const urgency = (daysOverdue * TIER_WEIGHT[tier]) + (c.humble_score || 0);
      let whyNow = "";
      if (daysOverdue > cadence) whyNow = `${TIER_NAMES[tier]} · ${daysOverdue}d overdue — relationship at risk`;
      else if (tier <= 2) whyNow = `${TIER_NAMES[tier]} · due every ${cadence}d · ${daysOverdue}d past`;
      else if (days > 365) whyNow = `${Math.floor(days / 30)} months since last touch`;
      else whyNow = `${TIER_NAMES[tier]} · ${daysOverdue}d past ${cadence}d cadence`;
      return { ...c, _urgency: urgency, _whyNow: whyNow };
    })
    .sort((a, b) => (b._urgency || 0) - (a._urgency || 0));

  const high = scored.filter(c => (c._urgency || 0) > 200);
  const mid = scored.filter(c => (c._urgency || 0) > 50 && (c._urgency || 0) <= 200);
  const low = scored.filter(c => (c._urgency || 0) <= 50);

  const seed = todaySeed() + page * 1000;
  const mixed = [
    ...seededShuffle(high, seed),
    ...seededShuffle(mid, seed + 1),
    ...seededShuffle(low, seed + 2),
  ];
  return mixed.slice(page * 12, page * 12 + 12);
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
  function EngagedButton({ onLogTouch, onEngageAction }: { onLogTouch: (method: string) => void; onEngageAction: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const methods = ["Call", "Text", "Met in person", "Email", "Other"];
  const engageOptions = [
    { id: "never_engage", label: "🚫 Do not engage", desc: "Permanently hide from Engage" },
  ];

  // Position the dropdown relative to the button, in viewport coords.
  // If there isn't room below, open upward.
  const updatePosition = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const DROPDOWN_HEIGHT_EST = 280;
    const DROPDOWN_WIDTH = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < DROPDOWN_HEIGHT_EST && rect.top > DROPDOWN_HEIGHT_EST;
    const top = openUp ? rect.top - 4 : rect.bottom + 4;
    // Align right edge of dropdown with right edge of button, clamped to viewport
    let left = rect.right - DROPDOWN_WIDTH;
    if (left < 8) left = 8;
    if (left + DROPDOWN_WIDTH > window.innerWidth - 8) left = window.innerWidth - DROPDOWN_WIDTH - 8;
    setPos({ top, left, openUp });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    // Defer one tick so the opening click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler);
    };
  }, [open]);

  const dropdown = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed" as const,
        top: pos.openUp ? "auto" : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : "auto",
        left: pos.left,
        width: 220,
        background: C.bg2,
        border: `1px solid ${C.border2}`,
        borderRadius: 8,
        overflow: "hidden",
        zIndex: 9999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        maxHeight: "70vh",
        overflowY: "auto" as const,
      }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.text4, textTransform: "uppercase" as const, letterSpacing: "0.08em", padding: "8px 14px 4px" }}>Connected outside HH</div>
      {methods.map(m => (
        <button key={m} onClick={() => { onLogTouch(m); setOpen(false); }}
          style={{ display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", textAlign: "left" as const, fontSize: 12, color: C.text, cursor: "pointer", fontFamily: font }}
          onMouseEnter={e => e.currentTarget.style.background = C.greenLight}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          {m === "Call" ? "📞" : m === "Text" ? "💬" : m === "Met in person" ? "🤝" : m === "Email" ? "✉️" : "•"} {m}
        </button>
      ))}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4 }} />
      <div style={{ fontSize: 9, fontWeight: 700, color: C.text4, textTransform: "uppercase" as const, letterSpacing: "0.08em", padding: "8px 14px 4px" }}>Hide from engage</div>
      {engageOptions.map(opt => (
        <button key={opt.id} onClick={() => { onEngageAction(opt.id); setOpen(false); }}
          style={{ display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", textAlign: "left" as const, fontSize: 12, color: C.text, cursor: "pointer", fontFamily: font }}
          onMouseEnter={e => e.currentTarget.style.background = C.bg3}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          <div>{opt.label}</div>
          <div style={{ fontSize: 10, color: C.text4, marginTop: 2 }}>{opt.desc}</div>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ position: "relative" as const }} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Mark as engaged or pause from Engage"
        style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.green}`, background: C.greenLight, color: C.green, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>
        ✓ Engaged ▾
      </button>
      {dropdown}
    </div>
  );
}
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

function ReengageCard({ contact, onSelect, onDismiss, onEdit, onDelete, reachedOut, onOpenCard, onLogTouch, onEngageAction, onTierChange, onBucketChange }: {
  contact: Contact; onSelect: () => void; onDismiss: () => void; onEdit: () => void; onDelete: () => void; reachedOut: boolean; onOpenCard: () => void; onLogTouch: (method: string) => void; onEngageAction: (action: string) => void; onTierChange: (tier: number) => void; onBucketChange: (buckets: string[]) => void;
}) {
  const days = daysAgo(contact.last_emailed_at);
  const health = healthColor(contact.relationship_health);
  const initials = contact.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const tier = contact.dunbar_tier || 5;
  const cadence = TIER_CADENCE[tier] || 90;
  const isEngaged = reachedOut || days < cadence;
  const tColor = tierColor(contact.relationship_type);

  const tierBg = tier === 1 ? "#bf5c3822" : tier === 2 ? "#6b997022" : tier === 3 ? "#3b82f622" : tier === 4 ? "#8b5cf622" : "#94a3b822";
  const tierFg = tier === 1 ? "#bf5c38" : tier === 2 ? "#6b9970" : tier === 3 ? "#3b82f6" : tier === 4 ? "#8b5cf6" : "#64748b";

  const displayTags: { label: string; color: string; bg: string }[] = [];
  if ((contact as any).tags) {
    (contact as any).tags.filter((t: any) => t.confidence >= 80).slice(0, 3)
      .forEach((t: any) => displayTags.push({ label: t.value || t.tag.replace(/_/g, " "), color: C.purple, bg: C.purpleLight }));
  }
  if (contact.topics) {
    contact.topics.slice(0, 2).forEach(t => displayTags.push({ label: t, color: C.text3, bg: C.bg3 }));
  }

  return (
    <div style={{ background: isEngaged ? C.bg2 : tierCardStyle(contact).background, border: `2px solid ${isEngaged ? C.green : tierCardStyle(contact).borderColor}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column" as const, gap: 10, transition: "border-color 0.15s, box-shadow 0.15s", maxWidth: "100%", minWidth: 0, overflow: "hidden" }}
      onMouseEnter={e => { e.currentTarget.style.opacity = "0.92"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.boxShadow = "none"; }}>

      {/* Top row — avatar, name, tier badge */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, ${tColor}33, ${tColor}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: tColor }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div onClick={e => { e.stopPropagation(); onOpenCard(); }}
            style={{ fontSize: 14, fontWeight: 700, color: C.blue, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}
            onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
            onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
            {contact.full_name}
          </div>
          {(contact.job_title || contact.company) && (
            <div style={{ fontSize: 11, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginTop: 2 }}>
              {contact.job_title && contact.company ? `${contact.job_title} · ${contact.company}` : contact.job_title || contact.company}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {isEngaged ? (
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onEngageAction("pause_30"); }}
              title="Pause for 30 days"
              style={{ width: 20, height: 20, borderRadius: "50%", background: C.bg3, border: "none", cursor: "pointer", color: C.text4, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          )}
          <span style={{ fontSize: 10, fontWeight: 600, color: days < 30 ? C.green : days < 90 ? C.amber : C.red }}>{days < 999 ? `${days}d ago` : "Never"}</span>
        </div>
      </div>

      {/* Contact info row */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, minWidth: 0 }}>
        {contact.email && (() => {
          const all = contact.all_emails?.length ? contact.all_emails : [contact.email].filter(Boolean) as string[];
          const extra = Math.max(0, all.length - 1);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, minWidth: 0 }}>
              <span style={{ color: C.text4, flexShrink: 0 }}>@</span>
              <span style={{ color: C.blue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>{contact.email}</span>
              {extra > 0 && (
                <span title={all.slice(1).join(", ")}
                  style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: C.blueLight, color: C.blue, fontWeight: 600, flexShrink: 0, cursor: "help" }}>
                  +{extra}
                </span>
              )}
            </div>
          );
        })()}
        {contact.phone && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ color: C.text4 }}>📱</span>
            <span style={{ color: C.blue }}>{contact.phone}</span>
            <span style={{ fontSize: 9, color: C.text4, fontWeight: 600 }}>cell</span>
          </div>
        )}
        {(contact.linkedin_url || contact.twitter_url || contact.instagram_url || contact.facebook_url) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }} onClick={e => e.stopPropagation()}>
            {contact.linkedin_url && <button onClick={() => window.open(contact.linkedin_url, "_blank")} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.blue, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>in</button>}
            {contact.twitter_url && <button onClick={() => window.open(contact.twitter_url, "_blank")} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>X</button>}
            {contact.instagram_url && <button onClick={() => window.open(contact.instagram_url, "_blank")} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.pink, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>IG</button>}
            {contact.facebook_url && <button onClick={() => window.open(contact.facebook_url, "_blank")} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.border2}`, background: C.bg3, color: C.blue, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>FB</button>}
          </div>
        )}
      </div>

      {/* Tags — filtered, no generic labels */}
      {(() => {
        const BLOCKED_TAGS = new Set(["business", "personal", "professional", "prospect", "work", "other", "general", "contact", "friend", "family", "customer", "vendor"]);
        const filtered = displayTags.filter(t => !BLOCKED_TAGS.has(t.label.toLowerCase()));
        return filtered.length > 0 ? (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
            {filtered.slice(0, 4).map((t, i) => (
              <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: t.bg, color: t.color, fontWeight: 500, textTransform: "capitalize" as const }}>{t.label}</span>
            ))}
          </div>
        ) : null;
      })()}

      {/* Key context */}
      {contact.key_context && (
        <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
          {contact.key_context}
        </div>
      )}

      {/* Why Now */}
      <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, background: C.amberLight, padding: "4px 8px", borderRadius: 6 }}>
        {contact._whyNow || (days < 999 ? `Last contacted ${days}d ago` : "Never contacted")}
      </div>

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
              let next = active ? current.filter(x => x !== b.id) : [...current, b.id];
              if (next.length === 0) return;
              // Prospect is mutually exclusive with personal/professional (same rule as contacts page)
              if (b.id === "prospect") next = ["prospect"];
              if ((b.id === "personal" || b.id === "professional") && next.includes("prospect")) {
                next = next.filter(x => x !== "prospect");
              }
              onBucketChange(next);
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
          const colors = ["#bf5c38","#6b9970","#2a6496","#6b5c9e"];
          const labels = ["C5","IC","A50","N150"];
          const active = tier === t;
          return (
            <button key={t} onClick={() => onTierChange(t)}
              style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, border: "none",
                background: active ? colors[t-1] : C.bg3,
                color: active ? "#fff" : C.text4,
                cursor: "pointer", fontFamily: font, fontWeight: 600, transition: "all 0.1s" }}>
              {labels[t-1]}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
        {isEngaged ? (
          <div style={{ flex: 1, padding: "8px", borderRadius: 7, background: C.greenLight, color: C.green, fontSize: 11, fontWeight: 600, textAlign: "center" as const }}>Engaged ✓</div>
        ) : (
          <>
            <button onClick={onSelect} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none", background: C.green, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Reach Out</button>
            <EngagedButton onLogTouch={onLogTouch} onEngageAction={onEngageAction} />
          </>
        )}
                       <button onClick={onEdit} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Edit</button>
        <button onClick={onDelete} title="Delete contact" style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>🗑</button>
      </div>
    </div>
  );
}
// ── Quick Action Panel ────────────────────────────────────────────────────────
function QuickActionPanel({ contact, onClose, onReachedOut, initialOccasion }: { contact: Contact; onClose: () => void; onReachedOut: () => void; initialOccasion?: string }) {
   const [mode, setMode] = useState<"email" | "card">(initialOccasion ? "card" : "email");
  const [message, setMessage] = useState("");
  const [cardOccasion, setCardOccasion] = useState(initialOccasion || "");
  const [subject, setSubject] = useState("");
  const [generating, setGenerating] = useState(true);
  const [variationSeed, setVariationSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [emailAngle, setEmailAngle] = useState<"casual" | "curious" | "recent_event" | "quick_hi">("casual");
  const [cardTone, setCardTone] = useState<string>("warm");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
const [cardSent, setCardSent] = useState(false);
  const [cardQueued, setCardQueued] = useState(false);
const [addressForm, setAddressForm] = useState({ street: "", city: "", region: "", zip: "" });
const [savingAddress, setSavingAddress] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const days = daysAgo(contact.last_emailed_at);
  const [showUpgrade, setShowUpgrade] = useState(false);

const generatingRef = useRef<"email" | "card" | null>(null);

  useEffect(() => {
    setMessage("");
    setGenerating(false);
    if (initialOccasion) {
      setMode("card");
      setCardOccasion(initialOccasion);
      generatingRef.current = "card";
      setGenerating(true);
      const initSeed = Math.floor(Math.random() * 1000);
      setVariationSeed(initSeed);
      fetch("/api/relationships/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: contact.full_name,
          relationship_type: contact.relationship_type,
          key_context: contact.key_context,
          contact_id: contact.id,
          occasion: initialOccasion,
          variation_seed: initSeed,
          card_tone_override: cardTone,
        }),
      }).then(r => r.json()).then(data => {
        setMessage(data.message || "wishing you all the best.");
        setGenerating(false);
      }).catch(() => { setMessage("wishing you all the best."); setGenerating(false); });
    } else {
      generateMessage();
    }
  }, [contact.id]);

  const generateMessage = async (occasion?: string, overrideAngle?: string) => {
    generatingRef.current = "email";
    setGenerating(true);
    // Bump variation seed on every regenerate so we get a genuinely different draft
    const nextSeed = Math.floor(Math.random() * 1000);
    setVariationSeed(nextSeed);
    try {
      const res = await fetch("/api/relationships/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          contact_name: contact.full_name,
          relationship_type: contact.relationship_type,
          relationship_health: contact.relationship_health,
          key_context: contact.key_context,
          days_since_contact: days,
          occasion: occasion || undefined,
          angle: overrideAngle || emailAngle,
          variation_seed: nextSeed,
        }),
      });
      const data = await res.json();
      if (data.error === "draft_limit_reached") { setShowUpgrade(true); setGenerating(false); return; }
      setMessage(data.message || `${contact.full_name.split(" ")[0]} — been thinking about you lately.`);
      setSubject(data.subject || "catching up");
    } catch { setMessage(`${contact.full_name.split(" ")[0]} — been thinking about you lately.`); }
    setGenerating(false);
  };

  const handleSendEmail = async () => {
    if (!contact.email) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id, contact_email: contact.email, contact_name: contact.full_name, subject, body: message }),
      });
      if ((await res.json()).success) { setSent(true); onReachedOut(); }
    } catch {}
    setSending(false);
  };

const handleSendCard = async () => {
    if (!cardOccasion) return;

    const address = contact.home_address;

    // No address path — queue into Approval Needed (no popup, the in-panel amber warning
    // and Send button label are enough context).
    if (!address || !address.streetAddress) {
      setSending(true);
      try {
        const res = await fetch("/api/cards/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_id: contact.id,
            contact_name: contact.full_name,
            occasion: cardOccasion,
            message,
            trigger_type: "manual_needs_info",
            requires_approval: true,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setCardSent(true);
          setCardQueued(true);
        } else {
          alert(`Couldn't queue card: ${data.error || "unknown error"}`);
        }
      } catch (e) {
        alert("Something went wrong queuing the card. Please try again.");
      }
      setSending(false);
      return;
    }

    // Happy path — address is present, send immediately
    const missing = [];
    if (!address.streetAddress) missing.push("street address");
    if (!address.city) missing.push("city");
    if (!address.region) missing.push("state");
    if (!address.postalCode && !address.zip) missing.push("zip code");
    if (missing.length > 0) {
      alert(`Address is incomplete — missing: ${missing.join(", ")}. Please update it in Edit.`);
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/cards/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          contact_name: contact.full_name,
          occasion: cardOccasion,
          message,
          address,
          trigger_type: "manual",
          requires_approval: false,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCardSent(true);
      } else if (data.needs_setup) {
        setShowPaymentModal(true);
      } else if (data.details?.message) {
        alert(`Card couldn't send: ${data.details.message}`);
      } else if (data.error) {
        alert(`Card couldn't send: ${data.error}`);
      }
    } catch (e) {
      alert("Something went wrong sending the card. Please try again.");
    }
    setSending(false);
  };

  const markReachedOut = async () => {
    await fetch("/api/relationships/draft", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_id: contact.id }) }).catch(() => {});
    onReachedOut();
  };

  const OCCASIONS = ["Thinking of you", "Thank you", "Congratulations", "Happy Birthday", "Just because", "Other"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 600, padding: 24, boxShadow: "0 -8px 40px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{contact.full_name}</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{contact.relationship_type?.replace(/_/g, " ")} · {days < 999 ? `${days} days ago` : "No contact history"}</div>
          </div>
          <button onClick={onClose} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: C.text3, fontSize: 13, fontFamily: font }}>Close</button>
        </div>

             {/* Action buttons row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setMode("card"); setMessage(""); setGenerating(false); generatingRef.current = "card"; }}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1.5px solid ${C.purple}`, background: C.purpleLight, color: C.purple, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            Send Card
          </button>
          <button disabled
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text4, fontSize: 13, fontWeight: 400, cursor: "not-allowed", fontFamily: font }}>
            Send Gift
          </button>
        </div>

        {mode === "email" ? (
          <>
            {contact.key_context && <div style={{ background: C.bg3, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{contact.key_context}</div>}
            {sent ? (
              <div style={{ background: C.greenLight, borderRadius: 8, padding: 16, textAlign: "center" as const, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>Email sent to {contact.full_name.split(" ")[0]}</div>
              </div>
            ) : (
              <>
                {!generating && <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const, marginBottom: 8 }} />}
                {generating ? (
                  <div style={{ background: C.bg3, borderRadius: 8, padding: 12, fontSize: 13, color: C.text3, marginBottom: 12 }}>Writing a personal message...</div>
                ) : (
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.text, fontFamily: font, resize: "none" as const, outline: "none", boxSizing: "border-box" as const, lineHeight: 1.6, marginBottom: 12 }} />
                )}
              </>
            )}
            {/* Angle picker — pick a different approach to the message */}
            {!sent && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, marginBottom: 6 }}>Approach:</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {[
                    { id: "casual", label: "Casual catch-up" },
                    { id: "curious", label: "Ask about them" },
                    { id: "recent_event", label: "Reference recent news" },
                    { id: "quick_hi", label: "Quick hi" },
                  ].map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setEmailAngle(a.id as any); generateMessage(undefined, a.id); }}
                      disabled={generating}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 16,
                        border: `1.5px solid ${emailAngle === a.id ? C.green : C.border2}`,
                        background: emailAngle === a.id ? C.greenLight : C.bg3,
                        color: emailAngle === a.id ? C.green : C.text3,
                        fontSize: 11,
                        fontWeight: emailAngle === a.id ? 700 : 500,
                        cursor: generating ? "default" : "pointer",
                        fontFamily: font,
                      }}
                    >
                      {emailAngle === a.id ? "✓ " : ""}{a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {contact.phone && <button onClick={() => { window.open(`sms:${contact.phone}?body=${encodeURIComponent(message)}`); markReachedOut(); }} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Text</button>}
              {contact.email && !sent && <button onClick={handleSendEmail} disabled={sending || generating} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: sending ? C.greenLight : C.green, color: sending ? C.green : "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{sending ? "Sending..." : "Send Email"}</button>}
              <button onClick={() => generateMessage(cardOccasion)} title="Regenerate with same angle" style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 13, cursor: "pointer", fontFamily: font }}>↻</button>
            </div>
          </>
        ) : (
          <>
            {cardSent ? (
              <div style={{ background: C.greenLight, borderRadius: 8, padding: 16, textAlign: "center" as const, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>
                  {cardQueued ? "Card queued for approval ✓" : `Card on its way to ${contact.full_name.split(" ")[0]}!`}
                </div>
                <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>
                  {cardQueued ? "Check the Approvals section on your dashboard to review and send." : "Handwritten and mailed via Handwrytten"}
                </div>
              </div>            ) : (
              <>
             {!contact.home_address && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "12px 14px", marginBottom: 12, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                  ⚠️ No address on file. When you click <b>Send to Approval</b>, this card will be queued in <b>Approval Needed</b> on your dashboard. Add the address there when you have it, and it'll send automatically.
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
                        const newSeed = Math.floor(Math.random() * 1000);
                        setVariationSeed(newSeed);
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
                              variation_seed: newSeed,
                              card_tone_override: cardTone,
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
                    {/* Tone chips — pick how the card should feel */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, marginBottom: 6 }}>Tone:</div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                        {[
                          { id: "warm", label: "Warm" },
                          { id: "playful", label: "Playful" },
                          { id: "heartfelt", label: "Heartfelt" },
                          { id: "short", label: "Short & sweet" },
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={async () => {
                              setCardTone(t.id);
                              setGenerating(true);
                              setMessage("");
                              const newSeed = Math.floor(Math.random() * 1000);
                              setVariationSeed(newSeed);
                              try {
                                const res = await fetch("/api/relationships/draft", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    contact_name: contact.full_name,
                                    relationship_type: contact.relationship_type,
                                    key_context: contact.key_context,
                                    contact_id: contact.id,
                                    occasion: cardOccasion,
                                    variation_seed: newSeed,
                                    card_tone_override: t.id,
                                  }),
                                });
                                const data = await res.json();
                                setMessage(data.message || "wishing you all the best.");
                              } catch { setMessage("wishing you all the best."); }
                              setGenerating(false);
                            }}
                            disabled={generating}
                            style={{
                              padding: "5px 11px",
                              borderRadius: 16,
                              border: `1.5px solid ${cardTone === t.id ? C.terra : C.border2}`,
                              background: cardTone === t.id ? `${C.terra}18` : C.bg3,
                              color: cardTone === t.id ? C.terra : C.text3,
                              fontSize: 11,
                              fontWeight: cardTone === t.id ? 700 : 500,
                              cursor: generating ? "default" : "pointer",
                              fontFamily: font,
                            }}
                          >
                            {cardTone === t.id ? "✓ " : ""}{t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {generating ? (
                      <div style={{ background: C.bg3, borderRadius: 8, padding: 12, fontSize: 13, color: C.text3, marginBottom: 12 }}>Drafting your card message...</div>
                    ) : (
                      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                        style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.text, fontFamily: font, resize: "none" as const, outline: "none", boxSizing: "border-box" as const, lineHeight: 1.6, marginBottom: 12 }} />
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleSendCard} disabled={sending || generating || !cardOccasion}
                        style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: sending ? C.terraLight : C.terra, color: sending ? C.terra : "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer", fontFamily: font }}>
                        {sending
                          ? (savingAddress ? "Saving address..." : contact.home_address ? "Sending..." : "Queuing...")
                          : contact.home_address ? "Send Card" : "Send to Approval"}
                      </button>
                     <button onClick={async () => {
                        setGenerating(true);
                        setMessage("");
                        const newSeed = Math.floor(Math.random() * 1000);
                        setVariationSeed(newSeed);
                        try {
                          const res = await fetch("/api/relationships/draft", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              contact_name: contact.full_name,
                              relationship_type: contact.relationship_type,
                              key_context: contact.key_context,
                              contact_id: contact.id,
                              occasion: cardOccasion,
                              variation_seed: newSeed,
                              card_tone_override: cardTone,
                            }),
                          });
                          const data = await res.json();
                          setMessage(data.message || "wishing you all the best.");
                        } catch { setMessage("wishing you all the best."); }
                        setGenerating(false);
                      }} disabled={generating} style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 13, cursor: "pointer", fontFamily: font }}>↻</button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      {showUpgrade && <UpgradeModal reason="drafts" onClose={() => setShowUpgrade(false)} />}
      {showPaymentModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 420, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Add a Payment Method</div>
            <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.6, marginBottom: 20 }}>
              Cards cost $4.75 each — you'll need a payment method on file to send. Add one in Settings → Plan & Billing.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowPaymentModal(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                Cancel
              </button>
              <button onClick={() => { setShowPaymentModal(false); window.location.href = "/settings"; }}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ── Approval Card ─────────────────────────────────────────────────────────────
function ApprovalCard({ approval, onDone }: { approval: any; onDone: (id: string) => void }) {
  const hasHome = !!approval.address;
  const hasWork = !!approval.work_address;
  const [useWork, setUseWork] = useState(!hasHome && hasWork);
  const [editedMessage, setEditedMessage] = useState(approval.message);
  const activeAddress = useWork ? approval.work_address : approval.address;
  const addr1Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const daysLeft = Math.ceil((new Date(approval.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const handleSend = async () => {
    let address = activeAddress;
    if (!address) {
      const street = addr1Ref.current?.value;
      const city = cityRef.current?.value;
      const state = stateRef.current?.value;
      const zip = zipRef.current?.value;
      if (!street || !city || !state || !zip) { alert("Please fill in the full address before sending."); return; }
      address = { streetAddress: street, city, region: state, postalCode: zip, country: "United States" };
    }
    await fetch("/api/cards/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approval_id: approval.id, action: "approve", address, message: editedMessage }) });
    onDone(approval.id);
  };

  const handleSkip = async () => {
    await fetch("/api/cards/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approval_id: approval.id, action: "skip" }) });
    onDone(approval.id);
  };

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.terra}44`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{approval.contact_name}</div>
        <span style={{ fontSize: 10, color: daysLeft <= 3 ? C.red : C.amber, fontWeight: 600 }}>{daysLeft}d left</span>
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>{approval.occasion} card</div>
      <textarea
        value={editedMessage}
        onChange={e => setEditedMessage(e.target.value)}
        rows={4}
        style={{ width: "100%", fontSize: 11, color: C.text2, lineHeight: 1.5, background: C.bg3, borderRadius: 6, padding: "8px 10px", marginBottom: 10, border: `1px solid ${C.border2}`, fontFamily: font, resize: "none" as const, outline: "none", boxSizing: "border-box" as const }}
      />
      {(hasHome || hasWork) ? (
        <div style={{ marginBottom: 10 }}>
          {hasHome && hasWork && (
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button onClick={() => setUseWork(false)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, border: "none", background: !useWork ? C.terra : C.bg3, color: !useWork ? "#fff" : C.text3, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>Home</button>
              <button onClick={() => setUseWork(true)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, border: "none", background: useWork ? C.terra : C.bg3, color: useWork ? "#fff" : C.text3, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>Work</button>
            </div>
          )}
          <div style={{ fontSize: 10, color: C.text3, background: C.bg3, borderRadius: 6, padding: "6px 10px" }}>
            {activeAddress?.streetAddress}<br />
            {activeAddress?.city}, {activeAddress?.region} {activeAddress?.postalCode}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.amber, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>⚠️ Add address to send</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
            <input ref={addr1Ref} placeholder="Street address" style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 11, fontFamily: font, outline: "none", boxSizing: "border-box" as const }} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 5 }}>
              <input ref={cityRef} placeholder="City" style={{ padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 11, fontFamily: font, outline: "none", width: "100%", boxSizing: "border-box" as const }} />
              <input ref={stateRef} placeholder="ST" style={{ padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 11, fontFamily: font, outline: "none", width: "100%", boxSizing: "border-box" as const }} />
              <input ref={zipRef} placeholder="Zip" style={{ padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 11, fontFamily: font, outline: "none", width: "100%", boxSizing: "border-box" as const }} />
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={handleSend} style={{ flex: 1, padding: "7px", borderRadius: 6, border: "none", background: C.terra, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Send</button>
        <button onClick={handleSkip} style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 11, cursor: "pointer", fontFamily: font }}>Skip</button>
      </div>
    </div>
  );
}
// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [activeNav, setActiveNav] = useState<"home" | "contacts" | "audience" | "campaigns" | "journal" | "stats">("home");
  const [allClassified, setAllClassified] = useState<Contact[]>([]);
  const [tierCounts, setTierCounts] = useState({ tier1: 0, tier2: 0, tier3: 0, tier4: 0, tier5: 0, unassigned: 0 });
  const [reengageContacts, setReengageContacts] = useState<Contact[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("engage_dismissed");
      if (!stored) return new Set();
      const parsed = JSON.parse(stored) as { id: string; until: number }[];
      const now = Date.now();
      // Only keep dismissals that haven't expired
      return new Set(parsed.filter(d => d.until > now).map(d => d.id));
    } catch { return new Set(); }
  });
  const [reachedOutIds, setReachedOutIds] = useState<Set<string>>(new Set());
  const [connectorPair, setConnectorPair] = useState<[Contact, Contact] | null>(null);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());
  const [introDone, setIntroDone] = useState(false);
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [impactStats, setImpactStats] = useState({ reached_out: 0, cards_sent: 0, intros_made: 0, campaigns_running: 0 });
  const [networkHealth, setNetworkHealth] = useState({ "A+": 0, A: 0, B: 0, C: 0 });
  const [userName, setUserName] = useState("Tom");
  const [showReflection, setShowReflection] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...DEFAULT_ORDER]);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [engagePage, setEngagePage] = useState(0);
  const [snoozeDays, setSnoozeDays] = useState(10);
  const [cardApprovals, setCardApprovals] = useState<any[]>([]);
  const [needsInfoApprovals, setNeedsInfoApprovals] = useState<any[]>([]);
  const [eventCardOccasion, setEventCardOccasion] = useState<string>("");
  const [planData, setPlanData] = useState<any>(null);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
     const [classifyData, eventsData, introsData, userData, planInfo, tierCountsData] = await Promise.all([
        fetch("/api/relationships/classify").then(r => r.json()).catch(() => ({ contacts: [] })),
        fetch("/api/life-events").then(r => r.json()).catch(() => ({ events: [] })),
        fetch("/api/relationships/intros").then(r => r.json()).catch(() => ({ count: 0 })),
        fetch("/api/auth/me").then(r => r.json()).catch(() => null),
        fetch("/api/plan").then(r => r.json()).catch(() => null),
        fetch("/api/contacts/tier-counts").then(r => r.json()).catch(() => null),
      ]);
      if (tierCountsData?.counts) setTierCounts(tierCountsData.counts);
      if (userData?.name) setUserName(userData.name.split(" ")[0]);
      if (planInfo) setPlanData(planInfo);
      const classified = classifyData.contacts || [];
      setAllClassified(classified);
      setReengageContacts(buildReengage(classified, dismissedIds, 0));
      setConnectorPair(findConnectorPair(classified, dismissedPairs));
      const upcoming = (eventsData.events || [])
        .map((e: LifeEvent) => ({ ...e, days: daysUntil(e.event_date) }))
        .filter((e: any) => e.days <= 30 && e.days >= 0)
        .sort((a: any, b: any) => a.days - b.days)
        .slice(0, 5);
      setLifeEvents(upcoming);
      const hc = { "A+": 0, A: 0, B: 0, C: 0 };
      classified.forEach((c: Contact) => {
        if ((c.relationship_strength || 0) >= 80) hc["A+"]++;
        else if ((c.relationship_strength || 0) >= 55) hc["A"]++;
        else if ((c.relationship_strength || 0) >= 30) hc["B"]++;
        else hc["C"]++;
      });
      setNetworkHealth(hc);
      setImpactStats({ reached_out: 7, cards_sent: 3, intros_made: introsData.count || 0, campaigns_running: 0 });
    } catch (e) { console.error(e); }
    fetch("/api/cards/approve?list=true").then(r => r.json()).then(d => {
      setCardApprovals(d.approvals || []);
      setNeedsInfoApprovals(d.needs_info || []);
    }).catch(() => {});
    fetch("/api/settings").then(r => r.json()).then(d => {
  if (d?.snooze_days) setSnoozeDays(d.snooze_days);
}).catch(() => {});
    setLoading(false);
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    setDismissedIds(new Set()); setReachedOutIds(new Set()); setDismissedPairs(new Set()); setIntroDone(false);
    setEngagePage(0);
    try {
      await fetch("/api/relationships/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_size: 20 }) });
      await loadAll();
    } catch {}
    setRefreshing(false);
  };

const handleDismiss = (id: string) => {
    // X button = "pause" action with user's custom snooze duration from settings
    handleEngageAction(id, "pause");
  };

  const handleLogTouch = async (id: string, method: string = "Other") => {
    await fetch("/api/relationships/draft", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_id: id }) }).catch(() => {});
    await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ last_meaningful_touch_at: new Date().toISOString(), last_contact_method: method }) }).catch(() => {});
    // Clear contacts page cache so it reflects the touch
    try { localStorage.removeItem("tom_contacts_cache"); } catch {}
    handleDismiss(id);
  };

  // Handle pause/snooze/never-engage actions from the EngagedButton menu.
  // Writes to DB via /api/contacts/engage-action and removes the card from view.
  const handleEngageAction = async (id: string, action: string) => {
    // Optimistic UI — remove card instantly
    setAllClassified(cs => cs.map(c => {
      if (c.id !== id) return c;
      const now = Date.now();
      switch (action) {
        case "pause": {
          // User's custom snooze duration from settings (default 10 days)
          const days = Math.max(1, Math.min(365, snoozeDays || 10));
          return { ...c, engage_snoozed_until: new Date(now + days * 86400000).toISOString() };
        }
        case "pause_30":
          return { ...c, engage_snoozed_until: new Date(now + 30 * 86400000).toISOString() };
        case "snooze_1year":
          return { ...c, engage_snoozed_until: new Date(now + 365 * 86400000).toISOString() };
        case "never_engage":
          return { ...c, engage_permanently_excluded: true, engage_snoozed_until: null };
        default:
          return c;
      }
    }));
    setReengageContacts(prev => prev.filter(c => c.id !== id));

    // Persist to DB. For "pause" action, send the user's snoozeDays preference.
    try {
      const payload: any = { contact_id: id, action };
      if (action === "pause") {
        payload.days = Math.max(1, Math.min(365, snoozeDays || 10));
      }
      await fetch("/api/contacts/engage-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("engage-action failed:", e);
    }
  };
const handleTierChange = async (id: string, tier: number) => {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dunbar_tier: tier, tier_override: true }),
    }).catch(() => {});
    setAllClassified(cs => cs.map(c => c.id === id ? { ...c, dunbar_tier: tier, tier_override: true } : c));
    setReengageContacts(cs => cs.map(c => c.id === id ? { ...c, dunbar_tier: tier, tier_override: true } : c));
  };

const handleBucketChange = async (id: string, buckets: string[]) => {
    // Optimistic UI update first — state updates immediately, API call happens in background.
    // We also set tier_override: true on every manual bucket change so the nightly
    // classifier doesn't overwrite the user's choice. Mirror what the tier change does.
    setAllClassified(cs => cs.map(c => c.id === id ? { ...c, dunbar_bucket: buckets, tier_override: true } : c));
    setReengageContacts(cs => cs.map(c => c.id === id ? { ...c, dunbar_bucket: buckets, tier_override: true } : c));
    try {
      await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dunbar_bucket: buckets, tier_override: true }),
      });
      try { localStorage.removeItem("tom_contacts_cache"); } catch {}
    } catch {}
  };

const handleDelete = async (id: string) => {
  if (!confirm("Delete this contact? This cannot be undone.")) return;
  await fetch("/api/contacts/" + id, { method: "DELETE" }).catch(() => {});
  setAllClassified(cs => cs.filter(c => c.id !== id));
  setReengageContacts(cs => cs.filter(c => c.id !== id));
};

  const handleRefreshConnector = () => {
    if (!connectorPair) return;
    const key = [connectorPair[0].id, connectorPair[1].id].sort().join("-");
    const next = new Set(dismissedPairs); next.add(key);
    setDismissedPairs(next);
    setIntroDone(false);
    setConnectorPair(findConnectorPair(allClassified, next));
  };

  const handleSaveEdit = async (updated: Partial<Contact>) => {
    if (!editContact) return;
    const res = await fetch(`/api/contacts/${editContact.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    const data = await res.json();
    console.log("Save edit payload:", JSON.stringify(updated));
    console.log("Save edit response:", JSON.stringify(data));
    const savedContact = data.contact ? { ...editContact, ...data.contact } : { ...editContact, ...updated };
    setAllClassified(cs => cs.map(c => c.id === editContact.id ? savedContact : c));
    setReengageContacts(cs => cs.map(c => c.id === editContact.id ? savedContact : c));
    setEditContact(null);
  };

  const handleIntroDone = async () => {
    if (!connectorPair) return;
    setIntroDone(true);
    await fetch("/api/relationships/intros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_a_id: connectorPair[0].id, contact_b_id: connectorPair[1].id, contact_a_name: connectorPair[0].full_name, contact_b_name: connectorPair[1].full_name }) }).catch(() => {});
    setImpactStats(p => ({ ...p, intros_made: p.intros_made + 1 }));
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    const next = [...widgetOrder];
    const [moved] = next.splice(dragItem.current, 1);
    next.splice(dragOver.current, 0, moved);
    setWidgetOrder(next);
    dragItem.current = null;
    dragOver.current = null;
  };

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "cards_review": {
        // Merge both lists — needs-info first (so missing address items bubble to the top),
        // then regular approvals. Tag each so the UI knows how to label it.
        const merged = [
          ...needsInfoApprovals.map((a: any) => ({ ...a, _source: "needs_info" as const })),
          ...cardApprovals.map((a: any) => ({ ...a, _source: "approvals" as const })),
        ];
        const totalCount = merged.length;
        const needsInfoCount = needsInfoApprovals.length;

        return (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span>Approval Needed</span>
              {totalCount > 0 && (
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: C.terra, color: "#fff", fontWeight: 700 }}>
                  {totalCount}
                </span>
              )}
              {needsInfoCount > 0 && (
                <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: C.amber, color: "#fff", fontWeight: 700 }}>
                  {needsInfoCount} needs info
                </span>
              )}
            </div>
            {merged.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text4, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
                No cards pending approval
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {merged.map((approval: any) => (
                  <div key={approval.id} style={{ position: "relative" as const }}>
                    {approval._source === "needs_info" && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.amber, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4 }}>
                        ⚠ Needs address
                      </div>
                    )}
                    <ApprovalCard
                      approval={approval}
                      onDone={(id) => {
                        if (approval._source === "needs_info") {
                          setNeedsInfoApprovals(prev => prev.filter((a: any) => a.id !== id));
                        } else {
                          setCardApprovals(prev => prev.filter((a: any) => a.id !== id));
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      case "reflection":
        return (
          <div style={{ background: C.purpleLight, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 8 }}>Today's Reflection</div>
            {showReflection ? (
              <div>
                <div style={{ background: C.bg2, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}><JournalChat autoStart /></div>
                <button onClick={() => setShowReflection(false)} style={{ fontSize: 11, color: C.purple, background: "none", border: "none", cursor: "pointer", fontFamily: font }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: C.purple, lineHeight: 1.6, marginBottom: 10 }}>Have a chat with Humble Hello about your contacts and they will update automatically.</div>
                <button onClick={() => window.dispatchEvent(new CustomEvent("open-journal"))} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "none", background: C.purple, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Start today's conversation</button>
              </>
            )}
          </div>
        );

      case "events":
        return (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 10 }}>Upcoming Birthdays</div>
            {lifeEvents.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text4, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>No birthdays in the next 30 days</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                {lifeEvents.map(e => (
                  <div key={e.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "center" as const, flexShrink: 0, width: 36 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: e.days! <= 3 ? C.red : e.days! <= 7 ? C.amber : C.green }}>{e.days}</div>
                      <div style={{ fontSize: 9, color: C.text4, textTransform: "uppercase" as const }}>days</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.contact_name}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{e.event_type} · {new Date(e.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </div>
                  <button
                      onClick={async () => {
                        let contact = allClassified.find(c => c.full_name === e.contact_name);
                        if (!contact) {
                          const res = await fetch(`/api/contacts?search=${encodeURIComponent(e.contact_name)}&limit=1`);
                          const data = await res.json();
                          // Only use if name matches closely
                          const found = (data.contacts || []).find((c: Contact) => 
                            c.full_name.toLowerCase() === e.contact_name.toLowerCase()
                          );
                          contact = found || null;
                        }
                        if (contact) {
                          setEventCardOccasion(e.event_type === "Birthday" ? "Happy Birthday" : "Congratulations");
                          setSelectedContact(contact);
                        } else {
                          alert(`Couldn't find contact for ${e.contact_name}.`);
                        }
                      }}
                      style={{ fontSize: 10, padding: "4px 8px", borderRadius: 5, border: "none", background: C.terra, color: "#fff", cursor: "pointer", fontFamily: font, fontWeight: 600, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
                      Send Card
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "health":
        return (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 10 }}>Network Health</div>
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
              {[
                { label: "Core 5", count: tierCounts.tier1, cap: 5, color: "#bf5c38" },
                { label: "Inner Circle 15", count: tierCounts.tier2, cap: 15, color: "#6b9970" },
                { label: "Active 50", count: tierCounts.tier3, cap: 50, color: "#3b82f6" },
                { label: "Network 150", count: tierCounts.tier4, cap: 150, color: "#8b5cf6" },
              ].map((tier, i) => {
                const pct = Math.min(100, Math.round((tier.count / tier.cap) * 100));
                return (
                  <div key={tier.label} style={{ paddingBottom: i < 3 ? 10 : 0, marginBottom: i < 3 ? 10 : 0, borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{tier.label}</span>
                      <span style={{ fontSize: 11, color: tier.color, fontWeight: 700 }}>{tier.count} / {tier.cap}</span>
                    </div>
                    <div style={{ height: 4, background: C.bg3, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: tier.color, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "campaign":
        return (
          <div style={{ background: C.bg2, border: `1px solid ${C.purple}44`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Campaign Builder</div>
            <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, marginBottom: 10 }}>Send targeted email, card, and SMS sequences to segmented contacts — AI personalizes each message per person.</div>
            <button onClick={() => router.push("/campaigns?new=1")}
              style={{ width: "100%", fontSize: 12, padding: "8px", borderRadius: 6, border: "none", background: C.purple, color: "#fff", cursor: "pointer", fontFamily: font, fontWeight: 600 }}>
              Build a Campaign →
            </button>
          </div>
        );
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      <Sidebar activeId={activeNav === "home" ? "home" : activeNav} onNavClick={(id) => {
        if (id === "contacts") { router.push("/contacts"); return; }
        if (id === "audience") { router.push("/audience"); return; }
        if (id === "campaigns") { router.push("/campaigns"); return; }
        setActiveNav(id as any);
      }} /><main style={{ flex: 1, overflowY: "auto" as const, padding: isMobile ? "16px 14px" : "24px 32px", minWidth: 0, width: isMobile ? "100%" : "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {planData && planData.plan === "trial" && (planData.trial_expired || planData.trial_days_left <= 2) && (
          <div style={{ background: planData.trial_expired ? C.redLight : C.amberLight, border: `1px solid ${planData.trial_expired ? C.red : C.amber}`, borderRadius: 10, padding: isMobile ? "12px 14px" : "12px 20px", marginBottom: 20, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 0 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: planData.trial_expired ? C.red : C.amber }}>
                {planData.trial_expired ? "Your trial has ended" : `Your trial ends in ${planData.trial_days_left} day${planData.trial_days_left === 1 ? "" : "s"}`}
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
                {planData.trial_expired
                  ? `Free plan limit: ${planData.contact_limit?.toLocaleString()} contacts. Upgrade to keep full access.`
                  : "Upgrade now to keep unlimited access to all features."}
              </div>
            </div>
            <button onClick={() => window.location.href = "/plans"}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: planData.trial_expired ? C.red : C.amber, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font, flexShrink: 0, marginLeft: 16 }}>
              Upgrade
            </button>
          </div>
        )}
        <div style={{ marginBottom: isMobile ? 20 : 28, display: "flex", alignItems: isMobile ? "center" : "flex-start", justifyContent: "space-between", flexDirection: isMobile ? "column-reverse" : "row", gap: isMobile ? 12 : 0 }}>
          <div style={{ width: isMobile ? "100%" : "auto" }}>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: C.text }}>{getGreeting()}, {userName}</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}><LiveDateTime /></div>
          </div>
          <img src="/logo-terra.svg" alt="humble hello." style={{ height: isMobile ? 32 : 48, marginTop: isMobile ? 0 : 4, alignSelf: isMobile ? "flex-start" : "auto" }} />
        </div>

        {activeNav === "home" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 32 }}>
         
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Engage</div>
                <button onClick={() => { const el = document.getElementById("engage-why"); if (el) el.style.display = el.style.display === "none" ? "block" : "none"; }} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, border: `1px solid ${C.border2}`, background: "transparent", color: C.text3, cursor: "pointer", fontFamily: font }}>why this matters</button>
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>These contacts could use a check-in — sorted by urgency and tier</div>
              <div id="engage-why" style={{ display: "none", marginBottom: 12, background: C.greenLight, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.green, lineHeight: 1.6 }}>
                Humble Hello uses AI to surface who needs attention most based on your relationship tiers and how long it's been since you last touched base. Core 5 every 30 days, Inner Circle every 60 days, Active every 120 days. Sorted by urgency — most overdue first.
              </div>
              {loading ? (
                <div style={{ fontSize: 13, color: C.text3 }}>Loading your relationships...</div>
              ) : reengageContacts.length === 0 ? (
                <div style={{ background: C.bg2, borderRadius: 12, padding: 24, textAlign: "center" as const, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 14, color: C.text3 }}>You're all caught up — no contacts overdue right now</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(380px, 1fr))", gap: isMobile ? 10 : 12 }}>
                  {reengageContacts.map(c => (
                    <ReengageCard key={c.id} contact={c}
  onSelect={() => setSelectedContact(c)}
  onDismiss={() => handleDismiss(c.id)}
  onEdit={() => setEditContact(c)}
  onDelete={() => handleDelete(c.id)}
  onOpenCard={() => router.push("/contacts?open=" + c.id)}
  onLogTouch={(method) => handleLogTouch(c.id, method)}
  onEngageAction={(action) => handleEngageAction(c.id, action)}
  onTierChange={(tier) => handleTierChange(c.id, tier)}
  onBucketChange={(buckets) => handleBucketChange(c.id, buckets)}
  reachedOut={reachedOutIds.has(c.id)} />
))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 11, color: C.text4 }}>Page {engagePage + 1}</span>
                <button onClick={() => {
                  const next = engagePage + 1;
                  const nextContacts = buildReengage(allClassified, dismissedIds, next);
                  if (nextContacts.length > 0) { setEngagePage(next); setReengageContacts(nextContacts); }
                  else { setEngagePage(0); setReengageContacts(buildReengage(allClassified, dismissedIds, 0)); }
                }} style={{ fontSize: 12, padding: "8px 20px", borderRadius: 8, border: "none", background: C.green, color: "#fff", cursor: "pointer", fontFamily: font, fontWeight: 600 }}>
                  Next 12 →
                </button>
                <button onClick={handleRefreshAll} disabled={refreshing} style={{ fontSize: 12, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: refreshing ? C.text4 : C.text2, cursor: refreshing ? "default" : "pointer", fontFamily: font }}>
                  {refreshing ? "..." : "↻"}
                </button>
              </div>
            </section>
          </div>
        )}

        {activeNav === "journal" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12 }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Journal is always available</div>
            <div style={{ fontSize: 13, color: C.text3 }}>Click the purple bubble in the bottom-right corner to start a conversation.</div>
          </div>
        )}

        {activeNav === "stats" && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Activity Stats</div>
            <div style={{ fontSize: 12, color: C.text3, marginBottom: 20 }}>Your relationship investment over time</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 10 : 16 }}>
              {[
                { label: "Total Contacts", value: "18,267", sub: "in your network", color: C.blue },
                { label: "Reached Out", value: impactStats.reached_out.toString(), sub: "this week", color: C.purple },
                { label: "Gift Ready", value: "643", sub: "have home address", color: C.green },
                { label: "Life Events", value: lifeEvents.length.toString(), sub: "in next 30 days", color: C.pink },
              ].map(stat => (
                <div key={stat.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 4 }}>{stat.label}</div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </main>

      <aside style={{ width: isMobile ? "100%" : 290, padding: isMobile ? "16px 14px" : "24px 16px", borderLeft: isMobile ? "none" : `1px solid ${C.border}`, borderTop: isMobile ? `1px solid ${C.border}` : "none", overflowY: "auto" as const, flexShrink: 0 }}>
                {!isMobile && <div style={{ fontSize: 10, color: C.text4, marginBottom: 16, textAlign: "center" as const, letterSpacing: "0.05em" }}>Drag to reorder</div>}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>
          {widgetOrder.map((id, idx) => (
            <div key={id} draggable={!isMobile}
              onDragStart={() => { if (!isMobile) dragItem.current = idx; }}
              onDragEnter={() => { if (!isMobile) dragOver.current = idx; }}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{ cursor: isMobile ? "default" : "grab" }}>
              {renderWidget(id)}
            </div>
          ))}
        </div>
      </aside>

      {selectedContact && (
        <QuickActionPanel contact={selectedContact} onClose={() => { setSelectedContact(null); setEventCardOccasion(""); }}
          onReachedOut={() => { setReachedOutIds(prev => new Set([...prev, selectedContact.id])); setSelectedContact(null); setEventCardOccasion(""); }}
          initialOccasion={eventCardOccasion} />
      )}
      {editContact && (
        <SharedEditModal contact={editContact} onClose={() => setEditContact(null)} onSave={handleSaveEdit} />
      )}
    </div>
  );
}