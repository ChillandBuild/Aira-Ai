# Bot Flow Builder — Phase 2 Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming) — pending implementation
**Builds on:** Phase 1 (shipped). Extends the same in-place automations engine.

## Summary

Phase 2 adds the "run-context" capabilities Phase 1 deferred: a variable system,
a resumable execution engine, pause-and-resume-on-reply (interactive bot turns),
four power blocks (HTTP API, Random, User Input, Interactive), a read-only map view,
and multi-way branching. Google Sheets Fetch is **deferred** to a later follow-up
(runtime Google auth is a credential subsystem; the HTTP API block already covers
sheets-as-API in the interim).

## Critical precondition: the current resume path is broken

`resume_pending_executions()` calls `run_automation()`, which rebuilds `root_steps`
and `walk()`s **from the root** every time — it ignores the stored `resume_step_id`
(automation_engine.py:502 stores it; nothing reads it). A flow with a `wait` would
re-send every pre-wait step on each resume and never reach post-wait steps. This is
dormant only because all existing automations are inactive (`active_flows=0`).

**Phase 2 replaces the resume mechanism entirely** with a durable, step-pointer
run-state. There is ONE resume mechanism that subsumes both time-waits and
reply-waits. The legacy `automation_pending_executions` table is retired (left in
place, no longer written/read).

## Architecture

### New execution model: step-pointer state machine

Today's executor recurses the whole tree in one pass. Phase 2 makes it **resumable**:
the engine holds a `current_step_id` and executes one node at a time.

- Execute node → compute the **next node** → set `current_step_id` → loop.
- On `wait` → persist run `status='waiting_time'`, `resume_at`, `current_step_id`=next
  node → stop. Cron resumes when due.
- On `user_input` / `interactive` → persist run `status='waiting_reply'`,
  `current_step_id`=the awaiting node → stop. Inbound message resumes it.
- On `condition` (and multi-way) → evaluate → next = first child of the chosen branch.
- No next node → `status='done'`.

**Next-node computation** (tree-as-sequence): children of a parent are ordered by
`position`; next is the next sibling; when a parent's children exhaust, pop to the
parent's next sibling (maintain a parent chain). Entering a branch sets next = first
child whose `branch` matches the chosen label. This is deterministic from the flat
`automation_steps` rows + the current node id. Implemented as a pure
`_next_step_id(steps_flat, current_id, branch=None)` helper, unit-testable in
isolation.

Behavior preservation: linear and binary-condition flows (Phase 1) produce identical
sends under the new engine — it just advances via the pointer loop instead of
recursion. This engine runs in the production reply path, so Milestone A is
runtime-verified before anything builds on it.

### New table — `automation_flow_runs` (migration 074)

```
id             UUID PK
automation_id  UUID FK → automations(id) ON DELETE CASCADE
lead_id        UUID FK → leads(id) ON DELETE CASCADE
tenant_id      UUID NOT NULL
status         TEXT CHECK IN ('running','waiting_time','waiting_reply','done','failed')
current_step_id UUID            -- node to execute/resume at (NULL when done)
variables      JSONB DEFAULT '{}'  -- the run's variable bag
resume_at      TIMESTAMPTZ      -- set when status='waiting_time'
trigger_message TEXT            -- the inbound that started/last advanced the run
created_at     TIMESTAMPTZ DEFAULT now()
updated_at     TIMESTAMPTZ DEFAULT now()
```
Indexes: `(status, resume_at) WHERE status='waiting_time'` (cron pickup);
`(lead_id, automation_id, status) WHERE status='waiting_reply'` (inbound lookup);
`(tenant_id, created_at DESC)`.

At most one active (`running`/`waiting_*`) run per (lead, automation) — enforce in app
logic (re-trigger while waiting = ignore or restart per trigger semantics; default:
ignore new trigger if an active run exists for that lead+automation).

### Variable system

- `variables` JSONB on the run is the bag. Seeded with lead fields
  (`name`, `phone`, `segment`, `score`) at run start.
- Interpolation: extend the existing `_interpolate` to resolve any `{{key}}` from the
  run's variable bag (falling back to the current name/phone behavior). Applies to all
  text/caption/url/body fields in send blocks.
- Writers: `http_api` (response or JSON-path → var), `random` (number → var),
  `user_input` (captured reply → var), `interactive` (chosen button label/id → var).

### Pause-and-resume-on-reply — 4-channel interception

User decision: **all 4 channels** (WhatsApp, Telegram, Instagram, Facebook).

Interception point — in each inbound path, AFTER the inbound message is stored but
BEFORE both the `new_message_received` trigger fan-out AND `generate_reply`:

```
waiting = find active waiting_reply run for (lead_id, automation active)
if waiting:
    resume_flow_run(waiting, message)      # capture var / branch, advance engine
    # SUPPRESS this message's normal handling:
    #   - do NOT fire new_message_received trigger fan-out
    #   - do NOT call generate_reply
    continue / return
# else: existing behavior unchanged (FAQ-first reply pipeline intact)
```

This is the same short-circuit shape as the existing `ai_enabled=False` guard inside
`generate_reply`. FAQ-first (Invariant 1) is NOT violated: when a flow owns the turn,
neither FAQ nor the LLM runs; when no flow is waiting, the pipeline is untouched.

Files touched (4 inbound paths): `routes/webhook.py` (WA), `routes/telegram.py`,
`routes/instagram.py`, `routes/facebook.py`. A shared helper
`services/flow_runtime.resume_for_inbound(lead_id, tenant_id, message, db) -> bool`
encapsulates the lookup+resume+suppress decision; each webhook calls it and skips
normal handling when it returns True. Single source of truth, 4 thin call sites.

**Trigger fan-out suppression (correctness-critical):** the inbound paths fire
`new_message_received` BEFORE `generate_reply`. When a waiting flow consumes the
message, BOTH must be suppressed for that message — otherwise we resume one flow while
starting others and/or double-reply. The shared helper returns True and the call site
skips the trigger call too.

### Power blocks (Milestone C)

- `http_api` — config `{method, url, headers?, body?, save_as, json_path?}`. Our server
  fetches the URL → **SSRF guard required**: reject private/link-local/loopback/cloud-
  metadata ranges (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7) after
  DNS resolution; https/http only; timeout; size cap. Store response (or `json_path`
  extraction) into `variables[save_as]`.
- `random` — config `{min, max, save_as}` → integer into `variables[save_as]`. (Random
  branching = random block writing a var + a condition reading it.)
- `user_input` — config `{prompt, save_as, ...}`. Sends `prompt`, sets run
  `waiting_reply`. On inbound resume, stores the reply text into `variables[save_as]`
  and advances.
- `interactive` — config `{body, buttons:[{id,title}] (≤3) | list}`. Sends WhatsApp
  interactive buttons; sets `waiting_reply`. On inbound resume, maps the chosen
  button/list id to a **branch label** = the button id; the engine follows the child
  whose `branch` == that id (multi-way). On non-WhatsApp channels, degrade: send a
  numbered text menu and match the reply number/text to a button.

### Multi-way branching

Schema already permits `branch` up to 40 chars (Phase 1 migration). `condition`
remains binary (`yes`/`no`); `interactive` introduces N-way where each child lane's
`branch` is a button id. The frontend BranchGroup renders one labeled lane per button;
`_next_step_id` already handles arbitrary branch labels.

### Map view (parallelizable immediately)

Read-only node-graph render of the same tree (`MapView.tsx`, enabled by the
already-present header toggle). Independent of all backend work — can be built in
parallel from day one of Phase 2. Uses a lightweight layout (dagre-style or simple
layered) over the existing tree model from `useFlow`. No new deps if avoidable;
otherwise a small graph lib behind a dynamic import.

## Milestones (verified, sequential where dependent)

- **A — Foundation:** migration 074 (`automation_flow_runs`) + resumable step-pointer
  engine (subsumes `wait`, retires `automation_pending_executions`) + `{{var}}`
  interpolation + run seeding. **Runtime-verify live** (see test plan), commit.
- **B — Pause-on-reply:** `flow_runtime.resume_for_inbound` + interception in all 4
  inbound paths (suppress trigger fan-out + generate_reply). **Runtime-verify live**,
  commit.
- **C — Blocks + Map (parallel):** http_api (+SSRF), random, user_input, interactive,
  multi-way UI + executor; AND map view (independent). Validation in `automations.py`.
  Frontend block forms + picker expansion (now show all blocks). Review + verify.

Map view may start in parallel with A. Blocks (C) must follow A+B (their semantics
depend on the resolved foundation).

## Runtime test plan (designed now, per advisor)

Compile-checks are blind to the stateful failure modes here. Verification:

**Milestone A (wait-resume correctness — the dormant bug):**
1. Create active flow `[msg A → wait 1m → msg B]`, fire trigger for a test lead.
2. Assert: a `automation_flow_runs` row exists, `status='waiting_time'`,
   `current_step_id` = msg B's id, msg A sent exactly once (one outbound message row).
3. Force `resume_at` into the past, run the cron resume.
4. Assert: msg B sent, `status='done'`, msg A NOT re-sent (still exactly one A row).

If the env can't fire live sends, simulate at the DB/engine layer: drive the engine
functions directly against the live DB with a stub send, asserting run-state
transitions and the single-send invariant. Hand the user a manual WhatsApp script for
the true end-to-end.

**Milestone B (pause-on-reply + no double-reply):**
1. Active flow `[user_input "your name?" save_as=name → msg "hi {{name}}"]`.
2. Fire trigger → assert prompt sent, run `waiting_reply`, `current_step_id`=user_input
   node.
3. Simulate inbound "Ravi" for that lead.
4. Assert: `variables.name == "Ravi"`, msg "hi Ravi" sent, run `done`, **and
   `generate_reply` did NOT fire** (no AI/FAQ outbound for that inbound), **and
   `new_message_received` automations did NOT fan out** for that message.

This double-negative (flow advanced AND AI stayed silent) is the core assertion;
plan it before building.

## Risks

- **HIGH** — Rewriting the executor control flow; runs in the production reply path
  alongside booking. Mitigations: pure `_next_step_id` helper (unit-testable), behavior
  preservation for Phase-1 flows, Milestone A runtime gate before anything builds on it.
- **HIGH** — 4-channel interception ordering: must suppress BOTH trigger fan-out and
  generate_reply atomically per message. Single shared helper; verified by the
  no-double-reply test.
- **MEDIUM** — SSRF on http_api (our server fetches). Post-DNS private-range block.
- **MEDIUM** — Re-entrancy: two inbound messages racing a waiting run. Single-active-run
  constraint + status flip to `running` before advancing (optimistic guard).
- **LOW** — Interactive on non-WhatsApp channels degrades to numbered text menu.

## Out of scope (later follow-up)

- Google Sheets Fetch (native runtime Google auth).
- A/B split testing, flow templates, conversion/funnel dashboards (potential Phase 3).
