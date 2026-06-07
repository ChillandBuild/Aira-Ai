"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import { Phone, Eye, RefreshCw, ChevronDown, StickyNote, Check, CheckCheck, Download, Calendar, Tag, Megaphone, Target, Inbox, Info, Copy } from "lucide-react";
import { api, Caller, Lead } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import BriefingModal from "./components/briefing-modal";
import LiveNotesPane from "./components/live-notes-pane";
import NotesHistoryModal from "./components/notes-history-modal";
import { fetchNotes, fetchTodayCallbacks, fetchTodayCompletedCallbacks, markCallbackDone, saveNote } from "./lib/notes-api";
import type { CallbackJob, NotesResponse } from "./types";
import { usePolling } from "@/hooks/usePolling";
import { useActiveCall } from "../contexts/ActiveCallContext";

export default function CallerView({ callerId }: { callerId: string | null }) {
  // caller profile
  const [myCaller, setMyCaller] = useState<Caller | null>(null);
  const [myStatus, setMyStatus] = useState<"active" | "idle">("active");
  const [togglingStatus, setTogglingStatus] = useState(false);

  // my leads (assigned to me, sorted by score desc)
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [lastCalledMap, setLastCalledMap] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  // callbacks
  const [todayCallbacks, setTodayCallbacks] = useState<CallbackJob[]>([]);
  const [completedCallbacks, setCompletedCallbacks] = useState<CallbackJob[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);

  // Selected Lead Profile
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeadNotes, setSelectedLeadNotes] = useState<NotesResponse | null>(null);
  const [selectedLeadLoading, setSelectedLeadLoading] = useState(false);

  // dialing
  const [dialing, setDialing] = useState<string | null>(null);
  const [releasingLead, setReleasingLead] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // quick-note on selected lead
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);

  // modals
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const { activeCall: activeCallCtx, setActiveCall: setActiveCallCtx } = useActiveCall();

  const loadCallbacks = useCallback(() => {
    fetchTodayCallbacks().then(setTodayCallbacks).catch(() => {});
    fetchTodayCompletedCallbacks().then(setCompletedCallbacks).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [callers, leads] = await Promise.all([
        api.callers.list(),
        api.leads.list({ assigned_to: callerId || undefined, limit: 100 }),
      ]);
      const me = callers.find((c: Caller) => c.id === callerId) || null;
      setMyCaller(me);
      if (me) setMyStatus((me.status as "active" | "idle") || "active");

      const dialable = leads.filter((l: Lead) => l.phone && l.phone.trim() !== "");
      const sorted = dialable.sort((a: Lead, b: Lead) => (b.score ?? 0) - (a.score ?? 0));
      setMyLeads(sorted);

      const ids = sorted.map((l: Lead) => l.id).filter(Boolean);
      if (ids.length) api.calls.recentByLeads(ids).then(setLastCalledMap).catch(() => {});

      loadCallbacks();
    } catch (err) {
      console.error("CallerView load error:", err);
    }
  }, [callerId, loadCallbacks]);

  useEffect(() => { loadData(); }, [loadData]);

  // auto-refresh callbacks every 5 minutes
  usePolling(loadCallbacks, 5 * 60 * 1000);

  // Fetch full details when lead is selected
  useEffect(() => {
    if (!selectedLeadId) {
      setSelectedLead(null);
      setSelectedLeadNotes(null);
      return;
    }
    setSelectedLeadLoading(true);
    
    Promise.all([
      api.leads.get(selectedLeadId),
      fetchNotes(selectedLeadId).catch(() => ({ pinned: [], notes: [] }))
    ])
      .then(([leadData, notesData]) => {
        setSelectedLead(leadData);
        setSelectedLeadNotes(notesData);
      })
      .catch((err) => {
        toast.error("Failed to load lead profile");
        console.error(err);
      })
      .finally(() => {
        setSelectedLeadLoading(false);
      });
  }, [selectedLeadId]);

  // actions
  async function toggleMyStatus() {
    const next = myStatus === "active" ? "idle" : "active";
    setTogglingStatus(true);
    try {
      await api.callers.setMyStatus(next);
      setMyStatus(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function executeDial(leadId: string, lead: Lead) {
    if (!myCaller) { toast.error("Caller profile not found"); return; }
    setDialing(leadId);
    try {
      const res = await api.calls.initiate({ leadId }, myCaller.id);
      setActiveCallCtx({
        leadId: res.lead_id ?? leadId,
        name: res.lead_name ?? lead.name,
        phone: lead.phone,
        callLogId: res.call_log_id ?? null
      });
      toast.success(`Calling ${lead.name || lead.phone}...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setDialing(null); }
  }

  async function manualDial() {
    if (!myCaller || !manualPhone.trim()) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone: manualPhone.trim() }, myCaller.id);
      setActiveCallCtx({
        leadId: res.lead_id ?? null,
        name: res.lead_name ?? null,
        phone: manualPhone.trim(),
        callLogId: res.call_log_id ?? null
      });
      setManualPhone("");
      toast.success(`Calling ${manualPhone}...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  async function saveQuickNote(leadId: string) {
    if (!quickNoteContent.trim()) return;
    setQuickNoteSaving(true);
    try {
      await saveNote(leadId, quickNoteContent.trim(), false);
      setQuickNoteContent("");
      toast.success("Note saved");
      // Refresh notes
      fetchNotes(leadId).then(setSelectedLeadNotes).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally { setQuickNoteSaving(false); }
  }

  async function handleMarkDone(jobId: string) {
    try {
      await markCallbackDone(jobId);
      const cb = todayCallbacks.find((c) => c.id === jobId);
      if (cb) {
        setTodayCallbacks((prev) => prev.filter((c) => c.id !== jobId));
        setCompletedCallbacks((prev) => [{ ...cb, status: "sent" }, ...prev]);
      }
      toast.success("Callback marked as completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark done");
    }
  }

  async function handleRelease(leadId: string) {
    if (confirmRelease !== leadId) {
      setConfirmRelease(leadId);
      setTimeout(() => setConfirmRelease((cur) => cur === leadId ? null : cur), 3000);
      return;
    }
    setConfirmRelease(null);
    setReleasingLead(leadId);
    try {
      await api.leads.release(leadId);
      setMyLeads((prev) => prev.filter((l) => l.id !== leadId));
      if (selectedLeadId === leadId) {
        setSelectedLeadId(null);
      }
      toast.success("Lead released successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to release lead");
    } finally {
      setReleasingLead(null);
    }
  }

  async function handleDownloadCSV() {
    setExporting(true);
    try {
      await api.leads.exportAssigned();
      toast.success("CSV downloaded successfully");
    } catch (err) {
      toast.error("Failed to download CSV");
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header with status toggle */}
      <div className="mb-6 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Telecalling Dashboard</h1>
          <p className="font-body text-on-surface-muted mt-1">Manage assigned leads, view marketing attribution, and log callbacks</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCSV}
            disabled={exporting || myLeads.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-mid rounded-xl font-label text-sm font-semibold hover:bg-surface-low transition-all text-on-surface hover:border-tertiary hover:text-tertiary disabled:opacity-50"
            title="Download CSV of all assigned leads with attribution details"
          >
            {exporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
            Export Assigned CSV
          </button>

          <button
            onClick={toggleMyStatus}
            disabled={togglingStatus}
            className={`flex items-center gap-3 px-6 py-2.5 rounded-xl font-label text-sm font-bold transition-all shadow-md ${
              myStatus === "active"
                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                : "bg-amber-400 text-amber-900 hover:bg-amber-500"
            } ${togglingStatus ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span className={`w-2 h-2 rounded-full ${myStatus === "active" ? "bg-white animate-pulse" : "bg-amber-700"}`} />
            {myStatus === "active" ? "Active Queue" : "On Break"}
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 grid grid-cols-5 gap-6 min-h-0">
        {/* Left Side: Lead List & Callbacks (2/5 columns) */}
        <div className="col-span-2 flex flex-col gap-5 min-h-0 overflow-y-auto pr-1">
          {/* Callbacks Section */}
          {(todayCallbacks.length > 0 || completedCallbacks.length > 0) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl shrink-0">
              <h2 className="font-bold text-amber-900 text-sm mb-3 flex items-center gap-2">
                <span>📞</span> Today&apos;s Callbacks ({todayCallbacks.length})
              </h2>
              {todayCallbacks.length > 0 && (
                <div className="space-y-2 mb-3">
                  {todayCallbacks.map((cb) => (
                    <div
                      key={cb.id}
                      onClick={() => setSelectedLeadId(cb.lead.id)}
                      className={`flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm border transition-all cursor-pointer hover:border-amber-400 ${
                        selectedLeadId === cb.lead.id ? "ring-2 ring-amber-400 border-transparent" : "border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{cb.lead.name ?? "Unnamed"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {cb.lead.phone} · {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {cb.message_preview && <p className="text-xs text-amber-800 line-clamp-1 mt-1 bg-amber-100/50 px-2 py-0.5 rounded w-fit">{cb.message_preview}</p>}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkDone(cb.id);
                        }}
                        className="ml-2 text-xs px-2.5 py-1 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
                      >
                        ✓ Done
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Completed section */}
              {completedCallbacks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold hover:text-amber-900"
                  >
                    <ChevronDown size={12} className={`transition-transform ${showCompleted ? "rotate-180" : ""}`} />
                    Completed Today ({completedCallbacks.length})
                  </button>
                  {showCompleted && (
                    <div className="space-y-2 mt-2">
                      {completedCallbacks.map((cb) => (
                        <div key={cb.id} className="flex items-center justify-between bg-emerald-50/50 rounded-xl px-4 py-2 opacity-75 border border-emerald-100">
                          <div>
                            <p className="font-semibold text-sm line-through text-gray-500">{cb.lead.name ?? "Unnamed"}</p>
                            <p className="text-xs text-gray-400">
                              {cb.lead.phone} · {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <span className="text-xs text-emerald-600 font-semibold">✓ Done</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lead List Card */}
          <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm border border-surface-mid/40 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="font-display text-lg font-bold text-tertiary flex items-center gap-2">
                🎯 Assigned Leads
                {myLeads.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full font-label text-xs font-semibold">{myLeads.length}</span>
                )}
              </h2>
            </div>
            {myLeads.length === 0 ? (
              <div className="text-center py-12 flex-1 flex flex-col justify-center">
                <p className="font-body text-sm text-on-surface-muted">No leads assigned to you yet.</p>
                <p className="font-label text-xs text-on-surface-muted mt-1">New leads will be assigned via auto-routing rules.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {myLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`rounded-xl border transition-all cursor-pointer p-3.5 flex items-center justify-between gap-3 ${
                      selectedLeadId === lead.id
                        ? "bg-primary/5 border-primary ring-1 ring-primary"
                        : "bg-surface-low border-surface-mid/40 hover:bg-surface-mid/20 hover:border-surface-mid"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-body text-sm font-semibold text-on-surface truncate">
                          {lead.name || formatPhone(lead.phone)}
                        </p>
                        {lead.score >= 7 && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-label text-[9px] font-bold tracking-wide">HOT</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded font-label text-[9px] font-semibold ${
                          lead.segment === "A" ? "bg-emerald-100 text-emerald-700" :
                          lead.segment === "B" ? "bg-blue-100 text-blue-700" :
                          lead.segment === "C" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          Seg {lead.segment}
                        </span>
                      </div>
                      <p className="font-label text-xs text-on-surface-muted mt-1">
                        {lead.name ? formatPhone(lead.phone) + " · " : ""}Score {lead.score}
                      </p>
                      {lastCalledMap[lead.id] && (
                        <p className="font-label text-[10px] text-on-surface-muted mt-0.5">Called {timeAgo(lastCalledMap[lead.id])}</p>
                      )}
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRelease(lead.id);
                      }}
                      disabled={releasingLead === lead.id}
                      title="Release / Mark Done with Lead"
                      className={`p-2 rounded-lg transition-colors border shrink-0 ${
                        confirmRelease === lead.id
                          ? "bg-red-50 text-red-600 border-red-300 font-semibold text-xs px-2.5 py-1"
                          : "hover:bg-surface-mid text-on-surface-muted border-transparent"
                      }`}
                    >
                      {releasingLead === lead.id ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : confirmRelease === lead.id ? (
                        "Release?"
                      ) : (
                        <CheckCheck size={14} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Manual Dial Container */}
          <div className="bg-white rounded-2xl p-5 border border-surface-mid/40 shadow-sm shrink-0">
            <h3 className="font-display text-sm font-bold text-tertiary mb-3 flex items-center gap-2">
              <Phone size={14} className="text-secondary" /> Dial Offline Number
            </h3>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="e.g. +919942497199"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manualDial()}
                className="flex-1 px-3 py-2 rounded-xl bg-surface-low border border-surface-mid/60 font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <button
                onClick={manualDial}
                disabled={manualDialing || !manualPhone.trim()}
                className="px-4 py-2 bg-tertiary text-white rounded-xl font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
              >
                {manualDialing ? <RefreshCw size={14} className="animate-spin" /> : "Call"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Profile Page (3/5 columns) */}
        <div className="col-span-3 flex flex-col min-h-0 bg-white rounded-2xl border border-surface-mid/40 shadow-sm">
          {activeCallCtx && (
            <div className="p-4 border-b border-surface-mid/40 shrink-0">
              <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />
            </div>
          )}

          {!selectedLeadId ? (
            // Empty State
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="p-4 rounded-full bg-slate-50 text-slate-400 mb-4 border border-slate-100">
                <Inbox size={32} />
              </div>
              <h3 className="font-display text-lg font-bold text-tertiary">No Lead Selected</h3>
              <p className="font-body text-sm text-on-surface-muted max-w-sm mt-1">
                Select a lead from the list on the left to view their detailed profile, marketing attribution channels, and notes history.
              </p>
            </div>
          ) : selectedLeadLoading ? (
            // Loading State
            <div className="flex-1 flex flex-col items-center justify-center">
              <RefreshCw size={32} className="animate-spin text-primary mb-2" />
              <p className="font-body text-sm text-on-surface-muted">Loading lead details...</p>
            </div>
          ) : selectedLead ? (
            // Lead Profile View
            <div className="flex-1 flex flex-col min-h-0">
              {/* Profile Header Card */}
              <div className="p-6 border-b border-surface-mid/40 flex justify-between items-start gap-4 shrink-0">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-display text-2xl font-bold text-tertiary">
                      {selectedLead.name || "Unnamed Lead"}
                    </h2>
                    {selectedLead.score >= 7 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-lg font-label text-[10px] font-bold">HOT LEAD</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-lg font-label text-[10px] font-bold ${
                      selectedLead.segment === "A" ? "bg-emerald-100 text-emerald-700" :
                      selectedLead.segment === "B" ? "bg-blue-100 text-blue-700" :
                      selectedLead.segment === "C" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      Segment {selectedLead.segment}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-1.5 font-label text-sm text-on-surface-muted">
                    <span className="font-semibold text-on-surface">{formatPhone(selectedLead.phone)}</span>
                    <span>·</span>
                    <span>Score: {selectedLead.score}/10</span>
                  </div>
                </div>

                <button
                  onClick={() => executeDial(selectedLead.id, selectedLead)}
                  disabled={dialing === selectedLead.id}
                  className="flex items-center gap-2 px-6 py-3 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Phone size={15} />
                  {dialing === selectedLead.id ? "Dialing…" : "Call Lead"}
                </button>
              </div>

              {/* Profile Details (Scrollable Body) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Assignment Info */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
                  <Calendar size={18} className="text-primary shrink-0" />
                  <div>
                    <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider">Telecaller Assignment Timestamp</p>
                    <p className="font-body text-sm font-medium text-slate-800 mt-0.5">
                      {selectedLead.assigned_at 
                        ? new Date(selectedLead.assigned_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
                        : "Unknown (Pre-assigned prior to tracking)"}
                    </p>
                  </div>
                </div>

                {/* 2. Marketing Attribution details */}
                <div>
                  <h3 className="font-display text-sm font-bold text-tertiary mb-3 flex items-center gap-2">
                    <Target size={15} className="text-secondary" /> Marketing & Lead Origin Attribution
                  </h3>

                  {/* Attributing lead source type (Inbound vs Outbound) */}
                  {selectedLead.broadcast_id || selectedLead.template_name ? (
                    // Outbound/Broadcast details
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-surface-mid rounded-xl p-4 bg-white hover:shadow-sm transition-all">
                        <div className="flex items-center justify-between">
                          <span className="font-label text-xs text-on-surface-muted uppercase">Broadcast Campaign ID</span>
                          <button 
                            onClick={() => copyToClipboard(selectedLead.broadcast_id || "", "Broadcast ID")}
                            className="p-1 text-on-surface-muted hover:text-tertiary hover:bg-surface-low rounded transition-colors"
                            title="Copy ID"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        <p className="font-mono text-xs text-slate-800 font-semibold truncate mt-1.5 select-all">
                          {selectedLead.broadcast_id || "None"}
                        </p>
                      </div>

                      <div className="border border-surface-mid rounded-xl p-4 bg-white hover:shadow-sm transition-all">
                        <span className="font-label text-xs text-on-surface-muted uppercase block">Message Template Name</span>
                        <p className="font-body text-sm text-slate-800 font-semibold truncate mt-1.5">
                          {selectedLead.template_name || "N/A"}
                        </p>
                      </div>

                      {selectedLead.tag_name && (
                        <div className="border border-surface-mid rounded-xl p-4 bg-white col-span-2 hover:shadow-sm transition-all flex items-center justify-between">
                          <div>
                            <span className="font-label text-xs text-on-surface-muted uppercase">Campaign Tag</span>
                            <span className="flex items-center gap-1.5 mt-1 font-body text-sm font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full w-fit">
                              <Tag size={12} />
                              {selectedLead.tag_name}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Inbound details
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-surface-mid rounded-xl p-4 bg-white hover:shadow-sm transition-all">
                        <span className="font-label text-xs text-on-surface-muted uppercase block">Ad Campaign Name</span>
                        <p className="font-body text-sm text-slate-800 font-bold mt-1.5 truncate">
                          {selectedLead.ad_campaign_name || "Organic (Non-Paid Lead)"}
                        </p>
                      </div>

                      <div className="border border-surface-mid rounded-xl p-4 bg-white hover:shadow-sm transition-all">
                        <span className="font-label text-xs text-on-surface-muted uppercase block">Origin Channel</span>
                        <p className="font-body text-sm text-slate-800 font-semibold capitalize mt-1.5 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                          {selectedLead.channel || selectedLead.source}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Lead Notes & Pinned Facts */}
                <div className="border-t border-surface-mid/40 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
                      <StickyNote size={15} className="text-secondary" /> Lead Briefing & Facts
                    </h3>
                    {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 && (
                      <button
                        onClick={() => setHistoryLead(selectedLead)}
                        className="text-xs text-tertiary font-semibold hover:underline"
                      >
                        See all notes ({selectedLeadNotes.notes.length})
                      </button>
                    )}
                  </div>

                  {selectedLeadNotes?.pinned && selectedLeadNotes.pinned.length > 0 && (
                    <div className="mb-4 space-y-2">
                      <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider">Pinned Facts</p>
                      {selectedLeadNotes.pinned.map((n) => (
                        <div key={n.id} className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
                          <p className="font-body text-xs text-slate-800">{n.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider">Recent Interactions</p>
                      {selectedLeadNotes.notes.slice(0, 3).map((n) => (
                        <div key={n.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                          <div className="flex justify-between items-center text-[10px] text-on-surface-muted mb-1">
                            <span>{timeAgo(n.created_at)}</span>
                            {n.is_pinned && <span className="text-purple-600 font-bold">📌 PINNED</span>}
                          </div>
                          <p className="font-body text-xs text-slate-700">{n.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-100 text-center rounded-xl text-xs text-on-surface-muted">
                      No previous notes recorded for this lead.
                    </div>
                  )}
                </div>

                {/* 4. Quick Note Input */}
                <div className="border-t border-surface-mid/40 pt-6">
                  <h3 className="font-display text-sm font-bold text-tertiary mb-3">Add Quick Call Note</h3>
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={quickNoteContent}
                      onChange={(e) => setQuickNoteContent(e.target.value)}
                      placeholder="Add a new note after calling the lead..."
                      rows={3}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-surface border border-surface-mid/80 font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
                    />
                    <button
                      onClick={() => saveQuickNote(selectedLead.id)}
                      disabled={quickNoteSaving || !quickNoteContent.trim()}
                      className="p-3 bg-tertiary text-white rounded-xl hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                      title="Save note"
                    >
                      {quickNoteSaving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* History Notes Modal */}
      {historyLead && (
        <NotesHistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />
      )}
    </div>
  );
}
