"use client";
import { useState, useRef } from "react";
import { C, font } from "@/app/lib/theme";
import type { ProcessingPlan } from "@/app/lib/hopper-smart-import";
import FeatureGate from "@/app/components/FeatureGate";

type Stage = "idle" | "analyzing" | "preview" | "importing" | "done";
type ImportResult = { queued: number; message: string; };

const MODE_LABELS: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  update_existing: { label: "Update existing",  color: C.blue,   bg: C.blueLight,   desc: "Match by email and fill in missing fields" },
  new_only:        { label: "New contacts only", color: C.green,  bg: C.greenLight,  desc: "Skip anyone already in your network" },
  partial_fields:  { label: "Partial update",    color: C.amber,  bg: C.amberLight,  desc: "Only update the specified fields" },
  tag_on_import:   { label: "Tag on import",     color: C.purple, bg: C.purpleLight, desc: "Apply a tag to all imported contacts" },
};

const ACTION_COLORS: Record<string, { color: string; bg: string }> = {
  create: { color: C.green,  bg: C.greenLight },
  update: { color: C.blue,   bg: C.blueLight },
  skip:   { color: C.text3,  bg: C.bg3 },
};

const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };

function HopperSmartImportInner() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<ProcessingPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStage("idle"); setFile(null); setInstruction(""); setPlan(null); setResult(null); setError(null); };

  const handleFile = (f: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
      setError("Smart Import works with CSV and Excel files. For images, use Quick Import below.");
      return;
    }
    setFile(f);
    setError(null);
  };

  const analyze = async () => {
    if (!file || !instruction.trim()) return;
    setStage("analyzing");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("instruction", instruction.trim());
      const res = await fetch("/api/contacts/hopper-smart-plan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setPlan(data.plan);
      setStage("preview");
    } catch (e: any) { setError(e.message); setStage("idle"); }
  };

  const confirmImport = async () => {
    if (!file || !plan) return;
    setStage("importing");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch("/api/contacts/hopper", { method: "POST", body: formData });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { queued: 0, message: "Import queued successfully." }; }
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult({ queued: data.queued || 0, message: data.message || "Import queued successfully." });
      setStage("done");
    } catch (e: any) { setError(e.message); setStage("preview"); }
  };

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, background: C.navy }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.terra, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>HH</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Smart Import</div>
          <div style={{ fontSize: 11, color: C.sidebarText }}>Tell Humble Hello what to do — preview before it runs</div>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>

        {/* IDLE */}
        {stage === "idle" && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: `2px dashed ${file ? C.green : dragging ? C.terra : C.border2}`, borderRadius: 10, padding: "20px 16px", textAlign: "center" as const, cursor: "pointer", background: file ? C.greenLight : dragging ? C.terraLight : C.bg3, transition: "all 0.15s", marginBottom: 12 }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: file ? C.green : dragging ? C.terra : C.text, marginBottom: 4 }}>
                {file ? file.name : "Drop your CSV or Excel file"}
              </div>
              <div style={{ fontSize: 11, color: file ? C.sageDark : C.text3 }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB — ready to analyze` : "or click to browse"}
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lStyle}>What should Humble Hello do with this file?</label>
              <textarea
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder={'e.g. "Import as new contacts and tag them as trade show leads" or "Update phone numbers for existing contacts only"'}
                rows={3}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, resize: "none" as const, outline: "none", boxSizing: "border-box" as const, lineHeight: 1.6 }}
              />
            </div>

            {error && (
              <div style={{ background: C.redLight, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.red, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={!file || !instruction.trim()}
              style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: (!file || !instruction.trim()) ? C.bg3 : C.terra, color: (!file || !instruction.trim()) ? C.text4 : "#fff", fontSize: 13, fontWeight: 700, cursor: (!file || !instruction.trim()) ? "default" : "pointer", fontFamily: font, transition: "all 0.15s" }}
            >
              Analyze with Humble Hello
            </button>
          </>
        )}

        {/* ANALYZING */}
        {stage === "analyzing" && (
          <div style={{ padding: "28px 0", textAlign: "center" as const }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Analyzing your file...</div>
            <div style={{ fontSize: 12, color: C.text3, marginBottom: 16 }}>Humble Hello is mapping your columns</div>
            <div style={{ height: 3, background: C.bg3, borderRadius: 2, overflow: "hidden", maxWidth: 180, margin: "0 auto" }}>
              <div style={{ height: "100%", width: "65%", background: C.terra, borderRadius: 2 }} />
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {stage === "preview" && plan && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: MODE_LABELS[plan.mode]?.bg, color: MODE_LABELS[plan.mode]?.color, border: `1px solid ${MODE_LABELS[plan.mode]?.color}44` }}>
                {MODE_LABELS[plan.mode]?.label}
              </div>
              <div style={{ fontSize: 11, color: C.text3 }}>{MODE_LABELS[plan.mode]?.desc}</div>
            </div>

            {plan.tag && (
              <div style={{ marginBottom: 10, fontSize: 12, color: C.text2 }}>
                Tag: <span style={{ fontWeight: 700, color: C.purple, background: C.purpleLight, padding: "2px 8px", borderRadius: 20 }}>#{plan.tag}</span>
              </div>
            )}

            {Object.keys(plan.mapped_columns).length > 0 && (
              <div style={{ background: C.bg3, borderRadius: 8, padding: "10px 12px", marginBottom: 12, border: `1px solid ${C.border}` }}>
                <label style={lStyle}>Column mapping</label>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
                  {Object.entries(plan.mapped_columns).map(([src, dst]) => (
                    <div key={src} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ fontFamily: "monospace", background: C.bg2, padding: "2px 6px", borderRadius: 4, color: C.text2, border: `1px solid ${C.border}`, flexShrink: 0 }}>{src}</span>
                      <span style={{ color: C.text4, fontSize: 10 }}>→</span>
                      <span style={{ color: dst && dst !== "null" ? C.green : C.text4, fontWeight: dst && dst !== "null" ? 600 : 400 }}>{dst && dst !== "null" ? dst : "ignored"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.warnings.length > 0 && (
              <div style={{ background: C.amberLight, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                {plan.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.amber }}>{w}</div>)}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={lStyle}>Preview — first {plan.preview.length} rows</label>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {plan.preview.map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: C.bg3, border: `1px solid ${C.border}`, fontSize: 12 }}>
                    <div style={{ width: 50, flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, textAlign: "center" as const, background: ACTION_COLORS[row.action]?.bg, color: ACTION_COLORS[row.action]?.color }}>
                      {row.action}
                    </div>
                    <div style={{ flex: 1, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.full_name || "—"}</div>
                    <div style={{ color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 130, fontSize: 11 }}>{row.email || row.company || ""}</div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div style={{ background: C.redLight, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={reset} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, cursor: "pointer", fontFamily: font }}>Start over</button>
              <button onClick={confirmImport} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Confirm & import</button>
            </div>
          </>
        )}

        {/* IMPORTING */}
        {stage === "importing" && (
          <div style={{ padding: "28px 0", textAlign: "center" as const }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Importing contacts...</div>
            <div style={{ fontSize: 12, color: C.text3 }}>Running in the background — this won't take long</div>
          </div>
        )}

        {/* DONE */}
        {stage === "done" && result && (
          <div>
            <div style={{ background: C.greenLight, border: `1px solid ${C.green}44`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 4 }}>Import queued successfully</div>
              <div style={{ fontSize: 12, color: C.sageDark, lineHeight: 1.6 }}>{result.message}</div>
            </div>
            <button onClick={reset} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: C.terra, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Import another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
export default function HopperSmartImport(props: any) {
  return (
    <FeatureGate feature="hopper_imports">
      <HopperSmartImportInner {...props} />
    </FeatureGate>
  );
}