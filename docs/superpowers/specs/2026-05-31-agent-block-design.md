# Agent Block — Design Spec

**Date:** 2026-05-31
**Status:** Approved (concept) — building
**Builds on:** Bot Flow Builder Phase 1 + 2. Reuses the resumable engine, variables, and
pause-on-reply machinery.

## Why

A pure visual flow builder is 2026 table-stakes; the differentiator is the **hybrid**
model — deterministic blocks as guardrails around an **LLM agent** that handles the
messy conversational middle. This block turns Aira's builder from "2023 flowchart" into
"2026 agentic" using tools that already exist (knowledge base, scoring, segmentation).

## Concept

A new block `ai_agent`. The operator states a **goal** in natural language and the
discrete **outcomes** the agent may reach. At runtime the agent drives a multi-turn
WhatsApp conversation — answering from the knowledge base, taking safe CRM actions via
tools — until it reaches one of the declared outcomes. Each outcome is a **branch lane**
(reusing the interactive N-way model), so the deterministic flow continues differently
per outcome. The chosen outcome is also saved to a variable.

The agent is a **contained** LLM (the 2026 "deterministic envelope around a probabilistic
core" pattern): each turn the model returns a strict JSON decision the engine validates,
never free-form control of the system.

## Config

```
ai_agent:
  goal: string              # NL objective, e.g. "Qualify the lead and answer questions"
  outcomes: string[]        # 1..5 discrete end states, e.g. ["qualified","not_interested","needs_human"]
  output_var: string        # default "agent_outcome" — stores the chosen outcome
  tools: string[]           # subset of the registry (below)
  max_turns: int            # default 6 — cap on lead round-trips (safety)
  use_knowledge: bool       # default true — inject tenant KB so the agent can answer
```

Branching: like `interactive`, the node fans out into one child lane per outcome
(branch label = outcome string). `lanesOf()` already supports arbitrary labels.

## Tool registry (v1 — safe, already-built, no money movement)

| tool | backing | effect |
|---|---|---|
| `search_knowledge(query)` | knowledge_service | returns KB snippet to answer a question |
| `update_segment(segment)` | leads.segment | set A/B/C/D |
| `add_note(text)` | lead_notes | log a note |
| `score_lead()` | lead_scorer | re-score from the conversation |
| `assign_to_caller()` | assignment.auto_assign_lead | round-robin assign |

**Excluded from v1 (money/irreversible):** booking, payment, send_template, opt-out.
Those stay deterministic-block-only until the agent loop is proven. Surfaced as a
deliberate scope choice.

## Engine — the agent loop

New module `services/agent_runtime.py`. Reuses `ai_reply._groq_client` /
`llama-3.3-70b-versatile` (Invariant 10 — no other providers).

Agent state lives in the run's `variables` under a reserved key
`__agent_<step_id>` = `{history: [...], turns: int}` so it survives pause/resume.

Each decision step the model returns JSON:
```
{ "thought": str,
  "action": "message" | "tool" | "finish",
  "message": str?,          # action=message: text to send the lead, then pause
  "tool": str?, "args": {}, # action=tool: call a registry tool, observe, loop
  "outcome": str? }         # action=finish: must be one of config.outcomes
```

Loop (bounded by `_MAX_TOOL_CALLS` per activation, e.g. 8):
- `tool` → execute (validated against the node's allowed tools), append observation,
  loop again (no lead interaction).
- `message` → send via the lead's channel, record outbound (counts as sent), pause the
  run as `waiting_reply` with the agent node as pointer, persist agent state, return
  `wait_reply`. Resume (inbound) appends the lead reply to history and re-enters the loop.
- `finish` → validate `outcome ∈ outcomes` (else coerce to first outcome), set
  `variables[output_var] = outcome`, advance via `_next_step_id(steps, node, outcome)`.
- Safety: if `turns > max_turns` → force `finish` with outcome = a configured fallback
  (first outcome, or "needs_human" if present). If JSON is unparseable → one retry, then
  finish-fallback. If `_groq_client` is None → finish-fallback (degrade gracefully).

FAQ-first (Invariant 1) is not violated: the agent only runs when the flow owns the turn
(generate_reply already suppressed by Phase-2 interception); the agent *prefers*
`search_knowledge` for answers, honoring the knowledge layer.

## Resume integration

`flow_runtime.resume_for_inbound` gets an `ai_agent` branch: instead of capturing into
`save_as` and advancing, it appends the reply to the agent history and calls
`agent_runtime.resume_agent(run, node, message, db)`, which re-enters the loop and
ultimately advances on `finish`. CAS guard (from the review fixes) still applies.

## Frontend

- Register `ai_agent` in blockMeta (icon: Bot/Sparkles), picker, and a config form:
  goal (textarea), outcomes (repeater 1..5, each a short label), tools (multi-select
  checklist), max_turns (number), use_knowledge (toggle), output_var (text).
- Branching: `isBranching("ai_agent") = true`; `lanesOf` returns one lane per outcome
  (key = outcome, label = outcome). BranchGroup/FlowCanvas/mapLayout already render
  arbitrary labeled lanes (Milestone C) — no further changes.
- Card summary: the goal (truncated) + an "AI" accent.

## Validation (routes/automations.py)

`ai_agent` requires: non-empty `goal`; 1..5 `outcomes` (non-empty strings); `output_var`;
`max_turns` 1..20; every `tools` entry in the registry.

## Verification

Behavioral test (stubbed Groq) through the real loop:
1. Agent that calls `search_knowledge` then `message`s the lead → run pauses
   `waiting_reply`, message sent.
2. Inbound reply → agent `finish`es with outcome "qualified" → `output_var` set, flow
   follows the "qualified" lane → that lane's block fires.
3. max_turns exceeded → forced finish on fallback outcome (no infinite loop).
4. Outcome→branch round-trip (reuses verified interactive multi-way serialization).

## Out of scope (later)

- Money/irreversible tools (booking, payment, templates) as agent actions.
- Agent memory across runs/channels (the cross-channel voice-memory moat — separate build).
- Streaming/typing indicators.
