"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Step1Welcome } from "./components/Step1Welcome";
import { Step2Privacy } from "./components/Step2Privacy";
import { Step3ContactCard } from "./components/Step3ContactCard";
import { Step4CoreFive } from "./components/Step4CoreFive";
import { ScanLoader } from "./components/ScanLoader";
import { M, BODY, PageWrap } from "./components/shared";

type Stage = "loading" | "step1" | "step2" | "step3" | "scanning" | "step4";

interface UserData {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  onboarding_complete: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [user, setUser] = useState<UserData | null>(null);

  // Load user data on mount
  useEffect(() => {
    let mounted = true;
    fetch("/api/profile")
      .then(r => {
        if (r.status === 401) {
          // Not signed in → start at Step 1 (welcome + sign in)
          if (mounted) setStage("step1");
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!mounted || !data) return;

        // Already onboarded → go to dashboard
        if (data.onboarding_complete) {
          router.replace("/dashboard");
          return;
        }

        setUser({
          id: data.id,
          name: data.name || "",
          email: data.email || "",
          avatar: data.avatar || null,
          onboarding_complete: false,
        });

        // Signed in but not onboarded → start at Step 2
        // (they've already done OAuth, so consent is the next beat)
        setStage("step2");
      })
      .catch(() => {
        if (mounted) setStage("step1");
      });

    return () => { mounted = false; };
  }, [router]);

  // ── Stage transitions ─────────────────────────────────────────────────────
  async function advanceFromStep2() {
    setStage("step3");
  }

  async function advanceFromStep3() {
    setStage("scanning");
  }

  function advanceFromScanning() {
    setStage("step4");
  }

  async function advanceFromStep4() {
    // onboarding_complete already saved in Step4 component
    router.push("/dashboard?welcome=1");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (stage === "loading") {
    return (
      <PageWrap>
        <div style={{
          textAlign: "center",
          paddingTop: 80,
          fontFamily: BODY,
          color: M.ink3,
          fontSize: 14,
        }}>
          Loading…
        </div>
      </PageWrap>
    );
  }

  if (stage === "step1") {
    return <Step1Welcome />;
  }

  if (stage === "step2" && user) {
    const firstName = user.name.split(" ")[0] || "";
    return <Step2Privacy firstName={firstName} onNext={advanceFromStep2} />;
  }

  if (stage === "step3" && user) {
    return <Step3ContactCard user={user} onNext={advanceFromStep3} />;
  }

  if (stage === "scanning") {
    return <ScanLoader onComplete={advanceFromScanning} />;
  }

  if (stage === "step4") {
    return <Step4CoreFive onNext={advanceFromStep4} />;
  }

  return null;
}