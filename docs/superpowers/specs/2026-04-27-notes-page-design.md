# Notes Page — Design Spec
**Date:** 2026-04-27

## Scope
1. Auto-close Live Notes pane after saving a note
2. New `/dashboard/notes` page — search leads, view/add/edit/delete notes and AI summaries
3. Remove AI summary toggle from telecalling recent calls (moved to Notes page)

## Live Notes Pane Change
- After `saveNote` succeeds, call `onClose()` automatically
- One-line change in `live-notes-pane.tsx`

## Notes Page — `/dashboard/notes`

### Layout
Two-column: left = lead search list, right = selected lead detail panel.

### Left Column
- Search input (name or phone) — client-side filter, no extra API call
- Lead list sorted by last call date (uses existing `leads` + `recent-by-leads`)
- Each card: name, phone, segment badge (A/B/C/D coloured), last called, note count
- Click → loads right panel

### Right Column — Lead Detail
**Section 1: Notes**
- "Add Note" button → inline form at top (textarea + pin checkbox + save)
- Note cards (newest first): content, timestamp, pin badge, pencil + trash icons
- Pencil → inline edit (textarea replaces text, Save/Cancel)
- Trash → confirm delete

**Section 2: AI Summaries**
- One card per call log that has `ai_summary`
- Shows: call date, duration, structured fields (course/budget/timeline/next_action/sentiment)
- Recording audio player if `recording_url` exists
- Read-only

### Backend Changes
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/lead-notes/{note_id}` | PATCH | Edit note content + pin |
| `/api/v1/lead-notes/{note_id}` | DELETE | Delete a note |
| `/api/v1/leads/{lead_id}/call-logs` | GET | All call logs for a lead (ai_summary) |

### Frontend Files
| File | Action |
|---|---|
| `live-notes-pane.tsx` | Auto-close on save |
| `telecalling/page.tsx` | Remove AI summary toggle from recent calls |
| `app/dashboard/notes/page.tsx` | NEW — full notes page |
| `lib/api.ts` | Add 3 new API methods |
| Sidebar nav | Add Notes link |

## Out of Scope
- Pagination on lead list (limit 50 for now)
- Note attachments
- Sharing notes between callers
