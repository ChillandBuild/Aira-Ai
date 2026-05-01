"use client";
import { useEffect, useState, useCallback } from "react";
import { Phone, Eye, RefreshCw, ChevronDown } from "lucide-react";
import { api, Caller, Lead } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import BriefingModal from "./components/briefing-modal";
import LiveNotesPane from "./components/live-notes-pane";
import NotesHistoryModal from "./components/notes-history-modal";
import { fetchNotes, fetchTodayCallbacks, fetchTodayCompletedCallbacks, markCallbackDone } from "./lib/notes-api";
import type { ActiveCallCtx, CallbackJob, NotesResponse } from "./types";



export default function CallerView({ callerId }: { callerId: string | null }) {
  // caller profile
  const [myCaller, setMyCaller] = useState<Caller | null>(null);
  const [myStatus, setMyStatus] = useState<"active" | "idle">("active");
  const [togglingStatus, setTogglingStatus] = useState(false);

  // my leads (assigned to me, sorted by score desc)
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [lastCalledMap, setLastCalledMap] = useState<Record<string, string>>({});

  // callbacks
  const [todayCallbacks, setTodayCallbacks] = useState<CallbackJob[]>([]);
  const [completedCallbacks, setCompletedCallbacks] = useState<CallbackJob[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);

  // dialing
  const [dialing, setDialing] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // modals
  const [briefingLead, setBriefingLead] = useState<Lead | null>(null);
  const [briefingNotes, setBriefingNotes] = useState<NotesResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [viewingNotes, setViewingNotes] = useState<NotesResponse | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [activeCallCtx, setActiveCallCtx] = useState<ActiveCallCtx | null>(null);



  const loadData = useCallback(async () => {
    try {
      // Get my caller profile
      const callers = await api.callers.list();
      const me = callers.find((c: Caller) => c.id === callerId) || null;
      setMyCaller(me);
      if (me) {
        setMyStatus((me.status as "active" | "idle") || "active");
        // load my logs
      }

      // Get leads assigned to me (sorted by score desc)
      const leads = await api.leads.list({ assigned_to: callerId || undefined, limit: 50 });
      const sorted = leads.sort((a: Lead, b: Lead) => (b.score ?? 0) - (a.score ?? 0));
      setMyLeads(sorted);

      // last-called map
      const ids = sorted.map((l: Lead) => l.id).filter(Boolean);
      if (ids.length) {
        api.calls.recentByLeads(ids).then(setLastCalledMap).catch(() => {});
      }

      // Callbacks
      fetchTodayCallbacks().then(setTodayCallbacks).catch(() => {});
      fetchTodayCompletedCallbacks().then(setCompletedCallbacks).catch(() => {});
    } catch (err) {
      console.error("CallerView load error:", err);
    }
  }, [callerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Modal data fetching
  useEffect(() => {
    if (!briefingLead) { setBriefingNotes(null); return; }
    setBriefingLoading(true);
    fetchNotes(briefingLead.id)
      .then(setBriefingNotes)
      .catch(() => setBriefingNotes({ pinned: [], notes: [] }))
      .finally(() => setBriefingLoading(false));
  }, [briefingLead]);

  useEffect(() => {
    if (!viewingLead) { setViewingNotes(null); return; }
    setViewingLoading(true);
    fetchNotes(viewingLead.id)
      .then(setViewingNotes)
      .catch(() => setViewingNotes({ pinned: [], notes: [] }))
      .finally(() => setViewingLoading(false));
  }, [viewingLead]);

  // ── actions ──

  async function toggleMyStatus() {
    const next = myStatus === "active" ? "idle" : "active";
    setTogglingStatus(true);
    try {
      await api.callers.setMyStatus(next);
      setMyStatus(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function executeDial(leadId: string, lead: Lead) {
    if (!myCaller) { alert("Caller profile not found"); return; }
    setDialing(leadId);
    try {
      const res = await api.calls.initiate({ leadId }, myCaller.id);
      setActiveCallCtx({ leadId: res.lead_id ?? leadId, name: res.lead_name ?? lead.name, phone: lead.phone });

    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    } finally { setDialing(null); }
  }

  function openBriefing(lead: Lead) {
    if (!myCaller) { alert("Caller profile not found"); return; }
    setBriefingLead(lead);
  }

  function startCallFromBriefing() {
    if (!briefingLead) return;
    const lead = briefingLead;
    setBriefingLead(null);
    executeDial(lead.id, lead);
  }

  async function manualDial() {
    if (!myCaller || !manualPhone.trim()) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone: manualPhone.trim() }, myCaller.id);
      setActiveCallCtx({ leadId: res.lead_id ?? null, name: res.lead_name ?? null, phone: manualPhone.trim() });
      setManualPhone("");

    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  async function handleMarkDone(jobId: string) {
    try {
      await markCallbackDone(jobId);
      // Move from active to completed
      const cb = todayCallbacks.find((c) => c.id === jobId);
      if (cb) {
        setTodayCallbacks((prev) => prev.filter((c) => c.id !== jobId));
        setCompletedCallbacks((prev) => [{ ...cb, status: "sent" }, ...prev]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark done");
    }
  }

  return (
    <div>
      {/* Header with status toggle */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Telecalling</h1>
          <p className="font-body text-on-surface-muted mt-1">Your assigned leads & callbacks</p>
        </div>
        <button
          onClick={toggleMyStatus}
          disabled={togglingStatus}
          className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-label text-sm font-bold transition-all shadow-md ${
            myStatus === "active"
              ? "bg-green-500 text-white hover:bg-green-600"
              : "bg-amber-400 text-amber-900 hover:bg-amber-500"
          } ${togglingStatus ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <span className={`w-3 h-3 rounded-full ${myStatus === "active" ? "bg-white animate-pulse" : "bg-amber-700"}`} />
          {myStatus === "active" ? "🟢 I'm Active" : "🟡 On Break"}
        </button>
      </div>

      {/* Callbacks Section */}
      {(todayCallbacks.length > 0 || completedCallbacks.length > 0) && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <h2 className="font-bold text-amber-900 text-sm mb-3 flex items-center gap-2">
            <span>📞</span> Today&apos;s Callbacks ({todayCallbacks.length})
          </h2>
          {todayCallbacks.length > 0 && (
            <div className="space-y-2 mb-3">
              {todayCallbacks.map((cb) => (
                <div key={cb.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm">
                  <div>
                    <p className="font-semibold text-sm">{cb.lead.name ?? "Unnamed"}</p>
                    <p className="text-xs text-gray-500">
                      {cb.lead.phone} · {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {cb.message_preview && <p className="text-xs text-gray-400 mt-0.5">{cb.message_preview}</p>}
                  </div>
                  <button
                    onClick={() => handleMarkDone(cb.id)}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
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
                    <div key={cb.id} className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-2.5 opacity-60">
                      <div>
                        <p className="font-semibold text-sm line-through text-gray-500">{cb.lead.name ?? "Unnamed"}</p>
                        <p className="text-xs text-gray-400">
                          {cb.lead.phone} · {new Date(cb.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className="text-xs text-green-600 font-semibold">✓ Done</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left: My Leads */}
        <div className="col-span-2 bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
          <h2 className="font-display text-lg font-bold text-tertiary mb-6 flex items-center gap-2">
            🎯 My Leads
            {myLeads.length > 0 && (
              <span className="ml-auto px-2.5 py-1 bg-primary/10 text-primary rounded-full font-label text-xs font-semibold">{myLeads.length}</span>
            )}
          </h2>
          {myLeads.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-body text-sm text-on-surface-muted">No leads assigned to you yet.</p>
              <p className="font-label text-xs text-on-surface-muted mt-1">Hot leads will be auto-assigned when available.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myLeads.map((lead) => (
                <div key={lead.id} className="p-4 bg-surface-low rounded-xl hover:bg-surface-mid transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-body text-sm font-semibold text-on-surface truncate">{lead.name || formatPhone(lead.phone)}</p>
                        {lead.score >= 7 && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-label text-[10px] font-bold">HOT</span>}
                      </div>
                      <p className="font-label text-xs text-on-surface-muted mt-0.5">
                        {lead.name ? formatPhone(lead.phone) + " · " : ""}Score {lead.score}
                      </p>
                      {lastCalledMap[lead.id] && (
                        <p className="font-label text-[10px] text-on-surface-muted mt-0.5">Called {timeAgo(lastCalledMap[lead.id])}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setViewingLead(lead)} className="p-2 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted" title="View notes">
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => openBriefing(lead)}
                        disabled={dialing === lead.id}
                        className="flex items-center gap-2 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                      >
                        <Phone size={12} />
                        {dialing === lead.id ? "Dialing…" : "Call"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-6">
          {activeCallCtx && <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />}

          {/* Manual Dial */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <h2 className="font-display text-sm font-bold text-tertiary mb-3 flex items-center gap-2">
              <Phone size={14} className="text-secondary" /> Manual Dial
            </h2>
            <div className="flex gap-2">
              <input
                type="tel" placeholder="e.g. +919942497199" value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manualDial()}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <button onClick={manualDial} disabled={manualDialing || !manualPhone.trim()}
                className="px-3 py-2 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {manualDialing ? <RefreshCw size={14} className="animate-spin" /> : <Phone size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {briefingLead && (
        <BriefingModal lead={briefingLead} notes={briefingNotes} loading={briefingLoading} dialing={dialing === briefingLead.id} viewOnly={false}
          onStartCall={startCallFromBriefing} onClose={() => setBriefingLead(null)}
          onViewAllNotes={() => { setHistoryLead(briefingLead); setBriefingLead(null); }} />
      )}
      {viewingLead && (
        <BriefingModal lead={viewingLead} notes={viewingNotes} loading={viewingLoading} dialing={false} viewOnly={true}
          onStartCall={() => {}} onClose={() => setViewingLead(null)}
          onViewAllNotes={() => { setHistoryLead(viewingLead); setViewingLead(null); }} />
      )}
      {historyLead && <NotesHistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />}
    </div>
  );
}
