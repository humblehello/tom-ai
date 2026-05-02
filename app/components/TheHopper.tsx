"use client";
import { useState, useRef } from "react";

import { C, font } from "@/app/lib/theme";

type HopperResult = {
  success: boolean;
  summary: string;
  file_type: "image" | "csv" | "excel";
  total_rows: number;
  created: number;
  updated: number;
  skipped: number;
  mapping: Record<string, string>;
};

const ACCEPTED_TYPES = ".csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,.gif,.heic";

const EXAMPLES = [
  { icon: "📊", label: "Customer export CSV" },
  { icon: "📇", label: "Business card photo" },
  { icon: "✉️", label: "Email signature screenshot" },
  { icon: "🔗", label: "LinkedIn profile screenshot" },
  { icon: "🌐", label: "Website team page screenshot" },
  { icon: "📋", label: "Any spreadsheet or contact list" },
];

export default function TheHopper() {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "reading" | "thinking" | "importing" | "done">("idle");
  const [result, setResult] = useState<HopperResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stageMessages: Record<string, { icon: string; text: string }> = {
    reading: { icon: "📖", text: "Reading your file..." },
    thinking: { icon: "🧠", text: "Claude is figuring out what's in here..." },
    importing: { icon: "⚡", text: "Hopping contacts into your network..." },
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setLoading(true);

    const isValid = /\.(csv|xlsx|xls|jpg|jpeg|png|webp|gif|heic)$/i.test(file.name);

    if (!isValid) {
      setError("Hmm, The Hopper can't digest that file type. Try a CSV, Excel, or image file.");
      setLoading(false);
      return;
    }

    try {
      setStage("reading");
      await new Promise(r => setTimeout(r, 400));
      setStage("thinking");

      const formData = new FormData();
      formData.append("file", file);

      setStage("importing");
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The Hopper hit a snag.");

      setResult(data);
      setStage("done");
    } catch (e: any) {
      setError(e.message);
      setStage("idle");
    }

    setLoading(false);
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setStage("idle");
  };

  return (
    <div style={{
      background: C.bg2,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: "hidden",
    }}>
   {/* Header */}
<div style={{
  padding: "16px 20px",
  borderBottom: `1px solid ${C.border}`,
  display: "flex",
  alignItems: "center",
  gap: 12,
 background: "linear-gradient(135deg, #1c2b3a, #253748)",
}}>
  <div style={{
    width: 36, height: 36, borderRadius: 10,
    background: "linear-gradient(135deg, #bf5c38, #9a4429)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18,
  }}>
    🐸
  </div>
  <div>
    <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>The Hopper</div>
    <div style={{ fontSize: 11, color: "#909296" }}>Toss anything in. Contacts hop out.</div>
  </div>
</div>
        {/* Idle state */}
        {stage === "idle" && !error && (
          <>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? C.terra : C.border2}`,
                borderRadius: 12,
                padding: "24px 20px",
                textAlign: "center" as const,
                cursor: "pointer",
                background: dragging ? C.terraLight : C.bg3,
                transition: "all 0.15s",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {dragging ? "🎯" : "📥"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: dragging ? C.green : C.text, marginBottom: 4 }}>
                {dragging ? "Drop it in!" : "Drop your file here"}
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>
                or click to browse
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" as const }}>
                {["CSV", "Excel", "JPG", "PNG", "Screenshot"].map(tag => (
                  <span key={tag} style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 20,
                    background: C.bg2, border: `1px solid ${C.border2}`,
                    color: C.text3, fontWeight: 500,
                  }}>{tag}</span>
                ))}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>

            {/* What can I drop in? */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 }}>
                What can I toss in?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {EXAMPLES.map(ex => (
                  <div key={ex.label} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 12, color: C.text2, padding: "6px 10px",
                    background: C.bg3, borderRadius: 8,
                  }}>
                    <span>{ex.icon}</span>
                    <span>{ex.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Loading state */}
        {loading && stage !== "done" && (
          <div style={{ padding: "32px 0", textAlign: "center" as const }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {stageMessages[stage]?.icon || "⚡"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>
              {stageMessages[stage]?.text || "Working..."}
            </div>
            <div style={{ height: 6, background: C.bg3, borderRadius: 3, overflow: "hidden", maxWidth: 200, margin: "0 auto" }}>
              <div style={{
                height: "100%",
                width: stage === "reading" ? "25%" : stage === "thinking" ? "60%" : "90%",
                background: "linear-gradient(90deg, #bf5c38, #6b9970)",
                borderRadius: 3,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div>
            <div style={{
              background: C.redLight, borderRadius: 10, padding: "14px 16px",
              fontSize: 13, color: C.red, marginBottom: 12, lineHeight: 1.5,
            }}>
              ⚠️ {error}
            </div>
            <button onClick={reset} style={{
              width: "100%", padding: "10px", borderRadius: 8,
              border: `1px solid ${C.border2}`, background: C.bg2,
              color: C.text2, fontSize: 13, cursor: "pointer", fontFamily: font,
            }}>
              Try again
            </button>
          </div>
        )}

        {/* Result */}
        {stage === "done" && result && (
          <div>
            <div style={{
              background: "linear-gradient(135deg, #d3f9d8, #b2f2bb)",
              borderRadius: 10, padding: "14px 16px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 2 }}>
                🐸 The Hopper did its thing!
              </div>
              <div style={{ fontSize: 12, color: "#2f9e44", lineHeight: 1.5 }}>
                {result.summary}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
              {[
                { label: "New contacts", value: result.created, color: C.green, bg: C.greenLight, icon: "✨" },
                { label: "Updated", value: result.updated, color: C.blue, bg: C.blueLight, icon: "🔄" },
                { label: "Skipped", value: result.skipped, color: C.text3, bg: C.bg3, icon: "⏭" },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: stat.bg, borderRadius: 10, padding: "12px 8px",
                  textAlign: "center" as const,
                }}>
                  <div style={{ fontSize: 11, marginBottom: 2 }}>{stat.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: stat.color, fontWeight: 500 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {result.file_type !== "image" && Object.keys(result.mapping).length > 0 && (
              <div style={{
                background: C.bg3, borderRadius: 8, padding: "10px 14px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>
                  How Claude mapped your columns
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {Object.entries(result.mapping).slice(0, 6).map(([col, field]) => (
                    <div key={col} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                      <span style={{ color: C.text3, fontFamily: "monospace", background: C.bg2, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>
                        {col}
                      </span>
                      <span style={{ color: C.text4 }}>→</span>
                      <span style={{ color: field ? C.green : C.text4, fontWeight: field ? 600 : 400 }}>
                        {field || "ignored"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={reset} style={{
              width: "100%", padding: "11px", borderRadius: 8,
              border: "none", background: C.terra,
              color: "white", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: font,
            }}>
              🐸 Hop in another file
            </button>
          </div>
        )}
      </div>

  );
}
