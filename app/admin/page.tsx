"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C, font } from "@/app/lib/theme";
import Sidebar from "@/app/components/Sidebar";

const ADMIN_USER_ID = "c82b7211-354f-4bfe-b44f-c03f4b3f50c3";

type Stats = {
  network_contacts: number;
  total_contributions: number;
  opted_in_users: number;
  suppression_pending: number;
};

type NetworkContact = {
  id: string;
  full_name: string;
  company: string;
  job_title: string;
  emails: any[];
  phones: any[];
  home_address: any;
  work_address: any;
  confidence_score: number;
  contributor_count: number;
  suppressed: boolean;
  created_at: string;
};

type Contributor = {
  id: string;
  name: string;
  email: string;
  network_opt_in: boolean;
  network_opt_in_at: string;
  contribution_count: number;
};

type SuppressionRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  reason: string;
  requested_at: string;
  processed: boolean;
};

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "contacts" | "contributors" | "suppression">("overview");
  const [stats, setStats] = useState<Stats>({ network_contacts: 0, total_contributions: 0, opted_in_users: 0, suppression_pending: 0 });
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [suppressionRequests, setSuppressionRequests] = useState<SuppressionRequest[]>([]);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (data?.id !== ADMIN_USER_ID) {
      router.push("/dashboard");
      return;
    }
    setAuthorized(true);
    loadAll();
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statsRes, contactsRes, contributorsRes, suppressionRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/network-contacts"),
        fetch("/api/admin/contributors"),
        fetch("/api/admin/suppression"),
      ]);
      const [statsData, contactsData, contributorsData, suppressionData] = await Promise.all([
        statsRes.json(), contactsRes.json(), contributorsRes.json(), suppressionRes.json(),
      ]);
      setStats(statsData);
      setContacts(contactsData.contacts || []);
      setContributors(contributorsData.contributors || []);
      setSuppressionRequests(suppressionData.requests || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    const res = await fetch("/api/admin/network-contacts?export=true");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `humble-hello-network-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    setExporting(false);
  };

  const handleProcessSuppression = async (id: string) => {
    await fetch("/api/admin/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "process" }),
    });
    setSuppressionRequests(prev => prev.map(r => r.id === id ? { ...r, processed: true } : r));
  };

  const handleRemoveFromNetwork = async (id: string) => {
    if (!confirm("Remove this contact from the network? This cannot be undone.")) return;
    await fetch("/api/admin/network-contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setContacts(prev => prev.filter(c => c.id !== id));
    setStats(s => ({ ...s, network_contacts: s.network_contacts - 1 }));
  };

  const filteredContacts = contacts.filter(c =>
    !search ||
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase()) ||
    c.emails?.some((e: any) => e.email?.toLowerCase().includes(search.toLowerCase()))
  );

  if (!authorized) return null;

  const tabStyle = (t: string) => ({
    padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: font,
    fontSize: 13, fontWeight: 600,
    background: activeTab === t ? C.text : C.bg2,
    color: activeTab === t ? "#fff" : C.text3,
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, color: C.text, display: "flex" }}>
      <Sidebar activeId="home" />
      <main style={{ flex: 1, padding: "24px 32px", overflowY: "auto" as const }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Admin</div>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Humble Hello Network — internal dashboard</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleExportCSV} disabled={exporting}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
              <button onClick={loadAll}
                style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {[
              { id: "overview", label: "Overview" },
              { id: "contacts", label: `Network Contacts (${stats.network_contacts})` },
              { id: "contributors", label: `Contributors (${stats.opted_in_users})` },
              { id: "suppression", label: `Suppression (${stats.suppression_pending})` },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={tabStyle(t.id)}>{t.label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: C.text3 }}>Loading...</div>
          ) : (
            <>
              {/* Overview */}
              {activeTab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                      { label: "Network Contacts", value: stats.network_contacts.toLocaleString(), color: C.blue },
                      { label: "Total Contributions", value: stats.total_contributions.toLocaleString(), color: C.green },
                      { label: "Opted-In Users", value: stats.opted_in_users.toLocaleString(), color: C.purple },
                      { label: "Suppression Pending", value: stats.suppression_pending.toLocaleString(), color: stats.suppression_pending > 0 ? C.red : C.text3 },
                    ].map(stat => (
                      <div key={stat.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 32, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                        <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Network Health</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.text3, marginBottom: 4 }}>Avg confidence score</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.green }}>
                          {contacts.length > 0 ? Math.round(contacts.reduce((a, c) => a + (c.confidence_score || 0), 0) / contacts.length) : 0}%
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: C.text3, marginBottom: 4 }}>Multi-contributor contacts</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.purple }}>
                          {contacts.filter(c => (c.contributor_count || 0) > 1).length.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: C.text3, marginBottom: 4 }}>Contacts with address</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.blue }}>
                          {contacts.filter(c => c.home_address || c.work_address).length.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: C.text3, marginBottom: 4 }}>Suppressed contacts</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.red }}>
                          {contacts.filter(c => c.suppressed).length.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Network Contacts */}
              {activeTab === "contacts" && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name, company, or email..."
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, fontSize: 13, fontFamily: font, outline: "none", boxSizing: "border-box" as const }} />
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>{filteredContacts.length.toLocaleString()} contacts</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredContacts.slice(0, 50).map(c => (
                      <div key={c.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{c.full_name}</div>
                            {c.suppressed && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.redLight, color: C.red, fontWeight: 700 }}>Suppressed</span>}
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.bg3, color: C.text3 }}>
                              {c.contributor_count} contributor{c.contributor_count !== 1 ? "s" : ""}
                            </span>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: C.greenLight, color: C.green, fontWeight: 700 }}>
                              {c.confidence_score}% confidence
                            </span>
                          </div>
                          {(c.job_title || c.company) && (
                            <div style={{ fontSize: 12, color: C.text3, marginBottom: 6 }}>
                              {c.job_title && c.company ? `${c.job_title} · ${c.company}` : c.job_title || c.company}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                            {c.emails?.slice(0, 2).map((e: any, i: number) => (
                              <span key={i} style={{ fontSize: 11, color: C.blue }}>@ {e.email}</span>
                            ))}
                            {c.phones?.slice(0, 1).map((p: any, i: number) => (
                              <span key={i} style={{ fontSize: 11, color: C.text3 }}>📱 {p.number}</span>
                            ))}
                            {c.home_address && (
                              <span style={{ fontSize: 11, color: C.text3 }}>
                                ⌂ {c.home_address.city}, {c.home_address.region}
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => handleRemoveFromNetwork(c.id)}
                          style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font, flexShrink: 0 }}>
                          Remove
                        </button>
                      </div>
                    ))}
                    {filteredContacts.length > 50 && (
                      <div style={{ textAlign: "center", padding: 16, color: C.text3, fontSize: 12 }}>
                        Showing 50 of {filteredContacts.length} — use search to narrow results
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Contributors */}
              {activeTab === "contributors" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {contributors.map(c => (
                    <div key={c.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{c.email}</div>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{c.contribution_count.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: C.text3 }}>contacts contributed</div>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: 11, color: C.text4 }}>Opted in</div>
                        <div style={{ fontSize: 11, color: C.text3 }}>{new Date(c.network_opt_in_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                  {contributors.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: C.text3, fontSize: 13 }}>No opted-in contributors yet</div>
                  )}
                </div>
              )}

              {/* Suppression */}
              {activeTab === "suppression" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {suppressionRequests.map(r => (
                    <div key={r.id} style={{ background: C.bg2, border: `1px solid ${r.processed ? C.border : C.amber}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16, opacity: r.processed ? 0.6 : 1 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{r.full_name || "Unknown"}</div>
                        <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
                          {r.email && `@ ${r.email}`} {r.phone && `· ${r.phone}`}
                        </div>
                        <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>
                          {r.reason} · {new Date(r.requested_at).toLocaleDateString()}
                        </div>
                      </div>
                      {r.processed ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>✓ Processed</span>
                      ) : (
                        <button onClick={() => handleProcessSuppression(r.id)}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: C.amber, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                          Process
                        </button>
                      )}
                    </div>
                  ))}
                  {suppressionRequests.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: C.text3, fontSize: 13 }}>No suppression requests</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}