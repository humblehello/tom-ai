"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C, font, fontHeading } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";

export default function ExtensionSettingsPage() {
  const router = useRouter();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/extension/auth/generate-key");
      const data = await res.json();
      setConnected(!!data.api_key);
      setCreatedAt(data.created_at || null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/extension/auth/generate-key", {
        method: "DELETE",
      });
      if (res.ok) {
        setConnected(false);
        setCreatedAt(null);
      }
    } catch (e) {
      console.error(e);
    }
    setDisconnecting(false);
    setShowConfirmDisconnect(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex" }}>
      <Sidebar activeId="settings" />

      <main style={{ flex: 1, padding: "40px 32px 80px", overflowY: "auto" as const }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>

          {/* HEADER */}
          <div style={{ marginBottom: 32 }}>
            <button onClick={() => router.push("/settings")}
              style={{ background: "none", border: "none", color: C.text3, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 12, padding: 0 }}>
              ← Back to Settings
            </button>
            <div style={{ fontFamily: fontHeading, fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 6, letterSpacing: "-0.02em" }}>
              Chrome Extension
            </div>
            <div style={{ fontSize: 15, color: C.text3, lineHeight: 1.5 }}>
              Read LinkedIn profiles, run Relationship Index analyses, and update contacts on the fly — right from your browser.
            </div>
          </div>

          {/* CONNECTION STATUS */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
            {loading ? (
              <div style={{ fontSize: 13, color: C.text3 }}>Loading...</div>
            ) : connected ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                  <div style={{ fontFamily: fontHeading, fontSize: 22, fontWeight: 700, color: C.text }}>
                    Connected
                  </div>
                </div>
                <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 20 }}>
                  Your Chrome extension is connected to Humble Hello. You can read LinkedIn profiles and update your contacts directly from the browser.
                </div>
                {createdAt && (
                  <div style={{ fontSize: 12, color: C.text4, marginBottom: 20 }}>
                    Connected on {new Date(createdAt).toLocaleString("en-US", { dateStyle: "long" })}
                  </div>
                )}
                <button onClick={() => setShowConfirmDisconnect(true)}
                  style={{ padding: "11px 20px", borderRadius: 8, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                  Disconnect Extension
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: C.text4, flexShrink: 0 }} />
                  <div style={{ fontFamily: fontHeading, fontSize: 22, fontWeight: 700, color: C.text }}>
                    Not Connected
                  </div>
                </div>
                <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 20 }}>
                  Install the Humble Hello Chrome extension to start reading LinkedIn profiles and updating your contacts on the fly.
                </div>
                <button disabled
                  style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.bg3, color: C.text4, fontSize: 14, fontWeight: 700, cursor: "default", fontFamily: font }}>
                  Install from Chrome Web Store (coming soon)
                </button>
              </>
            )}
          </div>

          {/* DISCONNECT CONFIRMATION */}
          {showConfirmDisconnect && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowConfirmDisconnect(false)}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 16, maxWidth: 420, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
                <div style={{ fontFamily: fontHeading, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Disconnect Extension?</div>
                <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.6, marginBottom: 20 }}>
                  Your Chrome extension will stop working immediately. To use it again, you'll need to click "Connect to Humble Hello" in the extension and sign in.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowConfirmDisconnect(false)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                    Cancel
                  </button>
                  <button onClick={handleDisconnect} disabled={disconnecting}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: disconnecting ? "default" : "pointer", fontFamily: font, opacity: disconnecting ? 0.7 : 1 }}>
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WHAT IT DOES */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 16 }}>
              What the extension does
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 18 }}>
              {[
                {
                  title: "Reads LinkedIn profiles into your CRM",
                  body: "Visit any LinkedIn profile and the Humble Hello sidebar appears. One click captures the profile data into your contact.",
                },
                {
                  title: "Runs Relationship Index analyses",
                  body: "Get a personality archetype, communication tips, and outreach guidance — based on Humble Hello's Five Factor framework.",
                },
                {
                  title: "Keeps your contacts up to date",
                  body: "When someone changes jobs, click \"Update Contact\" on their LinkedIn profile and Humble Hello (and Google Contacts) update instantly.",
                },
                {
                  title: "Drafts personalized outreach",
                  body: "AI-drafted messages tailored to both the person's archetype AND your relationship history — Crystal can't do this, because they don't have your CRM.",
                },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.terra, marginTop: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{item.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}