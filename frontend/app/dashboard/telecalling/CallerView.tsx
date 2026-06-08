"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback, useRef } from "react";
import { Phone, RefreshCw, ChevronDown, StickyNote, Check, CheckCheck, Download, Calendar, Tag, Target, Inbox, Copy, User, Sparkles, Search, Clock, Bell, X } from "lucide-react";
import { api, Caller, Lead } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import LiveNotesPane from "./components/live-notes-pane";
import NotesHistoryModal from "./components/notes-history-modal";
import { fetchNotes, fetchTodayCallbacks, fetchTodayCompletedCallbacks, markCallbackDone, saveNote, createCallback } from "./lib/notes-api";
import type { CallbackJob, NotesResponse } from "./types";
import { usePolling } from "@/hooks/usePolling";
import { useActiveCall } from "../contexts/ActiveCallContext";

export default function CallerView({ callerId }: { callerId: string | null }) {
  // caller profile
  const [myCaller, setMyCaller] = useState<Caller | null>(null);
  const [myStatus, setMyStatus] = useState<"active" | "break" | "logged_out">("active");
  const [togglingStatus, setTogglingStatus] = useState(false);
  const autoLoginRef = useRef(false);

  // my leads (assigned to me, sorted by score desc)
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [lastCalledMap, setLastCalledMap] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  // search query for leads
  const [searchQuery, setSearchQuery] = useState("");

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

  // scheduling
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedReminder, setSchedReminder] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // notification bell
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

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
      if (me) setMyStatus((me.status as "active" | "break" | "logged_out") || "active");

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

  // Auto-login: set status to active on mount if logged_out
  useEffect(() => {
    if (!callerId || autoLoginRef.current) return;
    autoLoginRef.current = true;
    api.callers.setMyStatus("active").catch(() => {});
  }, [callerId]);

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
    const next = myStatus === "active" ? "break" : "active";
    setTogglingStatus(true);
    try {
      await api.callers.setMyStatus(next);
      setMyStatus(next);
      toast.success(next === "active" ? "You are now active" : "Break mode enabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleScheduleCallback(leadId: string) {
    if (!schedDate || !schedTime) { toast.error("Pick a date & time"); return; }
    setScheduleSaving(true);
    try {
      const iso = new Date(`${schedDate}T${schedTime}`).toISOString();
      await createCallback(leadId, iso, quickNoteContent.trim() || undefined);
      toast.success("Callback scheduled!");
      setSchedDate(""); setSchedTime(""); setSchedReminder(false);
      loadCallbacks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    } finally { setScheduleSaving(false); }
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

  const filteredLeads = myLeads.filter((lead) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const nameMatch = lead.name?.toLowerCase().includes(query) ?? false;
    const phoneMatch = lead.phone?.toLowerCase().includes(query) ?? false;
    return nameMatch || phoneMatch;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-transparent">
      {/* Header Panel */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 shrink-0 px-1">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Telecalling Dashboard
            <span className="live-dot" />
          </h1>
          <p className="font-body text-sm text-slate-500 mt-0.5">Premium Outreach Workspace & Lead attribution cockpit</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCSV}
            disabled={exporting || myLeads.length === 0}
            className="flex items-center gap-2 px-4.5 py-2.5 bg-white border border-slate-200/80 rounded-2xl font-label text-xs font-bold hover:bg-slate-50 transition-all text-slate-700 shadow-sm hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
            title="Download CSV of all assigned leads with attribution details"
          >
            {exporting ? <RefreshCw size={14} className="animate-spin text-indigo-600" /> : <Download size={14} />}
            Export Leads CSV
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifDropdown((v) => !v)}
              className="relative p-2.5 bg-white border border-slate-200/80 rounded-2xl hover:bg-slate-50 hover:border-indigo-500 transition-all shadow-sm"
              title="Scheduled callback reminders"
            >
              <Bell size={16} className="text-slate-600" />
              {todayCallbacks.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-rose-500 to-pink-600 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
                  {todayCallbacks.length}
                </span>
              )}
            </button>
            {showNotifDropdown && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200/80 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="font-display text-xs font-black text-slate-800 uppercase tracking-wider">Due Callbacks</span>
                  <button onClick={() => setShowNotifDropdown(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/50 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {todayCallbacks.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-400">No pending callbacks</div>
                  ) : (
                    todayCallbacks.map((cb) => (
                      <div key={cb.id} className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-sm font-bold text-slate-800 truncate">{cb.lead.name ?? "Unnamed"}</p>
                          <p className="font-label text-[10px] text-slate-400">{cb.lead.phone} · {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <button
                          onClick={() => { setSelectedLeadId(cb.lead.id); setShowNotifDropdown(false); }}
                          className="shrink-0 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-label text-[10px] font-bold hover:bg-indigo-700 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleMyStatus}
            disabled={togglingStatus}
            className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl font-label text-xs font-bold transition-all shadow-sm ${
              myStatus === "active"
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/10"
                : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-amber-500/10"
            } ${togglingStatus ? "opacity-60 cursor-not-allowed" : ""} hover:scale-[1.02] active:scale-[0.98]`}
          >
            <span className={`w-2 h-2 rounded-full bg-white ${myStatus === "active" ? "animate-pulse" : ""}`} />
            {myStatus === "active" ? "Active Queue" : "On Break"}
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 pb-4">
        {/* Left Side: Lead List & Callbacks (5/12 columns) */}
        <div className="col-span-5 flex flex-col gap-5 min-h-0 overflow-y-auto pr-1">
          {/* Callbacks Card */}
          {(todayCallbacks.length > 0 || completedCallbacks.length > 0) && (
            <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-100/70 rounded-3xl shrink-0 shadow-sm">
              <h2 className="font-display text-xs font-black text-amber-800 mb-3 flex items-center gap-2 tracking-widest uppercase">
                <Clock size={13} className="text-amber-600 animate-pulse" /> Today&apos;s Scheduled Callbacks ({todayCallbacks.length})
              </h2>
              {todayCallbacks.length > 0 && (
                <div className="space-y-2 mb-3">
                  {todayCallbacks.map((cb) => (
                    <div
                      key={cb.id}
                      onClick={() => setSelectedLeadId(cb.lead.id)}
                      className={`flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border transition-all cursor-pointer hover:border-amber-400 ${
                        selectedLeadId === cb.lead.id ? "ring-2 ring-amber-400 border-transparent shadow-md" : "border-slate-100"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-slate-800 truncate">{cb.lead.name ?? "Unnamed"}</p>
                          <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 font-bold px-2 py-0.5 rounded-full">
                            {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{cb.lead.phone}</p>
                        {cb.message_preview && (
                          <p className="text-[11px] text-amber-900 line-clamp-1 mt-1.5 bg-amber-50/60 border border-amber-100/50 px-2.5 py-1 rounded-lg">
                            {cb.message_preview}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkDone(cb.id);
                        }}
                        className="ml-3 text-xs px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-bold hover:shadow-md transition-all shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Resolve
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Completed Section */}
              {completedCallbacks.length > 0 && (
                <div className="border-t border-amber-100/60 pt-3 mt-3">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-amber-800 font-bold hover:text-amber-950 transition-colors"
                  >
                    <ChevronDown size={12} className={`transition-transform duration-200 ${showCompleted ? "rotate-180" : ""}`} />
                    Completed Today ({completedCallbacks.length})
                  </button>
                  {showCompleted && (
                    <div className="space-y-2 mt-2.5">
                      {completedCallbacks.map((cb) => (
                        <div key={cb.id} className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-2xl px-4 py-2.5 opacity-80 border border-emerald-100/80">
                          <div>
                            <p className="font-semibold text-sm line-through text-slate-500">{cb.lead.name ?? "Unnamed"}</p>
                            <p className="text-xs text-slate-400">
                              {cb.lead.phone} · {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">✓ Done</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lead List Card */}
          <div className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 flex flex-col min-h-0">
            <div className="flex flex-col gap-3 mb-5 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
                  🎯 Assigned Queue
                  {myLeads.length > 0 && (
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-label text-xs font-bold">{myLeads.length}</span>
                  )}
                </h2>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search leads by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-body focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent transition-all shadow-inner"
                />
              </div>
            </div>

            {myLeads.length === 0 ? (
              <div className="text-center py-12 flex-1 flex flex-col justify-center items-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 border border-slate-100 mb-3">
                  <Inbox size={18} />
                </div>
                <p className="font-body text-sm font-semibold text-slate-500">No leads assigned to you</p>
                <p className="font-label text-xs text-slate-400 mt-1">Queue automations will route hot leads as they arrive.</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12 flex-1 flex flex-col justify-center items-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 border border-slate-100 mb-3">
                  <Inbox size={18} />
                </div>
                <p className="font-body text-sm font-semibold text-slate-500">No matching leads found</p>
                <p className="font-label text-xs text-slate-400 mt-1">Try adjusting your search query above.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {filteredLeads.map((lead) => {
                  // Left border accent logic depending on score/hotness
                  let borderAccent = "border-l-slate-300";
                  if (lead.score >= 8) {
                    borderAccent = "border-l-rose-500";
                  } else if (lead.score >= 6) {
                    borderAccent = "border-l-amber-500";
                  } else if (lead.score >= 4) {
                    borderAccent = "border-l-indigo-400";
                  }

                  const isSelected = selectedLeadId === lead.id;

                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`rounded-2xl border-y border-r border-l-4 transition-all duration-200 cursor-pointer p-4 flex items-center justify-between gap-3 ${borderAccent} ${
                        isSelected
                          ? "bg-gradient-to-r from-indigo-50/80 to-purple-50/30 border-indigo-200 shadow-[0_4px_15px_rgba(99,102,241,0.08)] ring-1 ring-indigo-500/10 translate-x-1"
                          : "bg-slate-50/30 border-slate-150 hover:bg-slate-50 hover:shadow-sm hover:-translate-y-0.5"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body text-sm font-bold text-slate-800 truncate">
                            {lead.name || formatPhone(lead.phone)}
                          </p>
                          {lead.score >= 7 && (
                            <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded font-label text-[9px] font-black uppercase tracking-wider">HOT</span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded font-label text-[9px] font-black ${
                            lead.segment === "A" ? "bg-emerald-50 text-emerald-700" :
                            lead.segment === "B" ? "bg-blue-50 text-blue-700" :
                            lead.segment === "C" ? "bg-amber-50 text-amber-700" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            SEG {lead.segment}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <p className="font-label text-xs text-slate-500">
                            {lead.name ? formatPhone(lead.phone) + " · " : ""}Score {lead.score}
                          </p>
                        </div>
                        {lastCalledMap[lead.id] && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                            <Clock size={10} />
                            <span>Called {timeAgo(lastCalledMap[lead.id])}</span>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRelease(lead.id);
                        }}
                        disabled={releasingLead === lead.id}
                        title="Release / Mark Lead as Resolved"
                        className={`p-2 rounded-xl transition-all border shrink-0 hover:shadow-sm ${
                          confirmRelease === lead.id
                            ? "bg-red-50 text-red-600 border-red-300 font-bold text-[10px] px-2.5 py-1"
                            : "hover:bg-white text-slate-400 border-transparent hover:border-slate-200"
                        }`}
                      >
                        {releasingLead === lead.id ? (
                          <RefreshCw size={13} className="animate-spin text-red-600" />
                        ) : confirmRelease === lead.id ? (
                          "Confirm?"
                        ) : (
                          <CheckCheck size={14} className="hover:text-emerald-600" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Dial Offline Widget */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/60 shadow-sm shrink-0">
            <h3 className="font-display text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Phone size={14} className="text-indigo-500" /> Quick Dial Offline
            </h3>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="e.g. +919942497199"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manualDial()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-body text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
              />
              <button
                onClick={manualDial}
                disabled={manualDialing || !manualPhone.trim()}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-label text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shrink-0 hover:scale-[1.01] active:scale-[0.99]"
              >
                {manualDialing ? <RefreshCw size={14} className="animate-spin" /> : "Dial"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Profile Page (7/12 columns) */}
        <div className="col-span-7 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
          {activeCallCtx && (
            <div className="p-4 border-b border-slate-100 shrink-0 bg-slate-50">
              <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />
            </div>
          )}

          {!selectedLeadId ? (
            // Empty State
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gradient-to-br from-slate-50/40 to-indigo-50/10">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-indigo-400/5 blur-2xl rounded-full scale-150 animate-pulse" />
                <div className="relative p-6 rounded-3xl bg-white border border-slate-150 shadow-md text-indigo-500">
                  <Sparkles size={38} className="text-indigo-500" />
                </div>
              </div>
              <h3 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">Lead Profile Workspace</h3>
              <p className="font-body text-sm text-slate-500 max-w-md mt-2 leading-relaxed">
                Choose a lead from your active queue on the left to review campaign source attribution details, previous calls history, and log feedback notes.
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-xs">
                <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Queue</span>
                  <span className="text-xl font-bold text-slate-800 mt-1 block">{myLeads.length}</span>
                </div>
                <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today Callbacks</span>
                  <span className="text-xl font-bold text-slate-800 mt-1 block">{todayCallbacks.length}</span>
                </div>
              </div>
            </div>
          ) : selectedLeadLoading ? (
            // Loading State
            <div className="flex-1 flex flex-col items-center justify-center">
              <RefreshCw size={32} className="animate-spin text-indigo-500 mb-2" />
              <p className="font-body text-sm text-slate-400 font-medium">Fetching lead attribution profile...</p>
            </div>
          ) : selectedLead ? (
            // Lead Profile View
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/20">
              {/* Premium Gradient Header Card */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white p-6 relative overflow-hidden shrink-0 shadow-md">
                <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient from-indigo-500/10 to-transparent pointer-events-none" />
                
                <div className="flex justify-between items-center gap-4 relative z-10">
                  <div className="flex gap-4 items-center min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-display text-2xl font-bold text-white shadow-inner shrink-0">
                      {selectedLead.name ? selectedLead.name.charAt(0).toUpperCase() : <User size={22} />}
                    </div>
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="font-display text-2xl font-extrabold tracking-tight truncate">
                          {selectedLead.name || "Unnamed Lead"}
                        </h2>
                        {selectedLead.score >= 7 && (
                          <span className="px-2 py-0.5 bg-rose-500 text-rose-50 border border-rose-600/30 rounded-md font-label text-[9px] font-black uppercase tracking-wider shadow-sm">HOT</span>
                        )}
                        <span className="px-2 py-0.5 bg-indigo-500/50 text-indigo-100 border border-indigo-500/20 rounded-md font-label text-[9px] font-black uppercase tracking-wider">
                          SEG {selectedLead.segment}
                        </span>
                      </div>
                      
                      <p className="text-slate-300 font-label text-sm mt-1.5 tracking-wide flex items-center gap-1.5">
                        <span className="font-bold text-white">{formatPhone(selectedLead.phone)}</span>
                        <span className="text-slate-500">•</span>
                        <span>Score: {selectedLead.score}/10</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRelease(selectedLead.id)}
                      className={`px-4 py-2.5 rounded-2xl border font-label text-xs font-bold transition-all text-slate-300 hover:text-white ${
                        confirmRelease === selectedLead.id
                          ? "bg-red-600 border-red-500 text-white font-bold animate-pulse"
                          : "border-slate-700/60 bg-slate-900/60 hover:bg-slate-900"
                      }`}
                    >
                      {confirmRelease === selectedLead.id ? "Release?" : "Release Lead"}
                    </button>
                    <button
                      onClick={() => executeDial(selectedLead.id, selectedLead)}
                      disabled={dialing === selectedLead.id}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-label text-sm font-extrabold shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                      <Phone size={14} className="fill-white" />
                      {dialing === selectedLead.id ? "Dialing…" : "Call Lead"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Profile Details Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Assignment Info Widget */}
                <div className="bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm flex items-center gap-3.5">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="font-label text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Telecaller Queue Assignment Time</p>
                    <p className="font-body text-sm font-bold text-slate-800 mt-0.5">
                      {selectedLead.assigned_at 
                        ? new Date(selectedLead.assigned_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
                        : "Prior to tracking (unmarked)"}
                    </p>
                  </div>
                </div>

                {/* 2. Marketing Attribution Grid (Outbound vs Inbound Visual Cues) */}
                {selectedLead.broadcast_id || selectedLead.template_name ? (
                  // Outbound Lead Card
                  <div className="bg-gradient-to-br from-purple-50/50 to-indigo-50/30 border border-purple-100 rounded-3xl p-6 shadow-sm">
                    <h3 className="font-display text-xs font-black text-purple-800 mb-4 flex items-center gap-2 tracking-widest uppercase">
                      <Target size={14} className="text-purple-600 animate-pulse" /> Outbound Campaign Attribution
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/80 backdrop-blur-sm border border-purple-100/60 rounded-2xl p-4 relative shadow-sm hover:shadow-md transition-shadow">
                        <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Broadcast Campaign ID</span>
                        <p className="font-mono text-xs text-slate-800 font-bold mt-1.5 truncate pr-8 select-all">
                          {selectedLead.broadcast_id || "None"}
                        </p>
                        {selectedLead.broadcast_id && (
                          <button 
                            onClick={() => copyToClipboard(selectedLead.broadcast_id || "", "Broadcast ID")}
                            className="absolute right-3.5 bottom-3.5 p-1.5 text-purple-400 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-all"
                            title="Copy Broadcast ID"
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </div>

                      <div className="bg-white/80 backdrop-blur-sm border border-purple-100/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Message Template</span>
                        <p className="font-body text-sm text-slate-800 font-extrabold mt-1.5 truncate">
                          {selectedLead.template_name || "N/A"}
                        </p>
                      </div>
                    </div>

                    {selectedLead.tag_name && (
                      <div className="mt-4 bg-white/80 backdrop-blur-sm border border-purple-100/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                          <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Campaign Tag</span>
                          <span className="flex items-center gap-1.5 mt-1.5 text-sm font-extrabold text-purple-700">
                            <Tag size={12} className="text-purple-500" />
                            {selectedLead.tag_name}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Inbound Lead Card
                  <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border border-emerald-100 rounded-3xl p-6 shadow-sm">
                    <h3 className="font-display text-xs font-black text-emerald-800 mb-4 flex items-center gap-2 tracking-widest uppercase">
                      <Target size={14} className="text-emerald-600 animate-pulse" /> Inbound Lead Attribution
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/80 backdrop-blur-sm border border-emerald-100/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <span className="font-label text-[10px] text-emerald-700/60 uppercase font-extrabold tracking-wider block">Paid Ad Campaign</span>
                        <p className="font-body text-sm text-slate-800 font-extrabold mt-1.5 truncate">
                          {selectedLead.ad_campaign_name || "Organic Traffic"}
                        </p>
                      </div>

                      <div className="bg-white/80 backdrop-blur-sm border border-emerald-100/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <span className="font-label text-[10px] text-emerald-700/60 uppercase font-extrabold tracking-wider block">Lead Source Channel</span>
                        <p className="font-body text-sm text-slate-800 font-extrabold mt-1.5 capitalize flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                          {selectedLead.channel || selectedLead.source || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Notes & Facts History (Timeline Style) */}
                <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display text-xs font-black text-slate-800 flex items-center gap-2 tracking-widest uppercase">
                      <StickyNote size={14} className="text-indigo-500" /> Interaction Logs & History
                    </h3>
                    {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 && (
                      <button
                        onClick={() => setHistoryLead(selectedLead)}
                        className="text-xs text-indigo-600 font-bold hover:underline"
                      >
                        See All ({selectedLeadNotes.notes.length})
                      </button>
                    )}
                  </div>

                  {/* Pinned Facts card */}
                  {selectedLeadNotes?.pinned && selectedLeadNotes.pinned.length > 0 && (
                    <div className="mb-5 space-y-2">
                      <p className="font-label text-[9px] text-slate-400 uppercase tracking-widest font-extrabold">📌 Pinned Core Facts</p>
                      <div className="grid grid-cols-1 gap-2">
                        {selectedLeadNotes.pinned.map((n) => (
                          <div key={n.id} className="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl">
                            <p className="font-body text-xs text-slate-700 leading-relaxed font-semibold">{n.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes timeline list */}
                  <div className="space-y-4">
                    <p className="font-label text-[9px] text-slate-400 uppercase tracking-widest font-extrabold">📅 Recent Timeline</p>
                    {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 ? (
                      <div className="relative border-l border-slate-100 pl-4.5 ml-2.5 space-y-5">
                        {selectedLeadNotes.notes.slice(0, 3).map((n) => (
                          <div key={n.id} className="relative">
                            {/* Dot icon */}
                            <span className="absolute -left-[23.5px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-white ring-4 ring-white" />
                            
                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-1">
                              <span>{timeAgo(n.created_at)}</span>
                              {n.is_pinned && <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-black text-[8px]">PINNED</span>}
                            </div>
                            <p className="font-body text-xs text-slate-650 bg-slate-50/80 border border-slate-100 p-3.5 rounded-2xl leading-relaxed">
                              {n.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 bg-slate-50/60 border border-slate-100 text-center rounded-2xl text-xs text-slate-400">
                        No previous interactions logged for this lead.
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Notes & Schedule */}
                <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                  <h3 className="font-display text-xs font-black text-slate-800 mb-3 uppercase tracking-widest flex items-center gap-2">
                    <StickyNote size={14} className="text-indigo-500" /> Notes &amp; Schedule
                  </h3>
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={quickNoteContent}
                      onChange={(e) => setQuickNoteContent(e.target.value)}
                      placeholder="Write brief outcome summary of the call (e.g. Call connected, wants a callback tomorrow at 5 PM)..."
                      rows={3}
                      className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 font-body text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent transition-all resize-none shadow-inner"
                    />

                    {/* Schedule Callback Section */}
                    <div className="border-t border-slate-100 pt-3">
                      <button
                        onClick={() => setSchedReminder((v) => !v)}
                        className={`flex items-center gap-2 text-xs font-bold transition-colors ${
                          schedReminder ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <div className={`w-8 h-[18px] rounded-full relative transition-colors ${
                          schedReminder ? "bg-indigo-600" : "bg-slate-200"
                        }`}>
                          <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all ${
                            schedReminder ? "left-[15px]" : "left-[2px]"
                          }`} />
                        </div>
                        <Calendar size={12} />
                        Set Callback Reminder
                      </button>

                      {schedReminder && (
                        <div className="mt-3 flex items-end gap-2">
                          <div className="flex-1">
                            <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Date</label>
                            <input
                              type="date"
                              value={schedDate}
                              onChange={(e) => setSchedDate(e.target.value)}
                              min={new Date().toISOString().split("T")[0]}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Time</label>
                            <input
                              type="time"
                              value={schedTime}
                              onChange={(e) => setSchedTime(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                            />
                          </div>
                          <button
                            onClick={() => handleScheduleCallback(selectedLead.id)}
                            disabled={scheduleSaving || !schedDate || !schedTime}
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-label text-xs font-bold hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all shadow-sm hover:scale-[1.01] active:scale-[0.99] shrink-0"
                          >
                            {scheduleSaving ? <RefreshCw size={12} className="animate-spin" /> : "Schedule"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => saveQuickNote(selectedLead.id)}
                        disabled={quickNoteSaving || !quickNoteContent.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-label text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md hover:shadow-indigo-500/10"
                      >
                        {quickNoteSaving ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        <span>Save Interaction Note</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Notes History Modal */}
      {historyLead && (
        <NotesHistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />
      )}
    </div>
  );
}
