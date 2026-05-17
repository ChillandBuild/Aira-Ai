"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import {
  Phone, ToggleLeft, ToggleRight, RefreshCw, TrendingUp,
  Users, Coffee, ChevronDown,
} from "lucide-react";
import { api, Caller, Lead, API_URL, getAuthHeaders } from "@/lib/api";
import { formatPhone } from "@/lib/utils";
import LiveNotesPane from "./components/live-notes-pane";
import type { ActiveCallCtx } from "./types";

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-400" : "bg-gray-300";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-surface-mid rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-label text-xs font-semibold text-on-surface-muted w-4">{score}</span>
    </div>
  );
}

export default function AdminView() {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [selectedCallerId, setSelectedCallerId] = useState<string | null>(null);
  const [roundRobinEnabled, setRoundRobinEnabled] = useState<boolean | null>(null);
  const [togglingRR, setTogglingRR] = useState(false);

  const [totalCallsToday, setTotalCallsToday] = useState(0);
  const [totalConversionsToday, setTotalConversionsToday] = useState(0);

  const [activeCallCtx, setActiveCallCtx] = useState<ActiveCallCtx | null>(null);
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [dialingLeadId, setDialingLeadId] = useState<string | null>(null);

  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const rows = await api.callers.list();
      setCallers(rows);

      const auth = await getAuthHeaders();
      const rrRes = await fetch(`${API_URL}/api/v1/callers/round-robin`, { headers: auth });
      const rrData = await rrRes.json();
      setRoundRobinEnabled(rrData.enabled ?? true);

      // Top 5 leads by score across all segments
      const leads = await api.leads.list({ limit: 5 });
      setTopLeads(leads);

      let calls = 0, conversions = 0;
      for (const caller of rows) {
        try {
          const logs = await api.callers.logs(caller.id);
          const today = new Date(); today.setHours(0, 0, 0, 0);
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
    if (!manualPhone.trim()) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone: manualPhone.trim() }, selectedCallerId ?? undefined);
      setActiveCallCtx({ leadId: res.lead_id ?? null, name: res.lead_name ?? null, phone: manualPhone.trim() });
      setManualPhone("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  async function callLead(lead: Lead) {
    setDialingLeadId(lead.id);
    try {
      const res = await api.calls.initiate({ leadId: lead.id }, selectedCallerId ?? undefined);
      setActiveCallCtx({ leadId: res.lead_id ?? lead.id, name: res.lead_name ?? lead.name ?? null, phone: lead.phone ?? "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setDialingLeadId(null); }
  }

  const activeCallers = callers.filter((c) => (c.status || "active") === "active");
  const idleCallers = callers.filter((c) => c.status === "idle");
  const selectedCallerName = callers.find((c) => c.id === selectedCallerId)?.name ?? "Admin (me)";

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Telecalling</h1>
          <p className="font-body text-on-surface-muted mt-1">Team management & performance</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Universal caller selector */}
          <div className="relative">
            <label className="block font-label text-[10px] text-on-surface-muted uppercase tracking-widest mb-1">Calling as</label>
            <div className="relative">
              <select
                value={selectedCallerId || ""}
                onChange={(e) => setSelectedCallerId(e.target.value || null)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-surface border border-surface-mid font-body text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-w-[140px]"
              >
                <option value="">Admin (me)</option>
                {callers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-muted pointer-events-none" />
            </div>
          </div>

          {/* Auto-assign toggle */}
          {roundRobinEnabled !== null && (
            <div>
              <label className="block font-label text-[10px] text-on-surface-muted uppercase tracking-widest mb-1">Auto-assign</label>
              <button onClick={toggleRoundRobin} disabled={togglingRR}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-label text-sm font-semibold transition-all border ${
                  roundRobinEnabled
                    ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                    : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
                } ${togglingRR ? "opacity-60 cursor-not-allowed" : ""}`}>
                {roundRobinEnabled ? <ToggleRight size={16} className="text-teal-600" /> : <ToggleLeft size={16} className="text-gray-400" />}
                {roundRobinEnabled ? <span className="text-teal-600">ON</span> : <span className="text-gray-400">OFF</span>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-xl bg-primary/10 w-fit mb-2"><Phone size={16} className="text-primary" /></div>
          <span className="font-display text-3xl font-bold text-on-surface">{totalCallsToday}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">Total Calls Today</span>
        </div>
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-xl bg-green-100 w-fit mb-2"><TrendingUp size={16} className="text-green-600" /></div>
          <span className="font-display text-3xl font-bold text-on-surface">{totalConversionsToday}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">Conversions Today</span>
        </div>
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-xl bg-green-100 w-fit mb-2"><Users size={16} className="text-green-600" /></div>
          <span className="font-display text-3xl font-bold text-green-600">{activeCallers.length}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">Active Callers</span>
        </div>
        <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-xl bg-amber-100 w-fit mb-2"><Coffee size={16} className="text-amber-600" /></div>
          <span className="font-display text-3xl font-bold text-amber-600">{idleCallers.length}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">On Break</span>
        </div>
      </div>

      {/* Top Leads + Manual Dial */}
      <div className="grid grid-cols-3 gap-6">
        {/* Top 5 leads by score */}
        <div className="col-span-2 bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
              <TrendingUp size={14} className="text-red-500" /> Top Leads
            </h2>
            <span className="font-label text-[10px] text-on-surface-muted uppercase tracking-widest">
              Calling as <span className="text-primary font-semibold">{selectedCallerName}</span>
            </span>
          </div>

          {topLeads.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted">No leads yet.</p>
          ) : (
            <div className="space-y-2">
              {topLeads.map((lead, i) => {
                const assignedCaller = callers.find((c) => c.id === lead.assigned_to);
                const isDialing = dialingLeadId === lead.id;
                return (
                  <div key={lead.id} className="flex items-center gap-4 p-3 bg-surface-low rounded-xl hover:bg-surface-mid transition-colors">
                    <span className="font-label text-xs text-on-surface-muted w-5 text-center shrink-0">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm font-semibold text-on-surface truncate">{lead.name || formatPhone(lead.phone)}</p>
                      <p className="font-label text-xs text-on-surface-muted truncate">{formatPhone(lead.phone)}</p>
                    </div>
                    <ScoreBar score={lead.score ?? 0} />
                    <span className="font-label text-xs text-on-surface-muted hidden sm:block shrink-0">
                      {assignedCaller ? assignedCaller.name : <span className="text-amber-500">Unassigned</span>}
                    </span>
                    <button onClick={() => callLead(lead)} disabled={isDialing}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 rounded-lg font-label text-xs font-semibold transition-colors">
                      {isDialing ? <RefreshCw size={11} className="animate-spin" /> : <Phone size={11} />}
                      {isDialing ? "Dialing…" : "Call"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual Dial */}
        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 self-start">
          <h2 className="font-display text-sm font-bold text-tertiary mb-1 flex items-center gap-2">
            <Phone size={14} className="text-secondary" /> Manual Dial
          </h2>
          <p className="font-label text-[10px] text-on-surface-muted mb-4">
            Calling as <span className="text-primary font-semibold">{selectedCallerName}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="e.g. +919942497199"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && manualDial()}
              className="flex-1 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            />
            <button onClick={manualDial} disabled={manualDialing || !manualPhone.trim()}
              className="px-3 py-2 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">
              {manualDialing ? <RefreshCw size={14} className="animate-spin" /> : <Phone size={14} />}
            </button>
          </div>
        </div>
      </div>

      {activeCallCtx && (
        <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />
      )}
    </div>
  );
}
