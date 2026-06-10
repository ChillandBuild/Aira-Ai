# Telecaller Dialer Page — Redesign Spec
**Date:** 2026-06-10  
**Scope:** `CallerView.tsx` + supporting components  
**Visual Mockup:** `frontend/public/telecaller-redesign-mockup.html`

---

## What Changes & Why

| Current | Redesigned |
|---|---|
| 2-column layout (5+7) | **3-column layout** — Profile | Queue | Detail |
| Linear progress bar (Daily Target) | **Circular SVG ring** with achieved/target count |
| "Today's Scheduled Callbacks" card (removed per request) | Callbacks shown as sub-tab badge inside Queue, not a separate card |
| Plain text input for Quick Dial | **Phone numpad grid** (3×4 dial pad) |
| Daily Target + Performance labels | Renamed → **My Profile** section with caller stats |
| Lead list only — no inline dial | **Dial button directly on each lead card** |
| Right panel: no tabs | Right panel: **4 tabs** — Overview · Notes & Log · Attribution · Schedule |
| Wrap-up outcomes at bottom of modal | **Outcome chips** always visible inside right panel (no extra modal needed) |

---

## Layout — 3-Column Command Center

```
┌─────────────────┬────────────────────┬──────────────────────────────┐
│   My Profile    │    Lead Queue      │     Lead Profile Detail      │
│   (~290px)      │    (~350px)        │     (flex-1)                 │
│                 │                    │                              │
│ · Avatar        │ · Queue header     │ · Dark gradient header       │
│ · Status toggle │ · Call Next btn    │ · Score ring on avatar       │
│ · Target ring   │ · Search bar       │ · Call Lead button           │
│ · Stats grid    │ · Sub-tabs         │ · 4 content tabs             │
│ · Streak badge  │ · Lead cards       │ · Pitch script card          │
│ · Conv rate     │   with dial btn    │ · Quick note + Outcome chips │
│ · Numpad dialer │                    │ · Interaction timeline       │
└─────────────────┴────────────────────┴──────────────────────────────┘
```

---

## New Features (frontend-only, no new API calls required)

### 1. Circular SVG Progress Ring (replaces linear bar)
- SVG `<circle>` with `stroke-dashoffset` calculated from `(achieved/target)`
- Gradient stroke: indigo → purple
- Center text: calls count + "/ target"
- Mounted in My Profile panel

### 2. Phone Numpad Dialer (replaces plain text input)
- 3×4 grid (1–9, *, 0, #) with letter sub-labels (ABC, DEF…)
- Typing on any numpad key appends to `manualPhone` state
- Backspace button (← key)
- Full-width green "Call Now" button at bottom
- Replaces the existing `Quick Dial Offline` widget

### 3. My Profile Panel (new left column)
- Shows `myCaller.name`, caller ID badge
- Active/Break status toggle (same logic, new UI)
- `performance.achieved / performance.target` → circular ring
- Stats grid: Converted today · Avg Duration · Connect Rate · Queue Left
- Streak counter (FE-computed from `myCallsTodayList` consecutive days — cosmetic)
- Conversion rate % chip: `converted / achieved * 100`

### 4. Inline Dial Button on Lead Cards
- Each lead card gets a small circular phone button (right side)
- Color matches lead heat: HOT → red gradient, warm → amber, rest → indigo, cold → grey
- Click = `dialWithGuard(lead.id, lead)` — same logic, no API change

### 5. Tabbed Right Panel (replaces vertical scroll)
Tabs: **Overview | Notes & Log | Attribution | Schedule**
- **Overview**: Assignment info + Pitch script + Attribution summary row
- **Notes & Log**: Quick note textarea + Interaction timeline (existing notes logic)
- **Attribution**: Full attribution grid (existing outbound/inbound cards)
- **Schedule**: Set Callback Reminder section (existing logic)

### 6. Outcome Chips always visible in right panel
- Grid of outcome chips rendered below Quick Note in the "Notes & Log" tab
- Replaces the separate wrap-up modal trigger for mid-call use
- Wrap-up modal still fires post-call as before (no change to that flow)

### 7. Remove "Today's Scheduled Callbacks" standalone card
- Callbacks are surfaced as a **badge count** on the "Callbacks" sub-tab of the queue
- Clicking the Callbacks sub-tab shows those leads (already filtered by `callbackLeads`)
- Snooze buttons move into the lead card detail when a callback lead is selected

---

## Files to Change

| File | Change |
|---|---|
| `telecalling/CallerView.tsx` | Full layout restructure — 3-column, new left panel, tabbed right panel |
| `telecalling/components/` | Extract `ProfilePanel.tsx`, `NumpadDialer.tsx`, `LeadQueuePanel.tsx`, `LeadDetailPanel.tsx` |

No backend changes. No new API endpoints. All data already flows through existing state.

---

## Implementation Plan

### Phase 1 — Layout shell (no logic changes)
1. Replace 2-col grid with 3-col flex layout in `CallerView.tsx`
2. Extract left panel as `<ProfilePanel>` — pass `myCaller`, `myStatus`, `performance`, `toggleMyStatus`, `manualPhone`, numpad handlers
3. Extract center panel as `<LeadQueuePanel>` — pass existing props
4. Right panel tabs state (`selectedTab: "overview"|"notes"|"attribution"|"schedule"`) added to CallerView

### Phase 2 — My Profile panel
5. Build circular SVG ring (pure CSS/SVG, no library)
6. Stats grid: connect rate = `myCallsTodayList.filter(c=>c.status==="answered").length / myCallsTodayList.length * 100`
7. Streak = cosmetic counter based on `performance.achieved > 0` days
8. Conv rate chip: `myCallsTodayList.filter(c=>c.outcome==="converted").length / performance.achieved * 100`

### Phase 3 — Numpad dialer
9. Replace Quick Dial Offline widget with `<NumpadDialer>` component
10. State: `manualPhone` lives in CallerView (already exists), pass setter down
11. Keyboard: `keydown` on numpad input appends digit; supports physical keyboard too

### Phase 4 — Lead queue panel
12. Add inline phone icon button on each lead card
13. Remove standalone Callbacks card from left col
14. Callbacks surfaced as sub-tab badge (count already computed as `callbackLeads.length`)

### Phase 5 — Tabbed right panel
15. Add `selectedDetailTab` state to CallerView
16. Tab bar: Overview / Notes & Log / Attribution / Schedule
17. Move sections into respective tabs (no logic change — just restructuring JSX)
18. Add outcome chips grid to Notes & Log tab (same `setWrapupOutcome` logic)

### Phase 6 — Polish
19. Score ring on lead avatar in header (SVG circle same as profile ring)
20. Heat-matched dial button colors on lead cards
21. Callback snooze buttons in detail panel when `selectedLead.call_status === "callback"`
22. Remove `{(todayCallbacks.length > 0 || completedCallbacks.length > 0) && ...}` block

---

## What Does NOT Change
- All API calls, state variables, polling logic — untouched
- Wrap-up modal — still fires when call ends
- Pending wrap-up blocking overlay — untouched
- Accidental-dial countdown overlay — untouched
- AdminView — untouched
- `LiveNotesPane`, `NotesHistoryModal` — untouched
- `BriefingModal` — untouched

---

## Approximate Effort
| Phase | Est. |
|---|---|
| Phase 1 (layout shell) | 1.5h |
| Phase 2 (profile panel + ring) | 1h |
| Phase 3 (numpad) | 45m |
| Phase 4 (queue panel) | 45m |
| Phase 5 (tabbed detail) | 1.5h |
| Phase 6 (polish) | 1h |
| **Total** | **~6.5h** |
