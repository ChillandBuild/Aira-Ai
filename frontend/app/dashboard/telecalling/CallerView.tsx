"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import { Phone, RefreshCw, ChevronDown, StickyNote, Check, CheckCheck, Download, Calendar, Tag, Target, Inbox, Copy, User, Sparkles, Search, Clock, AlertCircle } from "lucide-react";
import { api, Caller, Lead, CallLog } from "@/lib/api";
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
  const [selectedCallbackJobId, setSelectedCallbackJobId] = useState<string | null>(null);

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

  // modals
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const { activeCall: activeCallCtx, setActiveCall: setActiveCallCtx } = useActiveCall();

  // Accidental-dial Guard
  const [dialCountdown, setDialCountdown] = useState<number | null>(null);
  const [dialTarget, setDialTarget] = useState<{ leadId?: string; lead?: Lead; phone?: string } | null>(null);

  // Live Call Card & Polling
  const [callDuration, setCallDuration] = useState<number>(0);
  const [callStatus, setCallStatus] = useState<"ringing" | "connected" | "ended" | null>(null);

  // Mandatory Wrap-up Form
  const [showWrapupModal, setShowWrapupModal] = useState(false);
  const [wrapupOutcome, setWrapupOutcome] = useState<string>("");
  const [wrapupNotes, setWrapupNotes] = useState<string>("");
  const [wrapupCallbackTime, setWrapupCallbackTime] = useState<string>("");
  const [wrapupSaving, setWrapupSaving] = useState(false);

  // Blocking Pending-Wrapups list
  const [pendingWrapups, setPendingWrapups] = useState<CallLog[]>([]);

  // Call Next
  const [dialingNext, setDialingNext] = useState(false);

  // Completed Today Tab Switcher
  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");
  const [queueSubTab, setQueueSubTab] = useState<"new" | "callback" | "in_progress" | "closed">("new");
  const [myCallsTodayList, setMyCallsTodayList] = useState<CallLog[]>([]);
  const [loadingCallsToday, setLoadingCallsToday] = useState(false);

  // Performance Widget
  const [performance, setPerformance] = useState<{ target: number; achieved: number }>({ target: 50, achieved: 0 });

  // Live Script Panel
  const [telecallingConfig, setTelecallingConfig] = useState<{ scripts?: Record<string, string> } | null>(null);
  const [scriptExpanded, setScriptExpanded] = useState(true);

  // snooze action
  const snoozeCallback = async (jobId: string, minutes: number) => {
    const now = new Date();
    const snoozeTime = new Date(now.getTime() + minutes * 60 * 1000);
    try {
      await api.followUps.rescheduleCallback(jobId, snoozeTime.toISOString());
      toast.success(`Callback snoozed for ${minutes === 1440 ? "tomorrow" : minutes + " minutes"}`);
      loadCallbacks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to snooze callback");
    }
  };

  const loadCallbacks = useCallback(() => {
    fetchTodayCallbacks().then(setTodayCallbacks).catch(() => {});
    fetchTodayCompletedCallbacks().then(setCompletedCallbacks).catch(() => {});
  }, []);

  const loadPerformance = useCallback(async () => {
    try {
      const perf = await api.callers.myPerformance();
      setPerformance(perf);
    } catch (err) {
      console.error("Failed to load performance:", err);
    }
  }, []);

  const loadPendingWrapups = useCallback(async () => {
    try {
      const wrapups = await api.calls.getPendingWrapups();
      setPendingWrapups(wrapups);
    } catch (err) {
      console.error("Failed to load pending wrapups:", err);
    }
  }, []);

  const loadMyCallsToday = useCallback(async () => {
    setLoadingCallsToday(true);
    try {
      const list = await api.callers.myCallsToday();
      setMyCallsTodayList(list);
    } catch (err) {
      console.error("Failed to load my calls today:", err);
    } finally {
      setLoadingCallsToday(false);
    }
  }, []);

  const loadTelecallingConfig = useCallback(async () => {
    try {
      const config = await api.settings.getTelecallingConfig();
      setTelecallingConfig(config);
    } catch (err) {
      console.error("Failed to load telecalling config:", err);
    }
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
      loadPerformance();
      loadPendingWrapups();
      loadTelecallingConfig();
      if (activeTab === "completed") {
        loadMyCallsToday();
      }
    } catch (err) {
      console.error("CallerView load error:", err);
    }
  }, [callerId, loadCallbacks, loadPerformance, loadPendingWrapups, loadTelecallingConfig, activeTab, loadMyCallsToday]);

  useEffect(() => { loadData(); }, [loadData]);

  // auto-refresh callbacks every 5 minutes
  usePolling(loadCallbacks, 5 * 60 * 1000);

  // Accidental-dial countdown effect
  useEffect(() => {
    if (dialCountdown === null) return;
    if (dialCountdown === 0) {
      if (dialTarget) {
        if (dialTarget.leadId && dialTarget.lead) {
          executeDial(dialTarget.leadId, dialTarget.lead);
        } else if (dialTarget.phone) {
          executeManualDial(dialTarget.phone);
        }
      }
      setDialCountdown(null);
      setDialTarget(null);
      return;
    }
    const timer = setTimeout(() => {
      setDialCountdown(dialCountdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
    // executeDial/executeManualDial intentionally omitted: the countdown fires
    // the dial for the dialTarget captured when it started; including them would
    // reset the timer on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialCountdown, dialTarget]);

  // Active call status polling
  useEffect(() => {
    if (!activeCallCtx || !activeCallCtx.callLogId) {
      setCallStatus(null);
      setCallDuration(0);
      return;
    }

    setCallStatus("ringing");
    setCallDuration(0);

    const pollInterval = setInterval(async () => {
      try {
        const log = await api.calls.getLog(activeCallCtx.callLogId!);
        if (log.status === "completed") {
          setCallStatus("ended");
          setShowWrapupModal(true);
          clearInterval(pollInterval);
        } else if (log.status === "no_answer" || log.status === "failed") {
          setCallStatus("ended");
          setActiveCallCtx(null);
          clearInterval(pollInterval);
          loadData();
        } else if (log.status === "initiated") {
          setCallStatus((cur) => (cur === "ringing" ? "connected" : cur));
        }
      } catch (err) {
        console.error("Error polling call log:", err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [activeCallCtx, loadData, setActiveCallCtx]);

  // Call duration timer
  useEffect(() => {
    if (callStatus !== "connected") return;
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callStatus]);

  // Fetch full details when lead is selected
  useEffect(() => {
    if (!selectedLeadId) {
      setSelectedLead(null);
      setSelectedLeadNotes(null);
      setSelectedCallbackJobId(null);
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

  // Auto-link pending callback job for selected lead
  useEffect(() => {
    if (selectedLeadId && todayCallbacks.length > 0) {
      const cb = todayCallbacks.find((c) => c.lead.id === selectedLeadId && c.status === "pending");
      if (cb) {
        setSelectedCallbackJobId(cb.id);
      } else {
        setSelectedCallbackJobId(null);
      }
    } else {
      setSelectedCallbackJobId(null);
    }
  }, [selectedLeadId, todayCallbacks]);

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
      const res = await api.calls.initiate({ leadId, callbackJobId: selectedCallbackJobId ?? undefined }, myCaller.id);
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

  async function executeManualDial(phone: string) {
    if (!myCaller) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone }, myCaller.id);
      setActiveCallCtx({
        leadId: res.lead_id ?? null,
        name: res.lead_name ?? null,
        phone,
        callLogId: res.call_log_id ?? null
      });
      setManualPhone("");
      toast.success(`Calling ${phone}...`);
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

  const dialWithGuard = (leadId: string, lead: Lead) => {
    if (dialCountdown !== null) return;
    setDialTarget({ leadId, lead });
    setDialCountdown(3);
  };

  const manualDialWithGuard = () => {
    if (dialCountdown !== null || !manualPhone.trim()) return;
    setDialTarget({ phone: manualPhone.trim() });
    setDialCountdown(3);
  };

  const handleCallNext = async () => {
    if (!myCaller) {
      toast.error("Caller profile not found");
      return;
    }
    setDialingNext(true);
    try {
      const nextLd = await api.calls.nextLead(myCaller.id);
      toast.success(`Found next lead: ${nextLd.name || nextLd.phone}. Preparing to dial...`);
      setDialTarget({ leadId: nextLd.id, lead: nextLd });
      setDialCountdown(3);
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      if (errorObj?.status === 404) {
        toast.error("No leads available in queue");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to fetch next lead");
      }
    } finally {
      setDialingNext(false);
    }
  };

  const handleWrapupSubmit = async () => {
    if (!activeCallCtx || !activeCallCtx.callLogId) return;
    if (!wrapupOutcome) {
      toast.error("Outcome is required");
      return;
    }
    if (wrapupOutcome === "callback" && !wrapupCallbackTime) {
      toast.error("Callback time is required");
      return;
    }
    setWrapupSaving(true);
    try {
      await api.calls.setOutcome(
        activeCallCtx.callLogId,
        wrapupOutcome as NonNullable<CallLog["outcome"]>,
        {
          callbackTime: wrapupCallbackTime ? new Date(wrapupCallbackTime).toISOString() : undefined,
          notes: wrapupNotes.trim() || undefined,
        }
      );

      if (wrapupOutcome === "converted" && activeCallCtx.leadId) {
        await api.leads.convert(activeCallCtx.leadId, wrapupNotes);
      } else if (wrapupOutcome !== "converted" && activeCallCtx.leadId && wrapupNotes.trim()) {
        await saveNote(activeCallCtx.leadId, wrapupNotes, false);
      }

      toast.success("Wrap-up completed");
      setShowWrapupModal(false);
      setWrapupOutcome("");
      setWrapupNotes("");
      setWrapupCallbackTime("");
      setActiveCallCtx(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit wrap-up");
    } finally {
      setWrapupSaving(false);
    }
  };

  const filteredLeads = myLeads.filter((lead) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const nameMatch = lead.name?.toLowerCase().includes(query) ?? false;
    const phoneMatch = lead.phone?.toLowerCase().includes(query) ?? false;
    return nameMatch || phoneMatch;
  });

  const newLeads = filteredLeads.filter((l) => !l.call_status || l.call_status === "new");
  const callbackLeads = filteredLeads.filter((l) => l.call_status === "callback");
  const inProgressLeads = filteredLeads.filter((l) => l.call_status === "in_progress");
  const closedLeads = filteredLeads.filter((l) => l.call_status && ["converted", "not_interested", "dnc", "unreachable"].includes(l.call_status));

  const activeSubTabLeads =
    queueSubTab === "new" ? newLeads :
    queueSubTab === "callback" ? callbackLeads :
    queueSubTab === "in_progress" ? inProgressLeads :
    closedLeads;

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
          {/* Performance Widget */}
          <div className="p-5 bg-white border border-slate-200/60 rounded-3xl shrink-0 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase flex items-center gap-1.5">
                <Target size={13} className="text-indigo-600" /> Daily Target Performance
              </h3>
              <span className="font-label text-xs font-bold text-slate-500">
                {performance.achieved} / {performance.target} Calls
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3.5 relative overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, performance.target > 0 ? (performance.achieved / performance.target) * 100 : 0)}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2.5">
              <p className="text-[11px] text-slate-400 font-medium">
                {performance.target > 0 ? Math.round((performance.achieved / performance.target) * 100) : 0}% achieved
              </p>
              {performance.achieved >= performance.target && (
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                  🎉 Target Met!
                </span>
              )}
            </div>
          </div>

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
                      <div className="flex flex-col gap-2 ml-3 shrink-0 items-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkDone(cb.id);
                          }}
                          className="text-xs px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-bold hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          Resolve
                        </button>
                        
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeCallback(cb.id, 15); }}
                            className="text-[9px] bg-white border border-slate-200 px-1.5 py-1 rounded-md text-slate-650 hover:bg-slate-50 hover:border-indigo-500 font-bold transition-all"
                            title="Snooze 15 minutes"
                          >
                            +15m
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeCallback(cb.id, 60); }}
                            className="text-[9px] bg-white border border-slate-200 px-1.5 py-1 rounded-md text-slate-650 hover:bg-slate-50 hover:border-indigo-500 font-bold transition-all"
                            title="Snooze 1 hour"
                          >
                            +1h
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeCallback(cb.id, 1440); }}
                            className="text-[9px] bg-white border border-slate-200 px-1.5 py-1 rounded-md text-slate-650 hover:bg-slate-50 hover:border-indigo-500 font-bold transition-all"
                            title="Snooze to Tomorrow"
                          >
                            Tom.
                          </button>
                        </div>
                      </div>
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
            {/* Tab switcher */}
            <div className="flex border-b border-slate-100 mb-4 shrink-0">
              <button
                onClick={() => setActiveTab("queue")}
                className={`flex-1 py-2 font-display text-xs font-black tracking-wider uppercase border-b-2 text-center transition-all ${
                  activeTab === "queue"
                    ? "border-indigo-600 text-indigo-700 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                Queue ({myLeads.filter((l) => !l.call_status || !["converted", "not_interested", "dnc", "unreachable"].includes(l.call_status)).length})
              </button>
              <button
                onClick={() => setActiveTab("completed")}
                className={`flex-1 py-2 font-display text-xs font-black tracking-wider uppercase border-b-2 text-center transition-all ${
                  activeTab === "completed"
                    ? "border-indigo-600 text-indigo-700 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                Completed Today ({myCallsTodayList.length})
              </button>
            </div>

            {activeTab === "queue" ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex flex-col gap-3 mb-5 shrink-0">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
                      🎯 Assigned Queue
                    </h2>
                    <button
                      onClick={handleCallNext}
                      disabled={dialingNext || myStatus !== "active"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-label text-xs font-bold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      title="Call next hot lead in queue"
                    >
                      {dialingNext ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Call Next
                    </button>
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
                  {/* Secondary calling status sub-tabs */}
                  <div className="flex gap-1.5 p-1 bg-slate-100/80 rounded-2xl shrink-0 mt-2">
                    <button
                      onClick={() => setQueueSubTab("new")}
                      className={`flex-1 py-1.5 px-2 rounded-xl font-label text-[10px] font-bold text-center transition-all ${
                        queueSubTab === "new"
                          ? "bg-white text-indigo-700 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      To Call ({newLeads.length})
                    </button>
                    <button
                      onClick={() => setQueueSubTab("callback")}
                      className={`flex-1 py-1.5 px-2 rounded-xl font-label text-[10px] font-bold text-center transition-all ${
                        queueSubTab === "callback"
                          ? "bg-white text-indigo-700 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Callbacks ({callbackLeads.length})
                    </button>
                    <button
                      onClick={() => setQueueSubTab("in_progress")}
                      className={`flex-1 py-1.5 px-2 rounded-xl font-label text-[10px] font-bold text-center transition-all ${
                        queueSubTab === "in_progress"
                          ? "bg-white text-indigo-700 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      In Progress ({inProgressLeads.length})
                    </button>
                    <button
                      onClick={() => setQueueSubTab("closed")}
                      className={`flex-1 py-1.5 px-2 rounded-xl font-label text-[10px] font-bold text-center transition-all ${
                        queueSubTab === "closed"
                          ? "bg-white text-indigo-700 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Closed ({closedLeads.length})
                    </button>
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
                ) : activeSubTabLeads.length === 0 ? (
                  <div className="text-center py-12 flex-1 flex flex-col justify-center items-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 border border-slate-100 mb-3">
                      <Inbox size={18} />
                    </div>
                    <p className="font-body text-sm font-semibold text-slate-500">No matching leads found</p>
                    <p className="font-label text-xs text-slate-400 mt-1">Try switching tabs or adjusting your search query.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {activeSubTabLeads.map((lead) => {
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
                              {lead.call_status && lead.call_status !== "new" && (
                                <span className={`px-1.5 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                                  lead.call_status === "converted" ? "bg-emerald-100 text-emerald-800" :
                                  lead.call_status === "dnc" ? "bg-red-100 text-red-800" :
                                  lead.call_status === "unreachable" ? "bg-rose-100 text-rose-800" :
                                  lead.call_status === "callback" ? "bg-amber-100 text-amber-800" :
                                  "bg-indigo-100 text-indigo-850"
                                }`}>
                                  {lead.call_status}
                                </span>
                              )}
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
            ) : (
              // Completed Today list
              <div className="flex-1 flex flex-col min-h-0">
                {loadingCallsToday ? (
                  <div className="text-center py-12 flex-1 flex flex-col justify-center items-center">
                    <RefreshCw size={18} className="animate-spin text-slate-400 mb-2" />
                    <p className="font-body text-xs text-slate-400">Loading completed calls...</p>
                  </div>
                ) : myCallsTodayList.length === 0 ? (
                  <div className="text-center py-12 flex-1 flex flex-col justify-center items-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-450 border border-slate-100 mb-3">
                      <Phone size={18} />
                    </div>
                    <p className="font-body text-sm font-semibold text-slate-500">No calls completed today</p>
                    <p className="font-label text-xs text-slate-400 mt-1">Completed calls with feedback will list here.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {myCallsTodayList.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-slate-150 bg-slate-50/20 p-4 flex items-center justify-between gap-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-sm font-bold text-slate-800 truncate">
                            {log.leads?.name || formatPhone(log.leads?.phone || "")}
                          </p>
                          <p className="font-label text-xs text-slate-500 mt-1">
                            Duration: {log.duration_seconds || 0}s · {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <div className="flex gap-2 mt-1.5 flex-wrap">
                            {log.disposition && (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-650 border border-slate-200 rounded font-label text-[9px] font-bold">
                                {log.disposition}
                              </span>
                            )}
                            {log.outcome && (
                              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded font-label text-[9px] font-bold">
                                Outcome: {log.outcome}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                onKeyDown={(e) => e.key === "Enter" && manualDialWithGuard()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-body text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
              />
              <button
                onClick={manualDialWithGuard}
                disabled={manualDialing || !manualPhone.trim()}
                className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-label text-xs font-bold transition-all shadow-md shrink-0 hover:scale-[1.01] active:scale-[0.99]"
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
              {/* Custom Live Call Card */}
              <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-indigo-900 to-slate-900 text-white shrink-0 rounded-2xl mb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3.5 bg-indigo-500/20 text-indigo-300 rounded-2xl ${callStatus === "ringing" ? "animate-pulse" : ""}`}>
                      <Phone size={20} className={callStatus === "ringing" ? "animate-bounce" : ""} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-sm tracking-wide uppercase text-indigo-300">
                          {callStatus === "ringing" ? "Ringing..." : callStatus === "connected" ? "Connected" : "Ended"}
                        </span>
                        {callStatus === "connected" && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                        )}
                      </div>
                      <h4 className="font-display font-extrabold text-lg mt-0.5">
                        {activeCallCtx.name || "Offline Call"}
                      </h4>
                      <p className="font-mono text-xs text-slate-400 mt-0.5">{formatPhone(activeCallCtx.phone || "")}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {callStatus === "connected" && (
                      <div className="bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/50 font-mono text-sm font-bold text-emerald-400">
                        {Math.floor(callDuration / 60).toString().padStart(2, '0')}:
                        {(callDuration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-[11px] text-slate-450 italic">
                        Hint: Reject on your phone to cancel/hang up this call.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
                      onClick={() => dialWithGuard(selectedLead.id, selectedLead)}
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
                
                {/* Live Pitch Script Card */}
                {selectedLead && telecallingConfig?.scripts?.[selectedLead.segment] && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-150 rounded-3xl p-5 shadow-sm shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-xs font-black text-indigo-950 tracking-widest uppercase flex items-center gap-2">
                        <Sparkles size={14} className="text-indigo-650 animate-pulse" /> Pitch Script (Segment {selectedLead.segment})
                      </h3>
                      <button
                        onClick={() => setScriptExpanded(!scriptExpanded)}
                        className="text-xs font-bold text-indigo-650 hover:text-indigo-850 transition-colors"
                      >
                        {scriptExpanded ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    
                    {scriptExpanded && (
                      <div className="mt-3 bg-white border border-blue-100/60 p-4 rounded-2xl text-slate-700 font-body text-sm leading-relaxed whitespace-pre-wrap shadow-inner">
                        {telecallingConfig.scripts[selectedLead.segment]}
                      </div>
                    )}
                  </div>
                )}

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

      {/* Accidental-dial Guard countdown overlay */}
      {dialCountdown !== null && dialTarget && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Phone size={24} />
            </div>
            <h3 className="font-display text-lg font-bold text-slate-800">Calling in {dialCountdown}s...</h3>
            <p className="font-body text-sm text-slate-500 mt-1.5">
              Target: {"lead" in dialTarget ? (dialTarget.lead?.name || dialTarget.lead?.phone) : dialTarget.phone}
            </p>
            <button
              onClick={() => {
                setDialCountdown(null);
                setDialTarget(null);
              }}
              className="mt-6 w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-label text-sm font-bold rounded-2xl transition-all border border-red-200"
            >
              Cancel Dial
            </button>
          </div>
        </div>
      )}

      {/* Mandatory Wrap-Up Form modal */}
      {showWrapupModal && activeCallCtx && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-7 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-label text-[10px] font-black uppercase tracking-wider">
                Call Completed
              </span>
              <h3 className="font-display text-xl font-bold text-slate-900 mt-2">
                Mandatory Call Wrap-up
              </h3>
              <p className="font-body text-xs text-slate-400 mt-1">
                Please log feedback for the call with <span className="font-semibold text-slate-700">{activeCallCtx.name || activeCallCtx.phone}</span>.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block mb-2">
                  Call Outcome / Disposition *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWrapupOutcome("converted")}
                    className={`px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center ${
                      wrapupOutcome === "converted"
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    Converted
                  </button>
                  <button
                    type="button"
                    onClick={() => setWrapupOutcome("callback")}
                    className={`px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center ${
                      wrapupOutcome === "callback"
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    Callback Scheduled
                  </button>
                  <button
                    type="button"
                    onClick={() => setWrapupOutcome("not_interested")}
                    className={`px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center ${
                      wrapupOutcome === "not_interested"
                        ? "bg-indigo-650 border-indigo-650 text-white"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    Not Interested (Nurture)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWrapupOutcome("no_answer")}
                    className={`px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center ${
                      wrapupOutcome === "no_answer"
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    No Answer
                  </button>
                  <button
                    type="button"
                    onClick={() => setWrapupOutcome("do_not_call")}
                    className={`px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center ${
                      wrapupOutcome === "do_not_call"
                        ? "bg-red-650 border-red-650 text-white"
                        : "bg-slate-50 hover:bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    Do Not Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setWrapupOutcome("do_not_contact")}
                    className={`px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center ${
                      wrapupOutcome === "do_not_contact"
                        ? "bg-red-700 border-red-700 text-white"
                        : "bg-slate-50 hover:bg-red-50 text-red-800 border-red-200"
                    }`}
                  >
                    Do Not Contact at All
                  </button>
                </div>
              </div>

              {wrapupOutcome === "callback" && (
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3">
                  <p className="font-label text-[10px] text-amber-800 uppercase font-black tracking-widest block">
                    Schedule Next Callback Time
                  </p>
                  <input
                    type="datetime-local"
                    value={wrapupCallbackTime}
                    onChange={(e) => setWrapupCallbackTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  />
                </div>
              )}

              <div>
                <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block mb-1.5">
                  Interaction Note / Comments
                </label>
                <textarea
                  value={wrapupNotes}
                  onChange={(e) => setWrapupNotes(e.target.value)}
                  placeholder="Summarize customer feedback and key discussion points..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none shadow-inner"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleWrapupSubmit}
                disabled={wrapupSaving || !wrapupOutcome}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-label text-xs font-black shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {wrapupSaving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>Complete Wrap-up</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocking Pending-Wrapups list fullscreen overlay */}
      {pendingWrapups.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] shadow-2xl flex flex-col border border-slate-200">
            <div className="text-center mb-6 shrink-0">
              <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={24} />
              </div>
              <h2 className="font-display text-xl font-extrabold text-slate-900">
                Action Required: Pending Call Wrap-ups
              </h2>
              <p className="font-body text-xs text-slate-400 mt-1.5">
                You have {pendingWrapups.length} completed call(s) that require outcome feedback. Please submit feedback to unlock dashboard.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-1">
              {pendingWrapups.map((log) => (
                <div key={log.id} className="border border-slate-150 rounded-2xl p-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-bold text-slate-800 truncate">
                      {log.leads?.name || "Unnamed Lead"} ({formatPhone(log.leads?.phone || "")})
                    </p>
                    <p className="font-label text-xs text-slate-500 mt-1">
                      Duration: {log.duration_seconds || 0}s · Completed {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveCallCtx({
                        leadId: log.lead_id,
                        name: log.leads?.name || null,
                        phone: log.leads?.phone || null,
                        callLogId: log.id
                      });
                      setCallStatus("ended");
                      setShowWrapupModal(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-label text-xs font-bold transition-all shadow-sm shrink-0"
                  >
                    Wrap Up
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
