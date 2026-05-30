# Bot Flow Builder — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming) — pending implementation plan
**Replaces:** the Automations UI at `/dashboard/automations/` (backend preserved & extended)

## Summary

A visual builder for WhatsApp (and multi-channel) message-sequence flows. The user
designs a flow as a **vertical stack of block-cards** that read top-to-bottom like
the conversation itself: trigger → message → wait → message → branch. Each block
shows inline analytics (Sent / Delivered / Errors / Subscribers). A read-only
node-graph "map view" is a later toggle.

This is a **drip / sequence builder** first (time-delayed message sequences with
data-based branching), not a fully interactive chatbot. Interactive
"wait-for-the-user's-reply" branching is an explicit Phase 2 capability.

## Why this shape

The reference the user supplied is the ManyChat/Botpress node-canvas archetype.
We deliberately **do not** copy it:

- Real WhatsApp drip flows are mostly linear with occasional branches — a vertical
  stack reads more naturally than a node web and avoids spaghetti edges.
- Operators are solo/small-team, often on phones. A node canvas is near-unusable at
  390px; a vertical stack is mobile-native.
- A node-canvas engine (pan/zoom, edge routing, port snapping) is ~40% of the build
  effort and none of it is business logic.

Chosen UX: **Hybrid** — vertical stacked-card builder as primary; read-only
node-graph map view as a later, optional toggle rendering the same tree.

## Architecture decision: extend automations in place

The existing automations engine already does the hard parts and its data model already
fits:

- `automation_steps` is **tree-structured** (`parent_step_id`, `branch`, `position`) —
  a WhatsApp flow (message → wait → condition → branch-A/branch-B) *is* a tree.
- `automation_engine.py` already handles trigger matching, `wait` via
  `automation_pending_executions` + cron resume, `condition` branching, tenant
  isolation, and the booking-flow safety guard.

**We extend the existing tables in place. We do NOT rename them.** Renaming
`automations`→`bot_flows` would touch every reference in `automation_triggers.py`,
`automation_engine.py`, the routes, `automation_pending_executions`, and
`automation_logs` for zero functional gain. "Bot Flow" is a **UI-layer name only**;
the backend tables, engine, and `/api/v1/automations/` routes keep their names.
Existing automations keep running untouched.

What is thrown away: only the current Automations **UI**
(`frontend/app/dashboard/automations/page.tsx`, `new/`, `[id]/`).

## Data model changes (migration 073)

Extend existing tables; add one new table. No renames.

### `automation_steps` — add block types + per-node stat counters
- Relax `step_type` CHECK to add: `send_image`, `send_video`, `send_file`,
  `send_location`, `cta_url`. (Existing: `send_message`, `send_template`,
  `assign_lead`, `update_segment`, `add_note`, `send_webhook`, `wait`, `condition`.)
- Add denormalized counters (incremented on event, never COUNT(*) on read):
  - `sent_count INTEGER NOT NULL DEFAULT 0`
  - `delivered_count INTEGER NOT NULL DEFAULT 0`
  - `error_count INTEGER NOT NULL DEFAULT 0`
- Relax `branch` CHECK from `('yes','no')` to allow future multi-way labels. Phase 1
  conditions remain binary (`yes`/`no`); the CHECK is widened to a non-restrictive
  form so Phase 2 multi-branch (button replies) needs no second migration.

### `automations` — add flow-level rollup
- `subscriber_count INTEGER NOT NULL DEFAULT 0` — distinct leads who entered the flow
  (incremented once per lead on flow entry; distinct from per-node Sent).
- `flow_kind TEXT NOT NULL DEFAULT 'automation'` — discriminates rows authored in the
  new builder (`'bot_flow'`) from legacy automations, so the new UI lists only its own.

### `messages` — link outbound flow messages to their node (for delivery correlation)
The `messages` table **already** has `meta_message_id` (wamid, migration 016) and the
webhook status path **already** updates rows by it. We ride that existing path rather
than building a separate lookup. Add two nullable columns:
- `automation_id UUID` (nullable) — set on outbound messages sent by a flow.
- `automation_step_id UUID` (nullable) — the node that sent it.
Partial index: `(automation_step_id) WHERE automation_step_id IS NOT NULL`.

No separate events table — per-node counters live on `automation_steps`, the audit
trail already lives in `automation_logs.steps_results` (JSONB).

## Analytics (day one)

Split by cost:

- **Sent / Errors — cheap.** The executor already knows the outcome of each send step
  (`automation_engine.py` send branches). On each send: increment the step's
  `sent_count` (or `error_count` on failure) directly on the `automation_steps` row.
- **Subscribers — cheap.** On flow entry (run start), increment
  `automations.subscriber_count` once for the lead.
- **Delivered / Read — rides the existing path.** The executor already gets the wamid
  back as `sid` from the send functions. At send time, insert the `messages` row with
  `meta_message_id=sid`, `automation_id`, and `automation_step_id` (today it omits
  `meta_message_id`). The webhook status path **already** updates `messages` by
  `meta_message_id`; we add a small additive step: when the updated row carries an
  `automation_step_id` and status is `delivered`, increment that step's
  `delivered_count`. This touches the **signature-verified webhook** (Invariant 11) —
  additive only, inside the existing try block, single serialized owner. It must not
  alter signature verification or FAQ-first ordering.

Node card badge renders `sent_count`, `delivered_count`, `error_count` directly from
the denormalized columns on the step row (no aggregation on page load).

## Builder UI

Route: the editor stays under `/dashboard/automations/[id]/` (replaces current edit
page). List page `/dashboard/automations/` is rebuilt to show `flow_kind='bot_flow'`
flows. Sidebar label becomes "Bot Flows".

Vertical stacked-card layout:
- Pinned **trigger card** at top (keyword / lead_created / first_inbound / etc.).
- Below it, a recursive stack of **block-cards** with `+` insert affordances between
  cards and at branch tails.
- `Condition` renders labeled child lanes (`if` / `else`) that indent; foldable when
  tall.
- Tap a card → config form in a side drawer (desktop) / full-screen sheet (mobile).
- Drag-reorder within a level; per-card duplicate/delete on hover.
- Header: flow name, Active toggle, Map-view toggle (Phase 2).

Component split (each file < 400 lines):
```
frontend/app/dashboard/automations/[id]/
  FlowEditor.tsx        — page shell: load/save, active toggle, dirty tracking
  FlowCanvas.tsx        — recursive vertical stack renderer
  BlockCard.tsx         — one card: icon, label, stats badge, hover actions
  BranchGroup.tsx       — condition child-lane renderer (indented)
  BlockPicker.tsx       — add-block type menu (Phase-1 blocks only)
  AddButton.tsx         — the "+" insert affordance
  drawers/<Type>Form.tsx — one config form per block type
  useFlow.ts            — state: node tree, dirty tracking, save serialization
  MapView.tsx           — read-only graph render (Phase 2)
```

## Execution flow

1. Trigger fires (existing `automation_triggers.py` path) → `run_automation()`.
2. On entry: increment `subscriber_count` for the lead.
3. Executor walks the step tree (existing `_run_steps`):
   - send blocks (text/image/video/file/location/cta_url/template) → send via existing
     channel senders; capture wamid; write `sent`/`error` node event; bump counters.
   - `wait` → queue `automation_pending_executions`, resume via existing cron.
   - `condition` → evaluate (data-based: segment/score/channel/message_content), walk
     the matching branch.
4. Delivery/read events arrive async via `webhook.py` → correlate by wamid → bump
   `delivered_count`.

New send-block handlers (image/video/file/location/cta_url) reuse the existing
per-channel send functions in `ai_reply.py` / `meta_cloud.py` (media + interactive
CTA already exist in the provider layer per CLAUDE.md).

## Out of scope for Phase 1 (→ Phase 2)

- Variable system (`{{var}}` binding + interpolation beyond `{{name}}`/`{{phone}}`).
- Run-context blocks: HTTP API, Google Sheet Fetch, Random, User Input, Interactive
  (all depend on the variable system; User Input/Interactive also need
  pause-and-resume-on-inbound).
- Map view (read-only node graph).
- Multi-way (>2) condition branches and button-reply branching.

The Phase-1 block picker shows only the 9 supported blocks. Nothing inert in the UI.

## Phasing

- **Phase 1A — Migration 073:** extend tables, add node-link columns on `messages`,
  relax CHECKs, add counters.
- **Phase 1B — Backend blocks + analytics:** new send-block handlers in
  `automation_engine.py`; wamid capture; sent/error events + counters; subscriber
  increment; validation in `automations.py` route for new block types.
- **Phase 1C — Webhook delivery correlation:** extend `webhook.py` status path to bump
  `delivered_count` by wamid. (Serialized; single owner.)
- **Phase 1D — Builder UI:** vertical stack editor + block picker + config drawers +
  stats badges, against the fixed API contract.
- **Phase 1E — List page + sidebar:** rebuild list for `flow_kind='bot_flow'`.

## Risks

- **HIGH** — Webhook delivery correlation touches the signature-verified inbound path
  (Invariant 11). Must not alter signature verification or FAQ-first ordering. Single
  owner, reviewed.
- **MEDIUM** — Media/CTA send via existing provider functions: verify the actual
  signatures in `ai_reply.py`/`meta_cloud.py` before wiring (don't assume).
- **MEDIUM** — Multi-channel: send blocks must degrade gracefully on
  telegram/instagram/facebook (e.g., CTA-URL → plain link). Mirror the existing
  per-source branching in `_execute_step`.
- **LOW** — Drag-reorder within branch levels; constrain to same parent to avoid
  accidental cross-branch moves.

## API contract (frozen first — frontend builds against this)

- `GET /api/v1/automations/?flow_kind=bot_flow` → list
- `GET /api/v1/automations/{id}` → `{ ...flow, steps: [...with counters] }`
- `POST /api/v1/automations/` → create (sets `flow_kind='bot_flow'`)
- `PATCH /api/v1/automations/{id}` → update name/active/trigger/steps
- Per-block `config` schemas documented per type in the implementation plan.
