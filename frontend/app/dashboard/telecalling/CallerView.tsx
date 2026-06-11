"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import { Phone, RefreshCw, Check, Download, Inbox, User, Sparkles, Search, Clock, AlertCircle } from "lucide-react";
import { api, Caller, Lead, CallLog, Message } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import LiveNotesPane from "./components/live-notes-pane";
import NotesHistoryModal from "./components/notes-history-modal";
import { fetchNotes, fetchTodayCallbacks, saveNote } from "./lib/notes-api";
import type { CallbackJob, NotesResponse } from "./types";
import { usePolling } from "@/hooks/usePolling";
import { useActiveCall } from "../contexts/ActiveCallContext";
import NumpadDialer from "./components/NumpadDialer";
import LeadDetailPanel from "./components/LeadDetailPanel";

export default function CallerView({ callerId }: { callerId: string | null }) {
  // caller profile
  const [myCaller, setMyCaller] = useState<Caller | null>(null);
  const [myStatus, setMyStatus] = useState<"active" | "break" | "logged_out">("active");

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
  const [selectedLeadMessages, setSelectedLeadMessages] = useState<Message[]>([]);
  const [selectedLeadCallLogs, setSelectedLeadCallLogs] = useState<CallLog[]>([]);
  const [selectedLeadBrief, setSelectedLeadBrief] = useState<{ brief: string; opener: string } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [selectedLeadLoading, setSelectedLeadLoading] = useState(false);
  const [selectedCallbackJobId, setSelectedCallbackJobId] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<"overview" | "notes" | "attribution">("overview");

  // dialing
  const [dialing, setDialing] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // quick-note on selected lead
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);

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
  const [queueSubTab, setQueueSubTab] = useState<"new" | "callback" | "in_progress" | "closed" | "dialer">("new");

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

      const dialable = leads.filter((l: Lead) => l != null && l.phone && l.phone.trim() !== "");
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
      setSelectedLeadMessages([]);
      setSelectedLeadCallLogs([]);
      setSelectedLeadBrief(null);
      setSelectedCallbackJobId(null);
      return;
    }
    setActiveProfileTab("overview");
    setSelectedLeadLoading(true);

    Promise.all([
      api.leads.get(selectedLeadId),
      fetchNotes(selectedLeadId).catch(() => ({ pinned: [], notes: [] })),
      api.leads.messages(selectedLeadId).catch(() => []),
      api.leads.callLogs(selectedLeadId).catch(() => []),
    ])
      .then(([leadData, notesData, messagesData, callLogsData]) => {
        setSelectedLead(leadData);
        setSelectedLeadNotes(notesData);
        setSelectedLeadMessages(messagesData);
        setSelectedLeadCallLogs(callLogsData);
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

  async function executeDial(leadId: string, lead: Lead) {
    if (!myCaller) { toast.error("Caller profile not found"); return; }
    setDialing(leadId);
    setSelectedLeadId(leadId);
    try {
      const res = await api.calls.initiate({ leadId, callbackJobId: selectedCallbackJobId ?? undefined }, myCaller.id);
      setActiveCallCtx({
        leadId: res.lead_id ?? leadId,
        name: res.lead_name ?? lead.name,
        phone: lead.phone,
        callLogId: res.call_log_id ?? null
      });
      generatePreCallBrief(leadId);
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

  async function generatePreCallBrief(leadId: string) {
    setBriefLoading(true);
    try {
      const res = await api.leads.preCallBrief(leadId);
      setSelectedLeadBrief(res);
    } catch {
      toast.error("Failed to generate brief");
    } finally { setBriefLoading(false); }
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
      setSelectedLeadId(nextLd.id);
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
    if (!lead) return false;
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
    queueSubTab === "dialer" ? [] :
    closedLeads;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-transparent">
      {/* Main Split Layout */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 pb-4">
        {/* Left Side: Lead List (4/12 columns) */}
        <div className="col-span-4 flex flex-col gap-5 min-h-0 pr-1">
          {/* Lead List Card */}
          <div className="flex-1 bg-slate-50 rounded-3xl p-5 shadow-sm border border-slate-200 flex flex-col min-h-0">
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
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadCSV}
                  disabled={exporting || myLeads.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/80 rounded-xl font-label text-xs font-bold hover:bg-slate-50 transition-all text-slate-700 shadow-sm hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
                  title="Download CSV of all assigned leads"
                >
                  {exporting ? <RefreshCw size={12} className="animate-spin text-indigo-650" /> : <Download size={12} />}
                  Export CSV
                </button>
                <button
                  onClick={handleCallNext}
                  disabled={dialingNext || myStatus !== "active"}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl font-label text-xs font-bold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  title="Call next hot lead in queue"
                >
                  {dialingNext ? <RefreshCw size={12} className="animate-spin mr-1" /> : <Sparkles size={12} className="mr-1 fill-white text-white" />}
                  Call Next
                </button>
              </div>
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

            {/* Tabs for To Call, Callbacks, In Prog, Closed, Manual Dial */}
            <div className="flex gap-0.5 p-0.5 bg-slate-200/60 rounded-2xl shrink-0 mb-4">
              {[
                { id: "new", label: `To Call (${newLeads.length})` },
                { id: "callback", label: `Callbacks (${callbackLeads.length})` },
                { id: "in_progress", label: `In Prog (${inProgressLeads.length})` },
                { id: "closed", label: `Closed (${closedLeads.length})` },
                { id: "dialer", label: "Manual Dial" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setQueueSubTab(tab.id as typeof queueSubTab)}
                  className={`flex-1 py-1.5 px-0 rounded-xl font-label text-[9.5px] font-extrabold text-center whitespace-nowrap transition-all ${
                    queueSubTab === tab.id
                      ? "bg-white text-orange-600 shadow-sm"
                      : "text-amber-700/70 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Lead Cards List or Numpad Dialer */}
            {queueSubTab === "dialer" ? (
              <div className="flex-1 overflow-y-auto flex flex-col items-center pt-4 pb-2">
                <NumpadDialer
                  value={manualPhone}
                  onChange={setManualPhone}
                  onDial={manualDialWithGuard}
                  dialing={manualDialing}
                />
              </div>
            ) : myLeads.length === 0 ? (
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
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {activeSubTabLeads.map((lead) => {
                  if (!lead) return null;
                  const isSelected = selectedLeadId === lead.id;
                  
                  // Left border and circle color matches the status of lead
                  let borderAccent = "border-l-indigo-400";
                  let avatarBg = "bg-indigo-500";
                  let callBtnBg = "bg-emerald-500 hover:bg-emerald-650";
                  
                  if (lead.score >= 8) {
                    borderAccent = "border-l-red-500";
                    avatarBg = "bg-red-500";
                    callBtnBg = "bg-rose-500 hover:bg-rose-600 shadow-rose-500/10";
                  } else if (lead.call_status === "callback") {
                    borderAccent = "border-l-amber-500";
                    avatarBg = "bg-amber-500";
                    callBtnBg = "bg-amber-500 hover:bg-amber-600 shadow-amber-500/10";
                  } else if (lead.call_status && ["converted", "not_interested", "dnc", "unreachable"].includes(lead.call_status)) {
                    borderAccent = "border-l-slate-350";
                    avatarBg = "bg-slate-400";
                    callBtnBg = "bg-slate-450 hover:bg-slate-500 shadow-slate-500/10";
                  }

                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`rounded-2xl border-y border-r border-l-[6px] transition-all duration-200 cursor-pointer p-3 flex items-center justify-between gap-3 ${borderAccent} ${
                        isSelected
                          ? "bg-gradient-to-r from-indigo-50/70 to-purple-50/20 border-indigo-200 shadow-[0_4px_15px_rgba(99,102,241,0.06)] ring-1 ring-indigo-500/10 translate-x-1"
                          : "bg-slate-50/30 border-slate-100 hover:bg-slate-50 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Initial Circle Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display text-xs font-bold text-white shrink-0 ${avatarBg}`}>
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
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-label text-[8px] font-black uppercase">
                              SEG {lead.segment}
                            </span>
                            {lead.call_status === "callback" && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-label text-[8px] font-black uppercase">CALLBACK</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="font-label text-xs text-slate-500">
                              {lead.name ? formatPhone(lead.phone) + " · " : ""}Score {lead.score}/10
                            </p>
                          </div>

                          {/* Third line showing action status/time */}
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
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
                        className={`p-2.5 rounded-xl transition-all shadow-sm shrink-0 flex items-center justify-center text-white ${callBtnBg} hover:scale-105 active:scale-95`}
                      >
                        <Phone size={14} className="fill-white" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
        </div>

        {/* Right Side: Detailed Profile Page (8/12 columns) */}
        <div className="col-span-8 flex flex-col min-h-0 bg-slate-50 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Sticky call banner */}
          {activeCallCtx && (
            <div className="shrink-0 p-4 bg-slate-50 border-b border-slate-200">
              <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl">
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
            </div>
          )}

          {/* Single scrollable area — LiveNotesPane + profile */}
          <div className="flex-1 overflow-y-auto">
            {activeCallCtx && (
              <div className="border-b border-slate-200 bg-slate-50">
                <div className="p-4">
                  <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />
                </div>
              </div>
            )}

            {!selectedLeadId ? (
              // Empty State
              <div className="min-h-full flex flex-col items-center justify-center p-12 text-center bg-gradient-to-br from-slate-50/40 to-indigo-50/10">
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
            ) : (
              <LeadDetailPanel
              selectedLead={selectedLead!}
              selectedLeadNotes={selectedLeadNotes}
              selectedLeadMessages={selectedLeadMessages}
              selectedLeadCallLogs={selectedLeadCallLogs}
              selectedLeadBrief={selectedLeadBrief}
              briefLoading={briefLoading}
              generatePreCallBrief={generatePreCallBrief}
              selectedLeadLoading={selectedLeadLoading}
              activeProfileTab={activeProfileTab}
              setActiveProfileTab={setActiveProfileTab}
              quickNoteContent={quickNoteContent}
              setQuickNoteContent={setQuickNoteContent}
              quickNoteSaving={quickNoteSaving}
              saveQuickNote={saveQuickNote}
              handleQuickOutcome={handleQuickOutcome}
              confirmRelease={confirmRelease}
              handleRelease={handleRelease}
              dialWithGuard={dialWithGuard}
              dialing={dialing}
              telecallingConfig={telecallingConfig}
              scriptExpanded={scriptExpanded}
              setScriptExpanded={setScriptExpanded}
              setHistoryLead={setHistoryLead}
            />
            )}
          </div>
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
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
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
