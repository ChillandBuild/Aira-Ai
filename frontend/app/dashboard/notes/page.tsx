"use client";
import { useEffect, useState } from "react";
import { Search, StickyNote, Pin, Pencil, Trash2, Plus, X, ChevronDown, ChevronUp, Phone } from "lucide-react";
import { api, Lead, CallLog } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import type { Note, NotesResponse } from "@/app/dashboard/telecalling/types";
import { fetchNotes } from "@/app/dashboard/telecalling/lib/notes-api";

const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-blue-100 text-blue-700",
  D: "bg-red-100 text-red-600",
};

const SEGMENT_LABELS: Record<string, string> = {
  A: "Hot",
  B: "Warm",
  C: "Cold",
  D: "Disqualified",
};

function AiSummaryCard({ log }: { log: CallLog }) {
  const [open, setOpen] = useState(false);
  const s = log.ai_summary;
  if (!s) return null;
  const fields = Object.entries(s).filter(([, v]) => v);
  return (
    <div className="p-4 bg-surface-low rounded-xl border border-surface-mid">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-label text-xs font-semibold text-on-surface">
            {timeAgo(log.created_at)}
            {log.duration_seconds != null && ` · ${log.duration_seconds}s`}
          </p>
          <p className="font-label text-xs text-on-surface-muted capitalize mt-0.5">
            {log.status}{log.outcome ? ` · ${log.outcome.replace("_", " ")}` : ""}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="p-1 rounded hover:bg-surface-mid transition-colors">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-1.5">
          {fields.map(([k, v]) => (
            <p key={k} className="font-body text-xs text-on-surface">
              <span className="font-semibold capitalize">{k.replace("_", " ")}:</span> {v}
            </p>
          ))}
          {log.recording_url && (
            <audio controls src={log.recording_url} className="mt-2 w-full h-8" />
          )}
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [lastCalledMap, setLastCalledMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<NotesResponse | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const [addContent, setAddContent] = useState("");
  const [addPinned, setAddPinned] = useState(false);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadLeads(); }, []);

  useEffect(() => {
    if (!selected) { setNotes(null); setCallLogs([]); return; }
    setNotesLoading(true);
    Promise.all([fetchNotes(selected.id), api.leads.callLogs(selected.id)])
      .then(([n, logs]) => { setNotes(n); setCallLogs(logs); })
      .catch(() => { setNotes({ pinned: [], notes: [] }); setCallLogs([]); })
      .finally(() => setNotesLoading(false));
  }, [selected]);

  async function loadLeads() {
    const [a, b, c, d] = await Promise.all([
      api.leads.list({ segment: "A", limit: 50 }),
      api.leads.list({ segment: "B", limit: 50 }),
      api.leads.list({ segment: "C", limit: 50 }),
      api.leads.list({ segment: "D", limit: 50 }),
    ]);
    const all = [...a, ...b, ...c, ...d];
    setLeads(all);
    if (all.length) api.calls.recentByLeads(all.map((l) => l.id)).then(setLastCalledMap).catch(() => {});
  }

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    return !q || (l.name ?? "").toLowerCase().includes(q) || (l.phone ?? "").includes(q);
  });

  const sortedLeads = [...filtered].sort((a, b) => {
    const ta = lastCalledMap[a.id] ?? a.created_at;
    const tb = lastCalledMap[b.id] ?? b.created_at;
    return tb.localeCompare(ta);
  });

  async function refreshNotes() {
    if (!selected) return;
    setNotes(await fetchNotes(selected.id));
  }

  async function addNote() {
    if (!selected || !addContent.trim()) return;
    setAdding(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await fetch(`${apiUrl}/api/v1/lead-notes/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: addContent.trim(), is_pinned: addPinned }),
      });
      setAddContent(""); setAddPinned(false);
      await refreshNotes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add note");
    } finally { setAdding(false); }
  }

  async function saveEdit(noteId: string) {
    setSaving(true);
    try {
      await api.notes.update(noteId, { content: editContent.trim(), is_pinned: editPinned });
      setEditingId(null);
      await refreshNotes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally { setSaving(false); }
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await api.notes.delete(noteId);
      await refreshNotes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const allNotes = notes ? [...notes.pinned, ...notes.notes] : [];
  const aiLogs = callLogs.filter((l) => l.ai_summary);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">Notes</h1>
        <p className="font-body text-on-surface-muted mt-1">Search leads and manage call notes</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: lead list */}
        <div className="col-span-1">
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" />
            <input
              type="text" placeholder="Search by name or phone…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            />
          </div>
          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {sortedLeads.length === 0 && (
              <p className="font-body text-sm text-on-surface-muted px-2">No leads found.</p>
            )}
            {sortedLeads.map((lead) => (
              <button key={lead.id} onClick={() => setSelected(lead)}
                className={`w-full text-left p-4 rounded-xl transition-all ${selected?.id === lead.id ? "bg-tertiary-bg ring-2 ring-tertiary" : "bg-surface hover:bg-surface-low ring-1 ring-[#c4c7c7]/15"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-on-surface truncate">
                      {lead.name || formatPhone(lead.phone)}
                    </p>
                    {lead.name && <p className="font-label text-xs text-on-surface-muted">{formatPhone(lead.phone)}</p>}
                    {lastCalledMap[lead.id] && (
                      <p className="font-label text-[10px] text-on-surface-muted mt-0.5">Called {timeAgo(lastCalledMap[lead.id])}</p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-label text-[10px] font-semibold shrink-0 ${SEGMENT_COLORS[lead.segment]}`}>
                    {SEGMENT_LABELS[lead.segment]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: lead detail */}
        <div className="col-span-2">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 text-on-surface-muted">
              <StickyNote size={40} className="mb-3 opacity-30" />
              <p className="font-body text-sm">Select a lead to view notes</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold text-tertiary">
                    {selected.name || formatPhone(selected.phone)}
                  </h2>
                  <p className="font-label text-sm text-on-surface-muted mt-0.5">
                    {selected.name ? formatPhone(selected.phone) + " · " : ""}Segment {selected.segment} · Score {selected.score}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-surface-low transition-colors text-on-surface-muted">
                  <X size={16} />
                </button>
              </div>

              {notesLoading ? (
                <p className="font-body text-sm text-on-surface-muted px-2">Loading…</p>
              ) : (
                <>
                  {/* Section 1: Notes */}
                  <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
                    <h3 className="font-display text-base font-bold text-tertiary mb-4 flex items-center gap-2">
                      <StickyNote size={15} className="text-secondary" /> Notes
                    </h3>
                    <div className="mb-5 p-4 bg-surface-low rounded-xl space-y-3">
                      <textarea value={addContent} onChange={(e) => setAddContent(e.target.value)}
                        placeholder="Add a new note…" rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={addPinned} onChange={(e) => setAddPinned(e.target.checked)} className="rounded" />
                          <span className="font-label text-sm text-on-surface-muted">Pin this note</span>
                        </label>
                        <button onClick={addNote} disabled={adding || !addContent.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          <Plus size={13} /> {adding ? "Saving…" : "Add Note"}
                        </button>
                      </div>
                    </div>
                    {allNotes.length === 0 ? (
                      <p className="font-body text-sm text-on-surface-muted">No notes yet for this lead.</p>
                    ) : (
                      <div className="space-y-3">
                        {allNotes.map((note: Note) => (
                          <div key={note.id} className="p-4 bg-surface-low rounded-xl">
                            {editingId === note.id ? (
                              <div className="space-y-2">
                                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3}
                                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
                                />
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" checked={editPinned} onChange={(e) => setEditPinned(e.target.checked)} className="rounded" />
                                    <span className="font-label text-xs text-on-surface-muted">Pinned</span>
                                  </label>
                                  <div className="flex gap-2">
                                    <button onClick={() => saveEdit(note.id)} disabled={saving}
                                      className="px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">
                                      {saving ? "Saving…" : "Save"}
                                    </button>
                                    <button onClick={() => setEditingId(null)}
                                      className="px-3 py-1.5 bg-surface border border-surface-mid rounded-lg font-label text-xs font-semibold hover:bg-surface-mid transition-colors">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-body text-sm text-on-surface">{note.content}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="font-label text-[10px] text-on-surface-muted">{timeAgo(note.created_at)}</span>
                                    {note.is_pinned && (
                                      <span className="flex items-center gap-0.5 font-label text-[10px] text-secondary font-semibold">
                                        <Pin size={9} /> Pinned
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => { setEditingId(note.id); setEditContent(note.content); setEditPinned(note.is_pinned); }}
                                    className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted hover:text-on-surface">
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => deleteNote(note.id)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-on-surface-muted hover:text-red-500">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section 2: AI Summaries */}
                  <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
                    <h3 className="font-display text-base font-bold text-tertiary mb-4 flex items-center gap-2">
                      <Phone size={15} className="text-secondary" /> Call Summaries
                    </h3>
                    {aiLogs.length === 0 ? (
                      <p className="font-body text-sm text-on-surface-muted">No AI summaries yet. They appear after calls are processed.</p>
                    ) : (
                      <div className="space-y-3">
                        {aiLogs.map((log) => <AiSummaryCard key={log.id} log={log} />)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
