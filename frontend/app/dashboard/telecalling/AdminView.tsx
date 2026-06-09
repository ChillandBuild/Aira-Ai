"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import {
  Phone, RefreshCw, TrendingUp,
  Users, Coffee, ChevronDown, Settings, Eye, X, Calendar, Copy, Tag, Target, StickyNote, Clock, ClipboardList
} from "lucide-react";
import { api, Caller, Lead } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import LiveNotesPane from "./components/live-notes-pane";
import AssignmentLog from "./components/assignment-log";
import PerformanceView from "./components/performance-view";
import { useActiveCall } from "../contexts/ActiveCallContext";
import { TelecallingConfigPanel } from "../settings/TelecallingConfigPanel";
import { fetchNotes } from "./lib/notes-api";
import type { NotesResponse, Note } from "./types";

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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tab, setTab] = useState<"dialer" | "log" | "performance">("dialer");

  const [totalCallsToday, setTotalCallsToday] = useState(0);
  const [totalConversionsToday, setTotalConversionsToday] = useState(0);

  const { activeCall: activeCallCtx, setActiveCall: setActiveCallCtx } = useActiveCall();
  const [topLeads, setTopLeads] = useState<Lead[]>([]);
  const [dialingLeadId, setDialingLeadId] = useState<string | null>(null);

  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // Profile modal state
  const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [viewingLeadNotes, setViewingLeadNotes] = useState<NotesResponse | null>(null);
  const [viewingLeadLoading, setViewingLeadLoading] = useState(false);

  // Timeline modal state
  const [timelineCallerId, setTimelineCallerId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [timelineData, setTimelineData] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Fetch full details for the viewing lead
  useEffect(() => {
    if (!viewingLeadId) {
      setViewingLead(null);
      setViewingLeadNotes(null);
      return;
    }
    setViewingLeadLoading(true);
    
    Promise.all([
      api.leads.get(viewingLeadId),
      fetchNotes(viewingLeadId).catch(() => ({ pinned: [], notes: [] }))
    ])
      .then(([leadData, notesData]) => {
        setViewingLead(leadData);
        setViewingLeadNotes(notesData);
      })
      .catch((err) => {
        toast.error("Failed to load lead profile");
        console.error(err);
      })
      .finally(() => {
        setViewingLeadLoading(false);
      });
  }, [viewingLeadId]);

  const loadData = useCallback(async () => {
    try {
      const [rows, leads, stats] = await Promise.all([
        api.callers.list(),
        api.leads.list({ limit: 5 }),
        api.calls.statsToday().catch(() => ({ calls_today: 0, conversions_today: 0 })),
      ]);
      setCallers(rows);
      setTopLeads(leads);
      setTotalCallsToday(stats.calls_today);
      setTotalConversionsToday(stats.conversions_today);
    } catch (err) {
      console.error("AdminView load error:", err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch timeline data for a caller
  async function openTimeline(cid: string) {
    setTimelineCallerId(cid);
    setTimelineLoading(true);
    try {
      const data = await api.callers.statusSummary(cid);
      setTimelineData(data);
    } catch { setTimelineData(null); }
    finally { setTimelineLoading(false); }
  }

  async function manualDial() {
    if (!manualPhone.trim()) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone: manualPhone.trim() }, selectedCallerId ?? undefined);
      setActiveCallCtx({ leadId: res.lead_id ?? null, name: res.lead_name ?? null, phone: manualPhone.trim(), callLogId: res.call_log_id ?? null });
      setManualPhone("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  async function callLead(lead: Lead) {
    setDialingLeadId(lead.id);
    try {
      const res = await api.calls.initiate({ leadId: lead.id }, selectedCallerId ?? undefined);
      setActiveCallCtx({ leadId: res.lead_id ?? lead.id, name: res.lead_name ?? lead.name ?? null, phone: lead.phone ?? "", callLogId: res.call_log_id ?? null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setDialingLeadId(null); }
  }

  const activeCallers = callers.filter((c) => (c.status || "active") === "active");
  const breakCallers = callers.filter((c) => c.status === "break");
  const selectedCallerName = callers.find((c) => c.id === selectedCallerId)?.name ?? "Admin (me)";

  return (
    <div>
      {/* View tabs */}
      <div className="mb-6 flex gap-2">
        <button onClick={() => setTab("dialer")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-label text-sm font-semibold transition-colors border ${tab === "dialer" ? "bg-primary/10 text-primary border-primary/20" : "bg-white text-on-surface-muted border-surface-mid hover:border-primary/30"}`}>
          <Phone size={14} /> Dialer
        </button>
        <button onClick={() => setTab("log")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-label text-sm font-semibold transition-colors border ${tab === "log" ? "bg-primary/10 text-primary border-primary/20" : "bg-white text-on-surface-muted border-surface-mid hover:border-primary/30"}`}>
          <ClipboardList size={14} /> Assignment Log
        </button>
        <button onClick={() => setTab("performance")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-label text-sm font-semibold transition-colors border ${tab === "performance" ? "bg-primary/10 text-primary border-primary/20" : "bg-white text-on-surface-muted border-surface-mid hover:border-primary/30"}`}>
          <TrendingUp size={14} /> Performance
        </button>
      </div>

      {tab === "log" ? (
        <AssignmentLog callers={callers} />
      ) : tab === "performance" ? (
        <PerformanceView callers={callers} />
      ) : (
      <>
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

          {/* Telecalling routing config */}
          <div>
            <label className="block font-label text-[10px] text-on-surface-muted uppercase tracking-widest mb-1">Routing Rules</label>
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-surface-mid hover:text-amber-600 hover:border-amber-300 font-label text-sm font-semibold transition-colors"
            >
              <Settings size={14} />
              Config
            </button>
          </div>
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
          <span className="font-display text-3xl font-bold text-amber-600">{breakCallers.length}</span>
          <span className="block font-label text-xs text-on-surface-muted mt-1">On Break</span>
        </div>
      </div>

      {/* Live Telecaller Status Grid */}
      <div className="mb-8 bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
        <h2 className="font-display text-sm font-bold text-tertiary mb-4 flex items-center gap-2">
          <Users size={14} className="text-indigo-500" /> Team Live Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {callers.map((c) => {
            const st = c.status || "active";
            const dotColor = st === "active" ? "bg-emerald-500" : st === "break" ? "bg-amber-500" : "bg-slate-400";
            const labelColor = st === "active" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : st === "break" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-500 bg-slate-100 border-slate-200";
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-surface-low rounded-xl border border-slate-100 hover:shadow-sm transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-500 text-white font-display text-sm font-bold flex items-center justify-center shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-bold text-slate-800 truncate">{c.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${st === "active" ? "animate-pulse" : ""}`} />
                    <span className={`font-label text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${labelColor}`}>{st === "logged_out" ? "Offline" : st}</span>
                    {c.status_changed_at && (
                      <span className="font-label text-[9px] text-slate-400">· {timeAgo(c.status_changed_at)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openTimeline(c.id)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="View shift timeline"
                >
                  <Clock size={14} />
                </button>
              </div>
            );
          })}
          {callers.length === 0 && <p className="text-xs text-slate-400 col-span-full text-center py-4">No telecallers in the team yet.</p>}
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setViewingLeadId(lead.id)}
                        className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted border border-transparent hover:border-surface-mid"
                        title="View Profile Details"
                      >
                        <Eye size={13} />
                      </button>
                      <button onClick={() => callLead(lead)} disabled={isDialing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 rounded-lg font-label text-xs font-semibold transition-colors">
                        {isDialing ? <RefreshCw size={11} className="animate-spin" /> : <Phone size={11} />}
                        {isDialing ? "Dialing…" : "Call"}
                      </button>
                    </div>
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
        <div className="mt-6">
          <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />
        </div>
      )}

      {showConfigModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm cursor-pointer"
          onClick={() => setShowConfigModal(false)}
        >
          <div 
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <TelecallingConfigPanel />
          </div>
        </div>
      )}

      {/* Profile Detail Modal */}
      {viewingLeadId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm cursor-pointer"
          onClick={() => setViewingLeadId(null)}
        >
          <div 
            className="w-full max-w-4xl bg-white rounded-3xl p-7 shadow-2xl max-h-[90vh] overflow-y-auto cursor-default border border-slate-200/50 flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
                🔍 Lead Attribution profile
              </h3>
              <button 
                onClick={() => setViewingLeadId(null)} 
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            {viewingLeadLoading ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <RefreshCw size={28} className="animate-spin text-indigo-500 mb-2" />
                <p className="text-xs text-slate-500 font-medium">Fetching lead history...</p>
              </div>
            ) : viewingLead ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {/* Left Column: Demographics & Attribution */}
                <div className="space-y-6">
                  {/* Demographics Card */}
                  <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white font-display text-lg font-bold flex items-center justify-center">
                        {viewingLead.name ? viewingLead.name.charAt(0).toUpperCase() : <Users size={18} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body text-base font-extrabold text-slate-850">{viewingLead.name || "Unnamed Lead"}</p>
                          <span className={`px-2 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                            viewingLead.segment === "A" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                            viewingLead.segment === "B" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                            viewingLead.segment === "C" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            Seg {viewingLead.segment}
                          </span>
                        </div>
                        <p className="font-label text-xs text-slate-500 mt-1 select-all">
                          {formatPhone(viewingLead.phone)} · Score {viewingLead.score}/10
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Assignment Card */}
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <Calendar size={16} className="text-indigo-500 shrink-0" />
                    <div>
                      <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">Queue Assignment Timestamp</p>
                      <p className="font-body text-xs text-slate-800 font-bold mt-0.5">
                        {viewingLead.assigned_at 
                          ? new Date(viewingLead.assigned_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
                          : "Unknown (Assigned prior to tracking)"}
                      </p>
                    </div>
                  </div>

                  {/* Marketing Attribution Widget */}
                  {viewingLead.broadcast_id || viewingLead.template_name ? (
                    // Outbound campaign attribution
                    <div className="bg-gradient-to-br from-purple-50/50 to-indigo-50/20 border border-purple-100/60 rounded-3xl p-5 shadow-sm space-y-4">
                      <span className="font-display text-[11px] font-black text-purple-800 uppercase tracking-widest flex items-center gap-1.5">
                        <Target size={12} className="text-purple-500" /> Outbound Campaign
                      </span>
                      <div className="space-y-3.5">
                        <div className="bg-white/90 backdrop-blur-sm border border-purple-100/65 rounded-xl p-3.5 relative shadow-sm">
                          <span className="font-label text-[9px] text-purple-700/60 uppercase font-extrabold block">Broadcast Campaign ID</span>
                          <p className="font-mono text-xs text-slate-800 font-bold mt-1.5 truncate pr-8 select-all">
                            {viewingLead.broadcast_id || "None"}
                          </p>
                          {viewingLead.broadcast_id && (
                            <button 
                              onClick={() => { navigator.clipboard.writeText(viewingLead.broadcast_id || ""); toast.success("Copied Campaign ID"); }}
                              className="absolute right-3 bottom-3 p-1.5 text-purple-400 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Copy ID"
                            >
                              <Copy size={11} />
                            </button>
                          )}
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm border border-purple-100/65 rounded-xl p-3.5 shadow-sm">
                          <span className="font-label text-[9px] text-purple-700/60 uppercase font-extrabold block">Message Template</span>
                          <p className="font-body text-xs text-slate-850 font-bold mt-1.5 truncate">
                            {viewingLead.template_name || "N/A"}
                          </p>
                        </div>

                        {viewingLead.tag_name && (
                          <div className="bg-white/90 backdrop-blur-sm border border-purple-100/65 rounded-xl p-3.5 shadow-sm flex items-center gap-1.5">
                            <Tag size={11} className="text-purple-500" />
                            <div>
                              <span className="font-label text-[9px] text-purple-700/60 uppercase font-extrabold block">Campaign Tag</span>
                              <span className="text-xs font-bold text-purple-700 mt-0.5 inline-block">{viewingLead.tag_name}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Inbound lead attribution
                    <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/20 border border-emerald-100/60 rounded-3xl p-5 shadow-sm space-y-4">
                      <span className="font-display text-[11px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                        <Target size={12} className="text-emerald-500" /> Inbound Origin
                      </span>
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="bg-white/90 backdrop-blur-sm border border-emerald-100/65 rounded-xl p-3.5 shadow-sm">
                          <span className="font-label text-[9px] text-emerald-700/60 uppercase font-extrabold block">Ad Campaign</span>
                          <p className="font-body text-xs text-slate-850 font-bold mt-1 truncate">{viewingLead.ad_campaign_name || "Organic Traffic"}</p>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm border border-emerald-100/65 rounded-xl p-3.5 shadow-sm">
                          <span className="font-label text-[9px] text-emerald-700/60 uppercase font-extrabold block">Channel Source</span>
                          <p className="font-body text-xs text-slate-850 font-bold mt-1 capitalize truncate">{viewingLead.channel || viewingLead.source || "Organic"}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Interaction Logs */}
                <div className="space-y-4">
                  <h4 className="font-display text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <StickyNote size={12} className="text-indigo-500" /> Lead Interaction Timeline
                  </h4>

                  {/* Pinned notes */}
                  {viewingLeadNotes?.pinned && viewingLeadNotes.pinned.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">📌 Pinned Notes</p>
                      {viewingLeadNotes.pinned.map((n: Note) => (
                        <div key={n.id} className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-slate-700 font-semibold shadow-sm">
                          {n.content}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes Feed */}
                  <div className="space-y-3">
                    <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">📝 Recent Notes</p>
                    {viewingLeadNotes?.notes && viewingLeadNotes.notes.length > 0 ? (
                      <div className="relative border-l border-slate-100 pl-4 ml-2.5 max-h-[350px] overflow-y-auto pr-1 space-y-4">
                        {viewingLeadNotes.notes.slice(0, 5).map((n: Note) => (
                          <div key={n.id} className="relative">
                            <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white ring-4 ring-white" />
                            <div className="flex justify-between items-center text-[9px] text-slate-450 font-bold mb-1">
                              <span>{timeAgo(n.created_at)}</span>
                              {n.is_pinned && <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-black text-[8px]">PINNED</span>}
                            </div>
                            <p className="font-body text-xs text-slate-600 bg-slate-50 border border-slate-100/80 p-3 rounded-2xl leading-relaxed break-words">
                              {n.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-8 bg-slate-50/60 border border-slate-100 rounded-2xl">
                        No prior interaction notes logged.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {/* Timeline Modal */}
      {timelineCallerId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm cursor-pointer"
          onClick={() => { setTimelineCallerId(null); setTimelineData(null); }}
        >
          <div 
            className="w-full max-w-lg bg-white rounded-3xl p-7 shadow-2xl max-h-[80vh] overflow-y-auto cursor-default border border-slate-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-indigo-500" /> Shift Timeline
              </h3>
              <button onClick={() => { setTimelineCallerId(null); setTimelineData(null); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all">
                <X size={16} />
              </button>
            </div>
            {timelineLoading ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <RefreshCw size={28} className="animate-spin text-indigo-500 mb-2" />
                <p className="text-xs text-slate-500">Loading shift data...</p>
              </div>
            ) : timelineData ? (
              <div className="space-y-5">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <span className="font-display text-xl font-bold text-emerald-700">{Math.round(timelineData.active_minutes_today || 0)}</span>
                    <span className="block font-label text-[9px] text-emerald-600 uppercase mt-0.5">Active min</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                    <span className="font-display text-xl font-bold text-amber-700">{Math.round(timelineData.break_minutes_today || 0)}</span>
                    <span className="block font-label text-[9px] text-amber-600 uppercase mt-0.5">Break min</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <span className="font-display text-xl font-bold text-slate-600">{timelineData.scheduled_count || 0}</span>
                    <span className="block font-label text-[9px] text-slate-500 uppercase mt-0.5">Scheduled</span>
                  </div>
                </div>
                {/* Login/Logout */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <span className="font-label text-[9px] text-slate-400 uppercase block font-bold">First Login</span>
                    <span className="font-body text-xs text-slate-800 font-bold">
                      {timelineData.first_login_at ? new Date(timelineData.first_login_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u2014"}
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <span className="font-label text-[9px] text-slate-400 uppercase block font-bold">Last Logout</span>
                    <span className="font-body text-xs text-slate-800 font-bold">
                      {timelineData.last_logout_at ? new Date(timelineData.last_logout_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u2014"}
                    </span>
                  </div>
                </div>
                {/* Breaks */}
                {timelineData.breaks && timelineData.breaks.length > 0 && (
                  <div>
                    <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-2">Break Intervals Today</p>
                    <div className="space-y-1.5">
                      {timelineData.breaks.map((b: { started_at: string; ended_at: string | null; duration_minutes: number }, i: number) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 bg-amber-50/50 border border-amber-100/50 rounded-lg text-xs">
                          <span className="text-slate-600">
                            {new Date(b.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {" \u2192 "}
                            {b.ended_at ? new Date(b.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "ongoing"}
                          </span>
                          <span className="font-bold text-amber-700">{Math.round(b.duration_minutes)} min</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-8">No shift data available for today.</p>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
