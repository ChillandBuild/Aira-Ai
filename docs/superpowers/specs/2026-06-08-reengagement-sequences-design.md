# Re-engagement Sequences — Design

**Date:** 2026-06-08
**Status:** Approved (brainstorming) → ready for implementation plan
**Surface:** Leads page (`frontend/app/dashboard/leads/page.tsx`), `routes/reengagement.py`, `services/reengagement_service.py`

## Problem

The re-engagement screen mixes two unrelated clocks, so the operator can't tell "which timing is which." Concretely:

1. **Trigger Delay** (the `10h` / `18h` field) — *when* a follow-up fires.
2. **The 24h WhatsApp session window** ("open" vs "expired") — *whether* a freeform message can be delivered, anchored to the lead's reply.

The UI conflates them: it prints `remaining = 24 − delay` ("14 hours remaining") on the **broadcast** screen, which silently assumes the lead replied at the exact instant the broadcast was sent. That assumption is the root of the confusion and is wrong for any lead who replied later (or not at all).

Separately, the operator wants to send **multiple** re-engagement messages at **fully client-defined** intervals within the 24h window, each one freeform **or** template by choice. The backend already stores multiple independent steps per trigger (each with its own `delay_hours`, `message_type`, `target_segments`, sorted by delay) — so the capability mostly exists; the UI just doesn't present it as a customizable sequence, and the timing copy misleads.

## Goals

- Present re-engagement as a **customizable multi-step sequence** (any number of steps, any delays — no fixed 6/12/18).
- Make every timing **correct and self-evident** by never showing two clocks on one screen.
- Stop dropping leads when a freeform message can't deliver: **auto-fallback to a backup template**.

## Non-goals

- Multi-day horizons. Scope is **within the 24h window only** (decided). No day-2/day-3 markers.
- Engine rewrite. The per-lead window check already works; changes are additive.
- Touching the broadcast scheduler, drip broadcasts, or the Bot Flow Builder.

## Core decisions

| Decision | Choice | Source |
|---|---|---|
| Interval anchoring | Single fixed start, absolute marks on one clock | recommended, accepted |
| Time horizon | Within 24h only | user |
| Closed-window behavior | Auto-fallback to a backup template per freeform step | user (Q3) |
| Number/values of steps | Fully client-defined, arbitrary count + delays | user |
| Trigger scope | **Both** triggers built as **separate tools**, each on its own screen with only its own clock | user |
| Placement | A **sub-tab inside the Leads page** (not the source dropdown) | user |

## Two tools, two clocks — never mixed

| | **Campaign Follow-up** | **Reply Follow-up** |
|---|---|---|
| `type` | `broadcast` | `inbound` |
| Hour 0 | Broadcast was sent | Lead's last reply (`last_inbound_at`) = window opens |
| Fires at | `+Nh` after send, one schedule for the whole batch | `+Nh` after *that lead* replied |
| "Within 24h" means | within 24h of the send | within the lead's 24h window, exactly |
| `remaining = 24 − delay` valid? | **No** — window is per-lead, anchored to each reply | **Yes** — hour 0 *is* the reply |

The two screens never reference the other's clock. This is the structural fix for "which timing is which."

## Placement

Re-engagement today is buried: it only appears inline above the leads table when the **source dropdown** ([leads/page.tsx:568-580](../../../frontend/app/dashboard/leads/page.tsx#L568)) is set to "Inbound Leads" or "Broadcast Specific" ([line 644](../../../frontend/app/dashboard/leads/page.tsx#L644)). That cramped, filter-driven home is a root cause of the confusion and cannot give each tool its own screen.

New home: a **header sub-tab inside the Leads page** — same route (`/dashboard/leads`), same sidebar entry:

```
[ Leads ]  [ Re-engagement ]
              └─ [ Campaign Follow-up ]  [ Reply Follow-up ]
                   └─ 24h timeline sequence builder · + Add message
```

- `Leads` keeps the existing segment tabs + table untouched.
- `Re-engagement` is a new view with two inner tabs, each rendering the shared sequence builder bound to its own trigger type.
- The re-engagement panel is **removed** from the source dropdown's inline render; the source dropdown reverts to a pure leads filter.

## The sequence builder (shared component, both screens)

- **"+ Add message"** — operator adds arbitrary steps; delays are free-typed, not from a fixed set.
- Each step row exposes: `delay_hours` · `target_segments` (A/B/C/D) · `message_type` (freeform | template) · content/template · **(freeform only)** optional **backup template**.
- Steps auto-sort by `delay_hours` and render on a horizontal **24h timeline bar** so the whole sequence reads on one ruler. The freeform-safe zone vs the template-only zone is visually distinguished.
- Per-screen timing copy (see below) sits with each step, scaled to the screen's clock.

## Closed-window handling → auto-fallback

At fire time `_send_reengagement` already reads the lead's real `last_inbound_at` and computes `is_window_active`. New behavior for a **freeform** step:

```
window open                 → send freeform                (status: sent)
window closed / no reply,
  backup template set       → send the backup template     (status: sent_fallback)
window closed / no reply,
  no backup template        → skip + log                   (status: skipped_window)  [unchanged default]
```

Template-type steps are unchanged (they always deliver). This makes "open vs expired" stop mattering to the operator — nobody is silently dropped unless they explicitly left no backup.

## Honest timing copy — the actual confusion fix

- **Reply Follow-up screen:** keep `remaining = 24 − delay` — it is correct here. Message reads e.g. *"Fires 18h after the lead replied · 6h of window left · freeform delivers."*
- **Campaign Follow-up screen:** **remove** the "14 hours remaining" line. Replace with the truth, no per-lead promise: *"Fires 18h after the broadcast was sent. Per lead — window still open → freeform; otherwise → your backup template."*

## Changes by layer (scope guardrails)

### DB — one migration (`097_reengagement_fallback_template.sql`)
- `ALTER TABLE reengagement_steps ADD COLUMN fallback_template_name text;`
- `ALTER TABLE reengagement_steps ADD COLUMN fallback_template_variables jsonb;`
- Extend `reengagement_logs.status` CHECK to include `'sent_fallback'`.
- No change to multi-step / custom-delay support — it already exists.

### API — `routes/reengagement.py`
- Add `fallback_template_name: str | None` and `fallback_template_variables: list[str] | None` to `ReengagementStepCreate`.
- Persist both in `create_step`. No new endpoints.

### Engine — `services/reengagement_service.py` (small, additive)
- In `_send_reengagement`, freeform branch: when `is_window_active` is false **and** a backup template is configured, send the backup template (reuse the existing template-send path) and log `status='sent_fallback'`. Otherwise retain the current skip behavior.
- No change to the scheduling loop, dedup (per `lead × step`), or per-lead window math.

### Frontend — `frontend/app/dashboard/leads/page.tsx` (bulk of the work)
- Add a `Leads | Re-engagement` header sub-tab; gate the existing table/segments under `Leads`.
- Build the `Re-engagement` view with `Campaign Follow-up | Reply Follow-up` inner tabs, each rendering the shared timeline sequence builder bound to its trigger type.
- Remove the inline re-engagement panel from the source-dropdown render path (revert the dropdown to a pure filter).
- Add the **backup template** field to freeform step config.
- Add `fallback_template_name` / `fallback_template_variables` to the `ReengagementStep` type and `createStep` call in `frontend/lib/api.ts`.
- Replace the broadcast-screen timing copy (currently around the "remaining hours" block) with the honest per-lead copy; keep the inbound-screen copy.
- Extract the sequence builder into its own component (the page is already ~1250 lines — keep it from growing further).

## Data flow

1. Operator builds a sequence on the relevant screen → steps POST to `/api/v1/reengagement/steps` with the new fallback fields.
2. APScheduler `process_due_reengagements` (existing) walks steps; for each due `lead × step` it calls `_send_reengagement`.
3. `_send_reengagement` resolves freeform-vs-fallback-vs-skip per the lead's real window and writes a `reengagement_logs` row.

## Error handling

- Freeform with no open window and no backup → `skipped_window` (explicit, logged).
- Backup template send failure → `failed` (logged), same as existing template failures.
- Invalid step input (non-positive delay, bad type) → 400 from the route (existing validation retained).

## Testing

- **Unit (engine):** window-open → freeform; window-closed + backup → `sent_fallback`; window-closed + no backup → `skipped_window`; template step unaffected; dedup still prevents resend.
- **API:** create step round-trips the two new fields; omitted fields default to null.
- **Frontend:** add/remove steps with custom delays; backup-template field shows only for freeform; broadcast screen shows honest copy, reply screen shows `24 − delay`.

## Open risks

- `reengagement_logs.status` CHECK alteration must be applied before the engine writes `sent_fallback`; deploy migration first.
- The timeline bar must stay readable with many steps clustered near the same hour (visual concern, not correctness).
