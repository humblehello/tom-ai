"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import { C, font } from "@/app/lib/theme";
import { useIsMobile } from "@/app/lib/useMediaQuery";
import FeatureGate from "@/app/components/FeatureGate";
// ── Types ─────────────────────────────────────────────────────────────────────

type FilterOperator = "is" | "is_not" | "contains" | "not_contains" | "gt" | "lt" | "gte" | "lte" | "is_set" | "is_not_set" | "in" | "not_in";

type FilterRule = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string | string[] | number | null;
};

type FilterGroup = {
  id: string;
  logic: "AND" | "OR";
  rules: FilterRule[];
};

type Audience = {
  id: string;
  name: string;
  description?: string;
  filter_config: { groups: FilterGroup[]; group_logic: "AND" | "OR" };
  contact_count?: number;
  created_at: string;
  updated_at: string;
};

type Contact = {
  id: string;
  full_name: string;
  email?: string;
  company?: string;
  job_title?: string;
  dunbar_tier?: number;
  dunbar_bucket?: string[];
  tags?: any[];
  last_meaningful_touch_at?: string;
  home_address?: any;
  work_address?: any;
};

// ── Filter field definitions ──────────────────────────────────────────────────

const FILTER_FIELDS = [
  { group: "Relationship", fields: [
    { key: "dunbar_tier", label: "Tier", type: "select", options: [{ value: "1", label: "Core 5" }, { value: "2", label: "Inner Circle 15" }, { value: "3", label: "Active 50" }, { value: "4", label: "Network 150" }, { value: "5", label: "Acquaintance" }] },
    { key: "dunbar_bucket", label: "Bucket", type: "select", options: [{ value: "personal", label: "Personal" }, { value: "professional", label: "Professional" }, { value: "prospect", label: "Prospect" }] },
    { key: "relationship_type", label: "Relationship type", type: "select", options: [{ value: "close_friend", label: "Close friend" }, { value: "family", label: "Family" }, { value: "friend", label: "Friend" }, { value: "customer", label: "Customer" }, { value: "colleague", label: "Colleague" }, { value: "mentor", label: "Mentor" }, { value: "acquaintance", label: "Acquaintance" }] },
    { key: "relationship_health", label: "Relationship health", type: "select", options: [{ value: "thriving", label: "Thriving" }, { value: "warm", label: "Warm" }, { value: "cooling", label: "Cooling" }, { value: "cold", label: "Cold" }] },
    { key: "humble_score", label: "Humble score", type: "number" },
    { key: "relationship_strength", label: "Relationship strength", type: "number" },
  ]},
  { group: "Contact info", fields: [
    { key: "has_email", label: "Has email", type: "boolean" },
    { key: "has_personal_email", label: "Has personal email", type: "boolean" },
    { key: "has_work_email", label: "Has work email", type: "boolean" },
    { key: "has_phone", label: "Has phone", type: "boolean" },
    { key: "has_home_address", label: "Has home address", type: "boolean" },
    { key: "has_work_address", label: "Has work address", type: "boolean" },
    { key: "has_birthday", label: "Has birthday on file", type: "boolean" },
    { key: "has_linkedin", label: "Has LinkedIn URL", type: "boolean" },
  ]},
  { group: "Activity", fields: [
    { key: "last_meaningful_touch_at", label: "Last contacted", type: "date_relative" },
    { key: "last_emailed_at", label: "Last emailed", type: "date_relative" },
    { key: "never_contacted", label: "Never contacted", type: "boolean" },
    { key: "email_count", label: "Email count", type: "number" },
  ]},
  { group: "Professional", fields: [
    { key: "company", label: "Company", type: "text" },
    { key: "job_title", label: "Job title", type: "text" },
    { key: "industry", label: "Industry", type: "text" },
    { key: "seniority", label: "Seniority", type: "select", options: [{ value: "c_suite", label: "C-Suite" }, { value: "vp", label: "VP" }, { value: "director", label: "Director" }, { value: "manager", label: "Manager" }, { value: "individual", label: "Individual contributor" }] },
  ]},
  { group: "Location", fields: [
    { key: "city", label: "City", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "country", label: "Country", type: "text" },
  ]},
  { group: "Tags & interests", fields: [
    { key: "tags", label: "Tag", type: "text" },
    { key: "topics", label: "Topic / interest", type: "text" },
  ]},
];

const ALL_FIELDS = FILTER_FIELDS.flatMap(g => g.fields.map(f => ({ ...f, group: g.group })));

const OPERATORS_FOR_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is", label: "is exactly" },
    { value: "is_set", label: "is set" },
    { value: "is_not_set", label: "is not set" },
  ],
  number: [
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "gte", label: "at least" },
    { value: "lte", label: "at most" },
    { value: "is", label: "equals" },
  ],
  select: [
    { value: "in", label: "is any of" },
    { value: "not_in", label: "is none of" },
  ],
  boolean: [
    { value: "is", label: "is true" },
    { value: "is_not", label: "is false" },
  ],
  date_relative: [
    { value: "lt", label: "within last X days" },
    { value: "gt", label: "more than X days ago" },
    { value: "is_not_set", label: "never" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function newRule(): FilterRule {
  return { id: Math.random().toString(36).slice(2), field: "dunbar_tier", operator: "in", value: [] };
}

function newGroup(): FilterGroup {
  return { id: Math.random().toString(36).slice(2), logic: "AND", rules: [newRule()] };
}

function emptyConfig() {
  return { groups: [newGroup()], group_logic: "AND" as const };
}

const iStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const };
const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };

// ── Filter Rule Editor ────────────────────────────────────────────────────────

function RuleEditor({ rule, onChange, onRemove }: { rule: FilterRule; onChange: (r: FilterRule) => void; onRemove: () => void }) {
  const isMobile = useIsMobile();
  const field = ALL_FIELDS.find(f => f.key === rule.field);
  const operators = field ? (OPERATORS_FOR_TYPE[field.type] || OPERATORS_FOR_TYPE.text) : OPERATORS_FOR_TYPE.text;

  const handleFieldChange = (key: string) => {
    const newField = ALL_FIELDS.find(f => f.key === key);
    const newOps = newField ? (OPERATORS_FOR_TYPE[newField.type] || OPERATORS_FOR_TYPE.text) : OPERATORS_FOR_TYPE.text;
    onChange({ ...rule, field: key, operator: newOps[0].value, value: newField?.type === "boolean" ? null : newField?.type === "select" ? [] : "" });
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: isMobile ? "stretch" : "flex-start", padding: "10px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, flexDirection: isMobile ? "column" : "row" }}>
      {/* Field selector */}
      <select value={rule.field} onChange={e => handleFieldChange(e.target.value)}
        style={{ ...iStyle, width: isMobile ? "100%" : 200, flexShrink: 0, cursor: "pointer" }}>
        {FILTER_FIELDS.map(g => (
          <optgroup key={g.group} label={g.group}>
            {g.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>

      {/* Operator selector */}
      {field?.type !== "boolean" && (
        <select value={rule.operator} onChange={e => onChange({ ...rule, operator: e.target.value as FilterOperator })}
          style={{ ...iStyle, width: isMobile ? "100%" : 160, flexShrink: 0, cursor: "pointer" }}>
          {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
        </select>
      )}

      {/* Value input */}
      {field?.type === "boolean" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "9px 0", fontSize: 13, color: C.text3 }}>
          {rule.operator === "is" ? "✓ Must be true" : "✗ Must be false"}
        </div>
      )}

      {field?.type === "text" && rule.operator !== "is_set" && rule.operator !== "is_not_set" && (
        <input value={rule.value as string || ""} onChange={e => onChange({ ...rule, value: e.target.value })}
          placeholder="Enter value..." style={{ ...iStyle, flex: 1 }} />
      )}

      {field?.type === "number" && (
        <input type="number" value={rule.value as number || ""} onChange={e => onChange({ ...rule, value: Number(e.target.value) })}
          placeholder="0" style={{ ...iStyle, width: 100 }} />
      )}

      {field?.type === "date_relative" && rule.operator !== "is_not_set" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="number" value={rule.value as number || ""} onChange={e => onChange({ ...rule, value: Number(e.target.value) })}
            placeholder="30" style={{ ...iStyle, width: 80 }} />
          <span style={{ fontSize: 12, color: C.text3, whiteSpace: "nowrap" }}>days</span>
        </div>
      )}

      {field?.type === "select" && (
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {field.options?.map((opt: any) => {
            const selected = Array.isArray(rule.value) && rule.value.includes(opt.value);
            return (
              <button key={opt.value} onClick={() => {
                const current = Array.isArray(rule.value) ? rule.value : [];
                const next = selected ? current.filter(v => v !== opt.value) : [...current, opt.value];
                onChange({ ...rule, value: next });
              }} style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${selected ? C.blue : C.border2}`, background: selected ? C.blueLight : C.bg3, color: selected ? C.blue : C.text3, fontSize: 12, fontWeight: selected ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                {selected ? "✓ " : ""}{opt.label}
              </button>
            );
          })}
        </div>
      )}

      <button onClick={onRemove} style={{ padding: "9px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text3, fontSize: 14, cursor: "pointer", fontFamily: font, flexShrink: 0, alignSelf: isMobile ? "flex-end" : "auto" }}>×</button>
    </div>
  );
}

// ── Filter Builder ────────────────────────────────────────────────────────────

function FilterBuilder({ config, onChange }: { config: { groups: FilterGroup[]; group_logic: "AND" | "OR" }; onChange: (c: any) => void }) {
  const updateGroup = (idx: number, g: FilterGroup) => {
    const next = [...config.groups];
    next[idx] = g;
    onChange({ ...config, groups: next });
  };
  const removeGroup = (idx: number) => onChange({ ...config, groups: config.groups.filter((_, i) => i !== idx) });
  const addGroup = () => onChange({ ...config, groups: [...config.groups, newGroup()] });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {config.groups.map((group, gi) => (
        <div key={group.id}>
          {gi > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <button onClick={() => onChange({ ...config, group_logic: config.group_logic === "AND" ? "OR" : "AND" })}
                style={{ padding: "3px 12px", borderRadius: 20, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                {config.group_logic}
              </button>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
          )}
          <div style={{ border: `1px solid ${C.border2}`, borderRadius: 10, padding: 12, background: C.bg2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>Match</span>
                <button onClick={() => updateGroup(gi, { ...group, logic: group.logic === "AND" ? "OR" : "AND" })}
                  style={{ padding: "3px 10px", borderRadius: 20, border: `1px solid ${C.border2}`, background: group.logic === "AND" ? C.blueLight : C.amberLight, color: group.logic === "AND" ? C.blue : C.amber, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                  {group.logic === "AND" ? "ALL" : "ANY"}
                </button>
                <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>of these filters</span>
              </div>
              {config.groups.length > 1 && (
                <button onClick={() => removeGroup(gi)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", color: C.text4, fontSize: 11, cursor: "pointer", fontFamily: font }}>Remove group</button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.rules.map((rule, ri) => (
                <RuleEditor key={rule.id} rule={rule}
                  onChange={r => updateGroup(gi, { ...group, rules: group.rules.map((x, i) => i === ri ? r : x) })}
                  onRemove={() => updateGroup(gi, { ...group, rules: group.rules.filter((_, i) => i !== ri) })} />
              ))}
            </div>
            <button onClick={() => updateGroup(gi, { ...group, rules: [...group.rules, newRule()] })}
              style={{ marginTop: 10, padding: "7px 14px", borderRadius: 7, border: `1px dashed ${C.border2}`, background: "none", color: C.text3, fontSize: 12, cursor: "pointer", fontFamily: font }}>
              + Add filter
            </button>
          </div>
        </div>
      ))}
      <button onClick={addGroup}
        style={{ padding: "8px 16px", borderRadius: 8, border: `1px dashed ${C.border2}`, background: "none", color: C.text3, fontSize: 12, cursor: "pointer", fontFamily: font, alignSelf: "flex-start" }}>
        + Add filter group
      </button>
    </div>
  );
}

// ── Contact Picker ────────────────────────────────────────────────────────────

function ContactPicker({ selectedIds, onToggle }: { selectedIds: Set<string>; onToggle: (id: string, contact: Contact) => void }) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (search.length < 2) { setContacts([]); return; }
      setLoading(true);
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(search)}&limit=20`).catch(() => null);
      const data = res ? await res.json() : {};
      setContacts(data.contacts || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts by name, email, company..."
        style={{ ...iStyle, marginBottom: 8 }} />
      {loading && <div style={{ fontSize: 12, color: C.text3, padding: "8px 0" }}>Searching...</div>}
      {contacts.length > 0 && (
        <div style={{ border: `1px solid ${C.border2}`, borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
          {contacts.map(c => {
            const selected = selectedIds.has(c.id);
            return (
              <div key={c.id} onClick={() => onToggle(c.id, c)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", background: selected ? C.blueLight : "transparent", borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = C.bg3; }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected ? C.blue : C.border2}`, background: selected ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {selected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.full_name}</div>
                  <div style={{ fontSize: 11, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[c.job_title, c.company, c.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {search.length >= 2 && !loading && contacts.length === 0 && (
        <div style={{ fontSize: 12, color: C.text4, padding: "8px 0" }}>No contacts found</div>
      )}
    </div>
  );
}

// ── Hopper Upload ─────────────────────────────────────────────────────────────

function AudienceHopper({ onImported }: { onImported: (contacts: Contact[]) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (files: FileList) => {
    setProcessing(true);
    setResult(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("files", f));
      formData.append("audience_mode", "true");
      const res = await fetch("/api/contacts/hopper", { method: "POST", body: formData });
      const data = await res.json();
      setResult(`${data.imported || 0} contacts imported`);
      if (data.contacts) onImported(data.contacts);
    } catch { setResult("Upload failed"); }
    setProcessing(false);
    setTimeout(() => setResult(null), 5000);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files.length) processFile(e.dataTransfer.files); }}
      onClick={() => fileInputRef.current?.click()}
      style={{ border: `2px dashed ${isDragOver ? C.green : C.border2}`, borderRadius: 10, padding: 20, background: isDragOver ? C.greenLight : C.bg3, cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
      <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls" onChange={e => { if (e.target.files?.length) processFile(e.target.files); }} style={{ display: "none" }} />
      {processing ? (
        <div style={{ fontSize: 13, color: C.text3 }}>Processing file...</div>
      ) : result ? (
        <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{result}</div>
      ) : (
        <>
          <div style={{ fontSize: 22, marginBottom: 6 }}>⬆️</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Drop a CSV or Excel file</div>
          <div style={{ fontSize: 11, color: C.text4 }}>Contacts will be added to this audience and imported to Humble Hello</div>
        </>
      )}
    </div>
  );
}

// ── Audience Builder Modal ────────────────────────────────────────────────────

function AudienceModal({ audience, onClose, onSave }: { audience?: Audience | null; onClose: () => void; onSave: (a: Partial<Audience>) => Promise<void> }) {
  const isMobile = useIsMobile();
  const [name, setName] = useState(audience?.name || "");
  const [description, setDescription] = useState(audience?.description || "");
  const [mode, setMode] = useState<"filter" | "manual" | "hopper">("filter");
  const [config, setConfig] = useState(audience?.filter_config || emptyConfig());
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/audiences/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter_config: config }),
      });
      const data = await res.json();
      setPreviewCount(data.count ?? null);
    } catch { setPreviewCount(null); }
    setPreviewing(false);
  };

  const handleToggleManual = (id: string, contact: Contact) => {
    setManualIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); setManualContacts(cs => cs.filter(c => c.id !== id)); }
      else { next.add(id); setManualContacts(cs => [...cs, contact]); }
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      description: description.trim(),
      filter_config: mode === "filter" ? config : { groups: [], group_logic: "AND" },
      ...(mode !== "filter" ? { manual_contact_ids: [...manualIds] } : {}),
    });
    setSaving(false);
  };

  const totalManual = manualIds.size;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, width: "100%", maxWidth: 780, maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{audience ? "Edit audience" : "New audience"}</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>Max 250 contacts per audience</div>
          </div>
          <button onClick={onClose} style={{ background: C.bg3, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: C.text3, fontSize: 18 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Name + Description */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Audience name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot prospects Q2" style={iStyle} />
            </div>
            <div>
              <label style={lStyle}>Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this audience for?" style={iStyle} />
            </div>
          </div>

          {/* Mode tabs */}
          <div>
            <label style={lStyle}>Build method</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {(["filter", "manual", "hopper"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${mode === m ? C.blue : C.border2}`, background: mode === m ? C.blueLight : C.bg3, color: mode === m ? C.blue : C.text3, fontSize: 13, fontWeight: mode === m ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                  {m === "filter" ? "🔎 Filter builder" : m === "manual" ? "☑️ Manual pick" : "⬆️ Upload list"}
                </button>
              ))}
            </div>
          </div>

          {/* Filter builder */}
          {mode === "filter" && (
            <div>
              <FilterBuilder config={config} onChange={setConfig} />
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={handlePreview} disabled={previewing}
                  style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 13, cursor: "pointer", fontFamily: font }}>
                  {previewing ? "Counting..." : "Preview count"}
                </button>
                {previewCount !== null && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: previewCount > 250 ? C.red : C.green }}>
                    {previewCount} contacts match
                    {previewCount > 250 && " — will be capped at 250"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Manual picker */}
          {mode === "manual" && (
            <div>
              <ContactPicker selectedIds={manualIds} onToggle={handleToggleManual} />
              {totalManual > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: C.blueLight, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{totalManual} contacts selected {totalManual > 250 ? "(will be capped at 250)" : ""}</span>
                  <button onClick={() => { setManualIds(new Set()); setManualContacts([]); }} style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", fontFamily: font }}>Clear all</button>
                </div>
              )}
              {/* Selected chips */}
              {manualContacts.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {manualContacts.slice(0, 20).map(c => (
                    <span key={c.id} onClick={() => handleToggleManual(c.id, c)}
                      style={{ padding: "4px 10px", borderRadius: 20, background: C.bg3, border: `1px solid ${C.border2}`, fontSize: 12, color: C.text2, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      {c.full_name} <span style={{ color: C.text4 }}>×</span>
                    </span>
                  ))}
                  {manualContacts.length > 20 && <span style={{ fontSize: 12, color: C.text4, alignSelf: "center" }}>+{manualContacts.length - 20} more</span>}
                </div>
              )}
            </div>
          )}

          {/* Hopper upload */}
          {mode === "hopper" && (
            <div>
              <AudienceHopper onImported={(contacts) => {
                const ids = new Set(contacts.map(c => c.id));
                setManualIds(ids);
                setManualContacts(contacts);
              }} />
              {manualIds.size > 0 && (
                <div style={{ marginTop: 10, padding: "10px 14px", background: C.greenLight, borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.green }}>
                  {manualIds.size} contacts loaded from file {manualIds.size > 250 ? "(will be capped at 250)" : ""}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: name.trim() ? C.green : C.bg3, color: name.trim() ? "#fff" : C.text4, fontSize: 13, fontWeight: 600, cursor: saving || !name.trim() ? "default" : "pointer", fontFamily: font, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving..." : audience ? "Save changes" : "Create audience"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audience Card ─────────────────────────────────────────────────────────────

function AudienceCard({ audience, onEdit, onDelete, onSelect, selected }: { audience: Audience; onEdit: () => void; onDelete: () => void; onSelect: () => void; selected: boolean }) {
  const filterCount = audience.filter_config?.groups?.flatMap(g => g.rules).length || 0;
  const count = audience.contact_count ?? 0;
  const pct = Math.min(100, Math.round((count / 250) * 100));

  return (
    <div onClick={onSelect} style={{ background: selected ? C.blueLight : C.bg2, border: `2px solid ${selected ? C.blue : C.border}`, borderRadius: 12, padding: 16, cursor: "pointer", transition: "all 0.15s" }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = C.border2; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = C.border; }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: selected ? C.blue : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audience.name}</div>
          {audience.description && <div style={{ fontSize: 11, color: C.text3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audience.description}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text3, fontSize: 11, cursor: "pointer", fontFamily: font }}>Edit</button>
          <button onClick={onDelete} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 11, cursor: "pointer", fontFamily: font }}>Delete</button>
        </div>
      </div>

      {/* Contact count bar */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.text3 }}>{filterCount > 0 ? `${filterCount} filter${filterCount !== 1 ? "s" : ""}` : "Manual list"}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: count >= 250 ? C.amber : C.green }}>{count} / 250</span>
        </div>
        <div style={{ height: 4, background: C.bg3, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: count >= 250 ? C.amber : C.green, borderRadius: 2 }} />
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.text4 }}>
        Updated {new Date(audience.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function AudiencePageInner() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAudience, setEditingAudience] = useState<Audience | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { loadAudiences(); }, []);

  const loadAudiences = async () => {
    setLoading(true);
    const res = await fetch("/api/audiences").catch(() => null);
    const data = res ? await res.json() : {};
    setAudiences(data.audiences || []);
    setLoading(false);
  };

  const handleSave = async (payload: Partial<Audience>) => {
    const url = editingAudience ? `/api/audiences/${editingAudience.id}` : "/api/audiences";
    const method = editingAudience ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadAudiences();
      setShowModal(false);
      setEditingAudience(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this audience? Contacts already enrolled in campaigns won't be affected.")) return;
    await fetch(`/api/audiences/${id}`, { method: "DELETE" });
    setAudiences(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const filtered = audiences.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.description || "").toLowerCase().includes(search.toLowerCase()));
  const selected = audiences.find(a => a.id === selectedId);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      <Sidebar activeId="audience" onNavClick={(id) => {
        if (id === "contacts") { router.push("/contacts"); return; }
        if (id === "campaigns") { router.push("/campaigns"); return; }
        if (id === "home") { router.push("/"); return; }
      }} />

      <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 14px" : "32px", minWidth: 0, width: isMobile ? "100%" : "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between", marginBottom: isMobile ? 20 : 28, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: C.text }}>Audiences</div>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Segment your contacts into reusable lists for campaigns · 250 contacts max per audience</div>
            </div>
            <button onClick={() => { setEditingAudience(null); setShowModal(true); }}
              style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" }}>
              + New audience
            </button>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 20 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search audiences..."
              style={{ ...iStyle, maxWidth: 360 }} />
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ fontSize: 13, color: C.text3 }}>Loading audiences...</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: C.bg2, border: `2px dashed ${C.border2}`, borderRadius: 14, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>No audiences yet</div>
              <div style={{ fontSize: 13, color: C.text3, marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
                Audiences let you segment contacts by tier, bucket, company, activity, and more — then attach them to campaigns.
              </div>
              <button onClick={() => { setEditingAudience(null); setShowModal(true); }}
                style={{ padding: "10px 24px", borderRadius: 9, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                Create your first audience
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (selected ? "1fr 340px" : "1fr"), gap: 20, alignItems: "start" }}>
              {/* List */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, alignContent: "start" }}>
                {filtered.map(a => (
                  <AudienceCard key={a.id} audience={a} selected={selectedId === a.id}
                    onSelect={() => setSelectedId(selectedId === a.id ? null : a.id)}
                    onEdit={() => { setEditingAudience(a); setShowModal(true); }}
                    onDelete={() => handleDelete(a.id)} />
                ))}
              </div>

              {/* Detail panel */}
              {selected && (
                <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, position: isMobile ? "static" : "sticky", top: isMobile ? "auto" : 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selected.name}</div>
                    <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: C.text4, fontSize: 18, cursor: "pointer" }}>×</button>
                  </div>
                  {selected.description && <div style={{ fontSize: 12, color: C.text3, marginBottom: 14 }}>{selected.description}</div>}

                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Filters</div>
                  {selected.filter_config?.groups?.flatMap(g => g.rules).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                      {selected.filter_config.groups.flatMap(g => g.rules).map(rule => {
                        const field = ALL_FIELDS.find(f => f.key === rule.field);
                        return (
                          <div key={rule.id} style={{ padding: "6px 10px", background: C.bg3, borderRadius: 6, fontSize: 12, color: C.text2 }}>
                            <span style={{ fontWeight: 600 }}>{field?.label || rule.field}</span>
                            {" "}<span style={{ color: C.text3 }}>{rule.operator.replace(/_/g, " ")}</span>
                            {" "}<span style={{ fontWeight: 600 }}>{Array.isArray(rule.value) ? rule.value.join(", ") : rule.value?.toString() || ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.text4, marginBottom: 16 }}>Manual list — no filters</div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push(`/campaigns?audience=${selected.id}`)}
                      style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                      Use in campaign →
                    </button>
                    <button onClick={() => { setEditingAudience(selected); setShowModal(true); }}
                      style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                      Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {(showModal || editingAudience) && (
        <AudienceModal
          audience={editingAudience}
          onClose={() => { setShowModal(false); setEditingAudience(null); }}
          onSave={handleSave} />
      )}
    </div>
  );
}
export default function AudiencePage() {
  return (
    <FeatureGate feature="audience_builder">
      <AudiencePageInner />
    </FeatureGate>
  );
}