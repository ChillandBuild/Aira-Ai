"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import {
  Phone, Star, UserPlus, X, Pencil, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, TrendingUp,
  Users, Coffee,
} from "lucide-react";
import { api, Caller, Lead, API_URL, getAuthHeaders } from "@/lib/api";
import { formatPhone } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  idle: "bg-amber-100 text-amber-700",
  inactive: "bg-surface-mid text-on-surface-muted",
};

export default function AdminView() {
  // callers
  const [callers, setCallers] = useState<Caller[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // round-robin
  const [roundRobinEnabled, setRoundRobinEnabled] = useState<boolean | null>(null);
  const [togglingRR, setTogglingRR] = useState(false);

  // dashboard stats
  const [statusSummaries, setStatusSummaries] = useState<Record<string, { active_minutes_today: number; idle_minutes_today: number; current_status: string }>>({});
  const [unattendedLeads, setUnattendedLeads] = useState<Lead[]>([]);
  const [totalCallsToday, setTotalCallsToday] = useState(0);
  const [totalConversionsToday, setTotalConversionsToday] = useState(0);

  // manual dial
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);
  const [selectedCallerId, setSelectedCallerId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const rows = await api.callers.list();
      setCallers(rows);

      // Round-robin setting
      const auth = await getAuthHeaders();
      const rrRes = await fetch(`${API_URL}/api/v1/callers/round-robin`, { headers: auth });
      const rrData = await rrRes.json();
      setRoundRobinEnabled(rrData.enabled ?? true);

      // Status summaries for each caller
      const summaries: Record<string, { active_minutes_today: number; idle_minutes_today: number; current_status: string }> = {};
      for (const caller of rows) {
        try {
          const s = await api.callers.statusSummary(caller.id);
          summaries[caller.id] = s;
        } catch {
          summaries[caller.id] = { active_minutes_today: 0, idle_minutes_today: 0, current_status: caller.status || "active" };
        }
      }
      setStatusSummaries(summaries);

      // Unattended hot leads (assigned but score >= 7)
      const hotLeads = await api.leads.list({ segment: "A", limit: 50 });
      const unattended = hotLeads.filter((l: Lead) => l.assigned_to && l.score >= 7);
      setUnattendedLeads(unattended);

      // Aggregate stats (simple counts from callers' logs)
      let calls = 0;
      let conversions = 0;
      for (const caller of rows) {
        try {
          const logs = await api.callers.logs(caller.id);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayLogs = logs.filter((l) => new Date(l.created_at) >= today);
          calls += todayLogs.length;
          conversions += todayLogs.filter((l) => l.outcome === "converted").length;
        } catch { /* skip */ }
      }
      setTotalCallsToday(calls);
      setTotalConversionsToday(conversions);
    } catch (err) {
      console.error("AdminView load error:", err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── caller CRUD ──

  async function addCaller() {
    if (!newName.trim() || !newPhone.trim()) return;
    setAdding(true);
    try {
      await api.callers.create(newName.trim(), newPhone.trim());
      const rows = await api.callers.list();
      setCallers(rows);
      setNewName(""); setNewPhone(""); setShowAddForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add caller");
    } finally { setAdding(false); }
  }

  function startEdit(caller: Caller, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(caller.id);
    setEditName(caller.name);
    setEditPhone(caller.phone ?? "");
  }

  async function saveCaller(id: string) {
    setSaving(true);
    try {
      await api.callers.update(id, { name: editName.trim(), phone: editPhone.trim() });
      const rows = await api.callers.list();
      setCallers(rows);
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally { setSaving(false); }
  }

  async function deleteCaller(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this caller?")) return;
    try {
      await api.callers.remove(id);
      const rows = await api.callers.list();
      setCallers(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function toggleRoundRobin() {
    if (roundRobinEnabled === null) return;
    setTogglingRR(true);
    try {
      const auth = await getAuthHeaders();
      await fetch(`${API_URL}/api/v1/callers/round-robin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ enabled: !roundRobinEnabled }),
      });
      setRoundRobinEnabled(!roundRobinEnabled);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally { setTogglingRR(false); }
  }

  async function manualDial() {
    if (!selectedCallerId || !manualPhone.trim()) return;
    setManualDialing(true);
    try {
      await api.calls.initiate({ phone: manualPhone.trim() }, selectedCallerId);
      setManualPhone("");
      toast.success("Call initiated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  function formatMinutes(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const activeCallers = callers.filter((c) => (statusSummaries[c.id]?.current_status || c.status || "active") === "active");
  const idleCallers = callers.filter((c) => (statusSummaries[c.id]?.current_status || c.status || "active") === "idle");

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Telecalling</h1>
          <p className="font-body text-on-surface-muted mt-1">Team management & performance</p>
        </div>
        {roundRobinEnabled !== null && (
          <button
            onClick={toggleRoundRobin}
            disabled={togglingRR}
            title={roundRobinEnabled ? "Auto-assign ON — click to turn off" : "Auto-assign OFF — click to turn on"}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-label text-sm font-semibold transition-all border ${
              roundRobinEnabled
                ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
            } ${togglingRR ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {roundRobinEnabled ? <ToggleRight size={18} className="text-teal-600" /> : <ToggleLeft size={18} className="text-gray-400" />}
            Auto-assign {roundRobinEnabled ? <span className="text-teal-600">ON</span> : <span className="text-gray-400">OFF</span>}
          </button>
        )}
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center gap-2 mb-2"><div className="p-2 rounded-xl bg-primary/10"><Phone size={16} className="text-primary" /></div></div>
          <span className="font-display text-3xl font-bold text-on-surface">{totalCallsToday}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">Total Calls Today</span>
        </div>
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center gap-2 mb-2"><div className="p-2 rounded-xl bg-green-100"><TrendingUp size={16} className="text-green-600" /></div></div>
          <span className="font-display text-3xl font-bold text-on-surface">{totalConversionsToday}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">Conversions Today</span>
        </div>
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center gap-2 mb-2"><div className="p-2 rounded-xl bg-green-100"><Users size={16} className="text-green-600" /></div></div>
          <span className="font-display text-3xl font-bold text-green-600">{activeCallers.length}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">Active Callers</span>
        </div>
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center gap-2 mb-2"><div className="p-2 rounded-xl bg-amber-100"><Coffee size={16} className="text-amber-600" /></div></div>
          <span className="font-display text-3xl font-bold text-amber-600">{idleCallers.length}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">On Break</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Caller Roster */}
        <div className="col-span-2 bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-bold text-tertiary">Caller Roster</h2>
            <button onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors">
              {showAddForm ? <X size={13} /> : <UserPlus size={13} />}
              {showAddForm ? "Cancel" : "Add Caller"}
            </button>
          </div>

          {showAddForm && (
            <div className="mb-6 p-4 bg-surface-low rounded-xl space-y-3">
              <input type="text" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
              <input type="tel" placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
              <button onClick={addCaller} disabled={adding || !newName.trim() || !newPhone.trim()}
                className="w-full py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">
                {adding ? "Adding…" : "Add Caller"}
              </button>
            </div>
          )}

          {callers.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted">No callers yet.</p>
          ) : (
            <div className="space-y-3">
              {callers.map((caller) => {
                const isEditing = editingId === caller.id;
                const summary = statusSummaries[caller.id];
                const currentStatus = summary?.current_status || caller.status || "active";
                return (
                  <div key={caller.id} className={`p-4 rounded-xl transition-all ${isEditing ? "bg-surface-low ring-2 ring-tertiary" : "bg-surface-low hover:bg-surface-mid"}`}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
                        <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
                        <div className="flex gap-2">
                          <button onClick={() => saveCaller(caller.id)} disabled={saving}
                            className="flex-1 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">{saving ? "Saving…" : "Save"}</button>
                          <button onClick={() => setEditingId(null)}
                            className="flex-1 py-1.5 bg-surface border border-surface-mid rounded-lg font-label text-xs font-semibold hover:bg-surface-mid transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-tertiary-bg flex items-center justify-center shrink-0">
                          <span className="font-display text-sm font-bold text-tertiary">{caller.name.split(" ").map((n) => n[0]).join("")}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm font-semibold text-on-surface">{caller.name}</p>
                          <p className="font-label text-xs text-on-surface-muted">{caller.phone ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star size={13} className="text-secondary fill-secondary" />
                          <span className="font-label text-sm font-semibold text-on-surface">{Number(caller.overall_score ?? 0).toFixed(1)}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full font-label text-xs font-semibold ${STATUS_COLORS[currentStatus] || STATUS_COLORS.active}`}>
                          {currentStatus === "active" ? "🟢 Active" : "🟡 Idle"}
                        </span>
                        {summary && (
                          <span className="font-label text-[10px] text-on-surface-muted whitespace-nowrap">
                            {formatMinutes(summary.active_minutes_today)} active
                          </span>
                        )}
                        <div className="flex items-center gap-1 ml-1">
                          <button onClick={(e) => startEdit(caller, e)} className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted hover:text-on-surface" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={(e) => deleteCaller(caller.id, e)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-on-surface-muted hover:text-red-500" title="Remove">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Unattended + Manual Dial */}
        <div className="space-y-6">
          {/* Unattended Hot Leads */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <h2 className="font-display text-sm font-bold text-tertiary mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-red-500" /> Unattended Hot Leads
              {unattendedLeads.length > 0 && (
                <span className="ml-auto px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-label text-xs font-semibold">{unattendedLeads.length}</span>
              )}
            </h2>
            {unattendedLeads.length === 0 ? (
              <p className="font-body text-sm text-on-surface-muted">All hot leads are attended 👍</p>
            ) : (
              <div className="space-y-2">
                {unattendedLeads.slice(0, 10).map((lead) => {
                  const assignedCaller = callers.find((c) => c.id === lead.assigned_to);
                  return (
                    <div key={lead.id} className="p-3 bg-surface-low rounded-xl">
                      <p className="font-body text-sm font-semibold text-on-surface">{lead.name || formatPhone(lead.phone)}</p>
                      <p className="font-label text-xs text-on-surface-muted">
                        Score {lead.score} · Assigned to {assignedCaller?.name || "Unknown"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manual Dial */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <h2 className="font-display text-sm font-bold text-tertiary mb-3 flex items-center gap-2">
              <Phone size={14} className="text-secondary" /> Manual Dial
            </h2>
            <select
              value={selectedCallerId || ""}
              onChange={(e) => setSelectedCallerId(e.target.value || null)}
              className="w-full mb-2 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            >
              <option value="">Select caller…</option>
              {callers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="tel" placeholder="e.g. +919942497199" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manualDial()}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
              <button onClick={manualDial} disabled={manualDialing || !manualPhone.trim() || !selectedCallerId}
                className="px-3 py-2 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">
                {manualDialing ? <RefreshCw size={14} className="animate-spin" /> : <Phone size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
