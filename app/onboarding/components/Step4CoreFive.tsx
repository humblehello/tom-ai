"use client";

import { useEffect, useState, useMemo } from "react";
import {
  M, HEAD, BODY, MONO,
  PageWrap, PrimaryButton, StepHeader, Card,
} from "./shared";

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  signals: string[];   // ["Calendar 1:1", "Manual contact", "Starred", etc.]
  score: number;
}

interface Step4Props {
  onNext: () => Promise<void>;
}

export function Step4CoreFive({ onNext }: Step4Props) {
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isRedo, setIsRedo] = useState(false);
  const [existingCore5Count, setExistingCore5Count] = useState(0);

// Fetch suggestions + detect re-do on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/onboarding/core5-suggestions").then(r => r.json()).catch(() => ({})),
      // Check if user already has Core 5 contacts (i.e., this is a re-do)
      fetch("/api/contacts/tier-counts").then(r => r.json()).catch(() => null),
    ])
      .then(([suggestionsData, tierData]) => {
        setSuggestions(suggestionsData.suggestions || []);
        setAllContacts(suggestionsData.all_contacts || []);
        const tier1Count = tierData?.counts?.tier1 || 0;
        setExistingCore5Count(tier1Count);
        setIsRedo(tier1Count > 0);
      })
      .finally(() => setLoading(false));
  }, []);

  // Search filter — only runs when user types
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allContacts
      .filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [search, allContacts]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (isRedo || next.size < 5) {
        // Re-do: no cap. First-time: cap at 5.
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const selectedIds = Array.from(selected);
      if (selectedIds.length > 0) {
        await fetch("/api/onboarding/core5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact_ids: selectedIds }),
        });
      }

      // Mark onboarding complete & fire welcome email + card
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_complete: true }),
      });
      await fetch("/api/onboarding-complete", { method: "POST" }).catch(() => {});

      await onNext();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  const visibleContacts = search.trim() ? searchResults : suggestions;
  const showingSearch = search.trim().length > 0;
  const remaining = 5 - selected.size;

  return (
    <PageWrap>
      <StepHeader
        kicker="Step 3 of 3"
        title={
          <>
            Who's in your{" "}
            <span style={{ fontStyle: "italic", color: M.fire }}>
              inner circle?
            </span>
          </>
        }
        subtitle={
          isRedo
            ? `You already have ${existingCore5Count} in your Core 5. Add anyone else — there's no cap on a re-do.`
            : "The people you'd never want to drift away. Family, best friends, mentors, key partners — pick up to 5. You can add more anytime."
        }
      />

      <Card>
        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search your contacts…"
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: `1.5px solid ${M.rule}`,
              background: "#fff",
              fontSize: 15,
              fontFamily: BODY,
              color: M.ink,
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={e => { e.target.style.borderColor = M.fire; }}
            onBlur={e => { e.target.style.borderColor = M.rule; }}
          />
        </div>

        {/* Selected count */}
        <div style={{
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 600,
          color: M.ink3,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}>
          {showingSearch ? "Search results" : "Suggested for you"}
          {!showingSearch && (
            <span style={{ color: M.ink4, marginLeft: 12, letterSpacing: "0.04em", textTransform: "none", fontWeight: 400 }}>
              based on your calendar &amp; email
            </span>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{
            textAlign: "center",
            padding: "32px 0",
            fontFamily: BODY,
            fontSize: 14,
            color: M.ink3,
            fontStyle: "italic",
          }}>
            Loading suggestions…
          </div>
        )}

        {/* Empty state */}
        {!loading && visibleContacts.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "32px 16px",
            fontFamily: BODY,
            fontSize: 14,
            color: M.ink3,
            lineHeight: 1.6,
          }}>
            {showingSearch ? (
              <>No contacts match "<strong>{search}</strong>"</>
            ) : (
              <>We're still scanning your contacts. Skip for now and add your inner circle from your dashboard.</>
            )}
          </div>
        )}

        {/* Contact list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleContacts.map(contact => (
            <ContactRow
              key={contact.id}
              contact={contact}
              selected={selected.has(contact.id)}
              disabled={!isRedo && !selected.has(contact.id) && selected.size >= 5}
              onClick={() => toggle(contact.id)}
            />
          ))}
        </div>

        <div style={{ marginTop: 28 }}>
          <PrimaryButton onClick={handleSubmit} loading={submitting}>
            {selected.size === 0 ? "Skip for now →" : `Continue with ${selected.size} →`}
          </PrimaryButton>
        </div>

        <div style={{
          marginTop: 14,
          fontFamily: BODY,
          fontSize: 12,
          color: M.ink3,
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          {isRedo ? (
            <>You already have {existingCore5Count} in your Core 5. Add as many more as you'd like — no limit on re-do.</>
          ) : (
            <>
              {selected.size > 0 && remaining > 0 && (
                <>You can pick {remaining} more, or continue. </>
              )}
              {selected.size === 5 && <>That's your Core 5. </>}
              You can always add more in your dashboard.
            </>
          )}
        </div>
      </Card>
    </PageWrap>
  );
}

// ── Contact row ─────────────────────────────────────────────────────────────
function ContactRow({
  contact, selected, disabled, onClick,
}: {
  contact: Contact;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: selected ? M.forestSoft : "#fff",
        border: `1.5px solid ${selected ? M.green : M.rule}`,
        borderRadius: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "left",
        alignItems: "center",
        transition: "all 0.15s",
        fontFamily: BODY,
        width: "100%",
      }}
    >
      {/* Checkbox indicator */}
      <div style={{
        flexShrink: 0,
        width: 20,
        height: 20,
        borderRadius: 5,
        border: `1.5px solid ${selected ? M.green : M.ruleStrong}`,
        background: selected ? M.green : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {selected && (
          <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
            <path d="M3 8L7 12L13 5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Name + email + signals */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: M.ink,
          marginBottom: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {contact.full_name}
        </div>
        <div style={{
          fontSize: 12,
          color: M.ink3,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}>
          {contact.email && (
            <span style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 200,
            }}>
              {contact.email}
            </span>
          )}
          {contact.signals.length > 0 && contact.email && (
            <span style={{ color: M.ink4 }}>·</span>
          )}
          {contact.signals.map((s, i) => (
            <span key={i} style={{
              color: M.fire,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.04em",
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}