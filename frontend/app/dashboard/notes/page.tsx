"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import {
  Search, StickyNote, Pin, Pencil, Trash2, Plus, X,
  ChevronDown, ChevronUp, Phone, Tag, Filter,
} from "lucide-react";
import { api, Lead, CallLog } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/utils";
import type { Note, NotesResponse } from "@/app/dashboard/telecalling/types";
import { fetchNotes } from "@/app/dashboard/telecalling/lib/notes-api";

// ─── Tag system ───────────────────────────────────────────────────────────────
const PRESET_TAGS = [
  { label: "Follow-up", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "Important", color: "bg-red-100 text-red-700 border-red-200" },
  { label: "Callback", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "Pricing", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { label: "Visit", color: "bg-green-100 text-green-700 border-green-200" },
  { label: "Brochure", color: "bg-teal-100 text-teal-700 border-teal-200" },
  { label: "Not interested", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { label: "Hot lead", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

function tagStyle(label: string): string {
  const found = PRESET_TAGS.find((t) => t.label.toLowerCase() === label.toLowerCase());
  return found?.color ?? "bg-indigo-100 text-indigo-700 border-indigo-200";
}

function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-label text-[10px] font-semibold ${tagStyle(label)}`}>
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
          <X size={9} />
        </button>
      )}
    </span>
  );
}

function TagSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  function toggle(label: string) {
    if (selected.includes(label)) {
      onChange(selected.filter((t) => t !== label));
    } else {
      onChange([...selected, label]);
    }
  }

  function addCustom() {
    const t = custom.trim();
    if (t && !selected.includes(t)) onChange([...selected, t]);
    setCustom("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-surface-mid font-label text-xs text-on-surface-muted hover:text-on-surface hover:bg-surface-low transition-colors"
      >
        <Tag size={11} />
        {selected.length > 0 ? `${selected.length} tag${selected.length > 1 ? "s" : ""}` : "Add tags"}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-30 w-56 bg-surface rounded-xl shadow-card border border-surface-mid p-3 space-y-2">
          <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider">Select tags</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((t) => (
              <button
                key={t.label}
                onClick={() => toggle(t.label)}
                className={`px-2 py-0.5 rounded-full border font-label text-[10px] font-semibold transition-all ${
                  selected.includes(t.label)
                    ? t.color + " ring-2 ring-offset-1 ring-current"
                    : "bg-surface-low border-surface-mid text-on-surface-muted hover:border-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="Custom tag…"
              className="flex-1 px-2 py-1 rounded-lg bg-surface-low border border-surface-mid font-label text-xs focus:outline-none focus:ring-1 focus:ring-tertiary"
            />
            <button onClick={addCustom} className="px-2 py-1 rounded-lg bg-tertiary text-white font-label text-xs hover:bg-tertiary/90">
              <Plus size={11} />
            </button>
          </div>
          <button onClick={() => setOpen(false)} className="w-full text-center font-label text-[10px] text-on-surface-muted hover:text-on-surface">Done</button>
        </div>
      )}
    </div>
  );
}

// ─── Segment colors ───────────────────────────────────────────────────────────
const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-blue-100 text-blue-700",
  D: "bg-red-100 text-red-600",
};
const SEGMENT_LABELS: Record<string, string> = {
  A: "Hot", B: "Warm", C: "Cold", D: "Disqualified",
};

// ─── AI Summary card ──────────────────────────────────────────────────────────
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

// ─── Main Notes Page ─────────────────────────────────────────────────────────
export default function NotesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [lastCalledMap, setLastCalledMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<NotesResponse | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  // Add note state
  const [addContent, setAddContent] = useState("");
  const [addPinned, setAddPinned] = useState(false);
  const [addTags, setAddTags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Edit note state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Tag filter
  const [filterTag, setFilterTag] = useState<string | null>(null);

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

  const refreshNotes = useCallback(async () => {
    if (!selected) return;
    setNotes(await fetchNotes(selected.id));
  }, [selected]);

  async function addNote() {
    if (!selected || !addContent.trim()) return;
    setAdding(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${apiUrl}/api/v1/lead-notes/${selected.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ content: addContent.trim(), is_pinned: addPinned, tags: addTags }),
      });
      setAddContent(""); setAddPinned(false); setAddTags([]);
      await refreshNotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    } finally { setAdding(false); }
  }

  async function saveEdit(noteId: string) {
    setSaving(true);
    try {
      await api.notes.update(noteId, { content: editContent.trim(), is_pinned: editPinned, tags: editTags });
      setEditingId(null);
      await refreshNotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally { setSaving(false); }
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await api.notes.delete(noteId);
      await refreshNotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const allNotes = notes ? [...notes.pinned, ...notes.notes] : [];
  const filteredNotes = filterTag
    ? allNotes.filter((n: Note) => (n.tags ?? []).includes(filterTag))
    : allNotes;
  const aiLogs = callLogs.filter((l) => l.ai_summary);

  // Collect all unique tags across notes for filter UI
  const allTags = Array.from(new Set(allNotes.flatMap((n: Note) => n.tags ?? [])));

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
              {/* Lead header card */}
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
                  {/* Notes Section */}
                  <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-base font-bold text-tertiary flex items-center gap-2">
                        <StickyNote size={15} className="text-secondary" /> Notes
                        {allNotes.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-tertiary/10 font-label text-[10px] text-tertiary">
                            {allNotes.length}
                          </span>
                        )}
                      </h3>
                      {/* Tag filter */}
                      {allTags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Filter size={11} className="text-on-surface-muted" />
                          {filterTag && (
                            <button onClick={() => setFilterTag(null)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-tertiary/10 font-label text-[10px] text-tertiary hover:bg-tertiary/20">
                              <X size={8} /> Clear
                            </button>
                          )}
                          {allTags.map((t) => (
                            <button key={t} onClick={() => setFilterTag(filterTag === t ? null : t)}
                              className={`px-2 py-0.5 rounded-full border font-label text-[10px] font-semibold transition-all ${tagStyle(t)} ${filterTag === t ? "ring-2 ring-current ring-offset-1" : "opacity-60 hover:opacity-100"}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add note input */}
                    <div className="mb-5 p-4 bg-surface-low rounded-xl space-y-3">
                      <textarea value={addContent} onChange={(e) => setAddContent(e.target.value)}
                        placeholder="Add a new note…" rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={addPinned} onChange={(e) => setAddPinned(e.target.checked)} className="rounded" />
                            <span className="font-label text-sm text-on-surface-muted">Pin note</span>
                          </label>
                          <TagSelector selected={addTags} onChange={setAddTags} />
                        </div>
                        <button onClick={addNote} disabled={adding || !addContent.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          <Plus size={13} /> {adding ? "Saving…" : "Add Note"}
                        </button>
                      </div>
                      {/* Preview selected add-tags */}
                      {addTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {addTags.map((t) => <TagChip key={t} label={t} onRemove={() => setAddTags(addTags.filter((x) => x !== t))} />)}
                        </div>
                      )}
                    </div>

                    {/* Notes list */}
                    {filteredNotes.length === 0 ? (
                      <p className="font-body text-sm text-on-surface-muted">
                        {filterTag ? `No notes tagged "${filterTag}".` : "No notes yet for this lead."}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredNotes.map((note: Note) => (
                          <div key={note.id} className={`p-4 rounded-xl transition-all ${note.is_pinned ? "bg-amber-50 border border-amber-100" : "bg-surface-low"}`}>
                            {editingId === note.id ? (
                              <div className="space-y-2">
                                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3}
                                  className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
                                />
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input type="checkbox" checked={editPinned} onChange={(e) => setEditPinned(e.target.checked)} className="rounded" />
                                      <span className="font-label text-xs text-on-surface-muted">Pinned</span>
                                    </label>
                                    <TagSelector selected={editTags} onChange={setEditTags} />
                                  </div>
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
                                {editTags.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {editTags.map((t) => <TagChip key={t} label={t} onRemove={() => setEditTags(editTags.filter((x) => x !== t))} />)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-body text-sm text-on-surface whitespace-pre-wrap">{note.content}</p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span className="font-label text-[10px] text-on-surface-muted">{timeAgo(note.created_at)}</span>
                                    {note.is_pinned && (
                                      <span className="flex items-center gap-0.5 font-label text-[10px] text-amber-600 font-semibold">
                                        <Pin size={9} /> Pinned
                                      </span>
                                    )}
                                    {(note.tags ?? []).map((t: string) => (
                                      <TagChip key={t} label={t} />
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => {
                                    setEditingId(note.id);
                                    setEditContent(note.content);
                                    setEditPinned(note.is_pinned);
                                    setEditTags(note.tags ?? []);
                                  }}
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

                  {/* AI Call Summaries Section */}
                  <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
                    <h3 className="font-display text-base font-bold text-tertiary mb-4 flex items-center gap-2">
                      <Phone size={15} className="text-secondary" /> Call Summaries
                      {aiLogs.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-tertiary/10 font-label text-[10px] text-tertiary">
                          {aiLogs.length}
                        </span>
                      )}
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
