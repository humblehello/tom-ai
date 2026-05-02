"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { C, font, fontHeading } from "@/app/lib/theme";

function ConnectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<"loading" | "ready" | "authorizing" | "redirecting" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [extensionId, setExtensionId] = useState<string | null>(null);

  useEffect(() => {
    const redirect = searchParams.get("redirect");
    const stateParam = searchParams.get("state");

    // ── Validation: redirect must be a chrome-extension:// URL ──
    if (!redirect) {
      setError("Missing redirect parameter");
      setStage("error");
      return;
    }

    if (!redirect.startsWith("chrome-extension://")) {
      setError("Invalid redirect URL — only Chrome extensions can connect this way");
      setStage("error");
      return;
    }

    // Extract extension ID for display
    try {
      const url = new URL(redirect);
      setExtensionId(url.host);
    } catch {
      setError("Malformed redirect URL");
      setStage("error");
      return;
    }

    setRedirectUrl(redirect);
    setState(stateParam);

    // Check if user is logged in
    fetch("/api/extension/auth/generate-key")
      .then((res) => {
        if (res.status === 401) {
          // Not logged in — redirect to login with return URL
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?next=${returnUrl}`;
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setStage("ready");
        }
      })
      .catch(() => {
        setError("Failed to verify your session");
        setStage("error");
      });
  }, [searchParams]);

  const handleAuthorize = async () => {
    if (!redirectUrl) return;
    setStage("authorizing");

    try {
      // Generate (or rotate) the user's API key
      const res = await fetch("/api/extension/auth/generate-key", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate key");
        setStage("error");
        return;
      }

      const { api_key } = await res.json();

      // Build the redirect URL with key in fragment (not query string)
      // Fragments aren't sent to servers, so the key stays in the browser
      const redirectWithKey = new URL(redirectUrl);
      const fragment = new URLSearchParams();
      fragment.set("key", api_key);
      if (state) fragment.set("state", state);
      redirectWithKey.hash = fragment.toString();

      setStage("redirecting");

      // Brief pause so user sees the success state
      setTimeout(() => {
        window.location.href = redirectWithKey.toString();
      }, 800);
    } catch (e: any) {
      setError(e?.message || "Connection failed");
      setStage("error");
    }
  };

  const handleCancel = () => {
    router.push("/dashboard");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>

        {/* LOADING STATE */}
        {stage === "loading" && (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center" as const }}>
            <div style={{ fontSize: 13, color: C.text3 }}>Verifying connection request...</div>
          </div>
        )}

        {/* READY STATE — User authorizes the extension */}
        {stage === "ready" && (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40 }}>
            {/* Logo */}
            <div style={{ marginBottom: 28, display: "flex", justifyContent: "center" }}>
              <img src="/logo-terra.svg" alt="humble hello." style={{ height: 36, width: "auto" }} />
            </div>

            {/* Connection icon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: C.terra, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 700 }}>HH</div>
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.terra }} />
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.terra, opacity: 0.7 }} />
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.terra, opacity: 0.4 }} />
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bg3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🌐</div>
            </div>

            <div style={{ fontFamily: fontHeading, fontSize: 24, fontWeight: 700, color: C.text, textAlign: "center" as const, marginBottom: 12, letterSpacing: "-0.01em" }}>
              Connect Chrome Extension
            </div>
            <div style={{ fontSize: 14, color: C.text3, textAlign: "center" as const, marginBottom: 28, lineHeight: 1.55 }}>
              The Humble Hello Chrome extension is requesting access to your account. It will be able to read LinkedIn profiles, run Relationship Index analyses, and update contacts on your behalf.
            </div>

            {/* What it can do */}
            <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 12 }}>
                The extension will be able to
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {[
                  "Read your contacts",
                  "Add new contacts from LinkedIn",
                  "Update existing contacts when their info changes",
                  "Run Relationship Index analyses (counts toward your monthly cap)",
                ].map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
                    <span style={{ color: C.terra, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCancel}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                Cancel
              </button>
              <button onClick={handleAuthorize}
                style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: C.terra, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                Authorize Connection
              </button>
            </div>

            {/* Footer note */}
            {extensionId && (
              <div style={{ marginTop: 20, fontSize: 11, color: C.text4, textAlign: "center" as const, fontFamily: "ui-monospace, monospace" }}>
                Extension: {extensionId.slice(0, 16)}...
              </div>
            )}
          </div>
        )}

        {/* AUTHORIZING STATE */}
        {stage === "authorizing" && (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center" as const }}>
            <div style={{ fontFamily: fontHeading, fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>Connecting...</div>
            <div style={{ fontSize: 13, color: C.text3 }}>Generating secure connection key</div>
          </div>
        )}

        {/* REDIRECTING STATE — Brief success state before redirect */}
        {stage === "redirecting" && (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center" as const }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontFamily: fontHeading, fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>Connected!</div>
            <div style={{ fontSize: 13, color: C.text3 }}>Returning to your extension...</div>
          </div>
        )}

        {/* ERROR STATE */}
        {stage === "error" && (
          <div style={{ background: C.bg2, border: `1px solid ${C.red}`, borderRadius: 16, padding: 40 }}>
            <div style={{ fontFamily: fontHeading, fontSize: 20, fontWeight: 700, color: C.red, marginBottom: 8 }}>Connection Failed</div>
            <div style={{ fontSize: 14, color: C.text2, marginBottom: 20, lineHeight: 1.55 }}>
              {error || "We couldn't complete the connection."}
            </div>
            <button onClick={() => router.push("/dashboard")}
              style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
              Back to Dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ExtensionConnectPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: C.text3, fontFamily: font }}>Loading...</div>
      </div>
    }>
      <ConnectPageInner />
    </Suspense>
  );
}