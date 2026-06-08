# Re-engagement Sequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn re-engagement into a customizable multi-step sequence builder with auto-fallback-to-template on closed windows, honest per-trigger timing copy, and its own sub-tab in the Leads page.

**Architecture:** Backend already stores multiple `reengagement_steps` per trigger and checks each lead's real 24h window at send time. We add a backup-template column, make freeform fall back to that template when the window is closed (instead of skipping), and rebuild the UI as two clean screens — `Campaign Follow-up` (clock = broadcast send) and `Reply Follow-up` (clock = lead reply) — each with a 24h timeline builder.

**Tech Stack:** FastAPI + Pydantic v2, Supabase (PostgreSQL), Next.js 14 App Router + TypeScript + Tailwind, pytest (backend), `next build`/`tsc` (frontend verification — no JS unit harness in repo).

**Spec:** `docs/superpowers/specs/2026-06-08-reengagement-sequences-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `backend/supabase/migrations/097_reengagement_fallback_template.sql` | Add `fallback_template_name`, `fallback_template_variables`; extend logs status CHECK | Create |
| `backend/app/routes/reengagement.py` | Accept + persist the two new fields | Modify |
| `backend/app/services/reengagement_service.py` | Freeform → fallback template when window closed; DRY template send into one helper | Modify |
| `backend/tests/test_reengagement_service.py` | Unit-test the freeform/fallback/skip/template branches | Create |
| `frontend/lib/api.ts` | Export `WabaTemplate`; add fallback fields to `ReengagementStep` + `createStep` | Modify |
| `frontend/app/dashboard/leads/ReengagementBuilder.tsx` | Self-contained sequence builder (timeline + step list + add form), one instance per trigger type | Create |
| `frontend/app/dashboard/leads/page.tsx` | Add `Leads \| Re-engagement` header tab; render builder twice; remove inline panel from source dropdown | Modify |

---

## Task 1: Migration — fallback columns + status value

**Files:**
- Create: `backend/supabase/migrations/097_reengagement_fallback_template.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 097: Re-engagement backup template + fallback log status
-- Purpose: A freeform step can carry a backup approved template that is sent
-- when a lead's 24h window is closed at fire time, instead of skipping the lead.

ALTER TABLE public.reengagement_steps
  ADD COLUMN IF NOT EXISTS fallback_template_name text,
  ADD COLUMN IF NOT EXISTS fallback_template_variables jsonb;

-- Allow the engine to record fallback sends distinctly.
ALTER TABLE public.reengagement_logs
  DROP CONSTRAINT IF EXISTS reengagement_logs_status_check;

ALTER TABLE public.reengagement_logs
  ADD CONSTRAINT reengagement_logs_status_check
  CHECK (status IN ('sent', 'failed', 'skipped_window', 'sent_fallback'));
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply to project `ayftynkgmfkaqmmnlmoc` using the Supabase `apply_migration` tool with name `097_reengagement_fallback_template` and the SQL above. (Render auto-deploy is OFF and migrations are applied directly to Supabase per project memory.)

- [ ] **Step 3: Verify columns exist**

Run via Supabase `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'reengagement_steps'
  AND column_name IN ('fallback_template_name', 'fallback_template_variables');
```
Expected: 2 rows returned.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/097_reengagement_fallback_template.sql
git commit -m "feat: re-engagement backup template column + fallback log status (migration 097)"
```

---

## Task 2: API — accept and persist fallback fields

**Files:**
- Modify: `backend/app/routes/reengagement.py:12-20` (model), `:56-67` (insert row)

- [ ] **Step 1: Add the two fields to the Pydantic model**

In `backend/app/routes/reengagement.py`, replace the `ReengagementStepCreate` class body's trailing fields so the full class reads:

```python
class ReengagementStepCreate(BaseModel):
    type: str  # 'broadcast' or 'inbound'
    broadcast_id: str | None = None
    delay_hours: int
    target_segments: list[str]
    message_type: str  # 'freeform' or 'template'
    message_content: str | None = None
    template_name: str | None = None
    template_variables: list[str] | None = None
    fallback_template_name: str | None = None
    fallback_template_variables: list[str] | None = None
```

- [ ] **Step 2: Persist them in `create_step`**

In the same file, replace the `row = {...}` dict inside `create_step` with:

```python
    row = {
        "tenant_id": ctx["tenant_id"],
        "type": payload.type,
        "broadcast_id": payload.broadcast_id,
        "delay_hours": payload.delay_hours,
        "target_segments": payload.target_segments,
        "message_type": payload.message_type,
        "message_content": payload.message_content,
        "template_name": payload.template_name,
        "template_variables": payload.template_variables,
        "fallback_template_name": payload.fallback_template_name,
        "fallback_template_variables": payload.fallback_template_variables,
    }
```

- [ ] **Step 3: Add a 24h-horizon guard**

In `create_step`, directly after the existing `if payload.delay_hours <= 0:` check, add:

```python
    if payload.delay_hours > 24:
        raise HTTPException(status_code=400, detail="delay_hours must be within the 24h window (1-24)")
```

- [ ] **Step 4: Syntax check**

Run: `cd backend && python -c "import ast; ast.parse(open('app/routes/reengagement.py').read()); print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/reengagement.py
git commit -m "feat: re-engagement API accepts backup template + 24h delay guard"
```

---

## Task 3: Engine — freeform falls back to template when window closed

**Files:**
- Modify: `backend/app/services/reengagement_service.py:144-285` (`_send_reengagement`)
- Test: `backend/tests/test_reengagement_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_reengagement_service.py`:

```python
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, AsyncMock, patch


def _make_db(captured_logs):
    """Supabase mock that records every reengagement_logs insert into captured_logs."""
    db = MagicMock()

    def table_selector(name):
        t = MagicMock()
        if name == "reengagement_logs":
            def _insert(row):
                captured_logs.append(row)
                res = MagicMock()
                res.execute.return_value.data = [{"id": "log-1"}]
                return res
            t.insert.side_effect = _insert
        elif name == "messages":
            t.insert.return_value.execute.return_value.data = [{"id": "msg-1"}]
        else:
            t.insert.return_value.execute.return_value.data = [{"id": "x"}]
        return t

    db.table.side_effect = table_selector
    return db


def _now_iso(hours_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


def _step(message_type="freeform", fallback=None):
    return {
        "id": "step-1",
        "message_type": message_type,
        "message_content": "Hi there!",
        "template_name": "promo_v1",
        "template_variables": ["name"],
        "fallback_template_name": fallback,
        "fallback_template_variables": ["name"] if fallback else None,
    }


def _lead(hours_since_reply: float, source=None):
    return {
        "id": "lead-1",
        "name": "Asha",
        "phone": "919999999999",
        "last_inbound_at": _now_iso(hours_since_reply),
        "source": source,
        "extra_cols": {},
        "collected_data": {},
    }


@pytest.mark.asyncio
async def test_freeform_window_open_sends_freeform():
    from app.services import reengagement_service as svc
    logs = []
    db = _make_db(logs)
    with patch.object(svc, "send_whatsapp", new=AsyncMock(return_value="sid-1")) as wa, \
         patch.object(svc, "send_template_message", new=AsyncMock()) as tpl:
        ok = await svc._send_reengagement(db, "t1", _lead(2), _step())
    assert ok is True
    wa.assert_awaited_once()
    tpl.assert_not_awaited()
    assert logs[-1]["status"] == "sent"


@pytest.mark.asyncio
async def test_freeform_window_closed_with_fallback_sends_template():
    from app.services import reengagement_service as svc
    logs = []
    db = _make_db(logs)
    with patch.object(svc, "send_whatsapp", new=AsyncMock()) as wa, \
         patch.object(svc, "send_template_message",
                      new=AsyncMock(return_value={"messages": [{"id": "sid-2"}]})) as tpl:
        ok = await svc._send_reengagement(db, "t1", _lead(30), _step(fallback="winback_v1"))
    assert ok is True
    wa.assert_not_awaited()
    tpl.assert_awaited_once()
    assert tpl.await_args.kwargs["template_name"] == "winback_v1"
    assert logs[-1]["status"] == "sent_fallback"


@pytest.mark.asyncio
async def test_freeform_window_closed_no_fallback_skips():
    from app.services import reengagement_service as svc
    logs = []
    db = _make_db(logs)
    with patch.object(svc, "send_whatsapp", new=AsyncMock()) as wa, \
         patch.object(svc, "send_template_message", new=AsyncMock()) as tpl:
        ok = await svc._send_reengagement(db, "t1", _lead(30), _step(fallback=None))
    assert ok is False
    wa.assert_not_awaited()
    tpl.assert_not_awaited()
    assert logs[-1]["status"] == "skipped_window"


@pytest.mark.asyncio
async def test_template_step_always_sends_template():
    from app.services import reengagement_service as svc
    logs = []
    db = _make_db(logs)
    with patch.object(svc, "send_whatsapp", new=AsyncMock()) as wa, \
         patch.object(svc, "send_template_message",
                      new=AsyncMock(return_value={"messages": [{"id": "sid-3"}]})) as tpl:
        ok = await svc._send_reengagement(db, "t1", _lead(30), _step(message_type="template"))
    assert ok is True
    wa.assert_not_awaited()
    tpl.assert_awaited_once()
    assert tpl.await_args.kwargs["template_name"] == "promo_v1"
    assert logs[-1]["status"] == "sent"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_reengagement_service.py -v`
Expected: FAIL — `test_freeform_window_closed_with_fallback_sends_template` fails (current code logs `skipped_window` and returns False), and `test_template_step_always_sends_template` may fail on the `template_name=` kwarg assertion since the current call passes it positionally/differently.

- [ ] **Step 3: Refactor the template send into a reusable helper**

In `backend/app/services/reengagement_service.py`, add this helper immediately above `_send_reengagement` (after the `process_due_reengagements` function):

```python
async def _send_step_template(
    db,
    tenant_id: str,
    lead: dict,
    step: dict,
    *,
    template_name: str,
    template_variables: list[str] | None,
    log_status: str,
) -> bool:
    """Send a template message for a step and write message + reengagement logs."""
    lead_id = lead["id"]
    phone = lead["phone"]
    step_id = step["id"]
    if not template_name:
        raise ValueError("Template name not configured")

    parameters = []
    for var_name in (template_variables or []):
        if var_name == "name":
            val = lead.get("name") or "there"
        elif var_name == "phone":
            val = lead.get("phone") or ""
        else:
            val = (
                (lead.get("extra_cols") or {}).get(var_name)
                or (lead.get("collected_data") or {}).get(var_name)
                or ""
            )
        parameters.append({"type": "text", "text": str(val)})

    components = [{"type": "body", "parameters": parameters}] if parameters else []

    res = await send_template_message(
        to_number=phone,
        template_name=template_name,
        components=components,
        tenant_id=tenant_id,
    )
    sid = res.get("messages", [{}])[0].get("id") if res else None

    db.table("messages").insert({
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "direction": "outbound",
        "channel": "whatsapp",
        "content": f"[Template Broadcast: {template_name}]",
        "is_ai_generated": True,
        "meta_message_id": sid or "",
    }).execute()

    db.table("reengagement_logs").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "step_id": step_id,
        "status": log_status,
    }).execute()
    logger.info(f"Re-engagement step {step_id} ({log_status}) sent to lead {lead_id}")
    return True
```

- [ ] **Step 4: Rewrite `_send_reengagement` to use the helper + fallback**

Replace the entire body of `_send_reengagement` (from the `if message_type == "freeform":` block to the end of the function) with:

```python
    if message_type == "freeform":
        if not is_window_active:
            fallback_name = step.get("fallback_template_name")
            if fallback_name:
                try:
                    return await _send_step_template(
                        db, tenant_id, lead, step,
                        template_name=fallback_name,
                        template_variables=step.get("fallback_template_variables"),
                        log_status="sent_fallback",
                    )
                except Exception as e:
                    logger.error(f"Re-engagement fallback template {step_id} failed for lead {lead_id}: {e}")
                    db.table("reengagement_logs").insert({
                        "tenant_id": tenant_id,
                        "lead_id": lead_id,
                        "step_id": step_id,
                        "status": "failed",
                    }).execute()
                    return False

            db.table("reengagement_logs").insert({
                "tenant_id": tenant_id,
                "lead_id": lead_id,
                "step_id": step_id,
                "status": "skipped_window",
            }).execute()
            logger.info(f"Re-engagement step {step_id} skipped for lead {lead_id} (outside 24h window, no fallback)")
            return False

        try:
            content = step["message_content"] or ""
            sid = await send_whatsapp(phone, content, tenant_id=tenant_id)
            if not sid:
                raise RuntimeError("Channel send returned empty SID")

            db.table("messages").insert({
                "lead_id": lead_id,
                "tenant_id": tenant_id,
                "direction": "outbound",
                "channel": "whatsapp",
                "content": content,
                "is_ai_generated": True,
                "meta_message_id": sid,
            }).execute()

            db.table("reengagement_logs").insert({
                "tenant_id": tenant_id,
                "lead_id": lead_id,
                "step_id": step_id,
                "status": "sent",
            }).execute()
            logger.info(f"Re-engagement step {step_id} (freeform) sent to lead {lead_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to send re-engagement freeform step {step_id} to lead {lead_id}: {e}")
            db.table("reengagement_logs").insert({
                "tenant_id": tenant_id,
                "lead_id": lead_id,
                "step_id": step_id,
                "status": "failed",
            }).execute()
            return False

    elif message_type == "template":
        try:
            return await _send_step_template(
                db, tenant_id, lead, step,
                template_name=step.get("template_name"),
                template_variables=step.get("template_variables"),
                log_status="sent",
            )
        except Exception as e:
            logger.error(f"Failed to send re-engagement template step {step_id} to lead {lead_id}: {e}")
            db.table("reengagement_logs").insert({
                "tenant_id": tenant_id,
                "lead_id": lead_id,
                "step_id": step_id,
                "status": "failed",
            }).execute()
            return False

    return False
```

Note: the variable `message_type`, `phone`, `step_id`, `lead_id`, and `is_window_active` are already defined earlier in `_send_reengagement` (lines 146-167) — do not redefine them.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_reengagement_service.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/reengagement_service.py backend/tests/test_reengagement_service.py
git commit -m "feat: re-engagement freeform falls back to backup template on closed window"
```

---

## Task 4: Frontend API client — types + fallback fields

**Files:**
- Modify: `frontend/lib/api.ts:11`? (no) — `:153-165` (`ReengagementStep`), `:669-677` (`createStep` arg), and add exported `WabaTemplate`

- [ ] **Step 1: Add exported `WabaTemplate` and extend `ReengagementStep`**

In `frontend/lib/api.ts`, replace the `ReengagementStep` interface with:

```typescript
export interface WabaTemplate {
  id: string;
  name: string;
  category: string;
  status: string;
}

export interface ReengagementStep {
  id: string;
  tenant_id: string;
  type: "broadcast" | "inbound";
  broadcast_id?: string | null;
  delay_hours: number;
  target_segments: string[];
  message_type: "freeform" | "template";
  message_content?: string | null;
  template_name?: string | null;
  template_variables?: string[] | null;
  fallback_template_name?: string | null;
  fallback_template_variables?: string[] | null;
  created_at: string;
}
```

- [ ] **Step 2: Extend the `createStep` argument type**

In `frontend/lib/api.ts`, replace the `createStep: (data: {...})` argument object with:

```typescript
    createStep: (data: {
      type: "broadcast" | "inbound";
      broadcast_id?: string | null;
      delay_hours: number;
      target_segments: string[];
      message_type: "freeform" | "template";
      message_content?: string | null;
      template_name?: string | null;
      template_variables?: string[] | null;
      fallback_template_name?: string | null;
      fallback_template_variables?: string[] | null;
    }) =>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no errors). The local `WabaTemplate` in `page.tsx` still compiles; it is replaced in Task 6.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: re-engagement API client types for backup template"
```

---

## Task 5: Build the `ReengagementBuilder` component

**Files:**
- Create: `frontend/app/dashboard/leads/ReengagementBuilder.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/app/dashboard/leads/ReengagementBuilder.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, ReengagementStep, WabaTemplate } from "@/lib/api";

const SEGMENTS = ["A", "B", "C", "D"] as const;
const SEGMENT_LABELS: Record<string, string> = { A: "Hot", B: "Warm", C: "Cold", D: "Disqualified" };
const MAX_DELAY = 24;

interface ReengagementBuilderProps {
  type: "broadcast" | "inbound";
  broadcastId?: string;
  templates: WabaTemplate[];
}

export default function ReengagementBuilder({ type, broadcastId, templates }: ReengagementBuilderProps) {
  const [steps, setSteps] = useState<ReengagementStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [delayHours, setDelayHours] = useState(6);
  const [segments, setSegments] = useState<string[]>(["C"]);
  const [messageType, setMessageType] = useState<"freeform" | "template">("freeform");
  const [content, setContent] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [fallbackTemplate, setFallbackTemplate] = useState("");

  const fetchSteps = useCallback(async () => {
    if (type === "broadcast" && !broadcastId) {
      setSteps([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.reengagement.listSteps(
        type === "broadcast" ? { type: "broadcast", broadcast_id: broadcastId } : { type: "inbound" }
      );
      setSteps([...rows].sort((a, b) => a.delay_hours - b.delay_hours));
    } catch {
      toast.error("Failed to load sequence");
    } finally {
      setLoading(false);
    }
  }, [type, broadcastId]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  function toggleSegment(s: string) {
    setSegments((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function resetForm() {
    setDelayHours(6);
    setSegments(["C"]);
    setMessageType("freeform");
    setContent("");
    setTemplateName("");
    setFallbackTemplate("");
  }

  async function addStep() {
    if (delayHours < 1 || delayHours > MAX_DELAY) {
      toast.error(`Delay must be between 1 and ${MAX_DELAY} hours`);
      return;
    }
    if (segments.length === 0) {
      toast.error("Select at least one target segment");
      return;
    }
    if (messageType === "freeform" && !content.trim()) {
      toast.error("Message content is required");
      return;
    }
    if (messageType === "template" && !templateName) {
      toast.error("Select a template");
      return;
    }
    try {
      await api.reengagement.createStep({
        type,
        broadcast_id: type === "broadcast" ? broadcastId : null,
        delay_hours: delayHours,
        target_segments: segments,
        message_type: messageType,
        message_content: messageType === "freeform" ? content : null,
        template_name: messageType === "template" ? templateName : null,
        template_variables: messageType === "template" ? ["name"] : null,
        fallback_template_name: messageType === "freeform" && fallbackTemplate ? fallbackTemplate : null,
        fallback_template_variables: messageType === "freeform" && fallbackTemplate ? ["name"] : null,
      });
      toast.success("Message added to sequence");
      setShowAdd(false);
      resetForm();
      fetchSteps();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add message");
    }
  }

  async function removeStep(id: string) {
    if (!confirm("Remove this message from the sequence?")) return;
    try {
      await api.reengagement.deleteStep(id);
      toast.success("Message removed");
      fetchSteps();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove message");
    }
  }

  const anchorLabel = type === "broadcast" ? "after the broadcast was sent" : "after the lead replied";

  return (
    <div className="space-y-6">
      {/* Clock explainer */}
      <div className="rounded-2xl border border-on-surface/10 bg-surface/50 p-5">
        <h3 className="font-label text-xs uppercase tracking-widest text-on-surface-muted">
          {type === "broadcast" ? "Campaign Follow-up" : "Reply Follow-up"} — how timing works
        </h3>
        <p className="mt-2 text-sm text-on-surface">
          {type === "broadcast" ? (
            <>Each message fires a set number of hours <strong>after the broadcast is sent</strong>. Per lead, when a
            message fires: if their 24h WhatsApp window is still open it sends as <strong>freeform</strong>; otherwise
            your <strong>backup template</strong> is sent instead (or the lead is skipped if no backup is set).</>
          ) : (
            <>Each message fires a set number of hours <strong>after the lead replies</strong> — which is the moment
            their 24h window opens. A message at the {"{N}"}th hour leaves <strong>{`24 − N`}</strong> hours of window.
            Freeform delivers inside the window; add a backup template to be safe near the edge.</>
          )}
        </p>
      </div>

      {/* 24h timeline */}
      <div className="rounded-2xl border border-on-surface/10 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-label text-xs uppercase tracking-widest text-on-surface-muted">24-hour window</span>
          <span className="text-xs text-on-surface-muted">0h → 24h close</span>
        </div>
        <div className="relative h-10 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50">
          <div className="absolute right-0 top-0 h-full w-px bg-red-300" />
          {steps.map((s) => {
            const left = Math.min(100, (s.delay_hours / MAX_DELAY) * 100);
            return (
              <div
                key={s.id}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%` }}
                title={`${s.delay_hours}h · ${s.message_type}`}
              >
                <div className={`h-4 w-4 rounded-full border-2 border-white shadow ${s.message_type === "template" ? "bg-indigo-500" : "bg-emerald-600"}`} />
                <span className="mt-1 block text-[10px] text-on-surface-muted">{s.delay_hours}h</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-on-surface-muted">Loading…</p>
        ) : steps.length === 0 ? (
          <p className="text-sm text-on-surface-muted">No messages yet. Add the first one below.</p>
        ) : (
          steps.map((s, i) => (
            <div key={s.id} className="flex items-start justify-between rounded-xl border border-on-surface/10 bg-surface/40 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <span className="rounded bg-on-surface/10 px-2 py-0.5 text-xs">Step {i + 1}</span>
                  <span>{s.delay_hours}h {anchorLabel}</span>
                  <span className="text-on-surface-muted">·</span>
                  <span>{s.target_segments.map((x) => SEGMENT_LABELS[x] || x).join(", ")}</span>
                </div>
                <div className="text-xs text-on-surface-muted">
                  {s.message_type === "template" ? (
                    <>Template: <span className="font-mono">{s.template_name}</span> · always delivers</>
                  ) : (
                    <>Freeform{ s.fallback_template_name ? <> → backup template <span className="font-mono">{s.fallback_template_name}</span></> : <> · skipped if window closed</> }</>
                  )}
                </div>
                {s.message_type === "freeform" && s.message_content && (
                  <p className="max-w-xl truncate text-sm text-on-surface">&ldquo;{s.message_content}&rdquo;</p>
                )}
              </div>
              <button onClick={() => removeStep(s.id)} className="text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add form */}
      {showAdd ? (
        <div className="space-y-4 rounded-2xl border border-on-surface/15 p-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="font-label text-xs uppercase tracking-widest text-on-surface-muted">Delay (hours)</span>
              <input
                type="number"
                min={1}
                max={MAX_DELAY}
                value={delayHours}
                onChange={(e) => setDelayHours(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-on-surface/20 px-3 py-2"
              />
            </label>
            <div>
              <span className="font-label text-xs uppercase tracking-widest text-on-surface-muted">Target segments</span>
              <div className="mt-1 flex gap-2">
                {SEGMENTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSegment(s)}
                    className={`rounded-full px-3 py-1 text-xs ${segments.includes(s) ? "bg-on-surface text-surface" : "bg-on-surface/10 text-on-surface"}`}
                  >
                    {SEGMENT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMessageType("freeform")}
              className={`rounded-xl px-4 py-2 text-sm ${messageType === "freeform" ? "bg-on-surface text-surface" : "bg-on-surface/10 text-on-surface"}`}
            >
              Freeform (window only)
            </button>
            <button
              type="button"
              onClick={() => setMessageType("template")}
              className={`rounded-xl px-4 py-2 text-sm ${messageType === "template" ? "bg-on-surface text-surface" : "bg-on-surface/10 text-on-surface"}`}
            >
              Approved template (always sent)
            </button>
          </div>

          {messageType === "freeform" ? (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Hi! We noticed you haven't booked a time yet. Let us know if you have questions!"
                className="min-h-24 w-full rounded-xl border border-on-surface/20 px-3 py-2 text-sm"
              />
              <label className="block">
                <span className="font-label text-xs uppercase tracking-widest text-on-surface-muted">
                  Backup template (sent if the lead&apos;s window is closed)
                </span>
                <select
                  value={fallbackTemplate}
                  onChange={(e) => setFallbackTemplate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-on-surface/20 px-3 py-2 text-sm"
                >
                  <option value="">No backup — skip lead if window closed</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="block">
              <span className="font-label text-xs uppercase tracking-widest text-on-surface-muted">Template</span>
              <select
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-on-surface/20 px-3 py-2 text-sm"
              >
                <option value="">Select a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); resetForm(); }} className="rounded-xl px-4 py-2 text-sm text-on-surface-muted">
              Cancel
            </button>
            <button onClick={addStep} className="rounded-xl bg-on-surface px-5 py-2 text-sm text-surface">
              Save message
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          disabled={type === "broadcast" && !broadcastId}
          className="w-full rounded-xl border-2 border-dashed border-on-surface/20 py-3 text-sm text-on-surface-muted hover:border-on-surface/40 disabled:opacity-40"
        >
          + Add message
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS. (The component is not yet imported anywhere; this only checks it compiles.)

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/leads/ReengagementBuilder.tsx
git commit -m "feat: ReengagementBuilder — 24h timeline sequence builder component"
```

---

## Task 6: Wire the builder into the Leads page as a sub-tab

**Files:**
- Modify: `frontend/app/dashboard/leads/page.tsx`

- [ ] **Step 1: Import the builder and the shared type; drop the local `WabaTemplate`**

In `frontend/app/dashboard/leads/page.tsx`:

(a) Update the api import (line 4) to include `WabaTemplate`:
```tsx
import { api, Lead, Caller, SegmentTemplate, BroadcastResult, BroadcastHistoryItem, ReengagementStep, WabaTemplate, getAuthHeaders, API_URL } from "@/lib/api";
```
(b) Add below the imports:
```tsx
import ReengagementBuilder from "./ReengagementBuilder";
```
(c) Delete the local `interface WabaTemplate { ... }` block (lines 11-16) — it now comes from `@/lib/api`.

- [ ] **Step 2: Add the page-level tab state**

In the main page component, directly after the `const [tab, setTab] = useState...` line (the segment tab, ~line 191), add:

```tsx
  const [pageView, setPageView] = useState<"leads" | "reengagement">("leads");
  const [reengageTrigger, setReengageTrigger] = useState<"broadcast" | "inbound">("inbound");
```

- [ ] **Step 3: Add the header switch**

Find the top of the page's returned JSX (the outermost content container, just inside the page wrapper, before the segment tabs/source-filter row). Insert this switch as the first child:

```tsx
        <div className="mb-6 flex gap-2 border-b border-on-surface/10">
          <button
            onClick={() => setPageView("leads")}
            className={`px-4 py-2 text-sm font-medium ${pageView === "leads" ? "border-b-2 border-on-surface text-on-surface" : "text-on-surface-muted"}`}
          >
            Leads
          </button>
          <button
            onClick={() => setPageView("reengagement")}
            className={`px-4 py-2 text-sm font-medium ${pageView === "reengagement" ? "border-b-2 border-on-surface text-on-surface" : "text-on-surface-muted"}`}
          >
            Re-engagement
          </button>
        </div>
```

- [ ] **Step 4: Render the Re-engagement view and gate the Leads view**

Immediately after the header switch from Step 3, add the Re-engagement view:

```tsx
        {pageView === "reengagement" && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <button
                onClick={() => setReengageTrigger("inbound")}
                className={`rounded-xl px-4 py-2 text-sm ${reengageTrigger === "inbound" ? "bg-on-surface text-surface" : "bg-on-surface/10 text-on-surface"}`}
              >
                Reply Follow-up
              </button>
              <button
                onClick={() => setReengageTrigger("broadcast")}
                className={`rounded-xl px-4 py-2 text-sm ${reengageTrigger === "broadcast" ? "bg-on-surface text-surface" : "bg-on-surface/10 text-on-surface"}`}
              >
                Campaign Follow-up
              </button>
            </div>

            {reengageTrigger === "broadcast" && (
              <label className="block">
                <span className="font-label text-xs uppercase tracking-widest text-on-surface-muted">Broadcast</span>
                <select
                  value={selectedBroadcastId}
                  onChange={(e) => setSelectedBroadcastId(e.target.value)}
                  className="mt-1 w-full max-w-md rounded-xl border border-on-surface/20 px-3 py-2 text-sm"
                >
                  <option value="">Select a broadcast…</option>
                  {broadcastHistory.filter((b) => b.broadcast_id).map((b) => (
                    <option key={b.broadcast_id} value={b.broadcast_id}>
                      {b.template_name} · {new Date(b.timestamp).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <ReengagementBuilder
              type={reengageTrigger}
              broadcastId={reengageTrigger === "broadcast" ? selectedBroadcastId : undefined}
              templates={wabaTemplates}
            />
          </div>
        )}

        {pageView === "leads" && (
          <>
```

Then find the matching close point: the existing Leads content (segment tabs, source filter, table, action box) must be wrapped so it only renders under `pageView === "leads"`. Add `</>` `)}` to close this fragment immediately before the page's outermost closing wrapper tag (after the leads table + Action Box, before the final `</div>`/`</main>` of the return).

- [ ] **Step 5: Remove the old inline re-engagement panel and its dead state**

(a) Delete the inline re-engagement block — the JSX guarded by `{(sourceFilter === "INBOUND" || (sourceFilter === "BROADCAST" && selectedBroadcastId)) && (` (starts ~line 644) through its matching close `)}` (ends ~line 994, just before the `) : reengagementSteps.length === 0 ?` list region — delete that conditional list region too, through its close). This is the entire legacy timing-assistant + step list UI now replaced by `ReengagementBuilder`.

(b) Delete the now-unused state and handlers in the component: `reengagementSteps`, `loadingSteps`, `showAddStep`, `stepDelayHours`, `stepTargetSegments`, `stepMessageType`, `stepMessageContent`, `stepTemplateName`, `stepTemplateVariables`, `fetchReengagementSteps`, the `useEffect` that calls it, `handleAddStep`, `handleDeleteStep`, and the helpers `getSimulatedInboundTrigger` and `format24hWindow` **only if** they are no longer referenced after the deletion. Keep `wabaTemplates`, `broadcastHistory`, `selectedBroadcastId` — they are still used.

(c) Leave the `sourceFilter` dropdown itself intact as a pure leads filter (remove only its re-engagement side-effects already covered by the `fetchReengagementSteps` deletion).

- [ ] **Step 6: Typecheck and lint (catches unused vars that break the build)**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: PASS with no errors. Per project history, ESLint `no-unused-vars` will fail the Next.js build — resolve every "defined but never used" by deleting the dead symbol (do not suppress).

- [ ] **Step 7: Production build**

Run: `cd frontend && npm run build`
Expected: `✓ Compiled successfully` and the `/dashboard/leads` route builds.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/dashboard/leads/page.tsx
git commit -m "feat: Re-engagement sub-tab in Leads page using ReengagementBuilder; remove inline panel"
```

---

## Task 7: Manual verification

**Files:** none (runtime check)

- [ ] **Step 1: Run the app and verify both screens**

Run: `cd frontend && npm run dev` (backend already deployed on Render).

Verify:
1. `/dashboard/leads` shows a `Leads | Re-engagement` switch; `Leads` shows the table unchanged.
2. `Re-engagement → Reply Follow-up`: add two messages at different hours (e.g. 6h freeform with a backup template, 18h template). They appear on the 24h timeline sorted by hour; copy reads "after the lead replied" with "24 − N" framing.
3. `Re-engagement → Campaign Follow-up`: pick a broadcast, add a message; copy reads "after the broadcast was sent" and the per-lead freeform/backup explanation. No "14 hours remaining" line anywhere.
4. The source dropdown on the `Leads` view no longer renders a re-engagement panel.

- [ ] **Step 2: Verify a fallback send end-to-end (optional, if a closed-window test lead exists)**

In Supabase, confirm a `reengagement_logs` row with `status='sent_fallback'` appears after the scheduler runs for a lead whose `last_inbound_at` is >24h old on a freeform step that has a backup template.

---

## Self-Review

**Spec coverage:**
- Two tools / two clocks → Tasks 5 (copy per `type`) + 6 (two inner tabs). ✓
- Custom multi-step, arbitrary delays within 24h → Task 5 add form + Task 2 24h guard. ✓
- Auto-fallback to backup template → Tasks 1 (column), 2 (persist), 3 (engine), 5 (UI field). ✓
- Honest timing copy; kill "14 hours remaining" on campaign screen → Task 5 explainer + Task 6 Step 5 (delete legacy panel). ✓
- Placement as Leads sub-tab, out of source dropdown → Task 6. ✓
- Extract builder to its own component → Task 5. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; SQL, Python, and TSX are full. ✓

**Type consistency:** `fallback_template_name` / `fallback_template_variables` identical across migration (snake), API model (snake), engine (`step.get("fallback_template_name")`), api.ts (snake, matches JSON), and component payload. `_send_step_template` signature (kwargs `template_name`, `template_variables`, `log_status`) matches both call sites and the test's `tpl.await_args.kwargs["template_name"]` assertion. `ReengagementBuilder` prop names (`type`, `broadcastId`, `templates`) match the Task 6 usage. ✓
