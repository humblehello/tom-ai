"use client";

import { useState } from "react";
import {
  M, HEAD, BODY,
  PageWrap, PrimaryButton, StepHeader, Card, Input, Label,
  LOCKED_CARD_PROFILE, LOCKED_SNOOZE_DAYS,
} from "./shared";

interface Step3Props {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    first_name?: string;
    last_name?: string;
  };
  onNext: () => Promise<void>;
}

export function Step3ContactCard({ user, onNext }: Step3Props) {
  // Pre-fill from OAuth
  const initialName = user.name || "";
  const [firstName, lastNameFromOAuth] = splitName(initialName);

  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastNameFromOAuth);
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canContinue =
    first.trim().length > 0 &&
    last.trim().length > 0 &&
    street.trim().length > 0 &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    zip.trim().length >= 5;

  async function handleSubmit() {
    if (!canContinue) return;
    setSubmitting(true);
    try {
      const fullName = `${first.trim()} ${last.trim()}`;
      const formattedPhone = phone ? formatPhone(phone) : null;

      const homeAddress = {
        streetAddress: street.trim(),
        city: city.trim(),
        region: state.trim(),
        postalCode: zip.trim(),
        country: "US",
      };

      // Locked defaults: signoff = first + last name, plus the spec values
      const cardProfile = {
        ...LOCKED_CARD_PROFILE,
        signoff: fullName,
      };

      // 1. Update user profile (home_address, card_profile, snooze_days, name)
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          home_address: homeAddress,
          card_profile: cardProfile,
        }),
      });

      // 2. Create self contact record
      await fetch("/api/contacts/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          phone: formattedPhone,
          personal_email: user.email,
          home_address: homeAddress,
          is_self: true,
        }),
      });

      await onNext();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  return (
    <PageWrap>
      <StepHeader
        kicker="Step 2 of 3"
        title={
          <>
            Your{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>
              contact card.
            </span>
          </>
        }
        subtitle="This is the card we'll use for cards, gifts, and signatures. You can update it anytime in Settings."
      />

      <Card>
        {/* Avatar + email row */}
        <div style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginBottom: 28,
          padding: "16px 18px",
          background: M.paperDeep,
          border: `1px solid ${M.rule}`,
          borderRadius: 12,
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: M.ruleStrong,
          }}>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: HEAD, fontSize: 22, fontWeight: 700, color: "#fff",
              }}>
                {(first[0] || "?").toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: BODY, fontSize: 12, fontWeight: 600,
              color: M.ink3, textTransform: "uppercase", letterSpacing: "0.05em",
              marginBottom: 2,
            }}>
              Email
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 15, color: M.ink, fontWeight: 500,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {user.email}
            </div>
          </div>
        </div>

        {/* Name row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <Label>First name</Label>
            <Input value={first} onChange={setFirst} placeholder="First" required />
          </div>
          <div>
            <Label>Last name</Label>
            <Input value={last} onChange={setLast} placeholder="Last" required />
          </div>
        </div>

        {/* Address */}
        <div style={{ marginBottom: 16 }}>
          <Label sub="required for cards & gifts">Address</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input value={street} onChange={setStreet} placeholder="Street address" required />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
              <Input value={city} onChange={setCity} placeholder="City" required />
              <Input value={state} onChange={setState} placeholder="State" required />
              <Input value={zip} onChange={setZip} placeholder="ZIP" required />
            </div>
          </div>
        </div>

        {/* Phone */}
        <div style={{ marginBottom: 28 }}>
          <Label sub="optional">Phone</Label>
          <Input
            value={phone}
            onChange={setPhone}
            placeholder="(317) 555-0100"
            type="tel"
          />
        </div>

        <PrimaryButton
          onClick={handleSubmit}
          disabled={!canContinue}
          loading={submitting}
        >
          Continue →
        </PrimaryButton>

        <div style={{
          marginTop: 14,
          fontFamily: BODY,
          fontSize: 12,
          color: M.ink3,
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          Cards & gifts default to manual approval. You can turn on auto-send
          later in Settings.
        </div>
      </Card>
    </PageWrap>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function splitName(full: string): [string, string] {
  const trimmed = full.trim();
  if (!trimmed) return ["", ""];
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return [parts[0], ""];
  return [parts[0], parts.slice(1).join(" ")];
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}