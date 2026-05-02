"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import { C, font } from "@/app/lib/theme";
import { useIsMobile } from "@/app/lib/useMediaQuery";
import FeatureGate from "@/app/components/FeatureGate";
// ── Types ─────────────────────────────────────────────────────────────────────

type StepType = "send_email" | "wait" | "send_card" | "send_gift" | "branch" | "end";

type CampaignStep = {
  id: string;
  step_type: StepType;
  position: number;
  config: any;
};

type Campaign = {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  reply_behavior: "exit" | "next_step";
  campaign_audiences?: { audience_id: string; audiences: { id: string; name: string; contact_count?: number } }[];
  campaign_steps?: CampaignStep[];
  stats?: { sent: number; opened: number; clicked: number; replied: number; opted_out: number };
  created_at: string;
  updated_at: string;
};

type Audience = {
  id: string;
  name: string;
  contact_count?: number;
};

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "blank",
    name: "Build from scratch",
    description: "Start with a blank sequence",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "", body: "" } },
      { step_type: "end", position: 1, config: {} },
    ],
  },
  {
    id: "sales_outreach",
    name: "Sales outreach",
    description: "3-touch email sequence for warm prospects",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "Quick question, {{first_name}}", body: "Hi {{first_name}},\n\nI wanted to reach out personally — I think there's a real opportunity for us to work together.\n\nWould you have 15 minutes this week for a quick call?\n\nBest," } },
      { step_type: "wait", position: 1, config: { days: 3 } },
      { step_type: "send_email", position: 2, config: { subject: "Following up", body: "Hi {{first_name}},\n\nJust following up on my last note. Still think it could be worth a quick conversation — happy to work around your schedule.\n\nBest," } },
      { step_type: "wait", position: 3, config: { days: 5 } },
      { step_type: "send_email", position: 4, config: { subject: "Last touch", body: "Hi {{first_name}},\n\nI'll keep this brief — if now isn't the right time, no worries at all. I'll check back in a few months. But if you'd like to connect, I'm here.\n\nBest," } },
      { step_type: "end", position: 5, config: {} },
    ],
  },
  {
    id: "reengagement",
    name: "Re-engagement",
    description: "Win back contacts you haven't spoken to in a while",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "Been a while, {{first_name}}", body: "Hi {{first_name}},\n\nIt's been a while — I wanted to reach out and see how things are going on your end.\n\nHope all is well!\n\nBest," } },
      { step_type: "wait", position: 1, config: { days: 5 } },
      { step_type: "send_card", position: 2, config: { occasion: "Thinking of you", message: "{{first_name}}, just wanted to say hello and let you know I'm thinking of you. Hope everything is going great!" } },
      { step_type: "wait", position: 3, config: { days: 7 } },
      { step_type: "send_email", position: 4, config: { subject: "One more thought", body: "Hi {{first_name}},\n\nI know life gets busy. Just wanted to leave the door open — I'd love to reconnect whenever the timing works for you.\n\nBest," } },
      { step_type: "end", position: 5, config: {} },
    ],
  },
  {
    id: "birthday_holiday",
    name: "Birthday / holiday",
    description: "Thoughtful seasonal outreach with a handwritten card",
    steps: [
      { step_type: "send_card", position: 0, config: { occasion: "Happy Birthday", message: "{{first_name}}, wishing you a wonderful birthday and an incredible year ahead!" } },
      { step_type: "wait", position: 1, config: { days: 2 } },
      { step_type: "send_email", position: 2, config: { subject: "Happy Birthday, {{first_name}}!", body: "Hi {{first_name}},\n\nHope you're having a fantastic birthday! Wanted to reach out and let you know I'm thinking of you.\n\nWishing you all the best," } },
      { step_type: "end", position: 3, config: {} },
    ],
  },
  {
    id: "new_customer_welcome",
    name: "New customer welcome",
    description: "Onboard and delight a new customer",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "Welcome, {{first_name}} — so glad you're here", body: "Hi {{first_name}},\n\nI just wanted to personally welcome you and say thank you for choosing us. It means a lot.\n\nIf you ever have questions or just want to talk through anything, I'm always here.\n\nLooking forward to working together," } },
      { step_type: "wait", position: 1, config: { days: 3 } },
      { step_type: "send_card", position: 2, config: { occasion: "Thank you", message: "{{first_name}}, thank you for trusting us with your business. We're so glad to have you as a customer!" } },
      { step_type: "wait", position: 3, config: { days: 7 } },
      { step_type: "send_email", position: 4, config: { subject: "Checking in — how's everything going?", body: "Hi {{first_name}},\n\nJust wanted to check in and see how things are going. Is there anything I can do to make your experience even better?\n\nAlways here if you need anything," } },
      { step_type: "end", position: 5, config: {} },
    ],
  },
  {
    id: "referral_ask",
    name: "Referral ask",
    description: "Ask happy customers to introduce you to others",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "A quick favor, {{first_name}}", body: "Hi {{first_name}},\n\nI hope things are going well! I wanted to reach out with a small ask.\n\nIf you've been happy working with us, I'd be incredibly grateful if you thought of anyone who might benefit from what we do. Even a quick introduction makes a huge difference.\n\nNo pressure at all — just wanted to put it out there.\n\nThank you," } },
      { step_type: "wait", position: 1, config: { days: 5 } },
      { step_type: "send_email", position: 2, config: { subject: "One more thought on that intro", body: "Hi {{first_name}},\n\nI know you're busy, so I'll keep this short — if anyone comes to mind who might benefit from working with us, I'd be so grateful for an intro.\n\nThank you for considering it," } },
      { step_type: "end", position: 3, config: {} },
    ],
  },
  {
    id: "event_followup",
    name: "Event follow-up",
    description: "Follow up with people you met at an event",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "Great meeting you, {{first_name}}", body: "Hi {{first_name}},\n\nIt was great connecting with you recently. I really enjoyed our conversation and wanted to follow up while it's still fresh.\n\nLet's stay in touch — I'd love to find a way to be helpful to you.\n\nBest," } },
      { step_type: "wait", position: 1, config: { days: 4 } },
      { step_type: "send_email", position: 2, config: { subject: "Following up from our conversation", body: "Hi {{first_name}},\n\nJust wanted to follow up one more time. If there's ever anything I can help with, don't hesitate to reach out.\n\nBest," } },
      { step_type: "wait", position: 3, config: { days: 14 } },
      { step_type: "send_card", position: 4, config: { occasion: "Thinking of you", message: "{{first_name}}, it was great meeting you. Looking forward to staying in touch!" } },
      { step_type: "end", position: 5, config: {} },
    ],
  },
  {
    id: "lapsed_customer",
    name: "Lapsed customer",
    description: "Reach out to customers who haven't ordered recently",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "We miss you, {{first_name}}", body: "Hi {{first_name}},\n\nIt's been a while since we've worked together and I wanted to reach out personally.\n\nIs there anything I can help you with? I'd love to reconnect and see if there's an opportunity to work together again.\n\nBest," } },
      { step_type: "wait", position: 1, config: { days: 7 } },
      { step_type: "send_card", position: 2, config: { occasion: "Thinking of you", message: "{{first_name}}, just wanted to say hello and let you know we'd love to work with you again. Reach out anytime!" } },
      { step_type: "wait", position: 3, config: { days: 7 } },
      { step_type: "send_email", position: 4, config: { subject: "One last note", body: "Hi {{first_name}},\n\nI don't want to overstay my welcome — just wanted to leave the door wide open. Whenever you're ready to reconnect, we're here.\n\nBest," } },
      { step_type: "end", position: 5, config: {} },
    ],
  },
  {
    id: "nurture",
    name: "Relationship nurture",
    description: "Stay top of mind with key contacts over time",
    steps: [
      { step_type: "send_email", position: 0, config: { subject: "Thinking of you, {{first_name}}", body: "Hi {{first_name}},\n\nI was thinking about you recently and wanted to reach out. How are things going on your end?\n\nNo agenda — just wanted to say hello and stay in touch.\n\nBest," } },
      { step_type: "wait", position: 1, config: { days: 14 } },
      { step_type: "send_card", position: 2, config: { occasion: "Thinking of you", message: "{{first_name}}, just a quick note to say I'm thinking of you and hope things are going great!" } },
      { step_type: "wait", position: 3, config: { days: 14 } },
      { step_type: "send_email", position: 4, config: { subject: "Checking in", body: "Hi {{first_name}},\n\nJust checking in — hope all is well. I'm always here if there's ever anything I can do.\n\nBest," } },
      { step_type: "end", position: 5, config: {} },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const iStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const };
const lStyle = { fontSize: 11, fontWeight: 700 as const, color: C.text3, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6, display: "block" as const };

function newStep(type: StepType, position: number): CampaignStep {
  const defaults: Record<StepType, any> = {
    send_email: { subject: "", body: "" },
    wait: { days: 3 },
    send_card: { occasion: "Thinking of you", message: "" },
    send_gift: { placeholder: true },
    branch: { condition: "opened", yes_step_id: null, no_step_id: null },
    end: {},
  };
  return { id: Math.random().toString(36).slice(2), step_type: type, position, config: defaults[type] };
}

function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case "active": return { bg: C.greenLight, text: C.green };
    case "paused": return { bg: C.amberLight, text: C.amber };
    case "draft": return { bg: C.bg3, text: C.text3 };
    case "completed": return { bg: C.blueLight, text: C.blue };
    case "archived": return { bg: C.border, text: C.text4 };
    default: return { bg: C.bg3, text: C.text3 };
  }
}

function stepIcon(type: StepType): string {
  switch (type) {
    case "send_email": return "Email";
    case "wait": return "Wait";
    case "send_card": return "Card";
    case "send_gift": return "Gift";
    case "branch": return "Branch";
    case "end": return "End";
  }
}

function stepLabel(step: CampaignStep): string {
  switch (step.step_type) {
    case "send_email": return step.config.subject ? `Email: "${step.config.subject}"` : "Send email";
    case "wait": return `Wait ${step.config.days || 1} day${step.config.days !== 1 ? "s" : ""}`;
    case "send_card": return `Card: ${step.config.occasion || "Thinking of you"}`;
    case "send_gift": return "Send gift (coming soon)";
    case "branch": return `If/else: ${(step.config.condition || "opened").replace(/_/g, " ")}`;
    case "end": return "End sequence";
  }
}

// ── Step Editor ───────────────────────────────────────────────────────────────

function StepEditor({ step, onChange, position, totalSteps, campaignGoal }: {
  step: CampaignStep;
  onChange: (s: CampaignStep) => void;
  position: number;
  totalSteps: number;
  campaignGoal: string;
}) {
  const update = (config: any) => onChange({ ...step, config: { ...step.config, ...config } });
  const [generating, setGenerating] = useState(false);
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [goalOverride, setGoalOverride] = useState("");

  const generate = async () => {
    const goal = goalOverride.trim() || campaignGoal.trim();
    if (!goal) { setShowGoalInput(true); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/campaigns/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_type: step.step_type, goal, position, total_steps: totalSteps, occasion: step.config.occasion }),
      });
      const data = await res.json();
      console.log("[generate-step] response:", data);

      if (step.step_type === "send_email") {
        update({ subject: data.subject || "", body: data.body || "" });
      }
      if (step.step_type === "send_card") {
        // Accept several possible response shapes in case the API returns
        // {message}, {body}, or {text}
        const msg = data.message || data.body || data.text || "";
        if (!msg) {
          console.warn("[generate-step] card response missing message field:", data);
          alert("AI didn't return a message. Check console for details.");
        }
        update({ message: msg });
      }
    } catch (e) {
      console.error("[generate-step] error:", e);
      alert("AI generation failed. Check console.");
    }
    setGenerating(false);
    setShowGoalInput(false);
  };

  const aiButtonJsx = (
    <div style={{ marginBottom: 12 }}>
      {showGoalInput && !campaignGoal ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={goalOverride} onChange={e => setGoalOverride(e.target.value)}
            placeholder="What's the goal? e.g. Re-engage lapsed customers warmly"
            style={{ ...iStyle, flex: 1 }}
            onKeyDown={e => e.key === "Enter" && generate()} />
          <button onClick={generate} disabled={!goalOverride.trim() || generating}
            style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: C.purple, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" as const }}>
            {generating ? "Writing..." : "Generate"}
          </button>
          <button onClick={() => setShowGoalInput(false)}
            style={{ padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border2}`, background: "none", color: C.text3, fontSize: 12, cursor: "pointer", fontFamily: font }}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={generate} disabled={generating}
          style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.purple}`, background: C.purpleLight, color: C.purple, fontSize: 12, fontWeight: 700, cursor: generating ? "default" : "pointer", fontFamily: font, opacity: generating ? 0.7 : 1 }}>
          {generating ? "Writing with AI..." : "Write with AI"}
        </button>
      )}
    </div>
  );

  if (step.step_type === "send_email") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {aiButtonJsx}
      <div>
        <label style={lStyle}>Subject line</label>
        <input value={step.config.subject || ""} onChange={e => update({ subject: e.target.value })}
          placeholder="e.g. Quick question, {{first_name}}" style={iStyle} />
        <div style={{ fontSize: 10, color: C.text4, marginTop: 3 }}>Use {"{{first_name}}"} or {"{{company}}"} for personalization</div>
      </div>
      <div>
        <label style={lStyle}>Email body</label>
        <textarea value={step.config.body || ""} onChange={e => update({ body: e.target.value })}
          rows={6} placeholder="Write your message here..." style={{ ...iStyle, resize: "vertical" as const, lineHeight: 1.6 }} />
        <div style={{ fontSize: 10, color: C.text4, marginTop: 3 }}>Gmail signature + Humble Hello footer appended automatically</div>
      </div>
    </div>
  );

  if (step.step_type === "wait") return (
    <div>
      <label style={lStyle}>Wait for</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="number" min={1} max={90} value={step.config.days || 1}
          onChange={e => update({ days: Math.max(1, parseInt(e.target.value) || 1) })}
          style={{ ...iStyle, width: 80 }} />
        <span style={{ fontSize: 13, color: C.text3 }}>days before next step</span>
      </div>
    </div>
  );

  if (step.step_type === "send_card") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={lStyle}>Occasion</label>
        <select value={step.config.occasion || "Thinking of you"} onChange={e => update({ occasion: e.target.value })}
          style={{ ...iStyle, cursor: "pointer" }}>
          {["Thinking of you", "Thank you", "Congratulations", "Happy Birthday", "Just because", "Other"].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
      </div>
      {aiButtonJsx}
      <div>
        <label style={lStyle}>Card message template</label>
        <textarea value={step.config.message || ""} onChange={e => update({ message: e.target.value })}
          rows={4} placeholder="Write your handwritten card message..." style={{ ...iStyle, resize: "vertical" as const, lineHeight: 1.6 }} />
        <div style={{ fontSize: 10, color: C.text4, marginTop: 3 }}>
          At send time, AI personalizes each card using what we know about that contact — their interests, shared history, key context, and more.
        </div>
      </div>
      <div style={{ padding: "10px 12px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: C.amber }}>
        Card skipped if contact has no home address on file
      </div>
    </div>
  );

  if (step.step_type === "send_gift") return (
    <div style={{ padding: "16px", background: C.bg3, borderRadius: 8, textAlign: "center" as const }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Gift sending coming soon</div>
      <div style={{ fontSize: 12, color: C.text3 }}>This step will be skipped until the gifting store is live.</div>
    </div>
  );

  if (step.step_type === "branch") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={lStyle}>Condition — check if contact has...</label>
        <select value={step.config.condition || "opened"} onChange={e => update({ condition: e.target.value })}
          style={{ ...iStyle, cursor: "pointer" }}>
          {[
            { value: "opened", label: "Opened the previous email" },
            { value: "not_opened", label: "NOT opened the previous email" },
            { value: "clicked", label: "Clicked a link in the previous email" },
            { value: "not_clicked", label: "NOT clicked any link" },
            { value: "replied", label: "Replied to the previous email" },
            { value: "not_replied", label: "NOT replied" },
          ].map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div style={{ borderLeft: `3px solid ${C.green}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>If yes</div>
        <select value={step.config.yes_action || "continue"} onChange={e => update({ yes_action: e.target.value })}
          style={{ ...iStyle, cursor: "pointer", marginBottom: 6 }}>
          <option value="continue">Continue to next step</option>
          <option value="send_card">Send a card</option>
          <option value="send_email">Send an email</option>
          <option value="end">End sequence</option>
        </select>
        {step.config.yes_action === "send_card" && (
          <textarea value={step.config.yes_card_message || ""} onChange={e => update({ yes_card_message: e.target.value })}
            rows={3} placeholder="Card message..." style={{ ...iStyle, resize: "vertical" as const, lineHeight: 1.5, fontSize: 12 }} />
        )}
        {step.config.yes_action === "send_email" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input value={step.config.yes_email_subject || ""} onChange={e => update({ yes_email_subject: e.target.value })}
              placeholder="Subject line" style={{ ...iStyle, fontSize: 12 }} />
            <textarea value={step.config.yes_email_body || ""} onChange={e => update({ yes_email_body: e.target.value })}
              rows={3} placeholder="Email body" style={{ ...iStyle, resize: "vertical" as const, lineHeight: 1.5, fontSize: 12 }} />
          </div>
        )}
      </div>
      <div style={{ borderLeft: `3px solid ${C.red}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>If no</div>
        <select value={step.config.no_action || "end"} onChange={e => update({ no_action: e.target.value })}
          style={{ ...iStyle, cursor: "pointer", marginBottom: 6 }}>
          <option value="end">End sequence</option>
          <option value="continue">Continue to next step</option>
          <option value="send_card">Send a card</option>
          <option value="send_email">Send an email</option>
        </select>
        {step.config.no_action === "send_card" && (
          <textarea value={step.config.no_card_message || ""} onChange={e => update({ no_card_message: e.target.value })}
            rows={3} placeholder="Card message..." style={{ ...iStyle, resize: "vertical" as const, lineHeight: 1.5, fontSize: 12 }} />
        )}
        {step.config.no_action === "send_email" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input value={step.config.no_email_subject || ""} onChange={e => update({ no_email_subject: e.target.value })}
              placeholder="Subject line" style={{ ...iStyle, fontSize: 12 }} />
            <textarea value={step.config.no_email_body || ""} onChange={e => update({ no_email_body: e.target.value })}
              rows={3} placeholder="Email body" style={{ ...iStyle, resize: "vertical" as const, lineHeight: 1.5, fontSize: 12 }} />
          </div>
        )}
      </div>
    </div>
  );

  if (step.step_type === "end") return (
    <div style={{ padding: "16px", background: C.bg3, borderRadius: 8, textAlign: "center" as const }}>
      <div style={{ fontSize: 13, color: C.text3 }}>Sequence ends here — contact marked as completed</div>
    </div>
  );

  return null;
}

// ── Step Card ─────────────────────────────────────────────────────────────────

function StepCard({ step, index, total, selected, onSelect, onRemove, onMoveUp, onMoveDown, onChange, campaignGoal }: {
  step: CampaignStep; index: number; total: number; selected: boolean;
  onSelect: () => void; onRemove: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  onChange: (s: CampaignStep) => void;
  campaignGoal: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Connector line */}
      {index > 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <div style={{ width: 2, height: 20, background: C.border2 }} />
        </div>
      )}
      <div onClick={onSelect} style={{ border: `2px solid ${selected ? C.blue : C.border}`, borderRadius: 10, background: selected ? C.blueLight : C.bg2, cursor: "pointer", transition: "all 0.15s", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: selected ? `1px solid ${C.border2}` : "none" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: C.bg3, color: C.text3, flexShrink: 0, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{stepIcon(step.step_type)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: selected ? C.blue : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stepLabel(step)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={onMoveUp} disabled={index === 0} style={{ padding: "3px 7px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "none", color: index === 0 ? C.text4 : C.text3, fontSize: 11, cursor: index === 0 ? "default" : "pointer", fontFamily: font }}>↑</button>
            <button onClick={onMoveDown} disabled={index === total - 1} style={{ padding: "3px 7px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "none", color: index === total - 1 ? C.text4 : C.text3, fontSize: 11, cursor: index === total - 1 ? "default" : "pointer", fontFamily: font }}>↓</button>
            {step.step_type !== "end" && (
              <button onClick={onRemove} style={{ padding: "3px 7px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "none", color: C.red, fontSize: 11, cursor: "pointer", fontFamily: font }}>×</button>
            )}
          </div>
        </div>
        {/* Expanded editor */}
        {selected && (
          <div style={{ padding: 14 }} onClick={e => e.stopPropagation()}>
            <StepEditor step={step} onChange={onChange} position={index} totalSteps={total} campaignGoal={campaignGoal} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template Picker ───────────────────────────────────────────────────────────

function TemplatePicker({ onSelect }: { onSelect: (template: typeof TEMPLATES[0]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {TEMPLATES.map(t => (
        <div key={t.id} onClick={() => onSelect(t)}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg2, cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.background = C.blueLight; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg2; }}>

          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.name}</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{t.description}</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: C.text4, flexShrink: 0 }}>{t.steps.length - 1} steps →</div>
        </div>
      ))}
    </div>
  );
}

// ── Campaign Builder Panel ────────────────────────────────────────────────────

function CampaignBuilder({ campaign, audiences, isMobile, onSave, onLaunch, onPause, onClose }: {
  campaign: Campaign | null;
  audiences: Audience[];
  isMobile: boolean;
  onSave: (data: any) => Promise<Campaign | null>;
  onLaunch: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(campaign?.name || "");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [cardBudget, setCardBudget] = useState<number | null>(null);
  const [noBudgetCap, setNoBudgetCap] = useState(false);
  const [description, setDescription] = useState(campaign?.description || "");
  const [replyBehavior, setReplyBehavior] = useState<"exit" | "next_step">(campaign?.reply_behavior || "exit");
  const [selectedAudienceIds, setSelectedAudienceIds] = useState<string[]>(
    campaign?.campaign_audiences?.map(ca => ca.audience_id) || []
  );
  const [steps, setSteps] = useState<CampaignStep[]>(
    campaign?.campaign_steps?.sort((a, b) => a.position - b.position) || []
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(!campaign && steps.length === 0);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [activeTab, setActiveTab] = useState<"sequence" | "settings">("sequence");

  const totalContacts = audiences
    .filter(a => selectedAudienceIds.includes(a.id))
    .reduce((sum, a) => sum + (a.contact_count || 0), 0);
  const cappedContacts = Math.min(totalContacts, 250);
  const estimatedDays = cappedContacts > 0 ? Math.ceil(cappedContacts / 25) : 0;

  const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
    setSteps(template.steps.map((s, i) => ({ ...s, id: Math.random().toString(36).slice(2), position: i, step_type: s.step_type as StepType })));
    setName(name || template.name);
    setShowTemplates(false);
  };

  const addStep = (type: StepType) => {
    const endIdx = steps.findIndex(s => s.step_type === "end");
    const insertAt = endIdx >= 0 ? endIdx : steps.length;
    const newSteps = [...steps];
    const step = newStep(type, insertAt);
    newSteps.splice(insertAt, 0, step);
    setSteps(newSteps.map((s, i) => ({ ...s, position: i })));
    setSelectedStepId(step.id);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id).map((s, i) => ({ ...s, position: i })));
    if (selectedStepId === id) setSelectedStepId(null);
  };

  const moveStep = (id: string, dir: -1 | 1) => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx + dir < 0 || idx + dir >= steps.length) return;
    const next = [...steps];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    setSteps(next.map((s, i) => ({ ...s, position: i })));
  };

  const updateStep = (updated: CampaignStep) => {
    setSteps(steps.map(s => s.id === updated.id ? updated : s));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name, description, reply_behavior: replyBehavior, audience_ids: selectedAudienceIds, steps, card_budget: noBudgetCap ? null : (cardBudget || null), no_budget_cap: noBudgetCap });
    setSaving(false);
  };

  const handleLaunch = async () => {
    setLaunching(true);
    const saved = await onSave({ name, description, reply_behavior: replyBehavior, audience_ids: selectedAudienceIds, steps, card_budget: noBudgetCap ? null : (cardBudget || null), no_budget_cap: noBudgetCap });
    const id = saved?.id || campaign?.id;
    if (id) await onLaunch(id);
    setLaunching(false);
  };

  const isDraft = !campaign || campaign.status === "draft";
  const isActive = campaign?.status === "active";
  const isPaused = campaign?.status === "paused";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg2 }}>
      {/* Header */}
      <div style={{ padding: isMobile ? "12px 14px" : "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 10 : 12, flexShrink: 0, flexDirection: isMobile ? "column" : "row" }}>
        {/* Top row on mobile: back button + name input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          {isMobile && (
            <button onClick={onClose}
              aria-label="Back to list"
              style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, flexShrink: 0 }}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name..."
              style={{ width: "100%", fontSize: 16, fontWeight: 700, color: C.text, background: "none", border: "none", outline: "none", fontFamily: font, padding: 0 }} />
            {campaign && (
              <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>
                {cappedContacts} contacts · ~{estimatedDays} days · {campaign.status}
              </div>
            )}
          </div>
        </div>
        {/* Action buttons row: wraps on mobile */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: isMobile ? "wrap" as const : "nowrap" as const }}>
          {(isDraft || isPaused) && (
            <button onClick={handleLaunch} disabled={launching || !name.trim() || selectedAudienceIds.length === 0 || steps.length < 2}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font, opacity: launching || !name.trim() || selectedAudienceIds.length === 0 ? 0.5 : 1 }}>
              {launching ? "Launching..." : "Launch"}
            </button>
          )}
          {isActive && (
            <button onClick={() => campaign && onPause(campaign.id)}
              style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.amberLight, color: C.amber, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
              ⏸ Pause
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving..." : "Save draft"}
          </button>
          {!isMobile && (
            <button onClick={onClose} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border2}`, background: "none", color: C.text3, fontSize: 18, cursor: "pointer" }}>×</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {(["sequence", "settings"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "10px 20px", border: "none", background: "none", borderBottom: `2px solid ${activeTab === tab ? C.blue : "transparent"}`, color: activeTab === tab ? C.blue : C.text3, fontSize: 13, fontWeight: activeTab === tab ? 700 : 400, cursor: "pointer", fontFamily: font, textTransform: "capitalize" }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {activeTab === "sequence" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Campaign name */}
          <div>
            <label style={lStyle}>Campaign name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q2 referral outreach" style={iStyle} />
          </div>

          {/* Campaign goal */}
          <div>
            <label style={lStyle}>Campaign goal (used by AI to write messages)</label>
              <input value={campaignGoal} onChange={e => setCampaignGoal(e.target.value)}
                placeholder="e.g. Re-engage lapsed screen printing customers with a warm personal touch"
                style={iStyle} />
              <div style={{ fontSize: 10, color: C.text4, marginTop: 3 }}>Tell AI what this campaign is trying to accomplish — it uses this plus what we know about each contact to personalize every message</div>
            </div>

            {/* Audience selector */}
            <div>
              <label style={lStyle}>Audiences</label>
              {audiences.length === 0 ? (
                <div style={{ padding: "12px 14px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: C.amber }}>
                  No audiences yet — <a href="/audience" style={{ color: C.amber, fontWeight: 700 }}>create one first</a>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {audiences.map(a => {
                    const selected = selectedAudienceIds.includes(a.id);
                    return (
                      <div key={a.id} onClick={() => setSelectedAudienceIds(prev =>
                        selected ? prev.filter(id => id !== a.id) : [...prev, a.id]
                      )} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${selected ? C.blue : C.border}`, background: selected ? C.blueLight : C.bg3, cursor: "pointer", transition: "all 0.15s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected ? C.blue : C.border2}`, background: selected ? C.blue : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {selected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: selected ? C.blue : C.text }}>{a.name}</div>
                        </div>
                        <div style={{ fontSize: 11, color: selected ? C.blue : C.text4 }}>{a.contact_count || 0} contacts</div>
                      </div>
                    );
                  })}
                  {selectedAudienceIds.length > 0 && (
                    <div style={{ padding: "8px 12px", background: cappedContacts >= 250 ? C.amberLight : C.greenLight, borderRadius: 8, fontSize: 12, color: cappedContacts >= 250 ? C.amber : C.green, fontWeight: 600 }}>
                      {cappedContacts} contacts selected{cappedContacts >= 250 ? " — capped at 250" : ""} · ~{estimatedDays} day campaign at 25/day
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sequence */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <label style={{ ...lStyle, marginBottom: 0 }}>Sequence</label>
                <button onClick={() => setShowTemplates(true)}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border2}`, background: "none", color: C.text3, cursor: "pointer", fontFamily: font }}>
                  Load template
                </button>
              </div>

              {showTemplates ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Choose a starting template</div>
                  <TemplatePicker onSelect={handleTemplateSelect} />
                  {steps.length > 0 && (
                    <button onClick={() => setShowTemplates(false)}
                      style={{ marginTop: 10, fontSize: 12, padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.border2}`, background: "none", color: C.text3, cursor: "pointer", fontFamily: font }}>
                      Cancel — keep current steps
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  {steps.length === 0 ? (
                    <div style={{ padding: "24px", background: C.bg3, borderRadius: 10, textAlign: "center" as const, border: `2px dashed ${C.border2}` }}>
                      <div style={{ fontSize: 13, color: C.text3, marginBottom: 12 }}>No steps yet</div>
                      <button onClick={() => setShowTemplates(true)}
                        style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.blue, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                        Pick a template
                      </button>
                    </div>
                  ) : (
                    <div>
                      {steps.map((step, i) => (
                        <StepCard key={step.id} step={step} index={i} total={steps.length}
                          selected={selectedStepId === step.id}
                          onSelect={() => setSelectedStepId(selectedStepId === step.id ? null : step.id)}
                          onRemove={() => removeStep(step.id)}
                          onMoveUp={() => moveStep(step.id, -1)}
                          onMoveDown={() => moveStep(step.id, 1)}
                          onChange={updateStep} campaignGoal={campaignGoal} />
                      ))}
                    </div>
                  )}

                  {/* Add step buttons */}
                  {steps.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Add step</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {([
                          { type: "send_email", label: "Email" },
                          { type: "wait", label: "Wait" },
                          { type: "branch", label: "Branch" },
                          { type: "send_gift", label: "Gift" },
                          { type: "send_card", label: "Card" },
                        ] as { type: StepType; label: string }[]).map(({ type, label }) => (
                          <button key={type} onClick={() => addStep(type)}
                            style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom launch / save actions — mirror the top bar so users can finish without scrolling up */}
                  {steps.length > 0 && (
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
                      <button onClick={handleSave} disabled={saving || !name.trim()}
                        style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, opacity: saving ? 0.6 : 1 }}>
                        {saving ? "Saving..." : "Save draft"}
                      </button>
                      {(isDraft || isPaused) && (
                        <button onClick={handleLaunch}
                          disabled={launching || !name.trim() || selectedAudienceIds.length === 0 || steps.length < 2}
                          style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font, opacity: launching || !name.trim() || selectedAudienceIds.length === 0 ? 0.5 : 1 }}>
                          {launching ? "Launching..." : "Launch campaign"}
                        </button>
                      )}
                      {isActive && (
                        <button onClick={() => campaign && onPause(campaign.id)}
                          style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.amberLight, color: C.amber, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                          ⏸ Pause campaign
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    
            <div>
              <label style={lStyle}>When a contact replies</label>
              <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row" }}>
                {(["exit", "next_step"] as const).map(opt => (
                  <button key={opt} onClick={() => setReplyBehavior(opt)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1.5px solid ${replyBehavior === opt ? C.blue : C.border2}`, background: replyBehavior === opt ? C.blueLight : C.bg3, color: replyBehavior === opt ? C.blue : C.text3, fontSize: 12, fontWeight: replyBehavior === opt ? 700 : 400, cursor: "pointer", fontFamily: font }}>
                    {opt === "exit" ? "Exit sequence (recommended)" : "Continue to next step"}
                  </button>
                ))}
              </div>
            </div>
            {/* Card budget */}
            <div>
              <label style={lStyle}>Card & gift budget for this campaign</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
                  <div style={{ position: "relative" as const, flex: 1, width: isMobile ? "100%" : "auto" }}>
                    <span style={{ position: "absolute" as const, left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.text3 }}>$</span>
                    <input
                      type="number"
                      min={20}
                      value={cardBudget ?? ""}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setCardBudget(isNaN(val) ? null : Math.max(20, val));
                        setNoBudgetCap(false);
                      }}
                      disabled={noBudgetCap}
                      placeholder="e.g. 100"
                      style={{ ...iStyle, paddingLeft: 26, opacity: noBudgetCap ? 0.4 : 1 }}
                    />
                  </div>
                  <div
                    onClick={() => { setNoBudgetCap(v => !v); if (!noBudgetCap) setCardBudget(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${noBudgetCap ? C.blue : C.border2}`, background: noBudgetCap ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {noBudgetCap && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 12, color: C.text3 }}>No budget cap</span>
                  </div>
                </div>
                {!noBudgetCap && cardBudget !== null && cardBudget < 20 && (
                  <div style={{ fontSize: 11, color: C.red }}>Minimum budget is $20</div>
                )}
                <div style={{ fontSize: 11, color: C.text4, lineHeight: 1.6 }}>
                  {noBudgetCap
                    ? "Cards will send without a spending limit. Each card costs $4.75."
                    : cardBudget
                    ? `Card sends pause once this campaign has spent $${cardBudget} on cards. Each card is $4.75 (~${Math.floor(cardBudget / 4.75)} cards).`
                    : "Set a budget to automatically pause card sends when the limit is reached. Minimum $20."}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 16px", background: C.bg3, borderRadius: 10, fontSize: 12, color: C.text3, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Send rules</div>
              Sends stagger between 7am–3pm in your timezone · 25 emails/day max · Plain text with your Gmail signature · Humble Hello footer on every email · Contacts who opt out are excluded from all future sends
            </div>
            {campaign && (
              <div>
                <label style={lStyle}>Analytics</label>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 8 }}>
                  {[
                    { label: "Sent", value: campaign.stats?.sent || 0 },
                    { label: "Opened", value: campaign.stats?.opened || 0 },
                    { label: "Clicked", value: campaign.stats?.clicked || 0 },
                    { label: "Replied", value: campaign.stats?.replied || 0 },
                    { label: "Opted out", value: campaign.stats?.opted_out || 0 },
                  ].map(s => (
                    <div key={s.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: C.text4, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campaign List Item ────────────────────────────────────────────────────────

function CampaignListItem({ campaign, selected, onSelect, onArchive }: {
  campaign: Campaign; selected: boolean; onSelect: () => void; onArchive: () => void;
}) {
  const sc = statusColor(campaign.status);
  const sent = campaign.stats?.sent || 0;
  const opened = campaign.stats?.opened || 0;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;

  return (
    <div onClick={onSelect} style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: selected ? C.blueLight : "transparent", cursor: "pointer", transition: "background 0.1s" }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = C.bg3; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: selected ? C.blue : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {campaign.name}
          </div>
          {campaign.description && (
            <div style={{ fontSize: 11, color: C.text4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {campaign.description}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.text, fontWeight: 700, textTransform: "capitalize" as const }}>
            {campaign.status}
          </span>
          <button onClick={e => { e.stopPropagation(); onArchive(); }}
            title="Delete campaign"
            style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.border2}`, background: "none", color: C.text4, fontSize: 12, cursor: "pointer", fontFamily: font, lineHeight: 1.4 }}>
            ×
          </button>
        </div>
      </div>
      {sent > 0 && (
        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: C.text4 }}>
          <span>{sent} sent</span>
          <span style={{ color: openRate > 30 ? C.green : C.text4 }}>{openRate}% open</span>
          <span>{campaign.stats?.replied || 0} replies</span>
        </div>
      )}
      <div style={{ fontSize: 10, color: C.text4, marginTop: 4 }}>
        {new Date(campaign.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function CampaignsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    loadAll();
    // Check if coming from audience page with pre-selected audience
    const audienceId = searchParams.get("audience");
    if (audienceId) handleNewCampaign(audienceId);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [campRes, audRes] = await Promise.all([
      fetch("/api/campaigns").catch(() => null),
      fetch("/api/audiences").catch(() => null),
    ]);
    const campData = campRes ? await campRes.json() : {};
    const audData = audRes ? await audRes.json() : {};
    setCampaigns(campData.campaigns || []);
    setAudiences(audData.audiences || []);
    setLoading(false);
  };

  const handleNewCampaign = (preselectedAudienceId?: string) => {
    setSelectedCampaign(null);
    setShowBuilder(true);
  };

  const handleSelectCampaign = async (campaign: Campaign) => {
    // Load full campaign with steps
    const res = await fetch(`/api/campaigns/${campaign.id}`).catch(() => null);
    const data = res ? await res.json() : {};
    setSelectedCampaign(data.campaign || campaign);
    setShowBuilder(true);
  };

  const handleSave = async (formData: any): Promise<Campaign | null> => {
    const campId = selectedCampaign?.id;
    const isExisting = campId && campId !== "undefined" && campId !== "null";
    const url = isExisting ? `/api/campaigns/${campId}` : "/api/campaigns";
    const method = isExisting ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error("[handleSave] error:", err);
      return null;
    }
    const data = await res.json();
   const saved = data.campaign;
    if (saved) {
      setCampaigns(prev => isExisting
        ? prev.map(c => c.id === saved.id ? { ...saved, campaign_steps: c.campaign_steps } : c)
        : [saved, ...prev]
      );
      const stepsWithPositions = formData.steps?.map((s: any, i: number) => ({ ...s, position: i })) || [];
      setSelectedCampaign(prev => ({
        ...saved,
        campaign_steps: stepsWithPositions,
        campaign_audiences: prev?.campaign_audiences || [],
      }));
    }
    return saved || null;
  };

  const handleLaunch = async (id: string) => {
    await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "active" } : c));
    setSelectedCampaign(prev => prev?.id === id ? { ...prev, status: "active" } : prev);
  };

  const handlePause = async (id: string) => {
    await fetch(`/api/campaigns/${id}/pause`, { method: "POST" });
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "paused" } : c));
    setSelectedCampaign(prev => prev?.id === id ? { ...prev, status: "paused" } : prev);
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Archive this campaign?")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selectedCampaign?.id === id) { setSelectedCampaign(null); setShowBuilder(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      <Sidebar activeId="campaigns" onNavClick={(id) => {
        if (id === "contacts") { router.push("/contacts"); return; }
        if (id === "audience") { router.push("/audience"); return; }
        if (id === "home") { router.push("/"); return; }
      }} />

      <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>

        {/* Left: Campaign list — hidden on mobile when builder is open (drill-down pattern) */}
        <div style={{ width: isMobile ? "100%" : 280, borderRight: isMobile ? "none" : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : "none", display: isMobile && showBuilder ? "none" : "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>Campaigns</div>
            <button onClick={() => handleNewCampaign()}
              style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
              + New campaign
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "20px 16px", fontSize: 13, color: C.text4 }}>Loading...</div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📣</div>
                <div style={{ fontSize: 13, color: C.text3, marginBottom: 12 }}>No campaigns yet</div>
                <button onClick={() => handleNewCampaign()}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                  Create first campaign
                </button>
              </div>
            ) : (
              campaigns.map(c => (
                <CampaignListItem key={c.id} campaign={c}
                  selected={selectedCampaign?.id === c.id}
                  onSelect={() => handleSelectCampaign(c)}
                  onArchive={() => handleArchive(c.id)} />
              ))
            )}
          </div>

          {/* Growth tier note */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.text4, flexShrink: 0 }}>
            Growth tier · 1 active campaign at a time · 25 sends/day
          </div>
        </div>

        {/* Right: Builder or empty state — only visible on mobile when showBuilder is true */}
        <div style={{ flex: 1, overflow: "hidden", display: isMobile && !showBuilder ? "none" : "flex", flexDirection: "column", minHeight: isMobile ? "calc(100dvh - 52px)" : "auto" }}>
          {showBuilder ? (
            <CampaignBuilder
              key="builder"
              campaign={selectedCampaign}
              audiences={audiences}
              isMobile={isMobile}
              onSave={handleSave}
              onLaunch={handleLaunch}
              onPause={handlePause}
              onClose={() => { setShowBuilder(false); setSelectedCampaign(null); }}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: C.text3 }}>
              <div style={{ fontSize: 48 }}>📣</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Select or create a campaign</div>
              <div style={{ fontSize: 13, color: C.text3 }}>Build email + card sequences for your audiences</div>
              <button onClick={() => handleNewCampaign()}
                style={{ marginTop: 8, padding: "10px 24px", borderRadius: 9, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                + New campaign
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <FeatureGate feature="campaigns">
      <Suspense>
        <CampaignsPageInner />
      </Suspense>
    </FeatureGate>
  );
}