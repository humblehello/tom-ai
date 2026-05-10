"use client";
import { useState, useEffect, useRef } from "react";

import { C, font } from "@/app/lib/theme";

type Message = { role: "user" | "assistant"; content: string };
type ExtractedContact = {
  full_name: string; relationship_type: string; confidence: number;
  current_status: string; wants_to_reconnect: boolean; key_context: string;
};
type JournalState = "idle" | "chatting" | "extracting" | "saving" | "done";

type Props = { autoStart?: boolean };

import { useIsMobile } from "@/app/lib/useMediaQuery";
// ... at the top of the file ...

export default function JournalChat({ autoStart }: Props) {
  const isMobile = useIsMobile();

  const [state, setState] = useState<JournalState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [extractedContacts, setExtractedContacts] = useState<ExtractedContact[]>([]);
  const [saveResult, setSaveResult] = useState<any>(null);
  const [summary, setSummary] = useState("");
  const [theme, setTheme] = useState("");
  const [themesRemaining, setThemesRemaining] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-start if prop is set
  useEffect(() => {
    if (autoStart && state === "idle") {
      startConversation();
    }
  }, [autoStart]);

  const startConversation = async () => {
    setState("chatting");
    setSending(true);
    try {
      const res = await fetch("/api/journal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      setMessages([{ role: "assistant", content: data.message }]);
      setTheme(data.theme || "");
      setThemesRemaining(data.themes_remaining ?? null);
    } catch {
      setMessages([{ role: "assistant", content: "Who are some people from your past that still cross your mind? Just give me a few names and we'll go from there." }]);
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setSending(true);
    try {
      const res = await fetch("/api/journal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", messages: newMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
      if (data.missing_contact) {
        // Show create contact option after a short delay
        setTimeout(() => {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Want me to create a contact card for ${data.missing_contact}? Just say "yes, add them" and I'll set it up.`
          }]);
        }, 800);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Tell me more about that." }]);
    }
    setSending(false);
  };

  const extractAndSave = async () => {
    setState("extracting");
    let contacts: ExtractedContact[] = [];
    let conversationSummary = "";
    try {
      const extractRes = await fetch("/api/journal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract", messages, theme }),
      });
      const extractData = await extractRes.json();
      contacts = extractData.contacts || [];
      conversationSummary = extractData.summary || "";
      setExtractedContacts(contacts);
      setSummary(conversationSummary);
    } catch (e) { console.error("Extract failed:", e); }

    if (contacts.length === 0) { setState("done"); return; }

    setState("saving");
    try {
      const saveRes = await fetch("/api/journal/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });
      setSaveResult(await saveRes.json());
    } catch (e) { console.error("Save failed:", e); }
    setState("done");
  };

  const reset = () => {
    setState("idle");
    setMessages([]);
    setInput("");
    setExtractedContacts([]);
    setSaveResult(null);
    setSummary("");
    setTheme("");
    if (autoStart) startConversation();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const relationshipColor = (type: string) => {
    switch (type) {
      case "family": case "close_friend": return { bg: C.purpleLight, text: C.purple };
      case "friend": return { bg: C.blueLight, text: C.blue };
      case "mentor": return { bg: C.amberLight, text: C.amber };
      case "customer": return { bg: C.greenLight, text: C.green };
      default: return { bg: C.bg3, text: C.text3 };
    }
  };

  // ── Idle state — only shown when not autoStart ──────────────────────────
  if (state === "idle") {
    return (
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.purpleLight}, #f0ebff)` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.purple }}>Relationship Journal</div>
            <div style={{ fontSize: 12, color: C.purple, opacity: 0.8 }}>A conversation that builds your contact intelligence</div>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.7, marginBottom: 20 }}>
            Humble Hello asks you about the people in your life — friends, mentors, customers, family. Your answers automatically update your contacts and sync back to Google Contacts.
          </div>
          <button onClick={startConversation}
            style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: C.purple, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            Start today's conversation
          </button>
        </div>
      </div>
    );
  }

  // ── Extracting / Saving ─────────────────────────────────────────────────
  if (state === "extracting" || state === "saving") {
    return (
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 48, textAlign: "center" as const }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          {state === "extracting" ? "Reading your conversation..." : "Saving to contacts..."}
        </div>
        <div style={{ fontSize: 13, color: C.text3 }}>
          {state === "extracting" ? "Extracting relationship intelligence from everything you shared" : "Updating Humble Hello contacts and syncing to Google Contacts"}
        </div>
        <div style={{ marginTop: 24, height: 6, background: C.bg3, borderRadius: 3, overflow: "hidden", maxWidth: 240, margin: "24px auto 0" }}>
          <div style={{ height: "100%", width: state === "extracting" ? "50%" : "90%", background: `linear-gradient(90deg, ${C.purple}, #9b59b6)`, borderRadius: 3, transition: "width 0.6s ease" }} />
        </div>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────
  if (state === "done") {
    return (
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.purpleLight}, #f0ebff)` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>Journal saved and contacts updated</div>
          <div style={{ fontSize: 12, color: C.purple, opacity: 0.8, marginTop: 2 }}>
            {saveResult?.created || 0} new · {saveResult?.updated || 0} updated · {saveResult?.google_updated || 0} synced to Google
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {summary && (
            <div style={{ background: C.bg3, borderRadius: 10, padding: "14px 16px", fontSize: 13, color: C.text2, lineHeight: 1.7, marginBottom: 20 }}>
              {summary}
            </div>
          )}
          {extractedContacts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 12 }}>
                People updated ({extractedContacts.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {extractedContacts.map((c, i) => {
                  const color = relationshipColor(c.relationship_type);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: C.bg3, borderRadius: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: color.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: color.text }}>
                        {c.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.full_name}</div>
                        <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                          {c.relationship_type?.replace(/_/g, " ")} · {c.confidence}% confidence
                          {c.wants_to_reconnect && " · wants to reconnect"}
                        </div>
                        {c.key_context && (
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 4, lineHeight: 1.4 }}>
                            {c.key_context.slice(0, 100)}{c.key_context.length > 100 ? "..." : ""}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, flexShrink: 0, background: c.current_status === "active" ? C.greenLight : c.current_status === "lost_touch" ? C.redLight : C.amberLight, color: c.current_status === "active" ? C.green : c.current_status === "lost_touch" ? C.red : C.amber, fontWeight: 600 }}>
                        {c.current_status?.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={startConversation}
              style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: C.purple, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
              Start another conversation
            </button>
            <button onClick={reset}
              style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, cursor: "pointer", fontFamily: font }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: C.bg2,
      border: isMobile ? "none" : `1px solid ${C.border}`,
      borderRadius: isMobile ? 0 : 12,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column" as const,
      // Mobile: full-viewport pinned, so input bar stays at the bottom
      position: isMobile ? "fixed" as const : "relative" as const,
      top: isMobile ? 0 : "auto",
      left: isMobile ? 0 : "auto",
      right: isMobile ? 0 : "auto",
      bottom: isMobile ? 0 : "auto",
      height: isMobile ? "100dvh" : "auto",
      zIndex: isMobile ? 100 : "auto",
    }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? "10px 14px" : "12px 16px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.bg3,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden" as const, textOverflow: "ellipsis" as const }}>
            {isMobile ? "Journal" : "Relationship Journal"}
          </span>
          {theme && !isMobile && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.purpleLight, color: C.purple, fontWeight: 600, textTransform: "capitalize" as const }}>
              {theme.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {themesRemaining !== null && !isMobile && (
            <span style={{ fontSize: 10, color: C.text4 }}>{themesRemaining} topics remaining</span>
          )}
          {messages.length >= 4 && (
            <button onClick={extractAndSave}
              style={{
                fontSize: 11,
                padding: isMobile ? "6px 10px" : "6px 12px",
                borderRadius: 6,
                border: "none",
                background: C.purple,
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: font,
              }}>
              {isMobile ? "Save" : "Save & update contacts"}
            </button>
          )}
          <button onClick={reset}
            style={{
              fontSize: 11,
              padding: isMobile ? "6px 10px" : "6px 10px",
              borderRadius: 6,
              border: `1px solid ${C.border2}`,
              background: "transparent",
              color: C.text3,
              cursor: "pointer",
              fontFamily: font,
            }}>
            Close
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto" as const,
        WebkitOverflowScrolling: "touch" as const,
        padding: isMobile ? "12px 14px" : 16,
        display: "flex",
        flexDirection: "column" as const,
        gap: 12,
        maxHeight: isMobile ? "none" : 440,
        minHeight: isMobile ? 0 : 320,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.purpleLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.purple, flexShrink: 0 }}>AI</div>
            )}
            <div style={{ maxWidth: "72%", padding: "11px 15px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? C.purple : C.bg3, color: msg.role === "user" ? "#fff" : C.text, fontSize: 13, lineHeight: 1.6 }}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.purpleLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.purple }}>AI</div>
            <div style={{ padding: "11px 15px", borderRadius: "18px 18px 18px 4px", background: C.bg3, fontSize: 13, color: C.text3 }}>···</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: isMobile ? "10px 12px calc(10px + env(safe-area-inset-bottom))" : "12px 16px",
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        background: C.bg2,
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isMobile ? "Type a message..." : "Type your answer... (Enter to send)"}
          rows={isMobile ? 1 : 2}
          style={{
            flex: 1,
            padding: isMobile ? "10px 12px" : "10px 14px",
            borderRadius: 10,
            border: `1px solid ${C.border2}`,
            background: C.bg3,
            color: C.text,
            fontSize: isMobile ? 16 : 13,  // 16px on mobile prevents iOS zoom-on-focus
            fontFamily: font,
            resize: "none" as const,
            outline: "none",
            lineHeight: 1.5,
            maxHeight: isMobile ? 100 : 200,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = C.purple)}
          onBlur={e => (e.currentTarget.style.borderColor = C.border2)}
        />
        <button onClick={sendMessage} disabled={!input.trim() || sending}
          style={{
            padding: isMobile ? "10px 14px" : "10px 18px",
            borderRadius: 10,
            border: "none",
            background: input.trim() && !sending ? C.purple : C.bg3,
            color: input.trim() && !sending ? "#fff" : C.text4,
            fontSize: isMobile ? 14 : 13,
            fontWeight: 600,
            cursor: input.trim() && !sending ? "pointer" : "default",
            fontFamily: font,
            flexShrink: 0,
            minWidth: isMobile ? 60 : "auto",
            minHeight: isMobile ? 44 : "auto",
          }}>
          Send
        </button>
      </div>
    </div>
  );
}