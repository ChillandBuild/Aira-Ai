# Notes Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/dashboard/notes` page where telecallers can search leads, view/add/edit/delete notes, and see AI summaries from calls — plus auto-close the live notes pane on save.

**Architecture:** One new backend endpoint (call logs by lead), one new Next.js page (two-column layout with search + lead detail), minimal changes to sidebar, live-notes-pane, telecalling page, and api.ts.

**Tech Stack:** FastAPI (Python 3.11), Next.js 14 App Router, TypeScript, Tailwind, Supabase (PostgreSQL), shadcn/ui patterns.

---

## Discovery: What Already Exists

- `PATCH /api/v1/lead-notes/note/{note_id}` — ✅ exists in `lead_notes.py`
- `DELETE /api/v1/lead-notes/note/{note_id}` — ✅ exists in `lead_notes.py`
- `GET /api/v1/lead-notes/{lead_id}` — ✅ exists, returns `{pinned, notes}`
- `POST /api/v1/lead-notes/{lead_id}` — ✅ exists
- `GET /api/v1/leads/` — ✅ exists, supports `?segment=` and `?limit=`
- `GET /api/v1/calls/recent-by-leads` — ✅ exists
- **Missing:** `GET /api/v1/leads/{lead_id}/call-logs` — need to add

## File Map

| File | Action |
|---|---|
| `backend/app/routes/leads.py` | Add `GET /{lead_id}/call-logs` endpoint |
| `frontend/lib/api.ts` | Add `leads.callLogs()`, `notes.update()`, `notes.delete()` |
| `frontend/components/sidebar.tsx` | Add Notes nav item |
| `frontend/app/dashboard/notes/page.tsx` | NEW — full notes page |
| `frontend/app/dashboard/telecalling/components/live-notes-pane.tsx` | Auto-close on save |
| `frontend/app/dashboard/telecalling/page.tsx` | Remove AI summary toggle from recent calls |

---

## Task 1: Backend — call logs by lead endpoint

**Files:**
- Modify: `backend/app/routes/leads.py`

- [ ] **Step 1: Add the endpoint at the bottom of leads.py**

```python
@router.get("/{lead_id}/call-logs")
async def get_lead_call_logs(lead_id: UUID):
    db = get_supabase()
    result = (
        db.table("call_logs")
        .select("id,call_sid,status,outcome,duration_seconds,recording_url,score,ai_summary,transcript,created_at,callers(name)")
        .eq("lead_id", str(lead_id))
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return {"data": result.data or []}
```

- [ ] **Step 2: Verify Python syntax**

```bash
cd backend && python3 -c "import ast; ast.parse(open('app/routes/leads.py').read()); print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routes/leads.py
git commit -m "feat(leads): add GET /{lead_id}/call-logs endpoint"
```

---

## Task 2: Frontend API methods

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `leads.callLogs` method — inside the `leads:` block after `leads.messages`**

```typescript
callLogs: async (leadId: string) => {
  const res = await apiFetch<{ data: CallLog[] }>(`/api/v1/leads/${leadId}/call-logs`);
  return res.data || [];
},
```

- [ ] **Step 2: Add `notes` API block — after the `calls:` block**

```typescript
notes: {
  update: (noteId: string, data: { content?: string; is_pinned?: boolean }) =>
    apiFetch<{ id: string; content: string; is_pinned: boolean }>(
      `/api/v1/lead-notes/note/${noteId}`,
      { method: "PATCH", body: JSON.stringify(data) }
    ),
  delete: (noteId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/v1/lead-notes/note/${noteId}`, { method: "DELETE" }),
},
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(api): add leads.callLogs, notes.update, notes.delete"
```

---

## Task 3: Live notes pane — auto-close on save

**Files:**
- Modify: `frontend/app/dashboard/telecalling/components/live-notes-pane.tsx`

- [ ] **Step 1: In `handleSave`, call `onClose()` after `setSavedFlash(true)`**

Find this block:
```typescript
setSavedFlash(true);
setTimeout(() => setSavedFlash(false), 2000);
```

Replace with:
```typescript
setSavedFlash(true);
setTimeout(() => {
  setSavedFlash(false);
  onClose();
}, 1200);
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/telecalling/components/live-notes-pane.tsx
git commit -m "fix(live-notes): auto-close pane 1.2s after successful save"
```

---

## Task 4: Remove AI summary from telecalling recent calls

**Files:**
- Modify: `frontend/app/dashboard/telecalling/page.tsx`

- [ ] **Step 1: Find and delete the AI summary block in the call log map**

Find and remove this entire block (about 12 lines):
```tsx
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
```

- [ ] **Step 2: Remove unused state and imports no longer needed**

Remove `aiSummaryOpen` state:
```typescript
// DELETE this line:
const [aiSummaryOpen, setAiSummaryOpen] = useState<Record<string, boolean>>({});
```

Remove unused imports if `Sparkles`, `ChevronUp`, `ChevronDown` are no longer used elsewhere (check first with grep).

```bash
grep -n "Sparkles\|ChevronUp\|ChevronDown\|formatAiSummary\|aiSummaryOpen" \
  frontend/app/dashboard/telecalling/page.tsx
```

Remove any that only appear in the deleted block.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/telecalling/page.tsx
git commit -m "fix(telecalling): remove AI summary from recent calls, belongs in Notes page"
```

---

## Task 5: Add Notes to sidebar

**Files:**
- Modify: `frontend/components/sidebar.tsx`

- [ ] **Step 1: Add `StickyNote` to lucide imports**

```typescript
import {
  LayoutDashboard, MessageSquare, Users, Settings, Phone,
  BarChart2, Upload, Sparkles, BookOpen, Layers, AlertTriangle,
  FileCheck, StickyNote,   // ← add StickyNote
} from "lucide-react";
```

- [ ] **Step 2: Add Notes entry to NAV array — after Telecalling**

```typescript
{ href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
{ href: "/dashboard/notes", icon: StickyNote, label: "Notes" },   // ← add this
{ href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge" },
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat(nav): add Notes page to sidebar"
```

---

## Task 6: Build the Notes page

**Files:**
- Create: `frontend/app/dashboard/notes/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p frontend/app/dashboard/notes
```

- [ ] **Step 2: Create the full page**

Create `frontend/app/dashboard/notes/page.tsx`:

```tsx
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

  // add note
  const [addContent, setAddContent] = useState("");
  const [addPinned, setAddPinned] = useState(false);
  const [adding, setAdding] = useState(false);

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (!selected) { setNotes(null); setCallLogs([]); return; }
    setNotesLoading(true);
    Promise.all([
      fetchNotes(selected.id),
      api.leads.callLogs(selected.id),
    ])
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
    if (all.length) {
      api.calls.recentByLeads(all.map((l) => l.id))
        .then(setLastCalledMap)
        .catch(() => {});
    }
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
    const n = await fetchNotes(selected.id);
    setNotes(n);
  }

  async function addNote() {
    if (!selected || !addContent.trim()) return;
    setAdding(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/lead-notes/${selected.id}`, {
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
        {/* ── Left: lead list ── */}
        <div className="col-span-1">
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" />
            <input
              type="text"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {sortedLeads.length === 0 && (
              <p className="font-body text-sm text-on-surface-muted px-2">No leads found.</p>
            )}
            {sortedLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setSelected(lead)}
                className={`w-full text-left p-4 rounded-xl transition-all ${
                  selected?.id === lead.id
                    ? "bg-tertiary-bg ring-2 ring-tertiary"
                    : "bg-surface hover:bg-surface-low ring-1 ring-[#c4c7c7]/15"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-on-surface truncate">
                      {lead.name || formatPhone(lead.phone)}
                    </p>
                    {lead.name && (
                      <p className="font-label text-xs text-on-surface-muted">{formatPhone(lead.phone)}</p>
                    )}
                    {lastCalledMap[lead.id] && (
                      <p className="font-label text-[10px] text-on-surface-muted mt-0.5">
                        Called {timeAgo(lastCalledMap[lead.id])}
                      </p>
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

        {/* ── Right: lead detail ── */}
        <div className="col-span-2">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 text-on-surface-muted">
              <StickyNote size={40} className="mb-3 opacity-30" />
              <p className="font-body text-sm">Select a lead to view notes</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* lead header */}
              <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold text-tertiary">
                    {selected.name || formatPhone(selected.phone)}
                  </h2>
                  <p className="font-label text-sm text-on-surface-muted mt-0.5">
                    {selected.name ? formatPhone(selected.phone) + " · " : ""}
                    Segment {selected.segment} · Score {selected.score}
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

                    {/* Add note form */}
                    <div className="mb-5 p-4 bg-surface-low rounded-xl space-y-3">
                      <textarea
                        value={addContent}
                        onChange={(e) => setAddContent(e.target.value)}
                        placeholder="Add a new note…"
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={addPinned} onChange={(e) => setAddPinned(e.target.checked)} className="rounded" />
                          <span className="font-label text-sm text-on-surface-muted">Pin this note</span>
                        </label>
                        <button
                          onClick={addNote}
                          disabled={adding || !addContent.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus size={13} /> {adding ? "Saving…" : "Add Note"}
                        </button>
                      </div>
                    </div>

                    {/* Note list */}
                    {allNotes.length === 0 ? (
                      <p className="font-body text-sm text-on-surface-muted">No notes yet for this lead.</p>
                    ) : (
                      <div className="space-y-3">
                        {allNotes.map((note) => (
                          <div key={note.id} className="p-4 bg-surface-low rounded-xl">
                            {editingId === note.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  rows={3}
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
                              <>
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
                                    <button
                                      onClick={() => { setEditingId(note.id); setEditContent(note.content); setEditPinned(note.is_pinned); }}
                                      className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted hover:text-on-surface"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      onClick={() => deleteNote(note.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-on-surface-muted hover:text-red-500"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              </>
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
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/notes/
git commit -m "feat(notes): add /dashboard/notes page with lead search, notes CRUD, AI summaries"
```

---

## Task 7: Final push

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Verify on deployed backend**

```bash
curl -s "https://aira-ai-5tfr.onrender.com/api/v1/leads/<any-lead-id>/call-logs" | head -100
```
Expected: `{"data": [...]}` JSON response.

- [ ] **Step 3: Smoke test in browser**
  - Click "Notes" in sidebar → page loads
  - Search "Test" → Test Lead appears
  - Click Test Lead → notes section and call summaries section appear
  - Add a note → appears in list
  - Edit inline → pencil click → textarea → save → updated
  - Delete → confirm → gone
  - Make a call from Telecalling → live notes pane opens → type note → save → pane closes automatically

---

## Self-Review

**Spec coverage:**
- ✅ Auto-close live notes on save (Task 3)
- ✅ /dashboard/notes page with search (Task 6)
- ✅ Lead list sorted by last called (Task 6 - sortedLeads)
- ✅ Notes section with CRUD (Task 6)
- ✅ AI Summaries section (Task 6 - AiSummaryCard)
- ✅ Inline edit (Task 6 - editingId state)
- ✅ Sidebar nav entry (Task 5)
- ✅ Remove AI summary from telecalling (Task 4)
- ✅ New backend endpoint for call logs by lead (Task 1)
- ✅ New API methods (Task 2)

**No placeholders found.**

**Type consistency:** `CallLog` type used in `AiSummaryCard` matches `frontend/lib/api.ts` definition including `ai_summary`, `recording_url`, `duration_seconds`. `Note` type imported from existing `telecalling/types.ts`. `fetchNotes` imported from existing `telecalling/lib/notes-api.ts`. `api.notes.update` and `api.notes.delete` defined in Task 2 and used in Task 6.
