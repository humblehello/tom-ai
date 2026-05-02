"use client";
import { useState, useEffect, useRef } from "react";
import { C, font } from "@/app/lib/theme";

type Message = { role: "user" | "assistant"; content: string };

export default function FloatingJournal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [started, setStarted] = useState(false);
  const [theme, setTheme] = useState("");
  const [gapContact, setGapContact] = useState("");
  const [saveStatus, setSaveStatus] = useState<null | "saving" | "saved">(null);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const extractingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && !started) startConversation();
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Listen for open-journal event fired from sidebar or dashboard
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-journal", handler);
    return () => window.removeEventListener("open-journal", handler);
  }, []);

  const startConversation = async () => {
    setStarted(true);
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
      setGapContact(data.gap_contact || "");
    } catch {
      setMessages([{ role: "assistant", content: "Who's been on your mind lately? Just give me a name and we'll go from there." }]);
    }
    setSending(false);
  };

  const autoExtract = async (msgs: Message[]) => {
    if (extractingRef.current) return;
    const userMessages = msgs.filter(m => m.role === "user").length;
    if (userMessages < 2) return;
    extractingRef.current = true;
    setSaveStatus("saving");
    try {
      const extractRes = await fetch("/api/journal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract", messages: msgs, theme }),
      });
      const extractData = await extractRes.json();
      const contacts = extractData.contacts || [];
      if (contacts.length > 0) {
        const saveRes = await fetch("/api/journal/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts }),
        });
        const saveData = await saveRes.json();
        setTotalUpdated(prev => prev + (saveData.saved || 0));
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {}
    extractingRef.current = false;
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
        body: JSON.stringify({ action: "chat", messages: newMessages, gap_contact: gapContact }),
      });
      const data = await res.json();
      const finalMessages = [...newMessages, { role: "assistant" as const, content: data.message }];
      setMessages(finalMessages);
      if (data.card_queued) {
        setSaveStatus("saved");
        setTotalUpdated(prev => prev + 1);
        setTimeout(() => setSaveStatus(null), 4000);
      }
      autoExtract(finalMessages);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Tell me more about that." }]);
    }
    setSending(false);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setStarted(false);
    setTheme("");
    setTotalUpdated(0);
    setSaveStatus(null);
    extractingRef.current = false;
    startConversation();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, left: 24, zIndex: 9000,
      width: 380, height: 560,
      background: "#ffffff", borderRadius: 20,
      boxShadow: "0 16px 64px rgba(0,0,0,0.18)",
      display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: font,
      animation: "hhSlideUp 0.2s ease",
    }}>
      <style>{`@keyframes hhSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Header */}
      <div style={{ padding: "14px 16px", background: C.purple, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Relationship Journal</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
              {saveStatus === "saving" ? "Updating contacts..." : saveStatus === "saved" ? `✓ ${totalUpdated > 0 ? `${totalUpdated} contact${totalUpdated !== 1 ? "s" : ""} updated` : "card queued for approval"}` : "Contacts update automatically"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleNewConversation} title="New conversation"
            style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            ↻
          </button>
          <button onClick={() => setOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && sending && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e5dbff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.purple }}>hh</div>
            <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "#f1f3f5", fontSize: 13, color: "#868e96" }}>···</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e5dbff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.purple, flexShrink: 0 }}>hh</div>
            )}
            <div style={{
              maxWidth: "78%", padding: "10px 14px",
              borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: msg.role === "user" ? C.purple : "#f1f3f5",
              color: msg.role === "user" ? "#fff" : "#212529",
              fontSize: 13, lineHeight: 1.6,
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && messages.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e5dbff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.purple }}>hh</div>
            <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "#f1f3f5", fontSize: 13, color: "#868e96" }}>···</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px", borderTop: "1px solid #e9ecef", display: "flex", gap: 8, alignItems: "flex-end", background: "#ffffff", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type here... (Enter to send)"
          rows={2}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #dee2e6", background: "#f8f9fa", color: "#212529", fontSize: 13, fontFamily: font, resize: "none", outline: "none", lineHeight: 1.5 }}
          onFocus={e => e.currentTarget.style.borderColor = C.purple}
          onBlur={e => e.currentTarget.style.borderColor = "#dee2e6"}
        />
        <button onClick={sendMessage} disabled={!input.trim() || sending}
          style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: input.trim() && !sending ? C.purple : "#f1f3f5", color: input.trim() && !sending ? "#fff" : "#adb5bd", cursor: input.trim() && !sending ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22,2 15,22 11,13 2,9" />
          </svg>
        </button>
      </div>
    </div>
  );
}