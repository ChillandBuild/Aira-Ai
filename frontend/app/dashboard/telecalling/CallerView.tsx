"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import { Phone, RefreshCw, StickyNote, Check, Download, Calendar, Tag, Target, Inbox, Copy, User, Sparkles, Search, Clock, AlertCircle } from "lucide-react";
import { api, Caller, Lead, CallLog } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import LiveNotesPane from "./components/live-notes-pane";
import NotesHistoryModal from "./components/notes-history-modal";
import { fetchNotes, fetchTodayCallbacks, saveNote, createCallback } from "./lib/notes-api";
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

  // Selected Lead Profile
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeadNotes, setSelectedLeadNotes] = useState<NotesResponse | null>(null);
  const [selectedLeadLoading, setSelectedLeadLoading] = useState(false);
  const [selectedCallbackJobId, setSelectedCallbackJobId] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<"overview" | "notes" | "attribution" | "schedule">("overview");

  // dialing
  const [dialing, setDialing] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // quick-note on selected lead
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);

  // scheduling
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
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

  // Queue status sub-tabs
  const [queueSubTab, setQueueSubTab] = useState<"new" | "callback" | "in_progress" | "closed">("new");

  // Live Script Panel
  const [telecallingConfig, setTelecallingConfig] = useState<{ scripts?: Record<string, string> } | null>(null);
  const [scriptExpanded, setScriptExpanded] = useState(true);

  const loadCallbacks = useCallback(() => {
    fetchTodayCallbacks().then(setTodayCallbacks).catch(() => {});
  }, []);

  const loadPendingWrapups = useCallback(async () => {
    try {
      const wrapups = await api.calls.getPendingWrapups();
      setPendingWrapups(wrapups);
    } catch (err) {
      console.error("Failed to load pending wrapups:", err);
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
      loadPendingWrapups();
      loadTelecallingConfig();
    } catch (err) {
      console.error("CallerView load error:", err);
    }
  }, [callerId, loadCallbacks, loadPendingWrapups, loadTelecallingConfig]);

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
    setActiveProfileTab("overview");
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
      setSchedDate(""); setSchedTime("");
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

  async function handleRelease(leadId: string) {
    if (confirmRelease !== leadId) {
      setConfirmRelease(leadId);
      setTimeout(() => setConfirmRelease((cur) => cur === leadId ? null : cur), 3000);
      return;
    }
    setConfirmRelease(null);
    try {
      await api.leads.release(leadId);
      setMyLeads((prev) => prev.filter((l) => l.id !== leadId));
      if (selectedLeadId === leadId) {
        setSelectedLeadId(null);
      }
      toast.success("Lead released successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to release lead");
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

  const handleQuickOutcome = async (outcome: string) => {
    if (!selectedLead) return;
    if (outcome === "callback") {
      setActiveProfileTab("schedule");
      toast.info("Please select date and time for the callback");
      return;
    }
    
    if (!activeCallCtx?.callLogId) {
      toast.error("Please call the lead first to log an outcome.");
      return;
    }

    setQuickNoteSaving(true);
    try {
      await api.calls.setOutcome(
        activeCallCtx.callLogId,
        outcome as NonNullable<CallLog["outcome"]>,
        { notes: quickNoteContent.trim() || undefined }
      );
      if (outcome === "converted") {
        await api.leads.convert(selectedLead.id, quickNoteContent.trim());
      } else if (quickNoteContent.trim()) {
        await saveNote(selectedLead.id, quickNoteContent.trim(), false);
      }
      setActiveCallCtx(null);
      toast.success(`Outcome "${outcome.replace('_', ' ')}" logged successfully`);
      setQuickNoteContent("");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save outcome");
    } finally {
      setQuickNoteSaving(false);
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
        {/* Left Side: Lead List (5/12 columns) */}
        <div className="col-span-5 flex flex-col gap-5 min-h-0 pr-1">
          {/* Lead List Card */}
          <div className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 flex flex-col min-h-0">
            {/* Header / Title */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">
                  Lead Queue
                </h2>
                <p className="font-body text-xs text-slate-500 mt-0.5">
                  {myLeads.length} leads assigned
                </p>
              </div>
              <button
                onClick={handleCallNext}
                disabled={dialingNext || myStatus !== "active"}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-755 text-white rounded-2xl font-label text-xs font-bold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                title="Call next hot lead in queue"
              >
                {dialingNext ? <RefreshCw size={12} className="animate-spin mr-1" /> : <Sparkles size={12} className="mr-1 fill-white text-white" />}
                Call Next
              </button>
            </div>

            {/* Search leads */}
            <div className="mb-4 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-body focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Tabs for To Call, Callbacks, In Prog, Closed */}
            <div className="flex gap-1.5 p-1 bg-slate-100/80 rounded-2xl shrink-0 mb-4">
              <button
                onClick={() => setQueueSubTab("new")}
                className={`flex-1 py-1.5 px-1 rounded-xl font-label text-[10px] font-extrabold text-center transition-all ${
                  queueSubTab === "new"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                To Call ({newLeads.length})
              </button>
              <button
                onClick={() => setQueueSubTab("callback")}
                className={`flex-1 py-1.5 px-1 rounded-xl font-label text-[10px] font-extrabold text-center transition-all ${
                  queueSubTab === "callback"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Callbacks ({callbackLeads.length})
              </button>
              <button
                onClick={() => setQueueSubTab("in_progress")}
                className={`flex-1 py-1.5 px-1 rounded-xl font-label text-[10px] font-extrabold text-center transition-all ${
                  queueSubTab === "in_progress"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                In Prog ({inProgressLeads.length})
              </button>
              <button
                onClick={() => setQueueSubTab("closed")}
                className={`flex-1 py-1.5 px-1 rounded-xl font-label text-[10px] font-extrabold text-center transition-all ${
                  queueSubTab === "closed"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Closed ({closedLeads.length})
              </button>
            </div>

            {/* Lead Cards List */}
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
                  const isSelected = selectedLeadId === lead.id;
                  
                  // Left border and circle color matches the status of lead
                  let borderAccent = "border-l-indigo-400";
                  let avatarBg = "bg-indigo-500";
                  let callBtnBg = "bg-emerald-500 hover:bg-emerald-600";
                  
                  if (lead.score >= 8) {
                    borderAccent = "border-l-red-500";
                    avatarBg = "bg-red-500";
                    callBtnBg = "bg-red-550 hover:bg-red-600";
                  } else if (lead.call_status === "callback") {
                    borderAccent = "border-l-amber-500";
                    avatarBg = "bg-amber-500";
                    callBtnBg = "bg-emerald-500 hover:bg-emerald-600";
                  } else if (lead.call_status && ["converted", "not_interested", "dnc", "unreachable"].includes(lead.call_status)) {
                    borderAccent = "border-l-slate-350";
                    avatarBg = "bg-slate-400";
                    callBtnBg = "bg-slate-450 hover:bg-slate-500";
                  }

                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`rounded-2xl border-y border-r border-l-[6px] transition-all duration-200 cursor-pointer p-4 flex items-center justify-between gap-3 ${borderAccent} ${
                        isSelected
                          ? "bg-gradient-to-r from-indigo-50/70 to-purple-50/20 border-indigo-200 shadow-[0_4px_15px_rgba(99,102,241,0.06)] ring-1 ring-indigo-500/10 translate-x-1"
                          : "bg-slate-50/30 border-slate-100 hover:bg-slate-50 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Initial Circle Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display text-sm font-bold text-white shrink-0 ${avatarBg}`}>
                          {lead.name ? lead.name.charAt(0).toUpperCase() : <User size={14} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-body text-sm font-bold text-slate-800 truncate">
                              {lead.name || formatPhone(lead.phone)}
                            </p>
                            {lead.score >= 7 && (
                              <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded font-label text-[8px] font-black uppercase tracking-wider">HOT</span>
                            )}
                            <span className="px-1.5 py-0.5 bg-indigo-55 text-indigo-700 rounded font-label text-[8px] font-black uppercase">
                              SEG {lead.segment}
                            </span>
                            {lead.call_status === "callback" && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-label text-[8px] font-black uppercase">CALLBACK</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <p className="font-label text-xs text-slate-500">
                              {lead.name ? formatPhone(lead.phone) + " · " : ""}Score {lead.score}/10
                            </p>
                          </div>
                          
                          {/* Third line showing action status/time */}
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                            <Clock size={10} />
                            {lead.call_status === "callback" ? (
                              <span>Scheduled callback</span>
                            ) : lastCalledMap[lead.id] ? (
                              <span>Called {timeAgo(lastCalledMap[lead.id])}</span>
                            ) : (
                              <span>Not called yet</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Direct phone call button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dialWithGuard(lead.id, lead);
                        }}
                        disabled={dialing === lead.id}
                        className={`p-2.5 rounded-xl transition-all shadow-sm shrink-0 flex items-center justify-center text-white ${callBtnBg}`}
                      >
                        <Phone size={14} className="fill-white" />
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
              <div className="bg-gradient-to-br from-[#1a1c3d] via-[#12132e] to-[#0c0d1f] text-white p-6 relative overflow-hidden shrink-0 shadow-md">
                <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient from-indigo-500/10 to-transparent pointer-events-none" />
                
                <div className="flex justify-between items-center gap-4 relative z-10">
                  <div className="flex gap-4 items-center min-w-0">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center font-display text-2xl font-bold text-white shadow-inner shrink-0 ${
                      selectedLead.score >= 8 ? "bg-red-500" :
                      selectedLead.call_status === "callback" ? "bg-amber-500" :
                      "bg-indigo-500"
                    }`}>
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
                      
                      <p className="text-slate-300 font-label text-sm mt-1.5 tracking-wide flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-white">{formatPhone(selectedLead.phone)}</span>
                        <span className="text-slate-500">•</span>
                        <span>Score: {selectedLead.score}/10</span>
                        <span className="text-slate-500">•</span>
                        <span>{selectedLead.channel || selectedLead.source || "Direct"}</span>
                        <span className="text-slate-500">•</span>
                        <span>Assigned {selectedLead.assigned_at ? timeAgo(selectedLead.assigned_at) : "recent"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRelease(selectedLead.id)}
                      className={`px-4 py-2.5 rounded-2xl border font-label text-xs font-bold transition-all text-slate-300 hover:text-white ${
                        confirmRelease === selectedLead.id
                          ? "bg-red-650 border-red-500 text-white font-bold animate-pulse"
                          : "border-slate-700/60 bg-slate-900/40 hover:bg-slate-900"
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

              {/* Sub-tabs Row */}
              <div className="flex border-b border-slate-200 bg-white shrink-0">
                {[
                  { id: "overview", label: "Overview" },
                  { id: "notes", label: "Notes & Log" },
                  { id: "attribution", label: "Attribution" },
                  { id: "schedule", label: "Schedule" }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveProfileTab(t.id as "overview" | "notes" | "attribution" | "schedule")}
                    className={`px-6 py-4 font-display text-xs font-black tracking-wider uppercase border-b-2 text-center transition-all ${
                      activeProfileTab === t.id
                        ? "border-indigo-600 text-indigo-700 font-bold"
                        : "border-transparent text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Profile Details Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {activeProfileTab === "overview" && (
                  <>
                    {/* Lead Source banner */}
                    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100/50 text-blue-600 rounded-xl shrink-0">
                          <Inbox size={16} />
                        </div>
                        <div>
                          <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">Lead Source</p>
                          <p className="font-body text-sm font-semibold text-slate-800 mt-0.5">
                            {selectedLead.channel || selectedLead.source || "Organic Inbound"} — {selectedLead.ad_campaign_name || selectedLead.template_name || "Organic Traffic"}
                          </p>
                        </div>
                      </div>
                      <span className="font-label text-xs text-slate-400 font-medium whitespace-nowrap">
                        {selectedLead.assigned_at ? timeAgo(selectedLead.assigned_at) : "recent"}
                      </span>
                    </div>

                    {/* Live Pitch Script (Collapsed/Expandable inline for help) */}
                    {telecallingConfig?.scripts?.[selectedLead.segment] && (
                      <div className="bg-gradient-to-r from-blue-50/40 to-indigo-50/20 border border-blue-150 rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-xs font-black text-indigo-950 tracking-widest uppercase flex items-center gap-1.5">
                            <Sparkles size={13} className="text-indigo-600" /> Pitch Script Helper (SEG {selectedLead.segment})
                          </h3>
                          <button
                            onClick={() => setScriptExpanded(!scriptExpanded)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-850"
                          >
                            {scriptExpanded ? "Hide" : "Show"}
                          </button>
                        </div>
                        {scriptExpanded && (
                          <div className="mt-2.5 bg-white border border-blue-100 p-3 rounded-xl text-slate-700 font-body text-xs leading-relaxed whitespace-pre-wrap">
                            {telecallingConfig.scripts[selectedLead.segment]}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Side-by-side: Quick Note + Call Outcome */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Quick Note Card */}
                      <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between min-h-[220px]">
                        <div>
                          <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase mb-3 flex items-center gap-1.5">
                            <StickyNote size={13} className="text-slate-500" /> Quick Note
                          </h3>
                          <textarea
                            value={quickNoteContent}
                            onChange={(e) => setQuickNoteContent(e.target.value)}
                            placeholder="Outcome summary... e.g. Interested, wants demo call tomorrow 5 PM"
                            rows={4}
                            className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none shadow-inner"
                          />
                        </div>
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => saveQuickNote(selectedLead.id)}
                            disabled={quickNoteSaving || !quickNoteContent.trim()}
                            className="px-4.5 py-2 bg-indigo-600 hover:bg-indigo-755 text-white rounded-xl font-label text-xs font-bold disabled:opacity-50 transition-all shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                          >
                            {quickNoteSaving ? <RefreshCw size={12} className="animate-spin" /> : "Save Note"}
                          </button>
                        </div>
                      </div>

                      {/* Call Outcome Grid Card */}
                      <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
                        <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase mb-3 flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-500" /> Call Outcome
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                          {[
                            { id: "converted", label: "✓ Converted", style: "border-emerald-200 bg-emerald-50/20 text-emerald-700 hover:bg-emerald-50" },
                            { id: "callback", label: "📅 Callback", style: "border-amber-200 bg-amber-50/20 text-amber-700 hover:bg-amber-50" },
                            { id: "not_interested", label: "Not Interested", style: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" },
                            { id: "no_answer", label: "No Answer", style: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" },
                            { id: "do_not_call", label: "Do Not Call", style: "border-red-200 bg-red-50/20 text-red-700 hover:bg-red-55" },
                            { id: "unreachable", label: "Unreachable", style: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" }
                          ].map((o) => (
                            <button
                              key={o.id}
                              onClick={() => handleQuickOutcome(o.id)}
                              disabled={quickNoteSaving}
                              className={`py-3 px-1.5 text-center text-xs font-extrabold rounded-xl border transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm flex items-center justify-center ${o.style}`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Interaction Timeline box */}
                    <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                      <h3 className="font-display text-xs font-black text-slate-800 mb-4 flex items-center gap-1.5 tracking-widest uppercase">
                        <Inbox size={13} className="text-slate-500" /> Interaction Timeline
                      </h3>
                      {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 ? (
                        <div className="relative border-l border-slate-100 pl-4.5 ml-2.5 space-y-4">
                          {selectedLeadNotes.notes.slice(0, 3).map((n) => (
                            <div key={n.id} className="relative">
                              <span className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-2 ring-indigo-100" />
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-1">
                                <span>{timeAgo(n.created_at)}</span>
                                {n.is_pinned && <span className="text-indigo-650 bg-indigo-50 px-1.5 py-0.2 rounded-full font-black text-[7px]">PINNED</span>}
                              </div>
                              <div className="font-body text-xs text-slate-650 bg-slate-55 border border-slate-100/60 p-3.5 rounded-2xl leading-relaxed">
                                {n.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 bg-slate-50/60 border border-slate-100 text-center rounded-2xl text-xs text-slate-400 font-medium">
                          No previous interactions logged for this lead.
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeProfileTab === "notes" && (
                  <div className="space-y-6">
                    {/* Pinned Core Facts card */}
                    {selectedLeadNotes?.pinned && selectedLeadNotes.pinned.length > 0 && (
                      <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
                        <p className="font-display text-xs font-black text-slate-800 uppercase tracking-widest mb-3">📌 Pinned Core Facts</p>
                        <div className="space-y-2">
                          {selectedLeadNotes.pinned.map((n) => (
                            <div key={n.id} className="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl">
                              <p className="font-body text-xs text-slate-705 leading-relaxed font-semibold">{n.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full notes timeline list */}
                    <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase">Full Notes Timeline</h3>
                        <button
                          onClick={() => setHistoryLead(selectedLead)}
                          className="text-xs text-indigo-600 font-bold hover:underline"
                        >
                          Launch History Modal
                        </button>
                      </div>
                      
                      {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 ? (
                        <div className="relative border-l border-slate-100 pl-4.5 ml-2.5 space-y-4">
                          {selectedLeadNotes.notes.map((n) => (
                            <div key={n.id} className="relative">
                              <span className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-2 ring-indigo-100" />
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-1">
                                <span>{new Date(n.created_at).toLocaleString()}</span>
                                {n.is_pinned && <span className="text-indigo-650 bg-indigo-50 px-1.5 py-0.2 rounded-full font-black text-[7px]">PINNED</span>}
                              </div>
                              <div className="font-body text-xs text-slate-650 bg-slate-55 border border-slate-100/60 p-3.5 rounded-2xl leading-relaxed">
                                {n.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 bg-slate-50/60 border border-slate-100 text-center rounded-2xl text-xs text-slate-400">
                          No notes found.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeProfileTab === "attribution" && (
                  <div className="space-y-6">
                    {selectedLead.broadcast_id || selectedLead.template_name ? (
                      <div className="bg-gradient-to-br from-purple-50/50 to-indigo-50/30 border border-purple-100 rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="font-display text-xs font-black text-purple-800 flex items-center gap-2 tracking-widest uppercase">
                          <Target size={14} className="text-purple-600" /> Outbound Campaign Attribution
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white border border-purple-100/60 rounded-2xl p-4 relative shadow-sm">
                            <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Broadcast Campaign ID</span>
                            <p className="font-mono text-xs text-slate-800 font-bold mt-1.5 truncate pr-8 select-all">
                              {selectedLead.broadcast_id || "None"}
                            </p>
                            {selectedLead.broadcast_id && (
                              <button 
                                onClick={() => copyToClipboard(selectedLead.broadcast_id || "", "Broadcast ID")}
                                className="absolute right-3.5 bottom-3.5 p-1.5 text-purple-400 hover:text-purple-755 hover:bg-purple-50 rounded-lg transition-all"
                              >
                                <Copy size={12} />
                              </button>
                            )}
                          </div>

                          <div className="bg-white border border-purple-100/60 rounded-2xl p-4 shadow-sm">
                            <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Message Template</span>
                            <p className="font-body text-sm text-slate-805 font-extrabold mt-1.5 truncate">
                              {selectedLead.template_name || "N/A"}
                            </p>
                          </div>
                        </div>

                        {selectedLead.tag_name && (
                          <div className="bg-white border border-purple-100/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                            <div>
                              <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Campaign Tag</span>
                              <span className="flex items-center gap-1.5 mt-1.5 text-sm font-extrabold text-purple-700">
                                <Tag size={12} className="text-purple-505" />
                                {selectedLead.tag_name}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border border-emerald-100 rounded-3xl p-6 shadow-sm space-y-4">
                        <h3 className="font-display text-xs font-black text-emerald-800 flex items-center gap-2 tracking-widest uppercase">
                          <Target size={14} className="text-emerald-600" /> Inbound Lead Attribution
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white border border-emerald-100/60 rounded-2xl p-4 shadow-sm">
                            <span className="font-label text-[10px] text-emerald-700/60 uppercase font-extrabold tracking-wider block">Paid Ad Campaign</span>
                            <p className="font-body text-sm text-slate-805 font-extrabold mt-1.5 truncate">
                              {selectedLead.ad_campaign_name || "Organic Traffic"}
                            </p>
                          </div>

                          <div className="bg-white border border-emerald-100/60 rounded-2xl p-4 shadow-sm">
                            <span className="font-label text-[10px] text-emerald-700/60 uppercase font-extrabold tracking-wider block">Lead Source Channel</span>
                            <p className="font-body text-sm text-slate-805 font-extrabold mt-1.5 capitalize flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                              {selectedLead.channel || selectedLead.source || "N/A"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeProfileTab === "schedule" && (
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="font-display text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={14} className="text-slate-500" /> Reschedule Callback
                    </h3>
                    
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Date</label>
                          <input
                            type="date"
                            value={schedDate}
                            onChange={(e) => setSchedDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                          />
                        </div>
                        <div>
                          <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Time</label>
                          <input
                            type="time"
                            value={schedTime}
                            onChange={(e) => setSchedTime(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleScheduleCallback(selectedLead.id)}
                          disabled={scheduleSaving || !schedDate || !schedTime}
                          className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-555 text-white rounded-xl font-label text-xs font-bold hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all shadow-md hover:scale-[1.01] active:scale-[0.99]"
                        >
                          {scheduleSaving ? <RefreshCw size={12} className="animate-spin" /> : "Schedule Callback"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

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
