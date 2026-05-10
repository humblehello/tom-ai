"use client";

import { useEffect, useState } from "react";
import { M, HEAD, BODY, MONO, PageWrap } from "./shared";

interface ScanLoaderProps {
  onComplete: () => void;
}

const STEPS = [
  "Scanning your inbox…",
  "Analyzing communication patterns…",
  "Mapping who you actually talk to…",
  "Finding your inner circle…",
];

const MIN_DURATION_MS = 8000;  // minimum time on screen so it doesn't flash
const MAX_DURATION_MS = 25000; // hard cap — advance even if scan isn't done
const POLL_INTERVAL_MS = 1500;

export function ScanLoader({ onComplete }: ScanLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [contactCount, setContactCount] = useState<number | null>(null);

  useEffect(() => {
    const startedAt = Date.now();
    let advanced = false;

    // Animate progress bar smoothly over ~MAX_DURATION
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min((elapsed / MAX_DURATION_MS) * 100, 95);
      setProgress(pct);
    }, 50);

    // Cycle through step messages
    const stepInterval = setInterval(() => {
      setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
    }, 2200);

    // Poll for scan completion
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/onboarding/scan-status");
        const data = await res.json();

        if (data.contact_count !== undefined) {
          setContactCount(data.contact_count);
        }

        const elapsed = Date.now() - startedAt;
        const minMet = elapsed >= MIN_DURATION_MS;
        const enoughContacts = (data.contact_count ?? 0) >= 5;

        if (data.ready && minMet && enoughContacts && !advanced) {
          advanced = true;
          finish();
        }
      } catch {
        // Network blip — try again next interval
      }
    }, POLL_INTERVAL_MS);

    // Hard timeout — advance no matter what after MAX_DURATION
    const timeout = setTimeout(() => {
      if (!advanced) {
        advanced = true;
        finish();
      }
    }, MAX_DURATION_MS);

    function finish() {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
      clearInterval(pollInterval);
      clearTimeout(timeout);
      setProgress(100);
      setTimeout(onComplete, 400);
    }

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [onComplete]);

  return (
    <PageWrap>
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        {/* Pulsing dot */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: M.fire,
          margin: "0 auto 32px",
          position: "relative",
          animation: "hh-pulse 2s infinite ease-in-out",
        }}>
          <style>{`
            @keyframes hh-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.08); opacity: 0.85; }
            }
            @keyframes hh-fade {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>

        <h1 style={{
          fontFamily: HEAD,
          fontSize: "clamp(28px, 4vw, 40px)",
          lineHeight: 1.15,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: M.ink,
          margin: 0,
        }}>
          Finding your{" "}
          <span style={{ fontStyle: "italic", color: M.fire }}>
            inner circle.
          </span>
        </h1>

        {/* Animated step message */}
        <div
          key={stepIndex}
          style={{
            marginTop: 28,
            fontFamily: BODY,
            fontSize: 15,
            color: M.ink2,
            lineHeight: 1.6,
            minHeight: 24,
            animation: "hh-fade 0.4s ease forwards",
          }}
        >
          {STEPS[stepIndex]}
        </div>

        {/* Live count */}
        {contactCount !== null && contactCount > 0 && (
          <div style={{
            marginTop: 12,
            fontFamily: MONO,
            fontSize: 12,
            color: M.fire,
            letterSpacing: "0.06em",
          }}>
            {contactCount.toLocaleString()} contacts found
          </div>
        )}

        {/* Progress bar */}
        <div style={{
          marginTop: 40,
          maxWidth: 360,
          marginLeft: "auto",
          marginRight: "auto",
          height: 4,
          background: M.rule,
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${progress}%`,
            height: "100%",
            background: M.fire,
            transition: "width 0.3s ease",
            borderRadius: 2,
          }} />
        </div>

        <div style={{
          marginTop: 32,
          fontFamily: BODY,
          fontSize: 12,
          color: M.ink3,
          fontStyle: "italic",
        }}>
          This usually takes about 30 seconds.
        </div>
      </div>
    </PageWrap>
  );
}