"use client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  Phone, RefreshCw, TrendingUp,
  Users, ChevronDown, Settings, Eye, X, Calendar, StickyNote
} from "lucide-react";
import { api } from "@/lib/api";
import type { Caller, Lead } from "@/lib/api";
import { useAdminDashboard, useLeads } from "@/hooks/useApi";
import type { AdminDashboardData } from "@/hooks/useApi";
import { formatPhone, timeAgo } from "@/lib/utils";
import LiveNotesPane from "./components/live-notes-pane";
import { useActiveCall } from "../contexts/ActiveCallContext";
import { TelecallingConfigPanel } from "../settings/TelecallingConfigPanel";
import { fetchNotes } from "./lib/notes-api";
import type { NotesResponse, Note } from "./types";
import NumpadDialer from "./components/NumpadDialer";
import LeadAttribution from "./components/LeadAttribution";

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

export default function AdminView({ fallbackData }: { fallbackData?: AdminDashboardData }) {
  // Cached + auto-revalidating (focus/reconnect + 30s) admin dashboard data,
  // seeded from the server on first paint when available.
  const { data: dashboard, mutate: refreshDashboard } = useAdminDashboard(fallbackData);
  const callers: Caller[] = dashboard?.callers ?? [];
  const totalCallsToday = dashboard?.totalCallsToday ?? 0;
  const totalConversionsToday = dashboard?.totalConversionsToday ?? 0;

  const [selectedCallerId, setSelectedCallerId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const { activeCall: activeCallCtx, setActiveCall: setActiveCallCtx } = useActiveCall();
  const [dialingLeadId, setDialingLeadId] = useState<string | null>(null);

  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // Profile modal state
  const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [viewingLeadNotes, setViewingLeadNotes] = useState<NotesResponse | null>(null);
  const [viewingLeadLoading, setViewingLeadLoading] = useState(false);

  // Queue Filters state
  const [queueSegment, setQueueSegment] = useState<string>("all");
  const [queueStatus, setQueueStatus] = useState<string>("all");
  const [queueAssignedTo, setQueueAssignedTo] = useState<string>("all");

  const { data: queueLeadsData, mutate: refreshQueueLeads } = useLeads({
    segment: queueSegment !== "all" ? queueSegment : undefined,
    assigned_to: (queueAssignedTo !== "all" && queueAssignedTo !== "unassigned") ? queueAssignedTo : undefined,
    limit: 50,
  });

  const queueLeads = queueLeadsData ?? [];

  // Client-side filtering for call_status and unassigned
  const filteredQueueLeads = queueLeads.filter((lead) => {
    if (queueStatus !== "all" && lead.call_status !== queueStatus) {
      return false;
    }
    if (queueAssignedTo === "unassigned" && lead.assigned_to) {
      return false;
    }
    return true;
  });

  // Lock body scroll when modals are open to prevent double scrollbars
  useEffect(() => {
    if (showConfigModal || viewingLeadId) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showConfigModal, viewingLeadId]);

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


  async function manualDial() {
    if (!manualPhone.trim()) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone: manualPhone.trim() }, selectedCallerId ?? undefined);
      setActiveCallCtx({ leadId: res.lead_id ?? null, name: res.lead_name ?? null, phone: manualPhone.trim(), callLogId: res.call_log_id ?? null });
      setManualPhone("");
      refreshDashboard();
      refreshQueueLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  async function callLead(lead: Lead) {
    setDialingLeadId(lead.id);
    try {
      const res = await api.calls.initiate({ leadId: lead.id }, selectedCallerId ?? undefined);
      setActiveCallCtx({ leadId: res.lead_id ?? lead.id, name: res.lead_name ?? lead.name ?? null, phone: lead.phone ?? "", callLogId: res.call_log_id ?? null });
      refreshDashboard();
      refreshQueueLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setDialingLeadId(null); }
  }

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
      <div className="grid grid-cols-2 gap-4 mb-8">
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
      </div>

      {/* Lead Queue + Manual Dial */}
      <div className="grid grid-cols-3 gap-6">
        {/* Filterable Lead Queue */}
        <div className="col-span-2 bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
              <TrendingUp size={14} className="text-red-500" /> Lead Queue
            </h2>
            <span className="font-label text-[10px] text-on-surface-muted uppercase tracking-widest">
              Calling as <span className="text-primary font-semibold">{selectedCallerName}</span>
            </span>
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-3 gap-3 mb-5 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
            <div>
              <label className="block font-label text-[9px] text-on-surface-muted uppercase tracking-widest mb-1.5 font-extrabold">Segment</label>
              <div className="relative">
                <select
                  value={queueSegment}
                  onChange={(e) => setQueueSegment(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-200/80 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer font-semibold"
                >
                  <option value="all">All Segments</option>
                  <option value="A">Segment A</option>
                  <option value="B">Segment B</option>
                  <option value="C">Segment C</option>
                  <option value="D">Segment D</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-muted pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block font-label text-[9px] text-on-surface-muted uppercase tracking-widest mb-1.5 font-extrabold">Call Status</label>
              <div className="relative">
                <select
                  value={queueStatus}
                  onChange={(e) => setQueueStatus(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-200/80 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer font-semibold"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="callback">Callback</option>
                  <option value="converted">Converted</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="dnc">Do Not Call (DNC)</option>
                  <option value="unreachable">Unreachable</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-muted pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block font-label text-[9px] text-on-surface-muted uppercase tracking-widest mb-1.5 font-extrabold">Assigned To</label>
              <div className="relative">
                <select
                  value={queueAssignedTo}
                  onChange={(e) => setQueueAssignedTo(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-200/80 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer font-semibold"
                >
                  <option value="all">All Callers</option>
                  <option value="unassigned">Unassigned</option>
                  {callers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-muted pointer-events-none" />
              </div>
            </div>
          </div>

          {filteredQueueLeads.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted text-center py-6">No leads match the filters.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredQueueLeads.map((lead, i) => {
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
        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 self-start flex flex-col gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
              <Phone size={14} className="text-secondary" /> Manual Dial
            </h2>
            <p className="font-label text-[10px] text-on-surface-muted mt-1">
              Calling as <span className="text-primary font-semibold">{selectedCallerName}</span>
            </p>
          </div>
          <NumpadDialer 
            value={manualPhone}
            onChange={setManualPhone}
            onDial={manualDial}
            dialing={manualDialing}
          />
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
                  <LeadAttribution lead={viewingLead} />
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
    </div>
  );
}
