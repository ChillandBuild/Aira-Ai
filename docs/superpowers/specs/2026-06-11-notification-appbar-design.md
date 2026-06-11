# Notification App-Bar + Claim Banner — Design Spec

**Date:** 2026-06-11
**Status:** Approved (brainstorming) — pending spec review → writing-plans

## Problem

The notification bell ([NotificationCenter.tsx](../../../frontend/components/NotificationCenter.tsx)) is a single globally-mounted floating element at `fixed top-6 right-8 z-[100]`. There is no shared app header, so every dashboard page draws its own top-right toolbar (Export CSV, filters, etc.) and the bell renders *on top of* those buttons — a structural collision, not a per-page CSS bug.

Separately, the notification model is passive (small corner badge + 4-second `sonner` toast that vanishes). Pool-critical events — a new chat handover landing in the shared pool, or an overdue callback being released as claimable — are easy to miss, which undercuts the North Star ("no lead stalls >5 min").

Today only 3 events reach the bell, all callback plumbing (`missed_callback`, `callback_taken_over`, self due-callbacks). The shared escalation pool — the safety net — rings nothing.

## Goals

1. Give the bell a permanent, non-colliding home (a real top app-bar).
2. Make pool-critical events impossible to ignore (a sticky claim banner).
3. Wire 4 telecaller notification events into `app_notifications` so the bell is actually useful.

Non-goals (deferred): wrap-up reminder (event 5), urgency color tiers, sound/tab-title pings, owner/ops events (incidents, bookings, sentiment), per-broadcast events. These are catalogued for a later pass.

## Architecture

Three parts: a frontend layout restructure, a frontend attention surface, and the backend producers + a live pool endpoint.

### Part 1 — Top app-bar (`AppHeader.tsx`)

A slim sticky bar at the top of the content column (right of the sidebar), mounted in [ClientLayout.tsx](../../../frontend/app/dashboard/ClientLayout.tsx). `<main>` content gets top-padding equal to the bar height, so all pages render below it and never overlap the right cluster.

**Right cluster:** 🔔 bell · 📅 calendar · profile chip.

- The current global floating bell (`fixed top-6 right-8`) and the bottom-right Calendar FAB are both **removed** and reborn as buttons inside the bar.
- `NotificationCenter` is **split**:
  - Data + 30s polling logic → extracted into a `useNotifications()` hook (`frontend/hooks/useNotifications.ts`), reusable by the bell, the banner, and toasts.
  - The **bell button + dropdown panel** become a `NotificationBell.tsx` that lives in the bar; the dropdown anchors beneath it. Existing Alerts/Due-Callbacks tab UI is preserved.
- **Profile menu** on the role chip becomes the canonical account home:
  - Shows user name/email (email pulled from the Supabase session — `AuthRoleContext` has no email today), role label ("Admin" / "Telecaller"), link to `/dashboard/profile`, and **Sign out**.
  - The sidebar's `signOut` handler + profile-link block ([sidebar.tsx:46](../../../frontend/components/sidebar.tsx) and the `/dashboard/profile` link) are **removed** to avoid duplication; that logic moves into the profile menu.

### Part 2 — Sticky claim banner (`ClaimBanner.tsx`)

A full-width strip pinned directly under the app-bar, rendered only when there is ≥1 *still-actionable* pool item for the current caller.

```
╔═══════════════════════════════════════════════════════════╗
║ 🔴 Lead "Ravi" needs a human — unclaimed   [Claim] [View] ║
║    +2 more in the pool                                    ║
╚═══════════════════════════════════════════════════════════╝
```

- Shows the most urgent item with a `+N more` count when several are pending.
- `[Claim]` calls the existing claim/assign endpoint; on success the item clears optimistically and re-syncs on next poll.
- `[View]` deep-links to the lead's conversation.
- Inherently sticky: it stays until the item is acted on (no time-based dismiss), so nothing silently expires.
- Visibility: callers only. Owners do not see the claim banner (pool work is a caller action); owners still get pool notifications in the bell.

### Part 3 — Backend producers + live pool endpoint

**`services/notify.py` (new) — never-raise helpers:**

- `notify_user(tenant_id, user_id, type, title, message, *, db=None, dedupe_lead_id=None)` — single insert; when `dedupe_lead_id` is set, skip if an unread row of the same `type` for that lead already exists.
- `notify_pool(tenant_id, type, title, message, *, db=None, segments=None, exclude_user_ids=None)` — fan out one insert per active caller `user_id` (from `callers`) plus the owner; honors `segments` filter and `exclude_user_ids`.
- Both wrap all DB work in try/except and log on failure — a notification must never break the lead pipeline.

**Events wired (4):**

| # | Event | Hook site | Helper | type |
|---|-------|-----------|--------|------|
| 1 | New handover lands in shared pool | [`_trigger_chat_escalation`](../../../backend/app/services/ai_reply.py) after insert **and** the direct insert in [autopilot.py:214](../../../backend/app/services/autopilot.py) | `notify_pool` | `handover_new` |
| 2 | Overdue callback released / claimable | PULL-release + unavailable paths in [main.py:320](../../../backend/app/main.py) / [:346](../../../backend/app/main.py) | `notify_pool(segments=cfg.segments, exclude=[old_caller])` | `callback_claimable` |
| 3 | New lead auto-assigned to a caller | [`auto_assign_lead`](../../../backend/app/services/assignment.py) after update (add `user_id` to the `callers` select) | `notify_user(chosen.user_id)` | `lead_assigned` |
| 4 | Assigned lead replied (all 4 channels) | after each inbound `messages.insert` in webhook/telegram/instagram/facebook | `notify_user(assigned_caller.user_id, dedupe_lead_id=lead_id)` | `lead_replied` |

Event 4 covers **all 4 channels** (Decision A) via a shared helper `notify_assigned_caller_of_reply(lead_id, tenant_id, db)` called from each channel's inbound path, deduped on unread-per-lead so a message burst is one alert.

**`GET /api/v1/notifications/pool` (new):** returns only currently-actionable pool items — handovers still `pending`/unassigned and released callbacks whose lead is still unassigned — by joining live state, not stale `app_notifications` rows. This backs the claim banner so claimed items disappear for everyone on the next poll.

## Data Flow

```
backend event ──▶ notify_pool / notify_user ──▶ app_notifications (insert)
                                                      │
              GET /notifications        GET /notifications/pool (live-joined)
                     │                            │
         useNotifications() hook ────────────────┘
            │            │              │
       NotificationBell  toasts     ClaimBanner
       (badge+dropdown)            (sticky, callers only)
```

## Error Handling

- All `notify.py` inserts are best-effort and swallowed — failures log, never raise.
- `[Claim]` race: two callers claiming the same item is resolved by the existing claim endpoint's atomic guard (409 → "already claimed"); the banner shows a toast and re-syncs.
- Pool endpoint failures degrade gracefully: banner hides rather than blocking the page (mirrors existing `chat_handovers` count try/except).

## Testing

- `notify.py` unit tests: `notify_pool` fan-out targets correct recipients (active callers + owner, segment filter, exclusions); `notify_user` dedupe skips an existing unread same-type row for the lead.
- Integration: each of the 4 events inserts the expected row(s); event 4 dedupe across a 3-message burst yields 1 row.
- Pool endpoint: returns an item while pending/unassigned; omits it once claimed/assigned.
- Frontend: app-bar reserves space (no overlap with a page Export button at 1440/1024/768); banner appears on a pending pool item and clears after `[Claim]`.

## Files

**New:** `backend/app/services/notify.py`, `frontend/components/AppHeader.tsx`, `frontend/components/NotificationBell.tsx`, `frontend/components/ClaimBanner.tsx`, `frontend/hooks/useNotifications.ts`.

**Edited:** `frontend/app/dashboard/ClientLayout.tsx` (mount bar, drop floating buttons), `frontend/components/NotificationCenter.tsx` (split → bell + hook; file may be retired), `frontend/components/sidebar.tsx` (remove signOut + profile block), `frontend/lib/api.ts` (add `notifications.pool`), `backend/app/routes/notifications.py` (+pool endpoint), and 4 backend hook sites (`ai_reply.py`, `autopilot.py`, `main.py`, `assignment.py`, + the 4 channel inbound paths).

**No DB migration** — `app_notifications` schema already carries arbitrary `type`/`title`/`message`.

## Known Limitations

- Pool notifications create an unread row per caller; the *bell* still shows the alert until each caller dismisses it, even after someone claims (the *banner* self-clears via the live pool endpoint). A future "auto-clear pool notif on claim" sweep can reconcile the bell too.
- Owner/ops events (incidents, bookings, negative sentiment) and the wrap-up reminder remain unwired — deferred to a later pass.
