"use client";
import { useState } from "react";

export default function BackfillPage() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [pages, setPages] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [log, setLog] = useState([]);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setPages(0);
    setTotalProcessed(0);
    setTotalUpdated(0);
    setLog([]);

    let pageToken = null;
    let pageCount = 0;
    let processed = 0;
    let updated = 0;

    try {
      do {
        const res = await fetch("/api/contacts/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageToken }),
        });
        const data = await res.json();

        pageCount++;
        processed += data.processed || 0;
        updated += data.updated || 0;
        pageToken = data.nextPageToken || null;

        setPages(pageCount);
        setTotalProcessed(processed);
        setTotalUpdated(updated);
        setLog(l => [...l, `Page ${pageCount}: ${data.processed} emails scanned, ${data.updated} contacts updated`]);

        if (data.done || !pageToken) break;

        await new Promise(r => setTimeout(r, 300));

      } while (pageToken && pageCount < 200);

      setDone(true);
      setLog(l => [...l, `✅ Done! ${processed} emails scanned across ${pageCount} pages. ${updated} contacts updated.`]);
    } catch (e) {
      setLog(l => [...l, `❌ Error: ${e.message}`]);
    }

    setRunning(false);
  };

  return (
    <div style={{ padding: 40, fontFamily: "DM Sans, sans-serif", maxWidth: 600 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Gmail History Backfill</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Scans 3 years of Gmail history to update last_emailed_at for all your contacts.
        Run this once before using the Clean feature.
      </p>

      {!running && !done && (
        <button onClick={run} style={{ padding: "12px 24px", background: "#2f9e44", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Start Backfill
        </button>
      )}

      {running && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
            Running... Page {pages} · {totalProcessed.toLocaleString()} emails · {totalUpdated} contacts updated
          </div>
          <div style={{ height: 6, background: "#eee", borderRadius: 4 }}>
            <div style={{ height: "100%", width: `${Math.min((pages / 200) * 100, 99)}%`, background: "#2f9e44", borderRadius: 4, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {done && (
        <div style={{ background: "#d3f9d8", border: "1px solid #2f9e44", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14, color: "#2f9e44", fontWeight: 600 }}>
          ✅ Backfill complete! {totalProcessed.toLocaleString()} emails scanned · {totalUpdated} contacts updated
        </div>
      )}

      {log.length > 0 && (
        <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: 8, padding: 16, maxHeight: 300, overflowY: "auto", fontSize: 12, fontFamily: "monospace" }}>
          {log.map((l, i) => (
            <div key={i} style={{ marginBottom: 4, color: l.startsWith("✅") ? "#2f9e44" : l.startsWith("❌") ? "#e03131" : "#495057" }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}