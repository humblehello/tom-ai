"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Goal = {
  id: string;
  category: string;
  title: string;
  goal_type: string;
  target_metric?: string;
  target_value?: number;
  current_value?: number;
  target_date?: string;
  streak_days?: number;
  last_activity_at?: string;
  status: string;
  created_at: string;
  goal_checkins?: any[];
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  personal: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0", bar: "#22c55e" },
  business: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", bar: "#3b82f6" },
  stop: { bg: "#fef3c7", text: "#b45309", border: "#fde68a", bar: "#f59e0b" },
};

const GOAL_ENCOURAGEMENTS: Record<string, string[]> = {
  "Learn a new language": ["10 minutes today keeps the streak alive.", "Consistency beats intensity every time.", "Your brain is rewiring itself every session."],
  "Read more books": ["Even 10 pages a day is 12 books a year.", "What are you reading next?", "The best investment you can make is in yourself."],
  "Improve public speaking": ["Every meeting is a practice opportunity.", "Confidence comes from repetition.", "You're better than you were last month."],
  "Clean up finances": ["Small decisions compound over time.", "Financial clarity creates mental clarity.", "You're building future freedom right now."],
  "Exercise more": ["Movement is medicine.", "Show up — even when you don't feel like it.", "The hardest part is starting."],
  "Drink less alcohol": ["Every clear morning is a win.", "Your future self will thank you.", "You're in control."],
  "Learn new words daily": ["Vocabulary is the currency of thought.", "One word a day, 365 words a year.", "Language shapes how you see the world."],
  "Meditate daily": ["Even 5 minutes changes your day.", "The pause is where the power is.", "Stillness is a skill."],
  "Write more": ["Ideas only become real when written down.", "Writing clarifies thinking.", "Your voice matters."],
  "Travel more": ["The world is larger than your routine.", "New places create new perspectives.", "Adventure is always worth it."],
};

function getEncouragement(title: string): string {
  const list = GOAL_ENCOURAGEMENTS[title];
  if (list) return list[Math.floor(Math.random() * list.length)];
  return "Keep going — every step counts.";
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function GoalCard({ goal, onCheckin, onPause }: { goal: Goal; onCheckin: (id: string) => void; onPause: (id: string) => void }) {
  const colors = CATEGORY_COLORS[goal.goal_type] || CATEGORY_COLORS.personal;
  const checkins = goal.goal_checkins?.length || 0;
  const streak = goal.streak_days || 0;
  const lastActive = goal.last_activity_at ? daysSince(goal.last_activity_at) : null;
  const encouragement = getEncouragement(goal.title);
  const progress = goal.target_value ? Math.min(Math.round(((goal.current_value || 0) / goal.target_value) * 100), 100) : null;

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
      overflow: "hidden", transition: "border-color 0.15s",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {goal.goal_type === "stop" ? "Stop doing" : goal.goal_type}
            </span>
            {streak > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "#fef3c7", padding: "2px 8px", borderRadius: 20, border: "1px solid #fde68a" }}>
                {streak} day streak
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{goal.title}</div>
        </div>
        <button onClick={() => onPause(goal.id)} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#9ca3af", cursor: "pointer" }}>
          Pause
        </button>
      </div>

      {/* Encouragement */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", background: "#f9fafb" }}>
        <p style={{ fontSize: 13, color: "#374151", margin: 0, fontStyle: "italic", lineHeight: 1.5 }}>
          "{encouragement}"
        </p>
      </div>

      {/* Stats */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{checkins}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Check-ins</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: streak > 0 ? "#f59e0b" : "#9ca3af" }}>{streak}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Day streak</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: lastActive === 0 ? "#22c55e" : lastActive && lastActive > 7 ? "#ef4444" : "#111" }}>
            {lastActive === null ? "—" : lastActive === 0 ? "Today" : `${lastActive}d ago`}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Last activity</div>
        </div>
        {goal.target_date && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>
              {Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Until target</div>
          </div>
        )}
      </div>

      {/* Progress bar if has target */}
      {progress !== null && (
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Progress toward goal</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>{progress}%</span>
          </div>
          <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: colors.bar, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {/* Check-in button */}
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {lastActive === 0 ? "Checked in today" : "Mark progress for today"}
        </span>
        <button
          onClick={() => onCheckin(goal.id)}
          disabled={lastActive === 0}
          style={{
            fontSize: 12, fontWeight: 700, padding: "8px 20px", borderRadius: 10,
            border: "none", cursor: lastActive === 0 ? "default" : "pointer",
            background: lastActive === 0 ? "#f3f4f6" : "#111",
            color: lastActive === 0 ? "#9ca3af" : "white",
            transition: "all 0.15s",
          }}>
          {lastActive === 0 ? "Done for today" : "Check in"}
        </button>
      </div>
    </div>
  );
}

function AddGoalModal({ onSave, onClose }: { onSave: (goal: any) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("personal");
  const [targetDate, setTargetDate] = useState("");

  const QUICK_GOALS = [
    "Learn a new language", "Read more books", "Exercise more",
    "Meditate daily", "Improve public speaking", "Write more",
    "Clean up finances", "Learn new words daily", "Travel more",
  ];

  return (
    <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>Add a goal</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Goal type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["personal", "Personal"], ["business", "Business"], ["stop", "Stop doing"]].map(([v, l]) => (
              <button key={v} onClick={() => setType(v)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${type === v ? "#111" : "#e5e7eb"}`, background: type === v ? "#bf5c38" : "#fff", color: type === v ? "white" : "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Goal</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you want to accomplish?"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box" as const }} />
        </div>

        {type === "personal" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Or pick one</label>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
              {QUICK_GOALS.map(g => (
                <button key={g} onClick={() => setTitle(g)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 20, border: `1px solid ${title === g ? "#111" : "#e5e7eb"}`, background: title === g ? "#bf5c38" : "#fff", color: title === g ? "white" : "#374151", cursor: "pointer" }}>{g}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Target date (optional)</label>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box" as const }} />
        </div>

        <button
          onClick={() => { if (title.trim()) { onSave({ title: title.trim(), goal_type: type, category: type, target_date: targetDate || null, status: "active" }); } }}
          disabled={!title.trim()}
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: title.trim() ? "#bf5c38" : "#e5e7eb", color: title.trim() ? "white" : "#9ca3af", fontSize: 14, fontWeight: 700, cursor: title.trim() ? "pointer" : "default" }}>
          Add goal
        </button>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "personal" | "business" | "stop">("all");

  useEffect(() => {
    fetch("/api/goals")
      .then(r => { if (r.status === 401) { router.push("/connect"); return null; } return r.json(); })
      .then(data => { if (data) { setGoals(data.goals || []); setLoading(false); } })
      .catch(() => setLoading(false));
  }, []);

  const handleCheckin = async (goalId: string) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const newStreak = (goal.streak_days || 0) + 1;
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkin: { goal_id: goalId, note: "Daily check-in", streak_days: newStreak } }),
    });
    setGoals(gs => gs.map(g => g.id === goalId ? { ...g, streak_days: newStreak, last_activity_at: new Date().toISOString(), goal_checkins: [...(g.goal_checkins || []), {}] } : g));
  };

  const handlePause = async (goalId: string) => {
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goalId }),
    });
    setGoals(gs => gs.filter(g => g.id !== goalId));
  };

  const handleAdd = async (goal: any) => {
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
    });
    const data = await res.json();
    setGoals(gs => [...gs, { ...goal, id: data.id || Date.now().toString(), goal_checkins: [], streak_days: 0 }]);
    setShowAdd(false);
  };

  const filtered = goals.filter(g => filter === "all" || g.goal_type === filter);
  const personal = goals.filter(g => g.goal_type === "personal");
  const business = goals.filter(g => g.goal_type === "business");
  const stop = goals.filter(g => g.goal_type === "stop");
  const totalCheckins = goals.reduce((sum, g) => sum + (g.goal_checkins?.length || 0), 0);
  const longestStreak = Math.max(0, ...goals.map(g => g.streak_days || 0));

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#9ca3af" }}>
          <p>Loading your goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

 {/* Nav */}
<div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 32px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky" as const, top: 0, zIndex: 100 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => router.push("/dashboard")}>
    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#bf5c38", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white", fontFamily: "'Lora', serif" }}>hh</div>
    <span style={{ fontSize: 15, fontWeight: 700, color: "#241a0f" }}>Humble <span style={{ color: "#bf5c38" }}>Hello</span></span>
  </div>
  <div style={{ display: "flex", gap: 12 }}>
    <button onClick={() => router.push("/dashboard")} style={{ fontSize: 13, fontWeight: 600, color: "#374151", background: "none", border: "1px solid #e5e7eb", borderRadius: 20, padding: "8px 18px", cursor: "pointer" }}>
      Dashboard
    </button>
    <button onClick={() => setShowAdd(true)} style={{ fontSize: 13, fontWeight: 700, color: "white", background: "#bf5c38", border: "none", borderRadius: 20, padding: "8px 20px", cursor: "pointer" }}>
      Add goal
    </button>
  </div>
</div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Your goals</h1>
          <p style={{ fontSize: 14, color: "#9ca3af", margin: 0 }}>Humble Hello tracks your progress and connects your daily activity to what matters most.</p>
        </div>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 32 }}>
          {[
            { label: "Active goals", value: goals.length, color: "#111" },
            { label: "Total check-ins", value: totalCheckins, color: "#3b82f6" },
            { label: "Longest streak", value: `${longestStreak}d`, color: "#f59e0b" },
            { label: "This week", value: goals.filter(g => daysSince(g.last_activity_at) <= 7).length, color: "#22c55e" },
          ].map((stat, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {([["all", `All (${goals.length})`], ["personal", `Personal (${personal.length})`], ["business", `Business (${business.length})`], ["stop", `Stop doing (${stop.length})`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              fontSize: 12, fontWeight: 600, padding: "7px 16px", borderRadius: 20, cursor: "pointer",
              border: `1px solid ${filter === val ? "#111" : "#e5e7eb"}`,
            background: filter === val ? "#bf5c38" : "#fff",
color: filter === val ? "white" : "#374151",
            }}>{label}</button>
          ))}
        </div>

        {/* Goals grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>No goals yet</p>
            <p style={{ fontSize: 13 }}>Add your first goal to get started</p>
            <button onClick={() => setShowAdd(true)} style={{ marginTop: 16, fontSize: 13, fontWeight: 700, padding: "10px 24px", borderRadius: 10, border: "none", background: "#111", color: "#C8F04B", cursor: "pointer" }}>Add a goal</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 16 }}>
            {filtered.map(goal => (
              <GoalCard key={goal.id} goal={goal} onCheckin={handleCheckin} onPause={handlePause} />
            ))}
          </div>
        )}

        {/* Daily encouragement section */}
        {goals.length > 0 && (
          <div style={{ marginTop: 40, background: "#111", borderRadius: 16, padding: "24px 28px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(242,213,200,0.8)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 }}>Humble Hello says</div>
            <p style={{ fontSize: 15, color: "#fff", lineHeight: 1.7, margin: "0 0 16px" }}>
              You have {goals.length} active goals. {longestStreak > 0 ? `Your longest streak is ${longestStreak} days — ` : ""}
              {totalCheckins > 0 ? `You've checked in ${totalCheckins} times total. ` : ""}
              {goals.filter(g => daysSince(g.last_activity_at) > 7).length > 0
                ? `${goals.filter(g => daysSince(g.last_activity_at) > 7).length} goal${goals.filter(g => daysSince(g.last_activity_at) > 7).length > 1 ? "s haven't" : " hasn't"} had activity in over a week — worth a look.`
                : "You're actively working on all your goals. Keep going."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push("/dashboard")} style={{ fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 8, border: "none", background: "#bf5c38", color: "white", cursor: "pointer" }}>Back to brief</button>
              <button onClick={() => setShowAdd(true)} style={{ fontSize: 12, fontWeight: 600, padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", cursor: "pointer" }}>Add a goal</button>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddGoalModal onSave={handleAdd} onClose={() => setShowAdd(false)} />}
    </div>
  );
}