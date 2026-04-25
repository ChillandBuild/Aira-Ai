"use client";
import { useEffect, useState } from "react";
import { Phone, Star, TrendingUp, Sparkles, RefreshCw, UserPlus, X, Pencil, Trash2, Pin, FileText } from "lucide-react";
import { api, Caller, CallLog, Lead, API_URL } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";

type Note = {
  id: string;
  lead_id: string;
  caller_id: string | null;
  call_log_id: string | null;
  content: string;
  structured: {
    course?: string;
    budget?: string;
    timeline?: string;
    next_action?: string;
    sentiment?: string;
  };
  is_pinned: boolean;
  created_at: string;
};

type NotesResponse = {
  pinned: Note[];
  notes: Note[];
};

async function fetchNotes(leadId: string): Promise<NotesResponse> {
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function saveNote(
  leadId: string,
  content: string,
  isPinned: boolean,
): Promise<Note> {
  const res = await fetch(`${API_URL}/api/v1/lead-notes/${leadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, is_pinned: isPinned }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-surface-mid text-on-surface-muted",
};

const BRIEFING_TAGS = [
  "Confirm campus visit",
  "Discuss fees",
  "Schedule callback",
  "Send brochure",
];

const LIVE_NOTE_TAGS = [
  "Meeting scheduled",
  "Not interested",
  "Call back later",
  "Discussed fees",
  "Campus visit planned",
  "Needs more info",
];

function StructuredFields({ data }: { data: Note["structured"] }) {
  const entries = Object.entries(data).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {entries.map(([k, v]) => (
        <span key={k} className="font-label text-[10px] text-on-surface-muted">
          <span className="font-semibold capitalize">{k.replace("_", " ")}:</span> {v}
        </span>
      ))}
    </div>
  );
}

export default function TelecallingPage() {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [queue, setQueue] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Caller | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [tip, setTip] = useState<string>("");
  const [tipLoading, setTipLoading] = useState(false);
  const [dialing, setDialing] = useState<string | null>(null);

  // add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);

  // edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // manual dial
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);

  // briefing modal
  const [briefingLead, setBriefingLead] = useState<Lead | null>(null);
  const [briefingNotes, setBriefingNotes] = useState<NotesResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // live notes pane
  const [activeCallLeadId, setActiveCallLeadId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [notePinned, setNotePinned] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.callers.list().then((rows) => {
      setCallers(rows);
      if (rows.length && !selected) setSelected(rows[0]);
    });
    api.leads.list({ segment: "A", limit: 10 }).then(setQueue);
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.callers.logs(selected.id).then(setLogs);
    setTip("");
  }, [selected]);

  useEffect(() => {
    if (!briefingLead) {
      setBriefingNotes(null);
      return;
    }
    setBriefingLoading(true);
    fetchNotes(briefingLead.id)
      .then(setBriefingNotes)
      .catch(() => setBriefingNotes({ pinned: [], notes: [] }))
      .finally(() => setBriefingLoading(false));
  }, [briefingLead]);

  async function loadTip() {
    if (!selected) return;
    setTipLoading(true);
    try {
      const res = await api.callers.coaching(selected.id);
      setTip(res.tip);
    } catch (err) {
      setTip(err instanceof Error ? err.message : "Could not fetch tip");
    } finally {
      setTipLoading(false);
    }
  }

  async function addCaller() {
    if (!newName.trim() || !newPhone.trim()) return;
    setAdding(true);
    try {
      await api.callers.create(newName.trim(), newPhone.trim());
      const rows = await api.callers.list();
      setCallers(rows);
      setNewName("");
      setNewPhone("");
      setShowAddForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add caller");
    } finally {
      setAdding(false);
    }
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
    } finally {
      setSaving(false);
    }
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

  async function executeDial(leadId: string) {
    if (!selected) { alert("Select a caller first"); return; }
    setDialing(leadId);
    try {
      const res = await api.calls.initiate({ leadId }, selected.id);
      alert(`Call initiated (${res.status}). SID ${res.call_sid}`);
      api.callers.logs(selected.id).then(setLogs);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    } finally {
      setDialing(null);
    }
  }

  function openBriefing(lead: Lead) {
    if (!selected) { alert("Select a caller first"); return; }
    setBriefingLead(lead);
  }

  function startCallFromBriefing() {
    if (!briefingLead) return;
    const lead = briefingLead;
    setBriefingLead(null);
    setActiveCallLeadId(lead.id);
    setNoteContent("");
    setNotePinned(false);
    executeDial(lead.id);
  }

  async function manualDial() {
    if (!selected) { alert("Select a caller first"); return; }
    if (!manualPhone.trim()) return;
    setManualDialing(true);
    try {
      const res = await api.calls.initiate({ phone: manualPhone.trim() }, selected.id);
      alert(`Call initiated (${res.status}). SID ${res.call_sid}`);
      setManualPhone("");
      api.callers.logs(selected.id).then(setLogs);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Call failed");
    } finally {
      setManualDialing(false);
    }
  }

  async function handleSaveNote() {
    if (!activeCallLeadId || !noteContent.trim()) return;
    setNoteSaving(true);
    try {
      await saveNote(activeCallLeadId, noteContent.trim(), notePinned);
      setNoteContent("");
      setNotePinned(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  }

  function appendTag(tag: string) {
    setNoteContent((prev) => (prev.trim() ? `${prev.trim()}\n${tag}` : tag));
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">Telecalling</h1>
        <p className="font-body text-on-surface-muted mt-1">AI-assisted caller management</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
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

          {showAddForm && (
            <div className="mb-6 p-4 bg-surface-low rounded-xl space-y-3">
              <input
                type="text"
                placeholder="Name (e.g. Priya)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <input
                type="tel"
                placeholder="Phone (e.g. +919345679286)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <button
                onClick={addCaller}
                disabled={adding || !newName.trim() || !newPhone.trim()}
                className="w-full py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? "Adding…" : "Add Caller"}
              </button>
            </div>
          )}

          {callers.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted">
              No callers yet. Click &quot;Add Caller&quot; to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {callers.map((caller) => {
                const isSelected = selected?.id === caller.id;
                const isEditing = editingId === caller.id;
                return (
                  <div
                    key={caller.id}
                    onClick={() => !isEditing && setSelected(caller)}
                    className={`p-4 rounded-xl transition-all ${
                      isEditing ? "bg-surface-low ring-2 ring-tertiary" :
                      isSelected ? "bg-tertiary-bg ring-2 ring-tertiary cursor-pointer" :
                      "bg-surface-low hover:bg-surface-mid cursor-pointer"
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                        />
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); saveCaller(caller.id); }}
                            disabled={saving}
                            className="flex-1 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                            className="flex-1 py-1.5 bg-surface border border-surface-mid rounded-lg font-label text-xs font-semibold hover:bg-surface-mid transition-colors"
                          >
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
                          <button
                            onClick={(e) => startEdit(caller, e)}
                            className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted hover:text-on-surface"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={(e) => deleteCaller(caller.id, e)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-on-surface-muted hover:text-red-500"
                            title="Remove"
                          >
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

          {selected && (
            <div className="mt-8 pt-6 border-t border-surface-mid">
              <h3 className="font-display text-sm font-bold text-tertiary mb-4">
                Recent calls — {selected.name}
              </h3>
              {logs.length === 0 ? (
                <p className="font-body text-sm text-on-surface-muted">No calls yet.</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 bg-surface-low rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="font-label text-xs font-semibold text-on-surface capitalize">
                          {log.status.replace("_", " ")}
                          {log.outcome && ` · ${log.outcome.replace("_", " ")}`}
                        </span>
                        <span className="font-label text-xs text-on-surface-muted">{timeAgo(log.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 font-label text-xs text-on-surface-muted">
                        {log.duration_seconds != null && <span>{log.duration_seconds}s</span>}
                        {log.score != null && <span>Score {Number(log.score).toFixed(1)}</span>}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <label className="font-label text-xs text-on-surface-muted">Outcome</label>
                        <select
                          value={log.outcome ?? ""}
                          onChange={async (e) => {
                            const outcome = e.target.value as NonNullable<CallLog["outcome"]>;
                            if (!outcome || !selected) return;
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
                          }}
                          className="px-2 py-1 rounded-md bg-surface border border-surface-mid font-label text-xs"
                        >
                          <option value="">—</option>
                          <option value="converted">Converted</option>
                          <option value="callback">Callback</option>
                          <option value="not_interested">Not interested</option>
                          <option value="no_answer">No answer</option>
                        </select>
                      </div>
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

        <div className="space-y-6">
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
                <Sparkles size={14} className="text-secondary" />
                AI Coaching
              </h2>
              <button
                onClick={loadTip}
                disabled={!selected || tipLoading}
                className="p-1.5 rounded-lg hover:bg-surface-low transition-colors disabled:opacity-40"
                title="Refresh tip"
              >
                <RefreshCw size={14} className={tipLoading ? "animate-spin" : ""} />
              </button>
            </div>
            <p className="font-body text-sm text-on-surface min-h-[3rem]">
              {!selected ? "Select a caller to get coaching."
                : tip ? tip
                : tipLoading ? "Generating…"
                : "Click refresh to generate a tip."}
            </p>
          </div>

          {/* Manual Dial */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <h2 className="font-display text-sm font-bold text-tertiary mb-3 flex items-center gap-2">
              <Phone size={14} className="text-secondary" />
              Manual Dial
            </h2>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="e.g. +919942497199"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manualDial()}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <button
                onClick={manualDial}
                disabled={manualDialing || !manualPhone.trim() || !selected}
                className="px-3 py-2 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {manualDialing ? "…" : <Phone size={14} />}
              </button>
            </div>
            {!selected && (
              <p className="font-label text-xs text-on-surface-muted mt-2">Select a caller first.</p>
            )}
          </div>

          {/* Hot Call Queue */}
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
            <h2 className="font-display text-base font-bold text-tertiary mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-secondary" />
              Hot Call Queue (Segment A)
            </h2>
            {queue.length === 0 ? (
              <p className="font-body text-sm text-on-surface-muted">No hot leads.</p>
            ) : (
              <div className="space-y-3">
                {queue.map((lead) => (
                  <div key={lead.id} className="p-3 bg-surface-low rounded-xl">
                    <p className="font-body text-sm font-semibold text-on-surface">
                      {formatPhone(lead.phone)}
                    </p>
                    <p className="font-label text-xs text-on-surface-muted mt-0.5">
                      {lead.name || "Unnamed lead"} · Score {lead.score}
                    </p>
                    <button
                      onClick={() => openBriefing(lead)}
                      disabled={dialing === lead.id || !selected}
                      className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Phone size={12} />
                      {dialing === lead.id ? "Dialing…" : "Call"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Briefing Modal */}
      {briefingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-card p-8 shadow-card w-full max-w-md ring-1 ring-[#c4c7c7]/20 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg font-bold text-tertiary">Pre-Call Briefing</h2>
              <button
                onClick={() => setBriefingLead(null)}
                className="p-1.5 rounded-lg hover:bg-surface-low transition-colors text-on-surface-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-5">
              <p className="font-body text-base font-semibold text-on-surface">
                {briefingLead.name || "Unnamed lead"}
              </p>
              <p className="font-label text-sm text-on-surface-muted mt-0.5">
                {formatPhone(briefingLead.phone)} · Score {briefingLead.score} · Segment {briefingLead.segment}
              </p>
            </div>

            {briefingLoading ? (
              <p className="font-body text-sm text-on-surface-muted mb-5">Loading notes…</p>
            ) : briefingNotes ? (
              <>
                {briefingNotes.pinned.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Pin size={11} />
                      Pinned Facts
                    </h3>
                    <div className="space-y-2">
                      {briefingNotes.pinned.map((note) => (
                        <div key={note.id} className="p-3 bg-surface-low rounded-xl">
                          <p className="font-body text-sm text-on-surface">{note.content}</p>
                          <StructuredFields data={note.structured} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {briefingNotes.notes.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FileText size={11} />
                      Last 3 Interactions
                    </h3>
                    <div className="space-y-2">
                      {briefingNotes.notes.slice(0, 3).map((note) => (
                        <div key={note.id} className="p-3 bg-surface-low rounded-xl">
                          <p className="font-label text-[10px] text-on-surface-muted mb-1">{timeAgo(note.created_at)}</p>
                          <p className="font-body text-sm text-on-surface line-clamp-2">{note.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {briefingNotes.pinned.length === 0 && briefingNotes.notes.length === 0 && (
                  <p className="font-body text-sm text-on-surface-muted mb-5">No previous notes for this lead.</p>
                )}
              </>
            ) : null}

            <div className="mb-6">
              <h3 className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2">
                Suggested Next Steps
              </h3>
              <div className="flex flex-wrap gap-2">
                {BRIEFING_TAGS.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-tertiary-bg text-tertiary rounded-full font-label text-xs font-semibold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startCallFromBriefing}
                disabled={dialing === briefingLead.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Phone size={14} />
                {dialing === briefingLead.id ? "Dialing…" : "Start Call"}
              </button>
              <button
                onClick={() => setBriefingLead(null)}
                className="flex-1 py-2.5 bg-surface border border-surface-mid rounded-lg font-label text-sm font-semibold hover:bg-surface-low transition-colors text-on-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Notes Pane */}
      {activeCallLeadId && (
        <div className="fixed right-4 top-20 z-40 w-80 bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/20 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
              <FileText size={14} className="text-secondary" />
              Live Notes
            </h2>
            <button
              onClick={() => setActiveCallLeadId(null)}
              className="p-1.5 rounded-lg hover:bg-surface-low transition-colors text-on-surface-muted"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {LIVE_NOTE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => appendTag(tag)}
                className="px-2 py-1 bg-surface-low hover:bg-surface-mid rounded-lg font-label text-[10px] font-semibold text-on-surface transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>

          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Type notes here…"
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
          />

          <label className="flex items-center gap-2 mt-2 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notePinned}
              onChange={(e) => setNotePinned(e.target.checked)}
              className="rounded"
            />
            <span className="font-label text-xs text-on-surface-muted">Pin this note</span>
          </label>

          <button
            onClick={handleSaveNote}
            disabled={noteSaving || !noteContent.trim()}
            className="w-full py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savedFlash ? "Saved ✓" : noteSaving ? "Saving…" : "Save Note"}
          </button>
        </div>
      )}
    </div>
  );
}
