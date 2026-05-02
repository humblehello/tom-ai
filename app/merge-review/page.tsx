"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import SharedEditModal from "@/app/components/EditModal";
import { useIsMobile } from "@/app/lib/useMediaQuery";

import { C, font } from "@/app/lib/theme";

const RELATIONSHIP_TYPE_OPTIONS = ["close_friend", "family", "friend", "customer", "vendor", "colleague", "mentor", "acquaintance"];

function tierColor(type?: string): string {
  switch (type) {
    case "family": return C.purple;
    case "close_friend": return C.purple;
    case "friend": return C.blue;
    case "customer": return C.green;
    case "mentor": return C.amber;
    case "colleague": return C.text3;
    case "vendor": return C.text4;
    default: return C.text4;
  }
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return raw.trim();
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

type Contact = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  home_address?: any;
  work_address?: any;
  relationship_type?: string;
  relationship_types?: string[];
  relationship_strength?: number;
  relationship_health?: string;
  key_context?: string;
  notes?: string;
  notes_context?: string;
  topics?: string[];
  best_channel?: string;
  best_time?: string;
  communication_style?: string;
  met_where?: string;
  email_count?: number;
  last_emailed_at?: string;
  birthday?: string;
  all_emails?: string[];
};

type MergeItem = {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  contact_a_name: string;
  contact_b_name: string;
  reason: string;
  created_at: string;
  contact_a?: Contact;
  contact_b?: Contact;
};

function initials(name: string): string {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}
function formatReason(reason: string): string {
  return reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Edit Modal ───────────────────────────────────────────────────────────────
// Now lives in /app/components/EditModal.tsx as SharedEditModal (see import at top)

// ── Contact Card ─────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 6 }}>
      <span style={{ color: C.text4, width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text2, wordBreak: "break-all" as const }}>{value}</span>
    </div>
  );
}

function ContactCard({ contact, name, selected, onSelect, onEdit, label }: {
  contact: Contact | undefined; name: string; selected: boolean;
  onSelect: () => void; onEdit: () => void; label: string;
}) {
  const addr = contact?.home_address;
  const addrStr = addr ? [addr.streetAddress, addr.city, addr.region].filter(Boolean).join(", ") : null;

  return (
    <div style={{ flex: 1, border: `2px solid ${selected ? C.green : C.border2}`, borderRadius: 12, padding: 20, background: selected ? C.greenLight : C.bg2, transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: selected ? C.green : C.text4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {selected ? "✓ Keep this one" : label}
        </div>
        <button onClick={e => { e.stopPropagation(); onEdit(); }}
          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text3, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>
          ✎ Edit
        </button>
      </div>

      {/* Clickable area */}
      <div onClick={onSelect} style={{ cursor: "pointer", flex: 1 }}>
        {/* Avatar + Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: selected ? C.green + "33" : C.bg3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: selected ? C.green : C.text3, flexShrink: 0 }}>
            {initials(name)}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{name}</div>
            {contact?.job_title && contact?.company && (
              <div style={{ fontSize: 11, color: C.text3 }}>{contact.job_title} · {contact.company}</div>
            )}
          </div>
        </div>

        {/* Fields */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <Field label="Email" value={contact?.email} />
          <Field label="Phone" value={contact?.phone} />
          <Field label="Company" value={contact?.company} />
          <Field label="Address" value={addrStr} />
          <Field label="Birthday" value={contact?.birthday} />
          <Field label="Context" value={contact?.key_context || contact?.notes} />
          {contact?.topics && contact.topics.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {contact.topics.slice(0, 5).map((t: string) => (
                <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.bg3, color: C.text3 }}>{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {[
            { label: "Emails", value: contact?.email_count || 0 },
            { label: "Strength", value: contact?.relationship_strength || "—" },
          ].map(s => (
            <div key={s.label} style={{ background: selected ? "rgba(255,255,255,0.5)" : C.bg3, borderRadius: 8, padding: "8px 10px", textAlign: "center" as const }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.text4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MergeReviewPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [queue, setQueue] = useState<MergeItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [selected, setSelected] = useState<"a" | "b" | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { loadQueue(); }, []);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/merge-queue");
      const data = await res.json();
      setQueue(data.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const item = queue[current];

  const handleSaveEdit = async (updated: Partial<Contact>) => {
    if (!editContact) return;
    await fetch(`/api/contacts/${editContact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    // Update local queue state
    setQueue(q => q.map((qi, i) => {
      if (i !== current) return qi;
      return {
        ...qi,
        contact_a: qi.contact_a?.id === editContact.id ? { ...qi.contact_a, ...updated } : qi.contact_a,
        contact_b: qi.contact_b?.id === editContact.id ? { ...qi.contact_b, ...updated } : qi.contact_b,
        contact_a_name: qi.contact_a?.id === editContact.id ? (updated.full_name || qi.contact_a_name) : qi.contact_a_name,
        contact_b_name: qi.contact_b?.id === editContact.id ? (updated.full_name || qi.contact_b_name) : qi.contact_b_name,
      };
    }));
  };

  const handleMerge = async () => {
    if (!selected || !item) return;
    setActing(true);
    const keepId = selected === "a" ? item.contact_a_id : item.contact_b_id;
    const deleteId = selected === "a" ? item.contact_b_id : item.contact_a_id;
    await fetch("/api/contacts/merge-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_id: item.id, action: "merge", keep_id: keepId, delete_id: deleteId }),
    });
    advance();
    setActing(false);
  };

  const handleKeepBoth = async () => {
    if (!item) return;
    setActing(true);
    await fetch("/api/contacts/merge-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_id: item.id, action: "keep_both" }),
    });
    advance();
    setActing(false);
  };

  const advance = () => {
    setSelected(null);
    if (current + 1 >= queue.length) setDone(true);
    else setCurrent(c => c + 1);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.text3, fontSize: 14 }}>Loading merge queue...</div>
    </div>
  );

  if (done || queue.length === 0) return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Merge queue complete</div>
      <div style={{ fontSize: 14, color: C.text3 }}>All contacts have been reviewed</div>
      <button onClick={() => router.push("/contacts")} style={{ marginTop: 8, padding: "12px 24px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
        Back to Contacts
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      {/* Sidebar */}
   <Sidebar activeId="contacts" />

      {/* Main */}
      <main style={{ flex: 1, padding: isMobile ? "20px 16px" : "32px 40px", maxWidth: 960, margin: "0 auto", width: "100%", minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", marginBottom: 8, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: C.text }}>Merge Review</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>
              {current + 1} of {queue.length} · {queue.length - current - 1} remaining
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, width: isMobile ? "100%" : "auto" }}>
            <button onClick={() => router.push("/contacts")}
              style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, cursor: "pointer", fontFamily: font, flex: isMobile ? 1 : "none" }}>
              ← Contacts
            </button>
            <button onClick={async () => {
              setLoading(true);
              const res = await fetch("/api/contacts/auto-merge", { method: "POST" });
              const data = await res.json();
              alert(`Auto-resolved ${data.auto_merged} duplicates — ${data.remaining} remaining for review`);
              await loadQueue();
              setCurrent(0);
              setLoading(false);
            }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.purple, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, flex: isMobile ? 1 : "none" }}>
              ⚡ Auto-resolve
            </button>
          </div>
        </div>


        {/* Progress bar */}
        <div style={{ height: 4, background: C.border, borderRadius: 4, marginBottom: 28, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((current + 1) / queue.length) * 100}%`, background: C.green, borderRadius: 4, transition: "width 0.3s" }} />
        </div>

        {/* Reason badge */}
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 10, marginBottom: 20, flexDirection: isMobile ? "column" as const : "row" as const }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: C.amberLight, color: C.amber, whiteSpace: "nowrap" as const }}>
            {formatReason(item.reason)}
          </span>
          <span style={{ fontSize: 12, color: C.text4 }}>{isMobile ? "Tap a card to select it as the keeper" : "Click a card to select it as the keeper, or edit first"}</span>
        </div>

        {/* Cards */}
        <div style={{ display: "flex", gap: isMobile ? 12 : 16, marginBottom: 24, alignItems: "stretch", flexDirection: isMobile ? "column" as const : "row" as const }}>
          <ContactCard
            contact={item.contact_a}
            name={item.contact_a_name}
            selected={selected === "a"}
            onSelect={() => setSelected(selected === "a" ? null : "a")}
            onEdit={() => setEditContact(item.contact_a || null)}
            label="Contact A"
          />
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, paddingTop: 40 }}>
              <div style={{ fontSize: 18, color: C.text4, fontWeight: 700 }}>vs</div>
            </div>
          )}
          {isMobile && (
            <div style={{ textAlign: "center" as const, fontSize: 11, color: C.text4, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", margin: "-4px 0" }}>
              vs
            </div>
          )}
          <ContactCard
            contact={item.contact_b}
            name={item.contact_b_name}
            selected={selected === "b"}
            onSelect={() => setSelected(selected === "b" ? null : "b")}
            onEdit={() => setEditContact(item.contact_b || null)}
            label="Contact B"
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexDirection: isMobile ? "column" as const : "row" as const }}>
          <button onClick={handleMerge} disabled={!selected || acting}
            style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: selected ? C.green : C.bg3, color: selected ? "#fff" : C.text4, fontSize: 13, fontWeight: 600, cursor: selected ? "pointer" : "default", fontFamily: font, transition: "all 0.15s", order: isMobile ? 1 : 3 }}>
            {acting ? "Merging..." : selected
              ? `Merge → Keep ${selected === "a" ? item.contact_a_name.split(" ")[0] : item.contact_b_name.split(" ")[0]}`
              : "Select one to keep"}
          </button>
          <button onClick={handleKeepBoth} disabled={acting}
            style={{ padding: "12px 24px", borderRadius: 8, border: `1px solid ${C.blue}`, background: C.blueLight, color: C.blue, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, order: 2 }}>
            Keep Both
          </button>
          <button onClick={() => advance()} disabled={acting}
            style={{ padding: "12px 24px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 13, cursor: "pointer", fontFamily: font, order: isMobile ? 3 : 1 }}>
            Skip for now
          </button>
        </div>
      </main>

      {/* Edit Modal */}
     {editContact && (
        <SharedEditModal
          contact={editContact}
          onClose={() => setEditContact(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}