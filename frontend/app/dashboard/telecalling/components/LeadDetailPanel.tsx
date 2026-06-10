"use client";
import React from "react";
import { Sparkles, Phone, StickyNote, Copy, Tag, Target, Calendar, Inbox, User, RefreshCw, Clock, Hash, MessageSquare } from "lucide-react";
import { Lead, Message, CallLog } from "@/lib/api";
import type { NotesResponse } from "../types";
import { formatPhone, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

interface LeadDetailPanelProps {
  selectedLead: Lead;
  selectedLeadNotes: NotesResponse | null;
  selectedLeadMessages: Message[];
  selectedLeadCallLogs: CallLog[];
  selectedLeadLoading: boolean;
  activeProfileTab: "overview" | "notes" | "attribution" | "schedule";
  setActiveProfileTab: (tab: "overview" | "notes" | "attribution" | "schedule") => void;
  quickNoteContent: string;
  setQuickNoteContent: (val: string) => void;
  quickNoteSaving: boolean;
  saveQuickNote: (leadId: string) => void;
  handleQuickOutcome: (outcome: string) => void;
  confirmRelease: string | null;
  handleRelease: (leadId: string) => void;
  dialWithGuard: (leadId: string, lead: Lead) => void;
  dialing: string | null;
  telecallingConfig: { scripts?: Record<string, string> } | null;
  scriptExpanded: boolean;
  setScriptExpanded: (val: boolean) => void;
  schedDate: string;
  setSchedDate: (val: string) => void;
  schedTime: string;
  setSchedTime: (val: string) => void;
  scheduleSaving: boolean;
  handleScheduleCallback: (leadId: string) => void;
  setHistoryLead: (lead: Lead | null) => void;
}

export default function LeadDetailPanel({
  selectedLead,
  selectedLeadNotes,
  selectedLeadMessages,
  selectedLeadCallLogs,
  selectedLeadLoading,
  activeProfileTab,
  setActiveProfileTab,
  quickNoteContent,
  setQuickNoteContent,
  quickNoteSaving,
  saveQuickNote,
  handleQuickOutcome,
  confirmRelease,
  handleRelease,
  dialWithGuard,
  dialing,
  telecallingConfig,
  scriptExpanded,
  setScriptExpanded,
  schedDate,
  setSchedDate,
  schedTime,
  setSchedTime,
  scheduleSaving,
  handleScheduleCallback,
  setHistoryLead
}: LeadDetailPanelProps) {

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  if (selectedLeadLoading || !selectedLead) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/20">
        <RefreshCw size={32} className="animate-spin text-indigo-500 mb-2" />
        <p className="font-body text-sm text-slate-400 font-medium">Fetching lead attribution profile...</p>
      </div>
    );
  }

  // Live engagement signal
  const lastInbound = selectedLead.last_inbound_at ? new Date(selectedLead.last_inbound_at) : null;
  const hoursSinceInbound = lastInbound ? (Date.now() - lastInbound.getTime()) / 36e5 : Infinity;
  const engagementSignal =
    hoursSinceInbound < 24 ? { label: "Active today", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500 animate-pulse" } :
    hoursSinceInbound < 168 ? { label: "Active this week", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-400" } :
    { label: "Gone cold", color: "text-slate-400", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-300" };

  // Call attempt trail
  const outcomeStyle: Record<string, string> = {
    converted: "bg-emerald-500",
    callback: "bg-amber-400",
    not_interested: "bg-slate-400",
    no_answer: "bg-rose-400",
    do_not_call: "bg-red-600",
    do_not_contact: "bg-red-600",
    unreachable: "bg-orange-400",
  };
  const outcomeLabel: Record<string, string> = {
    converted: "Converted",
    callback: "Callback",
    not_interested: "Not Interested",
    no_answer: "No Answer",
    do_not_call: "DNC",
    do_not_contact: "DNC",
    unreachable: "Unreachable",
  };
  const recentCallLogs = selectedLeadCallLogs.slice(0, 6);

  // WhatsApp context (last 4 messages, any direction)
  const recentMessages = selectedLeadMessages.slice(-4);

  const score = selectedLead.score ?? 0;
  const ringColor =
    score >= 8 ? "#f43f5e" : // rose
    score >= 6 ? "#f97316" : // amber
    score >= 4 ? "#6366f1" : // indigo
    "#94a3b8"; // slate

  const ringBgGradient =
    score >= 8 ? "from-rose-500 to-red-600" :
    score >= 6 ? "from-amber-500 to-orange-600" :
    score >= 4 ? "from-indigo-500 to-purple-600" :
    "from-slate-400 to-slate-500";

  const circumference = 2 * Math.PI * 28; // 175.93
  const strokeDashoffset = circumference - (score / 10) * circumference;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/20">
      {/* Premium Gradient Header Card */}
      <div className="bg-gradient-to-br from-[#1a1c3d] via-[#12132e] to-[#0c0d1f] text-white p-6 relative overflow-hidden shrink-0 shadow-md">
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient from-indigo-500/10 to-transparent pointer-events-none" />
        
        <div className="flex justify-between items-center gap-4 relative z-10">
          <div className="flex gap-4 items-center min-w-0">
            {/* Avatar with score ring */}
            <div className="relative w-[66px] h-[66px] flex-shrink-0">
              <svg width="66" height="66" viewBox="0 0 66 66" className="absolute top-0 left-0">
                <circle cx="33" cy="33" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
                <circle
                  cx="33"
                  cy="33"
                  r="28"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 33 33)"
                  className="transition-all duration-500"
                />
              </svg>
              <div className={`absolute inset-[5px] bg-gradient-to-br ${ringBgGradient} rounded-full flex items-center justify-center font-display text-xl font-bold text-white shadow-inner`}>
                {selectedLead.name ? selectedLead.name.charAt(0).toUpperCase() : <User size={20} />}
              </div>
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

            {/* Live Engagement Signal + Call Attempt Trail */}
            <div className="grid grid-cols-2 gap-4">
              {/* Engagement Signal */}
              <div className={`border rounded-2xl p-4 flex items-center gap-3 shadow-sm ${engagementSignal.bg}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${engagementSignal.dot}`} />
                <div>
                  <p className="font-label text-[9px] uppercase tracking-widest font-extrabold text-slate-400">WhatsApp Activity</p>
                  <p className={`font-body text-sm font-extrabold mt-0.5 ${engagementSignal.color}`}>
                    {engagementSignal.label}
                  </p>
                  {lastInbound && (
                    <p className="font-label text-[9px] text-slate-400 mt-0.5">{timeAgo(selectedLead.last_inbound_at!)}</p>
                  )}
                </div>
              </div>

              {/* Call Attempt Trail */}
              <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                <p className="font-label text-[9px] uppercase tracking-widest font-extrabold text-slate-400 mb-2.5">Call History</p>
                {recentCallLogs.length === 0 ? (
                  <p className="font-body text-xs text-slate-400">No calls yet</p>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {recentCallLogs.map((log) => (
                      <div key={log.id} className="group relative">
                        <div className={`w-5 h-5 rounded-full ${outcomeStyle[log.outcome || ""] ?? "bg-slate-200"} cursor-default`} />
                        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap shadow-lg">
                          {outcomeLabel[log.outcome || ""] ?? "Unknown"} · {timeAgo(log.created_at)}
                        </div>
                      </div>
                    ))}
                    {selectedLeadCallLogs.length > 6 && (
                      <span className="font-label text-[9px] text-slate-400 font-bold">+{selectedLeadCallLogs.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* WhatsApp Context Strip */}
            {recentMessages.length > 0 && (
              <div className="bg-gradient-to-br from-[#075e54]/5 to-[#128c7e]/5 border border-[#075e54]/15 rounded-2xl p-4 shadow-sm">
                <p className="font-label text-[9px] uppercase tracking-widest font-extrabold text-[#075e54]/70 mb-3 flex items-center gap-1.5">
                  <MessageSquare size={11} className="text-[#075e54]/60" /> Last WhatsApp Conversation
                </p>
                <div className="space-y-2">
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === "inbound" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs font-body leading-relaxed shadow-sm ${
                        msg.direction === "inbound"
                          ? "bg-white text-slate-700 rounded-tl-sm"
                          : "bg-[#dcf8c6] text-slate-800 rounded-tr-sm"
                      }`}>
                        <p>{msg.content}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5 text-right">{timeAgo(msg.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Note + Call Outcome (primary during-call tools) */}
            <div className="grid grid-cols-2 gap-4">
              {/* Quick Note */}
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
                <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase flex items-center gap-1.5">
                  <StickyNote size={13} className="text-slate-500" /> Quick Note
                </h3>
                <textarea
                  value={quickNoteContent}
                  onChange={(e) => setQuickNoteContent(e.target.value)}
                  placeholder="Outcome summary… e.g. Interested, wants demo call tomorrow 5 PM"
                  rows={4}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none shadow-inner flex-1"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => saveQuickNote(selectedLead.id)}
                    disabled={quickNoteSaving || !quickNoteContent.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-label text-xs font-bold disabled:opacity-50 transition-all shadow-sm hover:scale-[1.01] active:scale-[0.99] flex items-center gap-1.5"
                  >
                    {quickNoteSaving ? <RefreshCw size={11} className="animate-spin" /> : "Save Note"}
                  </button>
                </div>
              </div>

              {/* Call Outcome */}
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
                <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-500" /> Call Outcome
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "converted", label: "✓ Converted", style: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
                    { id: "callback", label: "📅 Callback", style: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" },
                    { id: "not_interested", label: "Not Interested", style: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" },
                    { id: "no_answer", label: "No Answer", style: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" },
                    { id: "do_not_call", label: "Do Not Call", style: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" },
                    { id: "unreachable", label: "Unreachable", style: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" }
                  ].map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handleQuickOutcome(o.id)}
                      className={`py-2 px-2 text-[10px] font-extrabold rounded-xl border transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm text-center ${o.style}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Lead Details + Contact Info */}
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-3">
              <h3 className="font-display text-xs font-black text-slate-800 tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
                <Target size={13} className="text-slate-500" /> Lead Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 shadow-sm">
                  <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Score & Status</span>
                  <p className="font-body text-sm text-slate-800 font-extrabold mt-1 capitalize flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full inline-block ${selectedLead.score >= 8 ? "bg-red-500 animate-pulse" : "bg-indigo-500"}`} />
                    {selectedLead.call_status || "New"} ({selectedLead.score}/10)
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 shadow-sm">
                  <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Channel</span>
                  <p className="font-body text-sm text-slate-800 font-extrabold mt-1 capitalize">
                    {selectedLead.channel || selectedLead.source || "N/A"}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-start gap-2">
                  <Phone size={12} className="text-slate-400 mt-1 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Phone</span>
                    <button
                      onClick={() => copyToClipboard(selectedLead.phone || "", "Phone")}
                      className="font-body text-sm text-indigo-600 font-extrabold mt-1 hover:underline truncate block"
                    >
                      {formatPhone(selectedLead.phone)}
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-start gap-2">
                  <Clock size={12} className="text-slate-400 mt-1 shrink-0" />
                  <div>
                    <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Assigned</span>
                    <p className="font-body text-xs text-slate-700 font-semibold mt-1">
                      {selectedLead.assigned_at ? timeAgo(selectedLead.assigned_at) : "Recent"}
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-start gap-2">
                  <Hash size={12} className="text-slate-400 mt-1 shrink-0" />
                  <div>
                    <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Segment</span>
                    <p className="font-body text-xs text-slate-700 font-extrabold mt-1">SEG {selectedLead.segment}</p>
                  </div>
                </div>
                {selectedLead.tag_name && (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-start gap-2">
                    <Tag size={12} className="text-slate-400 mt-1 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Tag</span>
                      <p className="font-body text-xs text-purple-700 font-extrabold mt-1 truncate">{selectedLead.tag_name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interaction Timeline (inline, last 3) */}
            {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-display text-xs font-black text-slate-800 flex items-center gap-1.5 tracking-widest uppercase">
                    <MessageSquare size={13} className="text-slate-500" /> Recent Interactions
                  </h3>
                  <button
                    onClick={() => setActiveProfileTab("notes")}
                    className="text-xs text-indigo-600 font-bold hover:underline"
                  >
                    View all →
                  </button>
                </div>
                <div className="relative border-l border-slate-100 pl-4 ml-2 space-y-3">
                  {selectedLeadNotes.notes.slice(0, 3).map((n) => (
                    <div key={n.id} className="relative">
                      <span className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-2 ring-indigo-100" />
                      <span className="block text-[10px] text-slate-400 font-bold mb-1">{timeAgo(n.created_at)}</span>
                      <div className="font-body text-xs text-slate-600 bg-slate-50 border border-slate-100/60 p-3 rounded-2xl leading-relaxed">
                        {n.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Pitch Script */}
            {telecallingConfig?.scripts?.[selectedLead.segment] && (
              <div className="bg-gradient-to-r from-blue-50/40 to-indigo-50/20 border border-blue-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-black text-indigo-950 tracking-widest uppercase flex items-center gap-1.5">
                    <Sparkles size={13} className="text-indigo-600" /> Pitch Script (SEG {selectedLead.segment})
                  </h3>
                  <button
                    onClick={() => setScriptExpanded(!scriptExpanded)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
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
          </>
        )}

        {activeProfileTab === "notes" && (
          <div className="space-y-6">
            {/* Full Interaction Timeline */}
            <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display text-xs font-black text-slate-800 flex items-center gap-1.5 tracking-widest uppercase">
                  <Inbox size={13} className="text-slate-500" /> Full Interaction Timeline
                </h3>
                <button
                  onClick={() => setHistoryLead(selectedLead)}
                  className="text-xs text-indigo-600 font-bold hover:underline"
                >
                  History Modal
                </button>
              </div>

              {selectedLeadNotes?.notes && selectedLeadNotes.notes.length > 0 ? (
                <div className="relative border-l border-slate-100 pl-4.5 ml-2.5 space-y-4">
                  {selectedLeadNotes.notes.map((n) => (
                    <div key={n.id} className="relative">
                      <span className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-2 ring-indigo-100" />
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-1">
                        <span>{timeAgo(n.created_at)}</span>
                        {n.is_pinned && <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full font-black text-[7px]">PINNED</span>}
                      </div>
                      <div className="font-body text-xs text-slate-600 bg-slate-50 border border-slate-100/60 p-3.5 rounded-2xl leading-relaxed">
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
                        className="absolute right-3.5 bottom-3.5 p-1.5 text-purple-400 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-all"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>

                  <div className="bg-white border border-purple-100/60 rounded-2xl p-4 shadow-sm">
                    <span className="font-label text-[10px] text-purple-700/60 uppercase font-extrabold tracking-wider block">Message Template</span>
                    <p className="font-body text-sm text-slate-800 font-extrabold mt-1.5 truncate">
                      {selectedLead.template_name || "N/A"}
                    </p>
                  </div>
                </div>

                {selectedLead.tag_name && (
                  <div className="bg-white border border-purple-100/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
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
              <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border border-emerald-100 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-display text-xs font-black text-emerald-800 flex items-center gap-2 tracking-widest uppercase">
                  <Target size={14} className="text-emerald-600" /> Inbound Lead Attribution
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-emerald-100/60 rounded-2xl p-4 shadow-sm">
                    <span className="font-label text-[10px] text-emerald-700/60 uppercase font-extrabold tracking-wider block">Paid Ad Campaign</span>
                    <p className="font-body text-sm text-slate-800 font-extrabold mt-1.5 truncate">
                      {selectedLead.ad_campaign_name || "Organic Traffic"}
                    </p>
                  </div>

                  <div className="bg-white border border-emerald-100/60 rounded-2xl p-4 shadow-sm">
                    <span className="font-label text-[10px] text-emerald-700/60 uppercase font-extrabold tracking-wider block">Lead Source Channel</span>
                    <p className="font-body text-sm text-slate-850 font-extrabold mt-1.5 capitalize flex items-center gap-2">
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
  );
}
