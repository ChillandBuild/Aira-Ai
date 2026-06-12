# Broadcast Auto-Retry — Design

**Date:** 2026-06-12
**Status:** Approved → implementation

## Problem

Meta caps each WhatsApp user at ~2 marketing template messages / 24h **across all
brands**. The cap resets daily and is bypassed the moment the lead replies. When a
broadcast goes to 100 leads, a portion are silently throttled — they never receive the
message even though their number is valid and they may be engaged.

### Load-bearing fact
These failures are **not** visible at send time. The Meta API call succeeds and returns
a message ID for all recipients. The cap manifests **asynchronously** (minutes–hours
later) as a `failed` delivery-status webhook carrying error code **`131049`**
("not delivered to maintain healthy ecosystem engagement"), or as a **silent**
non-delivery (accepted, never delivered, no `failed` webhook at all). The retry set can
only be computed *after* receipts settle — which the "retry next day" model handles
naturally.

## The three failure modes (only one is retry-worthy)

| Mode | Meta signal | Meaning | Response |
|---|---|---|---|
| ① Wrong / invalid number | `131026`, `131000`, invalid-user | Number bad/no WhatsApp | **Never retry.** Already → `leads.whatsapp_undeliverable=true` |
| ② Disengagement | none — messages **delivered** | Lead ignores all sends | **Never retry.** Already suppressed at `outbound_no_reply_count >= 3` |
| ③ Marketing cap | `131049` (or silent drop) | Number valid, Meta rationed today's marketing volume; resets in 24h | **Retry tomorrow** — the feature |

## Decisions (locked during brainstorming)

- **Trigger = "sent but no `delivered`/`read` receipt by cutoff"** (robust) — catches
  `131049` *and* silent drops, vs. matching `131049` explicitly which misses silent
  drops. Cap resets daily so a slow real delivery won't be double-sent.
- **Architecture = dedicated retry subsystem**, reusing `broadcast_executor.py`
  unchanged and reusing the re-engagement skip-rules.
- **Config = per-broadcast toggle**, defaults pre-filled.
- **Timing = specific wall-clock time each day**, in tenant timezone, with a ≥20h guard
  so the cap has actually reset.

## Core model

Every broadcast (immediate or scheduled) already has an anchor row in
`scheduled_broadcasts` and a full recipient list in `broadcast_recipients`. A **retry
chain** = the original broadcast + child re-send attempts, all linked by `retry_of` →
the original `broadcast_id`.

Each retry attempt is just a new **child `scheduled_broadcasts` row** whose `leads_json`
is the recomputed undelivered subset. The existing 1-min `_process_scheduled_broadcasts`
job sends it via `broadcast_executor` — **no executor changes**. New code is only the
orchestrator that decides *who* and *when*.

> Note: immediate broadcasts store an **empty** `leads_json` in their shell row
> (`upload.py`), so the retry set is sourced from `broadcast_recipients`, not
> `leads_json`.

## Eligibility (who lands in attempt N)

At each retry fire time, recompute from the chain's `broadcast_recipients` joined to
`messages.delivery_status`. A lead is retried only if ALL hold:

- Sent in a prior attempt **and has no `delivered`/`read` receipt** across the whole chain.
- `leads.whatsapp_undeliverable = false` (excludes mode ①).
- `leads.opted_out = false`.
- No inbound reply since the original send (`last_inbound_at`) — reply bypasses the cap
  and means don't re-spam.
- `outbound_no_reply_count < 3` (reuses mode ② suppression).

Empty eligible set → chain marked `completed`.

## Timing

- Client picks a wall-clock time (e.g. `10:00`), interpreted in **tenant timezone**
  (new `app_settings.timezone`, default `Asia/Kolkata`).
- Attempt N fires at the **next occurrence of that time ≥20h after the previous send**,
  so the daily marketing cap has reset (handles "sent 11pm, 10am is only 11h later").

## Client controls (per-broadcast, defaults pre-filled)

- ☑ Auto-retry undelivered messages
- Retry at: `10:00` (time picker)
- Max attempts: `2` (1–5; *retries*, so total sends = original + up to 2)

## Schema changes

1. `scheduled_broadcasts` + `retry_enabled bool default false`, `retry_time time`,
   `retry_max_attempts int default 2`, `retry_of uuid` (parent; null on original),
   `retry_attempt int default 0`.
2. `broadcast_recipients` + `extra_cols jsonb` — personalization survives into retries.
3. `app_settings` + `timezone text default 'Asia/Kolkata'`.

## New orchestrator job

`_process_broadcast_retries` (APScheduler, 5-min tick) in `main.py`, backed by
`services/broadcast_retry.py`:

1. Find original broadcasts (`retry_of IS NULL`) where `retry_enabled`, chain not
   `completed`, `retry_attempt < retry_max_attempts` on the latest attempt.
2. If now ≥ chain's next fire time → compute eligible set.
3. Non-empty → insert child `scheduled_broadcasts` row (`retry_of=parent`,
   `retry_attempt=N`, `leads_json`=eligible rebuilt with `extra_cols`, `fire_at=now`,
   `status='pending'`). Existing scheduler sends it.
4. Stop chain when attempts exhausted or eligible empties.

## Metrics

No new metrics table — each attempt is its own `broadcast_id` with its own
`broadcast_recipients`; `delivered`/`read` settle on `messages.delivery_status`. Read API
`GET /api/v1/broadcasts/{broadcast_id}/retry-timeline` returns per-attempt
targeted / delivered+read / still-undelivered counts. UI renders an attempt timeline on
broadcast history detail plus an "eventually delivered" rollup.

## Out of scope (YAGNI)

- Per-attempt template rotation (retries reuse original template + params).
- Global tenant default retry config.
- Retrying mode ① / ② failures.

## Invariants respected

- No Gemini/OpenAI; no AI in this feature.
- Tenant isolation via existing `tenant_id` scoping on every query.
- `call_status` / segment untouched.
