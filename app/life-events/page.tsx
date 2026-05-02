"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { C, font } from "@/app/lib/theme";
const T = {
  bg: C.bg, bg2: C.bg2, bg3: C.bg3,
  border: C.border, border2: C.border2,
  text: C.text, text2: C.text2, text3: C.text3,
  green: C.terra, greenDim: C.terraLight,
  purple: C.purple, purpleDim: C.purpleLight,
  red: C.red, redDim: C.redLight,
  blue: C.blue, blueDim: C.blueLight,
  amber: C.amber, amberDim: C.amberLight,
};
const mono = font;

type LifeEvent = {
  id: string;
  contact_name: string;
  event_type: string;
  event_date: string;
  relationship_type: string;
  notes: string;
  recurring: boolean;
  last_actioned_year: number | null;
};

const EVENT_TYPES = ["Birthday", "Anniversary", "Wedding", "Graduation", "Baby shower", "Holiday", "Other"];
const RELATIONSHIP_TYPES = ["family", "close_friend", "colleague", "customer", "contact"];

function daysUntil(dateStr: string): number {
  const today = new Date();
  const eventDate = new Date(dateStr);
  const thisYear = new Date(today.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
  return Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number) {
  if (days <= 3) return T.red;
  if (days <= 7) return T.amber;
  if (days <= 14) return T.green;
  return T.text3;
}

export default function LifeEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [form, setForm] = useState({
    contact_name: "",
    event_type: "Birthday",
    event_date: "",
    relationship_type: "contact",
    notes: "",
    recurring: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/life-events");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const scan = async () => {
    setScanning(true); setScanResult(null);
    try {
      const res = await fetch("/api/life-events/scan", { method: "POST" });
      const data = await res.json();
      setScanResult(data);
      if (data.added > 0) load();
    } catch (e) { console.error(e); }
    setScanning(false);
  };

  const save = async () => {
    if (!form.contact_name || !form.event_date) return;
    setSaving(true);
    try {
      await fetch("/api/life-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowAdd(false);
      setForm({ contact_name: "", event_type: "Birthday", event_date: "", relationship_type: "contact", notes: "", recurring: true });
      load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const del = async (id: string) => {
    setDeleting(d => [...d, id]);
    await fetch(`/api/life-events?id=${id}`, { method: "DELETE" });
    setEvents(e => e.filter(x => x.id !== id));
    setDeleting(d => d.filter(x => x !== id));
  };

  const upcoming = events
    .map(e => ({ ...e, days: daysUntil(e.event_date) }))
    .sort((a, b) => a.days - b.days);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: mono, color: T.text, padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <button onClick={() => router.push("/dashboard")} style={{ fontSize: 10, color: T.text3, background: "none", border: "none", cursor: "pointer", fontFamily: mono, marginBottom: 6, padding: 0 }}>← Back to dashboard</button>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Life Events</div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{events.length} events · Humble Hello monitors these automatically</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={scan} disabled={scanning} style={{ fontSize: 10, padding: "7px 14px", borderRadius: 4, border: `1px solid ${T.border2}`, background: "transparent", color: scanning ? T.text3 : T.blue, cursor: scanning ? "default" : "pointer", fontFamily: mono }}>
              {scanning ? "Scanning Gmail..." : "Scan Gmail"}
            </button>
            <button onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 10, padding: "7px 14px", borderRadius: 4, border: "none", background: T.green, color: "#0f1117", cursor: "pointer", fontWeight: 700, fontFamily: mono }}>
              + Add event
            </button>
          </div>
        </div>

        {/* Scan result */}
        {scanResult && (
          <div style={{ background: T.blueDim, border: `1px solid ${T.blue}`, borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 10, color: T.blue }}>
            Scanned {scanResult.scanned} emails · detected {scanResult.detected} signals · added {scanResult.added} new events
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 14, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>New Event</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Person *</div>
                <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Name" style={{ width: "100%", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "7px 10px", color: T.text, fontFamily: mono, fontSize: 11, outline: "none", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Date *</div>
                <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} style={{ width: "100%", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "7px 10px", color: T.text, fontFamily: mono, fontSize: 11, outline: "none", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Event type</div>
                <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} style={{ width: "100%", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "7px 10px", color: T.text, fontFamily: mono, fontSize: 11, outline: "none", boxSizing: "border-box" as const }}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Relationship</div>
                <select value={form.relationship_type} onChange={e => setForm(f => ({ ...f, relationship_type: e.target.value }))} style={{ width: "100%", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "7px 10px", color: T.text, fontFamily: mono, fontSize: 11, outline: "none", boxSizing: "border-box" as const }}>
                  {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Notes</div>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Gift ideas, preferences..." style={{ width: "100%", background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "7px 10px", color: T.text, fontFamily: mono, fontSize: 11, outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.text2, cursor: "pointer" }}>
                <input type="checkbox" checked={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))} />
                Recurring yearly
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowAdd(false)} style={{ fontSize: 10, padding: "6px 14px", borderRadius: 4, border: `1px solid ${T.border2}`, background: "transparent", color: T.text3, cursor: "pointer", fontFamily: mono }}>Cancel</button>
                <button onClick={save} disabled={saving || !form.contact_name || !form.event_date} style={{ fontSize: 10, padding: "6px 14px", borderRadius: 4, border: "none", background: form.contact_name && form.event_date ? T.green : T.bg3, color: form.contact_name && form.event_date ? "#0f1117" : T.text3, cursor: "pointer", fontWeight: 700, fontFamily: mono }}>
                  {saving ? "Saving..." : "Save event"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Events list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.text3, fontSize: 11 }}>Loading...</div>
        ) : upcoming.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.text3, fontSize: 11 }}>
            No life events yet · Add one or scan Gmail to detect automatically
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcoming.map(e => (
              <div key={e.id} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                {/* Days pill */}
                <div style={{ width: 48, textAlign: "center" as const, flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: urgencyColor(e.days) }}>{e.days}</div>
                  <div style={{ fontSize: 8, color: T.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>days</div>
                </div>
                <div style={{ width: 1, height: 32, background: T.border, flexShrink: 0 }} />
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{e.contact_name}</div>
                  <div style={{ fontSize: 10, color: T.text2, marginTop: 1 }}>
                    {e.event_type} · {new Date(e.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {e.relationship_type}
                  </div>
                  {e.notes && <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{e.notes}</div>}
                </div>
                {/* Badges */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {e.recurring && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: T.purpleDim, color: T.purple, fontWeight: 700 }}>RECURRING</span>}
                  {e.days <= 14 && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: e.days <= 3 ? T.redDim : T.amberDim, color: e.days <= 3 ? T.red : T.amber, fontWeight: 700 }}>ACTION NEEDED</span>}
                  <button onClick={() => del(e.id)} disabled={deleting.includes(e.id)} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 3, border: `1px solid ${T.border2}`, background: "transparent", color: T.text3, cursor: "pointer", fontFamily: mono }}>
                    {deleting.includes(e.id) ? "..." : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}