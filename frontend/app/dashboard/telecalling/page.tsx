"use client";
import { useEffect, useState } from "react";
import {
  Phone, Star, TrendingUp, Sparkles, RefreshCw, UserPlus, X,
  Pencil, Trash2, Eye, RotateCcw, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, Caller, CallLog, Lead } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import BriefingModal from "./components/briefing-modal";
import LiveNotesPane from "./components/live-notes-pane";
import NotesHistoryModal from "./components/notes-history-modal";
import { fetchNotes } from "./lib/notes-api";
import type { ActiveCallCtx, NotesResponse } from "./types";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-surface-mid text-on-surface-muted",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function defaultCallbackTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function formatAiSummary(s: CallLog["ai_summary"]): string {
  if (!s) return "";
  return Object.entries(s)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.replace("_", " ")}: ${v}`)
    .join(" · ");
}

// ── sub-component: queue card ─────────────────────────────────────────────────

function QueueCard({
  lead,
  dialing,
  lastCalledAt,
  hasSelected,
  onCall,
  onView,
}: {
  lead: Lead;
  dialing: string | null;
  lastCalledAt: string | undefined;
  hasSelected: boolean;
  onCall: (lead: Lead) => void;
  onView: (lead: Lead) => void;
}) {
  return (
    <div className="p-3 bg-surface-low rounded-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-on-surface truncate">
            {lead.name || formatPhone(lead.phone)}
          </p>
          <p className="font-label text-xs text-on-surface-muted mt-0.5">
            {lead.name ? formatPhone(lead.phone) + " · " : ""}Score {lead.score}
          </p>
          {lastCalledAt && (
            <p className="font-label text-[10px] text-on-surface-muted mt-0.5">
              Called {timeAgo(lastCalledAt)}
            </p>
          )}
        </div>
        <button
          onClick={() => onView(lead)}
          className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted shrink-0"
          title="View notes"
        >
          <Eye size={13} />
        </button>
      </div>
      <button
        onClick={() => onCall(lead)}
        disabled={dialing === lead.id || !hasSelected}
        className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Phone size={12} />
        {dialing === lead.id ? "Dialing…" : "Call"}
      </button>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TelecallingPage() {
  // callers
  const [callers, setCallers] = useState<Caller[]>([]);
  const [selected, setSelected] = useState<Caller | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [tip, setTip] = useState("");
  const [tipLoading, setTipLoading] = useState(false);

  // add / edit caller form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // queues
  const [hotQueue, setHotQueue] = useState<Lead[]>([]);
  const [callbackQueue, setCallbackQueue] = useState<Lead[]>([]);
  const [showCallbackQueue, setShowCallbackQueue] = useState(true);
  const [lastCalledMap, setLastCalledMap] = useState<Record<string, string>>({});

  // dialing state
  const [dialing, setDialing] = useState<string | null>(null);

  // manual dial
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // briefing modal (for calling)
  const [briefingLead, setBriefingLead] = useState<Lead | null>(null);
  const [briefingNotes, setBriefingNotes] = useState<NotesResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // notes-only viewer (eye icon)
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [viewingNotes, setViewingNotes] = useState<NotesResponse | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  // full notes history modal
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);

  // live notes pane
  const [activeCallCtx, setActiveCallCtx] = useState<ActiveCallCtx | null>(null);

  // phase 3: callback time picker per log
  const [callbackTimeMap, setCallbackTimeMap] = useState<Record<string, string>>({});
  const [showCallbackPicker, setShowCallbackPicker] = useState<Record<string, boolean>>({});

  // phase 2: AI summary toggle
  const [aiSummaryOpen, setAiSummaryOpen] = useState<Record<string, boolean>>({});

  // ── data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    api.callers.list().then((rows) => {
      setCallers(rows);
      if (rows.length && !selected) setSelected(rows[0]);
    });
    loadQueues();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return;
    api.callers.logs(selected.id).then(setLogs);
    setTip("");
  }, [selected]);

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

  async function loadQueues() {
    const [hot, cb] = await Promise.all([
      api.leads.list({ segment: "A", limit: 10 }),
      api.leads.list({ segment: "B", limit: 10 }),
    ]);
    setHotQueue(hot);
    setCallbackQueue(cb);

    const allIds = [...hot, ...cb].map((l) => l.id).filter(Boolean);
    if (allIds.length) {
      api.calls.recentByLeads(allIds).then(setLastCalledMap).catch(() => {});
    }
  }

  // ── caller CRUD ─────────────────────────────────────────────────────────────

  async function addCaller() {
    if (!newName.trim() || !newPhone.trim()) return;
    setAdding(true);
    try {
      await api.callers.create(newName.trim(), newPhone.trim());
      const rows = await api.callers.list();
      setCallers(rows);
      setNewName(""); setNewPhone(""); setShowAddForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add caller");
    } finally { setAdding(false); }
  }

  function startEdit(caller: Caller, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(caller.id);
    setEditName(caller.name);
    setEditPhone(caller.phone ?? "");
  }

  async function saveCaller(id: string) {
    setSaving(true);
    try {
      await api.callers.update(id, { name: editName.trim(), phone: editPhone.trim() });
      const rows = await api.callers.list();
      setCallers(rows);
      setSelected((prev) => rows.find((c) => c.id === prev?.id) ?? rows[0] ?? null);
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally { setSaving(false); }
  }

  async function deleteCaller(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this caller?")) return;
    try {
      await api.callers.remove(id);
      const rows = await api.callers.list();
      setCallers(rows);
      if (selected?.id === id) setSelected(rows[0] ?? null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // ── dialing ─────────────────────────────────────────────────────────────────

  async function executeDial(leadId: string, lead: Lead) {
    if (!selected) { alert("Select a caller first"); return; }
    setDialing(leadId);
    try {
      await api.calls.initiate({ leadId }, selected.id);
      setActiveCallCtx({ leadId, name: lead.name, phone: lead.phone });
      api.callers.logs(selected.id).then(setLogs);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    } finally { setDialing(null); }
  }

  function openBriefing(lead: Lead) {
    if (!selected) { alert("Select a caller first"); return; }
    setBriefingLead(lead);
  }

  function startCallFromBriefing() {
    if (!briefingLead) return;
    const lead = briefingLead;
    setBriefingLead(null);
    executeDial(lead.id, lead);
  }

  async function manualDial() {
    if (!selected) { alert("Select a caller first"); return; }
    if (!manualPhone.trim()) return;
    setManualDialing(true);
    try {
      await api.calls.initiate({ phone: manualPhone.trim() }, selected.id);
      setActiveCallCtx({ leadId: null, name: null, phone: manualPhone.trim() });
      setManualPhone("");
      api.callers.logs(selected.id).then(setLogs);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    } finally { setManualDialing(false); }
  }

  // ── outcome + callback time ──────────────────────────────────────────────────

  async function handleSetOutcome(log: CallLog, outcome: NonNullable<CallLog["outcome"]>) {
    if (!selected) return;
    if (outcome === "callback") {
      setShowCallbackPicker((prev) => ({ ...prev, [log.id]: true }));
      setCallbackTimeMap((prev) => ({ ...prev, [log.id]: prev[log.id] ?? defaultCallbackTime() }));
    }
    try {
      await api.calls.setOutcome(log.id, outcome);
      const [freshLogs, freshCallers] = await Promise.all([
        api.callers.logs(selected.id),
        api.callers.list(),
      ]);
      setLogs(freshLogs);
      setCallers(freshCallers);
      setSelected(freshCallers.find((c) => c.id === selected.id) ?? selected);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function saveCallbackTime(logId: string) {
    const cbTime = callbackTimeMap[logId];
    if (!cbTime || !selected) return;
    try {
      await api.calls.setOutcome(logId, "callback", new Date(cbTime).toISOString());
      setShowCallbackPicker((prev) => ({ ...prev, [logId]: false }));
      alert(`Callback reminder set for ${new Date(cbTime).toLocaleString()}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save callback time");
    }
  }

  // ── call again ───────────────────────────────────────────────────────────────

  async function callAgain(log: CallLog) {
    if (!selected || !log.lead_id) return;
    try {
      await api.calls.initiate({ leadId: log.lead_id }, selected.id);
      setActiveCallCtx({ leadId: log.lead_id, name: null, phone: null });
      api.callers.logs(selected.id).then(setLogs);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    }
  }

  // ── AI coaching ──────────────────────────────────────────────────────────────

  async function loadTip() {
    if (!selected) return;
    setTipLoading(true);
    try {
      const res = await api.callers.coaching(selected.id);
      setTip(res.tip);
    } catch (err) {
      setTip(err instanceof Error ? err.message : "Could not fetch tip");
    } finally { setTipLoading(false); }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">Telecalling</h1>
        <p className="font-body text-on-surface-muted mt-1">AI-assisted caller management</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── left panel ── */}
        <div className="col-span-2 bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
          {/* caller roster header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-bold text-tertiary">Caller Roster</h2>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors"
            >
              {showAddForm ? <X size={13} /> : <UserPlus size={13} />}
              {showAddForm ? "Cancel" : "Add Caller"}
            </button>
          </div>

          {/* add form */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-surface-low rounded-xl space-y-3">
              <input
                type="text" placeholder="Name (e.g. Priya)" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <input
                type="tel" placeholder="Phone (e.g. +919345679286)" value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <button
                onClick={addCaller} disabled={adding || !newName.trim() || !newPhone.trim()}
                className="w-full py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? "Adding…" : "Add Caller"}
              </button>
            </div>
          )}

          {/* caller list */}
          {callers.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted">No callers yet. Click &quot;Add Caller&quot; to get started.</p>
          ) : (
            <div className="space-y-3">
              {callers.map((caller) => {
                const isSelected = selected?.id === caller.id;
                const isEditing = editingId === caller.id;
                return (
                  <div
                    key={caller.id}
                    onClick={() => !isEditing && setSelected(caller)}
                    className={`p-4 rounded-xl transition-all ${isEditing ? "bg-surface-low ring-2 ring-tertiary" : isSelected ? "bg-tertiary-bg ring-2 ring-tertiary cursor-pointer" : "bg-surface-low hover:bg-surface-mid cursor-pointer"}`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onClick={(e) => e.stopPropagation()}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
                        <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} onClick={(e) => e.stopPropagation()}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary" />
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); saveCaller(caller.id); }} disabled={saving}
                            className="flex-1 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                            className="flex-1 py-1.5 bg-surface border border-surface-mid rounded-lg font-label text-xs font-semibold hover:bg-surface-mid transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-tertiary-bg flex items-center justify-center shrink-0">
                          <span className="font-display text-sm font-bold text-tertiary">
                            {caller.name.split(" ").map((n) => n[0]).join("")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm font-semibold text-on-surface">{caller.name}</p>
                          <p className="font-label text-xs text-on-surface-muted">{caller.phone ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star size={13} className="text-secondary fill-secondary" />
                          <span className="font-label text-sm font-semibold text-on-surface">
                            {Number(caller.overall_score ?? 0).toFixed(1)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full font-label text-xs font-semibold ${STATUS_COLORS[caller.active ? "active" : "inactive"]}`}>
                          {caller.active ? "active" : "inactive"}
                        </span>
                        <div className="flex items-center gap-1 ml-1">
                          <button onClick={(e) => startEdit(caller, e)}
                            className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted hover:text-on-surface" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={(e) => deleteCaller(caller.id, e)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-on-surface-muted hover:text-red-500" title="Remove">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* recent calls */}
          {selected && (
            <div className="mt-8 pt-6 border-t border-surface-mid">
              <h3 className="font-display text-sm font-bold text-tertiary mb-4">
                Recent calls — {selected.name}
              </h3>
              {logs.length === 0 ? (
                <p className="font-body text-sm text-on-surface-muted">No calls yet.</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 bg-surface-low rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="font-label text-xs font-semibold text-on-surface capitalize">
                          {log.status.replace("_", " ")}
                          {log.outcome && ` · ${log.outcome.replace("_", " ")}`}
                        </span>
                        <div className="flex items-center gap-2">
                          {log.lead_id && (
                            <button
                              onClick={() => callAgain(log)}
                              className="p-1 rounded hover:bg-surface-mid transition-colors text-on-surface-muted hover:text-tertiary"
                              title="Call again"
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                          <span className="font-label text-xs text-on-surface-muted">{timeAgo(log.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-1 font-label text-xs text-on-surface-muted">
                        {log.duration_seconds != null && <span>{log.duration_seconds}s</span>}
                        {log.score != null && <span>Score {Number(log.score).toFixed(1)}</span>}
                      </div>

                      {/* outcome dropdown */}
                      <div className="mt-2 flex items-center gap-2">
                        <label className="font-label text-xs text-on-surface-muted">Outcome</label>
                        <select
                          value={log.outcome ?? ""}
                          onChange={(e) => handleSetOutcome(log, e.target.value as NonNullable<CallLog["outcome"]>)}
                          className="px-2 py-1 rounded-md bg-surface border border-surface-mid font-label text-xs"
                        >
                          <option value="">—</option>
                          <option value="converted">Converted</option>
                          <option value="callback">Callback</option>
                          <option value="not_interested">Not interested</option>
                          <option value="no_answer">No answer</option>
                        </select>
                      </div>

                      {/* Phase 3: callback time picker */}
                      {showCallbackPicker[log.id] && (
                        <div className="mt-2 p-3 bg-surface rounded-lg border border-surface-mid space-y-2">
                          <p className="font-label text-xs font-semibold text-on-surface-muted">Schedule callback reminder</p>
                          <input
                            type="datetime-local"
                            value={callbackTimeMap[log.id] ?? ""}
                            onChange={(e) => setCallbackTimeMap((prev) => ({ ...prev, [log.id]: e.target.value }))}
                            className="w-full px-2 py-1 rounded-md bg-surface-low border border-surface-mid font-label text-xs focus:outline-none focus:ring-2 focus:ring-tertiary"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveCallbackTime(log.id)}
                              className="flex-1 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors"
                            >
                              Save Reminder
                            </button>
                            <button
                              onClick={() => setShowCallbackPicker((prev) => ({ ...prev, [log.id]: false }))}
                              className="flex-1 py-1.5 bg-surface border border-surface-mid rounded-lg font-label text-xs font-semibold hover:bg-surface-mid transition-colors"
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Phase 2: AI summary */}
                      {log.ai_summary && (
                        <div className="mt-2">
                          <button
                            onClick={() => setAiSummaryOpen((prev) => ({ ...prev, [log.id]: !prev[log.id] }))}
                            className="flex items-center gap-1 font-label text-xs text-secondary hover:underline"
                          >
                            <Sparkles size={11} />
                            AI Summary
                            {aiSummaryOpen[log.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                          {aiSummaryOpen[log.id] && (
                            <p className="mt-1 font-body text-xs text-on-surface-muted bg-surface p-2 rounded-lg border border-surface-mid">
                              {formatAiSummary(log.ai_summary)}
                            </p>
                          )}
                        </div>
                      )}

                      {log.recording_url && (
                        <audio controls src={log.recording_url} className="mt-2 w-full h-8" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── right panel ── */}
        <div className="space-y-6">
          {/* AI Coaching */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
                <Sparkles size={14} className="text-secondary" /> AI Coaching
              </h2>
              <button onClick={loadTip} disabled={!selected || tipLoading}
                className="p-1.5 rounded-lg hover:bg-surface-low transition-colors disabled:opacity-40" title="Refresh tip">
                <RefreshCw size={14} className={tipLoading ? "animate-spin" : ""} />
              </button>
            </div>
            <p className="font-body text-sm text-on-surface min-h-[3rem]">
              {!selected ? "Select a caller to get coaching." : tip ? tip : tipLoading ? "Generating…" : "Click refresh to generate a tip."}
            </p>
          </div>

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
              <button onClick={manualDial} disabled={manualDialing || !manualPhone.trim() || !selected}
                className="px-3 py-2 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {manualDialing ? "…" : <Phone size={14} />}
              </button>
            </div>
            {!selected && <p className="font-label text-xs text-on-surface-muted mt-2">Select a caller first.</p>}
          </div>

          {/* Hot Queue (Segment A) */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <h2 className="font-display text-base font-bold text-tertiary mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-secondary" />
              Hot Queue (Segment A)
              {hotQueue.length > 0 && (
                <span className="ml-auto px-2 py-0.5 bg-secondary/10 text-secondary rounded-full font-label text-xs font-semibold">
                  {hotQueue.length}
                </span>
              )}
            </h2>
            {hotQueue.length === 0 ? (
              <p className="font-body text-sm text-on-surface-muted">No hot leads.</p>
            ) : (
              <div className="space-y-3">
                {hotQueue.map((lead) => (
                  <QueueCard
                    key={lead.id} lead={lead} dialing={dialing}
                    lastCalledAt={lastCalledMap[lead.id]}
                    hasSelected={!!selected}
                    onCall={openBriefing}
                    onView={(l) => setViewingLead(l)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Callback Queue (Segment B) */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <button
              onClick={() => setShowCallbackQueue((v) => !v)}
              className="w-full flex items-center gap-2 mb-1"
            >
              <h2 className="font-display text-base font-bold text-tertiary flex items-center gap-2 flex-1 text-left">
                <Phone size={16} className="text-secondary" />
                Callbacks (Segment B)
                {callbackQueue.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-label text-xs font-semibold">
                    {callbackQueue.length}
                  </span>
                )}
              </h2>
              {showCallbackQueue ? <ChevronUp size={14} className="text-on-surface-muted" /> : <ChevronDown size={14} className="text-on-surface-muted" />}
            </button>

            {showCallbackQueue && (
              <div className="mt-4">
                {callbackQueue.length === 0 ? (
                  <p className="font-body text-sm text-on-surface-muted">No callbacks pending.</p>
                ) : (
                  <div className="space-y-3">
                    {callbackQueue.map((lead) => (
                      <QueueCard
                        key={lead.id} lead={lead} dialing={dialing}
                        lastCalledAt={lastCalledMap[lead.id]}
                        hasSelected={!!selected}
                        onCall={openBriefing}
                        onView={(l) => setViewingLead(l)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Briefing Modal (pre-call) ── */}
      {briefingLead && (
        <BriefingModal
          lead={briefingLead}
          notes={briefingNotes}
          loading={briefingLoading}
          dialing={dialing === briefingLead.id}
          viewOnly={false}
          onStartCall={startCallFromBriefing}
          onClose={() => setBriefingLead(null)}
          onViewAllNotes={() => { setHistoryLead(briefingLead); setBriefingLead(null); }}
        />
      )}

      {/* ── Notes Viewer Modal (read-only, eye icon) ── */}
      {viewingLead && (
        <BriefingModal
          lead={viewingLead}
          notes={viewingNotes}
          loading={viewingLoading}
          dialing={false}
          viewOnly={true}
          onStartCall={() => {}}
          onClose={() => setViewingLead(null)}
          onViewAllNotes={() => { setHistoryLead(viewingLead); setViewingLead(null); }}
        />
      )}

      {/* ── Full Notes History Modal ── */}
      {historyLead && (
        <NotesHistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />
      )}

      {/* ── Live Notes Pane ── */}
      {activeCallCtx && (
        <LiveNotesPane ctx={activeCallCtx} onClose={() => setActiveCallCtx(null)} />
      )}
    </div>
  );
}
