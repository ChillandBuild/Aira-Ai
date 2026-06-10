# Telecaller Dialer Page — Redesign Spec
**Date:** 2026-06-10  
**Scope:** `CallerView.tsx` + supporting components  
**Visual Mockup:** `frontend/public/telecaller-redesign-mockup2.html`

---

## Layout — 2-Column (kept, refined)

```
┌─────────────────────────────┬────────────────────────────────────────┐
│       Lead Queue            │        Lead Profile Detail             │
│       (5/12 col)            │        (7/12 col)                      │
│                             │                                        │
│ · Header + status toggle    │ · Dark gradient header                 │
│ · Daily target ring         │ · Score ring on lead avatar            │
│ · Call Next btn + Search    │ · Call Lead button                     │
│ · Sub-tabs (w/ callbacks)   │ · 4 content tabs                       │
│ · Lead cards + dial btn     │   Overview / Notes & Log /             │
│ · Numpad dialer (bottom)    │   Attribution / Schedule               │
│                             │ · Pitch script card                    │
│                             │ · Quick note + Outcome chips           │
│                             │ · Interaction timeline                 │
└─────────────────────────────┴────────────────────────────────────────┘
```

---

## What Changes

| Current | Redesigned |
|---|---|
| Linear progress bar (Daily Target) | **Circular SVG ring** — achieved/target, gradient arc |
| "Today's Scheduled Callbacks" standalone card | **Removed** — callbacks in sub-tab badge only |
| Plain text input for Quick Dial | **Phone numpad grid** (3×4) at bottom of left col |
| Lead list — no inline dial button | **Inline dial button** on every lead card (heat-colored) |
| Right panel: vertical scroll, no tabs | **4-tab panel** — Overview · Notes & Log · Attribution · Schedule |
| Wrap-up outcome only in post-call modal | **Outcome chips** always visible in Notes & Log tab |
| Status toggle in header | Stays in left col header (same logic, cleaner pill style) |

---

## New Features (frontend-only, no new API calls)

### 1. Circular SVG Progress Ring
- Replaces the flat linear bar in the Daily Target widget
- SVG `<circle>` with `stroke-dashoffset` driven by `(achieved / target)`
- Gradient stroke: indigo → purple
- Center shows `achieved` count and `/ target`

### 2. Phone Numpad Dialer
- Replaces the plain `<input>` + Dial button in "Quick Dial Offline"
- 3×4 grid — digits 1–9, *, 0, # — with sub-labels (ABC, DEF…)
- Each button click appends to `manualPhone` state (already exists)
- Physical keyboard input still works via `onKeyDown` on the hidden input
- Full-width "Call Now" button spans all 3 columns

### 3. Inline Dial Button on Lead Cards
- Small phone icon button on the right of each lead card
- Color matches heat: HOT → rose, warm → amber, normal → indigo, cold → slate
- Click = `dialWithGuard(lead.id, lead)` — identical logic, no API change

### 4. Remove Standalone Callbacks Card
- Delete the amber `<div>` block (lines 608–705 of CallerView.tsx)
- Callbacks surfaced only as `callbackLeads.length` badge on the "Callbacks" sub-tab
- Snooze actions move into the right panel when a callback lead is selected

### 5. Tabbed Right Panel
- Add `selectedDetailTab` state: `"overview" | "notes" | "attribution" | "schedule"`
- **Overview**: Assignment info card + Pitch script card
- **Notes & Log**: Quick note textarea + timeline (existing logic, relocated)
- **Attribution**: Outbound/Inbound attribution grid (existing logic, relocated)
- **Schedule**: Set Callback Reminder section (existing logic, relocated)

### 6. Outcome Chips in Notes & Log Tab
- 6 chips: Converted · Callback Scheduled · Not Interested · No Answer · Do Not Call · Unreachable
- Uses the existing `setWrapupOutcome` state — no duplicate logic
- Chips appear above the note textarea as a quick-action row
- Wrap-up modal still fires after a call ends (unchanged)

---

## Files to Change

| File | What |
|---|---|
| `telecalling/CallerView.tsx` | Layout updates, remove callbacks card, add ring + numpad + tabs |
| `telecalling/components/NumpadDialer.tsx` | New component — extracted numpad grid |
| `telecalling/components/LeadDetailPanel.tsx` | New component — tabbed right panel |

---

## Implementation Plan

### Phase 1 — Remove Callbacks card + add Callbacks sub-tab badge
1. Delete the amber callbacks `<div>` block from the left column in `CallerView.tsx`
2. The "Callbacks" sub-tab already renders `callbackLeads` — just add `({callbackLeads.length})` to its label
3. Add snooze buttons inside the right panel when `selectedLead?.call_status === "callback"` and `selectedCallbackJobId` is set

**Verify:** No callbacks card renders; sub-tab shows correct count; snooze works from detail panel.

---

### Phase 2 — Circular SVG progress ring
4. Replace the `<div>` progress bar inside the Daily Target widget with an SVG ring:
   ```tsx
   // two <circle> elements — track + filled arc
   // stroke-dashoffset = circumference * (1 - achieved/target)
   ```
5. Keep the same `performance` state — no new fetch needed
6. Add `achieved / target` text centered inside the ring

**Verify:** Ring fills correctly at 0%, 50%, 100%; animates on data load.

---

### Phase 3 — Numpad Dialer component
7. Create `telecalling/components/NumpadDialer.tsx`
   - Props: `value: string`, `onChange: (v: string) => void`, `onDial: () => void`, `dialing: boolean`
   - Renders 3×4 button grid + number display input + full-width Call button
   - Each digit button: `onChange(value + digit)`
   - Backspace key support via `onKeyDown` on the display input
8. Replace the existing Quick Dial Offline `<div>` in `CallerView.tsx` with `<NumpadDialer>`

**Verify:** Typing via buttons and keyboard both work; `manualDialWithGuard` fires on Call.

---

### Phase 4 — Inline dial button on lead cards
9. Inside the lead card `map`, add a `<button>` on the right:
   ```tsx
   <button onClick={(e) => { e.stopPropagation(); dialWithGuard(lead.id, lead); }}>
     <Phone size={13} />
   </button>
   ```
10. Color class based on `lead.score`: ≥8 → rose, ≥6 → amber, ≥4 → indigo, else → slate

**Verify:** Dial guard fires; button does not trigger lead selection; color matches score.

---

### Phase 5 — Tabbed right panel
11. Add `selectedDetailTab` state to `CallerView.tsx`
12. Extract right panel into `telecalling/components/LeadDetailPanel.tsx`
    - Props: all existing right-panel state + setters
13. Add tab bar: Overview / Notes & Log / Attribution / Schedule
14. **Overview tab**: Assignment info card + Pitch script card (move from current scroll position)
15. **Notes & Log tab**: Outcome chips row + quick note textarea + `saveQuickNote` button + interaction timeline
16. **Attribution tab**: Outbound/Inbound attribution grid (existing JSX, relocated)
17. **Schedule tab**: Set Callback Reminder toggle + date/time pickers + Schedule button (existing logic)

**Verify:** All 4 tabs render correct content; note saving, scheduling, attribution all work; no regressions.

---

### Phase 6 — Polish
18. Score ring on lead avatar in the right panel header (same SVG pattern as daily target ring, scaled to 66px, color = heat-based)
19. Heat-matched dial button color on lead cards (from Phase 4 — verify consistency)
20. Status toggle pill style update (same `toggleMyStatus` logic, visual refresh only)
21. Remove `showCompleted` state and `completedCallbacks` display since the standalone callbacks card is gone

---

## What Does NOT Change
- All API calls, polling, state variables — untouched
- Wrap-up modal — fires post-call exactly as before
- Pending wrap-up blocking overlay — untouched
- Accidental-dial countdown overlay — untouched
- `LiveNotesPane`, `NotesHistoryModal`, `BriefingModal` — untouched
- `AdminView` — untouched
- Queue sub-tabs logic (`newLeads`, `callbackLeads`, `inProgressLeads`, `closedLeads`) — untouched

---

## Approximate Effort

| Phase | Task | Est. |
|---|---|---|
| 1 | Remove callbacks card + sub-tab badge | 30m |
| 2 | Circular SVG progress ring | 45m |
| 3 | Numpad dialer component | 45m |
| 4 | Inline dial button on lead cards | 30m |
| 5 | Tabbed right panel (LeadDetailPanel) | 1.5h |
| 6 | Polish (score ring, colors, cleanup) | 45m |
| **Total** | | **~5h** |
