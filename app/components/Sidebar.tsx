"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { C, font } from "@/app/lib/theme";
import { useIsMobile } from "@/app/lib/useMediaQuery";

// ── SVG Icons (monochrome, Supabase-style) ────────────────────────────────────
const Icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  contacts: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  audience: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10,8 16,12 10,16 10,8" />
    </svg>
  ),
  campaigns: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
    </svg>
  ),
  profile: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,18 15,12 9,6" />
    </svg>
  ),
  chevronLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15,18 9,12 15,6" />
    </svg>
  ),
  hamburger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { id: "home",      path: "/dashboard",  icon: Icons.home,      label: "Home" },
  { id: "contacts",  path: "/contacts",   icon: Icons.contacts,  label: "Contacts" },
  { id: "audience",  path: "/audience",   icon: Icons.audience,  label: "Audience" },
  { id: "campaigns", path: "/campaigns",  icon: Icons.campaigns, label: "Campaigns" },
  { id: "pricing",   path: "/pricing",    icon: Icons.campaigns, label: "Pricing" }
];

const JOURNAL_ITEM = {
  id: "journal",
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  label: "Start today's conversation",
};

type SidebarProps = {
  activeId?: string;
  onNavClick?: (id: string) => void;
};

export default function Sidebar({ activeId, onNavClick }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userInitials, setUserInitials] = useState("?");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [planInfo, setPlanInfo] = useState<{ plan: string; trial_ends_at: string | null } | null>(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    fetch("/api/plan")
      .then(r => r.json())
      .then(d => setPlanInfo(d))
      .catch(() => {});
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Body scroll lock when mobile drawer is open
  useEffect(() => {
    if (isMobile && mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isMobile, mobileOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Hide mobile header when scrolling down, show when scrolling up (iOS pattern).
  // Only active on mobile; desktop sidebar ignores this entirely.
  useEffect(() => {
    if (!isMobile) return;
    // Always show when drawer is open (user is interacting with menu)
    if (mobileOpen) {
      setHeaderHidden(false);
      return;
    }
    const THRESHOLD = 8; // minimum px delta to trigger direction change
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      // Always show near the top (first 60px)
      if (y < 60) {
        setHeaderHidden(false);
      } else if (delta > THRESHOLD) {
        setHeaderHidden(true);  // scrolling down
      } else if (delta < -THRESHOLD) {
        setHeaderHidden(false); // scrolling up
      }
      lastScrollY.current = y;
    };
    lastScrollY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile, mobileOpen]);

  const trialDaysLeft = planInfo?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(planInfo.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  const planLabel = planInfo?.plan === "trial" ? `Trial · ${trialDaysLeft}d left`
    : planInfo?.plan === "pro" ? "Hello Pro"
    : planInfo?.plan === "growth" ? "Hello Growth"
    : "Free";

  const planColor = planInfo?.plan === "growth" ? "#8b5cf6"
    : planInfo?.plan === "pro" ? "#6b9970"
    : planInfo?.plan === "trial" ? "#bf5c38"
    : "#64748b";

  const currentActive = activeId || NAV_ITEMS.find(n => pathname?.startsWith(n.path))?.id || "home";

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (data?.name) {
          setUserName(data.name);
          setUserInitials(data.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase());
        }
      })
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/connect";
  };

  const handleNav = (item: typeof NAV_ITEMS[0]) => {
    if (onNavClick) onNavClick(item.id);
    setMobileOpen(false);
    router.push(item.path);
  };

  // On mobile, sidebar is either the overlay drawer (open) or completely hidden.
  // The expanded desktop width is always used when visible on mobile (no collapsed rail).
  const W = isMobile ? 260 : (collapsed ? 56 : 200);
  const showLabels = isMobile ? true : !collapsed;

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE: render a fixed top header + off-canvas drawer overlay
  // ─────────────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <style>{`
          .hh-mobile-header { transition: box-shadow 0.15s; }
          .hh-drawer { transform: translateX(${mobileOpen ? "0" : "-100%"}); transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); }
          .hh-backdrop { opacity: ${mobileOpen ? 1 : 0}; pointer-events: ${mobileOpen ? "auto" : "none"}; transition: opacity 0.2s; }
          .hh-nav-btn:active { background: rgba(255,255,255,0.12) !important; }
        `}</style>

       {/* Spacer — takes 52px in the flow so content starts below the fixed header */}
        <div style={{ height: 52, flexShrink: 0 }} aria-hidden />

        {/* Fixed mobile top header — hides on scroll down, reappears on scroll up */}
        <header
          className="hh-mobile-header"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 52,
            background: C.sidebar,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            zIndex: 90,
            boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
            transform: headerHidden ? "translateY(-100%)" : "translateY(0)",
            transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
            willChange: "transform",
          }}
        >
        {/* Spacer so page content starts below the fixed header */}
        <div aria-hidden style={{ position: "fixed", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none" }} />
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {Icons.hamburger}
          </button>

          <div
            onClick={() => router.push("/dashboard")}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 2 }}>
              <img src="/icon.svg" alt="hh" style={{ width: 24, height: 24 }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "white", fontFamily: "'ITCSouvenir', serif", letterSpacing: "-0.3px" }}>
              humble hello.
            </span>
          </div>

          {/* Right spacer — matches hamburger width so logo stays centered */}
          <div style={{ width: 40 }} />
        </header>

        {/* Backdrop */}
        <div
          className="hh-backdrop"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 998,
          }}
          aria-hidden
        />

        {/* Drawer */}
        <nav
          className="hh-drawer"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: 260,
            maxWidth: "85vw",
            height: "100dvh",
            background: C.sidebar,
            display: "flex",
            flexDirection: "column",
            padding: "14px 0",
            zIndex: 999,
            boxShadow: mobileOpen ? "4px 0 24px rgba(0,0,0,0.2)" : "none",
            overflowY: "auto",
          }}
          aria-hidden={!mobileOpen}
        >
          {/* Drawer header: logo + close */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", marginBottom: 20 }}>
            <div
              onClick={() => { setMobileOpen(false); router.push("/dashboard"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "white", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 2 }}>
                <img src="/icon.svg" alt="hh" style={{ width: 30, height: 30 }} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "white", fontFamily: "'ITCSouvenir', serif", letterSpacing: "-0.3px" }}>
                humble hello.
              </span>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{
                width: 32, height: 32, borderRadius: 7, border: "none",
                background: "transparent", color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {Icons.close}
            </button>
          </div>

          {/* Nav items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px", flex: 1 }}>
            {NAV_ITEMS.map(item => {
              const isActive = currentActive === item.id;
              return (
                <button
                  key={item.id}
                  className="hh-nav-btn"
                  onClick={() => handleNav(item)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                    color: isActive ? C.terra : C.sidebarText,
                    cursor: "pointer",
                    fontFamily: font,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    textAlign: "left",
                  }}
                >
                  <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: C.terra }} />}
                </button>
              );
            })}
          </div>

          {/* Journal trigger */}
          <div style={{ padding: "0 8px", marginBottom: 8 }}>
            <button
              className="hh-nav-btn"
              onClick={() => { setMobileOpen(false); window.dispatchEvent(new CustomEvent("open-journal")); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                borderRadius: 8, border: "none",
                background: "rgba(112,72,232,0.15)",
                color: "#a78bfa",
                cursor: "pointer", fontFamily: font,
                fontSize: 14, fontWeight: 600, textAlign: "left",
              }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{JOURNAL_ITEM.icon}</span>
              <span>Today's Journal</span>
            </button>
          </div>

          {/* Bottom section */}
          <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 2, borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10, marginTop: 8 }}>
            <button
              className="hh-nav-btn"
              onClick={() => { setMobileOpen(false); router.push("/profile"); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                borderRadius: 8, border: "none", background: "transparent",
                color: C.sidebarText, cursor: "pointer", fontFamily: font,
                fontSize: 14, fontWeight: 400, textAlign: "left",
              }}
            >
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.terra, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white", flexShrink: 0 }}>
                {userInitials}
              </div>
              <span>{userName || "Profile"}</span>
            </button>

            {planInfo && (
              <button
                onClick={() => { setMobileOpen(false); router.push("/pricing"); }}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderRadius: 8, border: `1px solid ${planColor}33`, background: `${planColor}18`, cursor: "pointer", fontFamily: font, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: planColor }}>{planLabel}</span>
                {(planInfo.plan === "free" || planInfo.plan === "trial") && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: planColor, background: `${planColor}33`, padding: "1px 6px", borderRadius: 10 }}>UPGRADE</span>
                )}
              </button>
            )}

            <button
              className="hh-nav-btn"
              onClick={() => { setMobileOpen(false); router.push("/settings"); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                borderRadius: 8, border: "none", background: "transparent",
                color: C.sidebarText, cursor: "pointer", fontFamily: font,
                fontSize: 14, textAlign: "left",
              }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{Icons.settings}</span>
              <span>Settings</span>
            </button>

            <button
              className="hh-nav-btn"
              onClick={handleSignOut}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                borderRadius: 8, border: "none", background: "transparent",
                color: C.sidebarText, cursor: "pointer", fontFamily: font,
                fontSize: 14, textAlign: "left",
              }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{Icons.logout}</span>
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DESKTOP: original sticky sidebar, unchanged visuals
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .hh-sidebar { transition: width 0.22s cubic-bezier(0.4,0,0.2,1); overflow: hidden; }
        .hh-nav-label { transition: opacity 0.15s, width 0.22s; white-space: nowrap; }
        .hh-nav-btn:hover { background: rgba(255,255,255,0.07) !important; }
        .hh-collapse-btn:hover { background: rgba(255,255,255,0.1) !important; }
        .hh-tooltip {
          position: absolute;
          left: 52px;
          background: #1c2b3a;
          color: white;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
      `}</style>

      <nav
        className="hh-sidebar"
        style={{
          width: W,
          minWidth: W,
          background: C.sidebar,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          padding: "14px 0",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          zIndex: 100,
        }}
      >
        {/* Logo + collapse button row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: collapsed ? "0 8px" : "0 14px", marginBottom: 20, flexDirection: collapsed ? "column" as const : "row" as const, gap: collapsed ? 8 : 0 }}>
          <div
            onClick={() => router.push("/dashboard")}
            style={{ width: 34, height: 34, borderRadius: 9, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, overflow: "hidden", padding: 2 }}
          >
            <img src="/icon.svg" alt="hh" style={{ width: 30, height: 30 }} />
          </div>
          {!collapsed && (
            <span style={{ fontSize: 16, fontWeight: 700, color: "white", marginLeft: 10, flex: 1, fontFamily: "'ITCSouvenir', serif", letterSpacing: "-0.3px", whiteSpace: "nowrap" as const }}>
              humble hello.
            </span>
          )}
          <button
            className="hh-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: 24, height: 24, borderRadius: 6, border: "none",
              background: "transparent", color: C.sidebarText,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0, marginLeft: collapsed ? 0 : 4,
            }}
          >
            {collapsed ? Icons.chevronRight : Icons.chevronLeft}
          </button>
        </div>

        {/* Nav items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px", flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const isActive = currentActive === item.id;
            return (
              <div key={item.id} style={{ position: "relative" }}>
                <button
                  className="hh-nav-btn"
                  onClick={() => handleNav(item)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: collapsed ? "9px 9px" : "9px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                    color: isActive ? C.terra : C.sidebarText,
                    cursor: "pointer",
                    fontFamily: font,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    transition: "background 0.12s, color 0.12s",
                    textAlign: "left",
                  }}
                >
                  <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                  {!collapsed && (
                    <span className="hh-nav-label" style={{ opacity: collapsed ? 0 : 1 }}>
                      {item.label}
                    </span>
                  )}
                  {isActive && !collapsed && (
                    <span style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: "50%", background: C.terra, flexShrink: 0 }} />
                  )}
                </button>
                {collapsed && hoveredId === item.id && (
                  <div className="hh-tooltip" style={{ top: "50%", transform: "translateY(-50%)" }}>
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Journal trigger */}
        <div style={{ padding: "0 8px", marginBottom: 8 }}>
          <button
            className="hh-nav-btn"
            onClick={() => window.dispatchEvent(new CustomEvent("open-journal"))}
            onMouseEnter={() => setHoveredId("journal")}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: collapsed ? "9px 9px" : "9px 12px",
              borderRadius: 8, border: "none",
              background: "rgba(112,72,232,0.15)",
              color: "#a78bfa",
              cursor: "pointer", fontFamily: font,
              fontSize: 13, fontWeight: 600, textAlign: "left",
              transition: "background 0.12s",
            }}
          >
            <span style={{ flexShrink: 0, display: "flex" }}>{JOURNAL_ITEM.icon}</span>
            {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Today's Journal</span>}
          </button>
          {collapsed && hoveredId === "journal" && (
            <div className="hh-tooltip" style={{ top: "50%", transform: "translateY(-50%)" }}>Today's Journal</div>
          )}
        </div>

        {/* Bottom section — profile + settings + logout */}
        <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 2, borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10, marginTop: 8 }}>
          <button
            className="hh-nav-btn"
            onClick={() => router.push("/profile")}
            onMouseEnter={() => setHoveredId("profile")}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: collapsed ? "9px 9px" : "9px 12px",
              borderRadius: 8, border: "none", background: "transparent",
              color: C.sidebarText, cursor: "pointer", fontFamily: font,
              fontSize: 13, fontWeight: 400, textAlign: "left",
              transition: "background 0.12s",
            }}
          >
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.terra, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white", flexShrink: 0 }}>
              {userInitials}
            </div>
            {!collapsed && (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {userName || "Profile"}
              </span>
            )}
          </button>
          {collapsed && hoveredId === "profile" && (
            <div className="hh-tooltip" style={{ bottom: 52, top: "auto" }}>{userName || "Profile"}</div>
          )}

          {!collapsed && planInfo && (
            <button
              onClick={() => router.push("/pricing")}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderRadius: 8, border: `1px solid ${planColor}33`, background: `${planColor}18`, cursor: "pointer", fontFamily: font, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: planColor }}>{planLabel}</span>
              {(planInfo.plan === "free" || planInfo.plan === "trial") && (
                <span style={{ fontSize: 9, fontWeight: 700, color: planColor, background: `${planColor}33`, padding: "1px 6px", borderRadius: 10 }}>UPGRADE</span>
              )}
            </button>
          )}

          <div style={{ position: "relative" }}>
            <button
              className="hh-nav-btn"
              onClick={() => router.push("/settings")}
              onMouseEnter={() => setHoveredId("settings")}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: collapsed ? "9px 9px" : "9px 12px",
                borderRadius: 8, border: "none", background: "transparent",
                color: C.sidebarText, cursor: "pointer", fontFamily: font,
                fontSize: 13, textAlign: "left", transition: "background 0.12s",
              }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{Icons.settings}</span>
              {!collapsed && <span>Settings</span>}
            </button>
            {collapsed && hoveredId === "settings" && (
              <div className="hh-tooltip" style={{ top: "50%", transform: "translateY(-50%)" }}>Settings</div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              className="hh-nav-btn"
              onClick={handleSignOut}
              onMouseEnter={() => setHoveredId("logout")}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: collapsed ? "9px 9px" : "9px 12px",
                borderRadius: 8, border: "none", background: "transparent",
                color: C.sidebarText, cursor: "pointer", fontFamily: font,
                fontSize: 13, textAlign: "left", transition: "background 0.12s",
              }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{Icons.logout}</span>
              {!collapsed && <span>Sign out</span>}
            </button>
            {collapsed && hoveredId === "logout" && (
              <div className="hh-tooltip" style={{ top: "50%", transform: "translateY(-50%)" }}>Sign out</div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}