# Escalation, Cold Toggle & Call Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build chat escalation pipeline, cold lead assignment toggle, call evaluation scoring, and fix the recording base URL settings field — all without billing/plans.

**Architecture:** DB migrations first (shared prerequisite), then backend services in parallel with frontend. Chat escalation: detect "connect with team" phrase in `ai_reply.py` → write to new `chat_handovers` table → inbox page. Cold toggle: new `app_settings` key gates C-segment auto-assignment. Call evaluation: extend `call_summarizer.py` with an `evaluate_call()` function, store result in `call_logs.evaluation`.

**Tech Stack:** FastAPI + Supabase Python SDK (backend), Next.js 14 App Router + TypeScript (frontend), Groq llama-3.3-70b-versatile.

---

## File Map

| Action | File |
|---|---|
| Create | `backend/supabase/migrations/043_chat_escalation.sql` |
| Create | `backend/supabase/migrations/044_cold_assignment_setting.sql` |
| Create | `backend/supabase/migrations/045_call_evaluation_column.sql` |
| Modify | `frontend/app/dashboard/settings/page.tsx` — add `telecmi_recording_base_url` field |
| Modify | `backend/app/services/ai_reply.py` — add `_trigger_chat_escalation` + call at end of `generate_reply` |
| Create | `backend/app/routes/chat_handovers.py` — list, resolve, count endpoints |
| Modify | `backend/app/main.py` — register chat_handovers router |
| Modify | `backend/app/services/assignment.py` — add cold toggle check + helpers |
| Modify | `backend/app/routes/callers.py` — add `GET/PATCH /cold-assignment` endpoints |
| Modify | `backend/app/services/call_summarizer.py` — add `evaluate_call()` |
| Modify | `backend/app/routes/calls.py` — call `evaluate_call` in `_run_summarization` |
| Create | `frontend/app/dashboard/inbox/page.tsx` — chat handovers inbox |
| Modify | `frontend/components/sidebar.tsx` — add Inbox nav item (feature=whatsapp) |
| Modify | `frontend/app/dashboard/leads/page.tsx` — add cold assignment toggle |

---

## Task 1: Settings UI — recording base URL field

**Files:**
- Modify: `frontend/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add field to TeleCMI section**

In `frontend/app/dashboard/settings/page.tsx`, find the `voice` section fields array (around line 62–65) and add a third field:

```typescript
{ key: "telecmi_recording_base_url", label: "Recording Base URL", secret: false, required: false, hint: "From TeleCMI dashboard → Settings → Recording. Needed for call summaries." },
```

The full voice section fields array becomes:
```typescript
fields: [
  { key: "telecmi_secret", label: "App Secret", secret: true, required: true },
  { key: "telecmi_callerid", label: "Caller ID (DID shown to leads)", secret: false, required: false, hint: "The outbound number leads see when you call them" },
  { key: "telecmi_recording_base_url", label: "Recording Base URL", secret: false, required: false, hint: "From TeleCMI dashboard → Settings → Recording. Needed for call summaries." },
],
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/prem/Documents/Aira\ Ai/frontend && npx tsc --noEmit 2>&1 | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/settings/page.tsx
git commit -m "feat: add recording base URL field to TeleCMI settings"
```

---

## Task 2: DB migrations

**Files:**
- Create: `backend/supabase/migrations/043_chat_escalation.sql`
- Create: `backend/supabase/migrations/044_cold_assignment_setting.sql`
- Create: `backend/supabase/migrations/045_call_evaluation_column.sql`

- [ ] **Step 1: Write migration 043**

```sql
-- backend/supabase/migrations/043_chat_escalation.sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_attention bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

CREATE TABLE IF NOT EXISTS chat_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES leads(id),
  assigned_to uuid REFERENCES callers(id),
  reason text,
  status text DEFAULT 'pending',
  opened_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_handovers_tenant_status ON chat_handovers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_handovers_lead ON chat_handovers(lead_id);
```

- [ ] **Step 2: Write migration 044**

```sql
-- backend/supabase/migrations/044_cold_assignment_setting.sql
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'cold_assignment_enabled', 'false', false
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;
```

- [ ] **Step 3: Write migration 045**

```sql
-- backend/supabase/migrations/045_call_evaluation_column.sql
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS evaluation jsonb;
```

- [ ] **Step 4: Apply all three via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` for each:
- Project ID: `tovmebyyjhvszwgvyfdm`
- Name + query from each file above

- [ ] **Step 5: Verify**

```sql
-- Run via execute_sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('leads','call_logs') AND column_name IN ('needs_human_attention','escalation_reason','evaluation');

SELECT table_name FROM information_schema.tables WHERE table_name = 'chat_handovers';

SELECT key FROM app_settings WHERE key = 'cold_assignment_enabled' LIMIT 1;
```

Expected: 4 column rows + chat_handovers table + one setting row.

- [ ] **Step 6: Commit migration files**

```bash
git add backend/supabase/migrations/043_chat_escalation.sql backend/supabase/migrations/044_cold_assignment_setting.sql backend/supabase/migrations/045_call_evaluation_column.sql
git commit -m "feat: chat_handovers table, cold_assignment setting, call_logs.evaluation column"
```

---

## Task 3: Chat escalation backend

**Files:**
- Modify: `backend/app/services/ai_reply.py` — add `_trigger_chat_escalation` function + call in `generate_reply`
- Create: `backend/app/routes/chat_handovers.py`
- Modify: `backend/app/main.py` — register router

- [ ] **Step 1: Add `_trigger_chat_escalation` to `ai_reply.py`**

Add this function before `generate_reply` (around line 193 in the current file):

```python
_ESCALATION_PHRASES = [
    "connect you with our team",
    "connect them with a team member",
    "let me connect",
    "our team will",
    "team will reach out",
    "team member will",
    "team will get back",
]

def _trigger_chat_escalation(
    lead_id: str, reason: str, tenant_id: str, assigned_to: str | None, db
) -> None:
    existing = (
        db.table("chat_handovers")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("status", "pending")
        .maybe_single()
        .execute()
    )
    if existing.data:
        return  # already has an open handover

    db.table("leads").update({
        "needs_human_attention": True,
        "escalation_reason": reason,
    }).eq("id", lead_id).execute()

    db.table("chat_handovers").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "assigned_to": assigned_to,
        "reason": reason,
        "status": "pending",
    }).execute()
    logger.info(f"Chat handover created for lead {lead_id}")
```

- [ ] **Step 2: Call escalation check at end of `generate_reply`**

At the very end of `generate_reply`, after Step 5 (the `sync_follow_up_jobs` call and its except block), add:

```python
    # Step 6: Detect AI escalation and open a chat handover
    if is_ai and any(phrase in reply_text.lower() for phrase in _ESCALATION_PHRASES):
        try:
            _trigger_chat_escalation(
                lead_id=str(lead_id),
                reason=message[:200],
                tenant_id=lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001",
                assigned_to=lead_data.get("assigned_to"),
                db=db,
            )
        except Exception as e:
            logger.error(f"Chat escalation trigger failed for lead {lead_id}: {e}")
```

- [ ] **Step 3: Create `backend/app/routes/chat_handovers.py`**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

router = APIRouter()


@router.get("/")
def list_handovers(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    rows = (
        db.table("chat_handovers")
        .select("id, lead_id, assigned_to, reason, status, opened_at, leads(name, phone, segment)")
        .eq("tenant_id", tenant_id)
        .eq("status", "pending")
        .order("opened_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"data": rows.data or []}


@router.get("/count")
def handover_count(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("chat_handovers")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("status", "pending")
        .execute()
    )
    return {"count": result.count or 0}


@router.patch("/{handover_id}/resolve")
def resolve_handover(handover_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("chat_handovers").update({
        "status": "resolved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", handover_id).eq("tenant_id", tenant_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Handover not found")

    lead_id = result.data[0].get("lead_id")
    if lead_id:
        remaining = (
            db.table("chat_handovers")
            .select("id", count="exact")
            .eq("lead_id", lead_id)
            .eq("status", "pending")
            .execute()
        )
        if not (remaining.count or 0):
            db.table("leads").update({
                "needs_human_attention": False,
                "escalation_reason": None,
            }).eq("id", lead_id).execute()

    return {"resolved": True}
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

Add import with other route imports:
```python
from app.routes import chat_handovers
```

Add after last `app.include_router` line:
```python
app.include_router(chat_handovers.router, prefix="/api/v1/chat-handovers", tags=["chat-handovers"], dependencies=_auth)
```

- [ ] **Step 5: Smoke test**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && python -c "from app.routes.chat_handovers import router; from app.services.ai_reply import _trigger_chat_escalation; print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_reply.py backend/app/routes/chat_handovers.py backend/app/main.py
git commit -m "feat: chat escalation pipeline — detect AI handoff phrases, create chat_handovers"
```

---

## Task 4: Chat escalation frontend — inbox page + sidebar

**Files:**
- Create: `frontend/app/dashboard/inbox/page.tsx`
- Modify: `frontend/components/sidebar.tsx` — add Inbox nav item

- [ ] **Step 1: Create inbox page**

Create `frontend/app/dashboard/inbox/page.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { MessageSquare, CheckCircle, Phone } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { SegmentBadge } from "@/components/segment-badge";
import { API_URL, getAuthHeaders } from "@/lib/api";

type Handover = {
  id: string;
  lead_id: string;
  reason: string | null;
  status: string;
  opened_at: string;
  leads: { name: string | null; phone: string; segment: string } | null;
};

async function fetchHandovers(): Promise<Handover[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/chat-handovers`, { headers: auth });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

async function resolveHandover(id: string): Promise<void> {
  const auth = await getAuthHeaders();
  await fetch(`${API_URL}/api/v1/chat-handovers/${id}/resolve`, {
    method: "PATCH",
    headers: auth,
  });
}

export default function InboxPage() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setHandovers(await fetchHandovers());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleResolve(id: string) {
    await resolveHandover(id);
    await load();
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="page-title">Chat Inbox</h1>
        <p className="page-subtitle">Conversations where AI couldn't answer — needs your reply.</p>
      </div>

      {loading ? (
        <div className="card rounded-3xl p-8 text-center font-body text-sm text-ink-muted">Loading…</div>
      ) : handovers.length === 0 ? (
        <div className="card rounded-3xl p-12 text-center">
          <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
          <p className="font-display font-bold text-ink">All caught up</p>
          <p className="font-body text-sm text-ink-muted mt-1">No conversations need your attention right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {handovers.map((h) => (
            <div key={h.id} className="card rounded-2xl p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <MessageSquare size={16} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-label font-semibold text-ink text-sm">
                    {h.leads?.name || "Unknown Lead"}
                  </span>
                  {h.leads?.segment && <SegmentBadge segment={h.leads.segment} />}
                </div>
                <p className="font-body text-xs text-ink-muted mb-1.5">{h.leads?.phone}</p>
                {h.reason && (
                  <p className="font-body text-sm text-ink bg-surface-subtle rounded-lg px-3 py-2 mb-3">
                    "{h.reason}"
                  </p>
                )}
                <p className="font-body text-xs text-ink-muted">
                  {new Date(h.opened_at).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <Link
                  href={`/dashboard/conversations?lead=${h.lead_id}`}
                  className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  <MessageSquare size={12} /> Reply
                </Link>
                <button
                  onClick={() => handleResolve(h.id)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-green-200 text-green-700 hover:bg-green-50 flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle size={12} /> Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Inbox to sidebar**

In `frontend/components/sidebar.tsx`, find `OWNER_NAV` array. Add after the Conversations item:

```typescript
{ href: "/dashboard/inbox", icon: Inbox, label: "Inbox", feature: "whatsapp" },
```

Add `Inbox` to the lucide-react import line:
```typescript
import {
  LayoutDashboard, MessageSquare, Users, Settings, Phone,
  BarChart2, Upload, BookOpen, Layers, FileCheck, StickyNote,
  LogOut, BookOpenCheck, Inbox,
} from "lucide-react";
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/prem/Documents/Aira\ Ai/frontend && npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/inbox/page.tsx frontend/components/sidebar.tsx
git commit -m "feat: chat inbox page + sidebar Inbox link for whatsapp feature"
```

---

## Task 5: Cold lead assignment toggle

**Files:**
- Modify: `backend/app/services/assignment.py` — add `is_cold_assignment_enabled`, `set_cold_assignment_enabled`, check in `auto_assign_lead`
- Modify: `backend/app/routes/callers.py` — add `GET/PATCH /cold-assignment` endpoints
- Modify: `frontend/app/dashboard/leads/page.tsx` — add cold toggle to page header

- [ ] **Step 1: Add helpers to `assignment.py`**

After the `set_round_robin_enabled` function, add:

```python
def is_cold_assignment_enabled(tenant_id: str) -> bool:
    """Check app_settings for cold_assignment_enabled flag. Defaults to False."""
    db = get_supabase()
    result = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", "cold_assignment_enabled")
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return False
    return result.data.get("value", "false").lower() == "true"


def set_cold_assignment_enabled(tenant_id: str, enabled: bool) -> None:
    """Upsert cold_assignment_enabled in app_settings."""
    db = get_supabase()
    db.table("app_settings").upsert(
        {
            "key": "cold_assignment_enabled",
            "value": "true" if enabled else "false",
            "tenant_id": tenant_id,
            "is_secret": False,
        },
        on_conflict="tenant_id,key",
    ).execute()
```

- [ ] **Step 2: Add segment check inside `auto_assign_lead`**

In `auto_assign_lead`, after the `if not is_round_robin_enabled(tenant_id): return None` block, add:

```python
    lead_res = (
        db.table("leads")
        .select("segment")
        .eq("id", lead_id)
        .maybe_single()
        .execute()
    )
    lead_segment = (lead_res.data or {}).get("segment", "C")
    if lead_segment == "C" and not is_cold_assignment_enabled(tenant_id):
        logger.info("Cold assignment OFF — skipping assignment for C-segment lead %s", lead_id)
        return None
```

- [ ] **Step 3: Add endpoints to `callers.py`**

After the existing `toggle_round_robin` endpoint, add:

```python
@router.get("/cold-assignment")
async def get_cold_assignment(tenant_id: str = Depends(get_tenant_id)):
    return {"enabled": is_cold_assignment_enabled(tenant_id)}


@router.patch("/cold-assignment")
async def toggle_cold_assignment(payload: RoundRobinToggle, tenant_id: str = Depends(get_tenant_id)):
    set_cold_assignment_enabled(tenant_id, payload.enabled)
    return {"enabled": payload.enabled}
```

Add missing import at top of `callers.py`:
```python
from app.services.assignment import (
    is_round_robin_enabled, set_round_robin_enabled, reassign_backlog,
    is_cold_assignment_enabled, set_cold_assignment_enabled,
)
```

- [ ] **Step 4: Add toggle to leads page**

In `frontend/app/dashboard/leads/page.tsx`, find the page header area (where the title "Leads" is rendered, around line where `<h1>` appears). Add a cold assignment toggle below the page title.

First read the leads page to find the exact location, then insert this component after the title:

```typescript
{/* Cold Lead Assignment Toggle — owner only */}
<ColdAssignmentToggle />
```

Add this component definition near the top of the file (before the main component):

```typescript
function ColdAssignmentToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthHeaders().then(async (auth) => {
      const res = await fetch(`${API_URL}/api/v1/callers/cold-assignment`, { headers: auth });
      if (res.ok) setEnabled((await res.json()).enabled);
      setLoading(false);
    });
  }, []);

  async function toggle() {
    const auth = await getAuthHeaders();
    const next = !enabled;
    setEnabled(next);
    await fetch(`${API_URL}/api/v1/callers/cold-assignment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ enabled: next }),
    });
  }

  if (loading) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface-subtle rounded-xl">
      <div>
        <p className="font-label font-semibold text-ink text-sm">Auto-assign Cold Leads</p>
        <p className="font-body text-xs text-ink-muted">When ON, C-segment leads are auto-assigned to callers</p>
      </div>
      <button
        onClick={toggle}
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-primary" : "bg-surface-mid"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
```

You will also need these imports in leads/page.tsx if not present:
```typescript
import { API_URL, getAuthHeaders } from "@/lib/api";
```

- [ ] **Step 5: Verify**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && python -c "from app.services.assignment import is_cold_assignment_enabled, set_cold_assignment_enabled; print('OK')"
cd /Users/prem/Documents/Aira\ Ai/frontend && npx tsc --noEmit 2>&1 | head -5
```
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/assignment.py backend/app/routes/callers.py frontend/app/dashboard/leads/page.tsx
git commit -m "feat: cold lead assignment toggle — admin-controlled C-segment auto-assign"
```

---

## Task 6: Call evaluation

**Files:**
- Modify: `backend/app/services/call_summarizer.py` — add `evaluate_call()`
- Modify: `backend/app/routes/calls.py` — call `evaluate_call` in `_run_summarization`

- [ ] **Step 1: Add `evaluate_call` to `call_summarizer.py`**

Add these constants and function after `summarize_call`:

```python
_EVALUATE_PROMPT = (
    "You are evaluating a sales call transcript. Assess the caller's performance.\n\n"
    "Transcript:\n{transcript}\n\n"
    "Return valid JSON only with these keys:\n"
    "- talk_ratio: integer 0-100, percentage of time the caller was speaking\n"
    "- objection_handling: one of 'good', 'average', 'poor'\n"
    "- outcome_clarity: 'yes' if call ended with a clear next step, 'no' otherwise\n"
    "- overall_score: integer 1-10 for overall call quality\n"
    "- coaching_tip: string, one specific actionable improvement (max 50 words)"
)


async def evaluate_call(transcript: str) -> dict:
    if not transcript or not _client:
        return {}
    try:
        response = _client.chat.completions.create(
            model=_SUMMARY_MODEL,
            messages=[
                {"role": "user", "content": _EVALUATE_PROMPT.format(transcript=transcript)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=300,
        )
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Groq evaluation JSON: {e}")
        return {}
    except Exception as e:
        logger.error(f"Groq evaluate_call failed: {e}")
        return {}
```

- [ ] **Step 2: Call `evaluate_call` in `_run_summarization` in `calls.py`**

In `backend/app/routes/calls.py`, find `_run_summarization`. The current function ends after inserting the lead_note. Add evaluation after the `db.table("call_logs").update(...)` that stores transcript+ai_summary:

```python
from app.services.call_summarizer import transcribe_recording, summarize_call, evaluate_call
```

Update the import at the top of `calls.py` (line ~15):
```python
from app.services.call_summarizer import transcribe_recording, summarize_call, evaluate_call
```

Inside `_run_summarization`, after the `db.table("call_logs").update({"transcript": transcript, "ai_summary": summary})` call, add:

```python
        evaluation = await evaluate_call(transcript)
        if evaluation:
            db.table("call_logs").update({"evaluation": evaluation}).eq("id", call_log_id).execute()
            logger.info(f"Call evaluation stored for {call_log_id}: score={evaluation.get('overall_score')}")
```

- [ ] **Step 3: Verify import**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && python -c "from app.services.call_summarizer import evaluate_call; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/call_summarizer.py backend/app/routes/calls.py
git commit -m "feat: call evaluation scoring via Groq — stores talk_ratio, objection_handling, overall_score in call_logs.evaluation"
```

---

## Self-Review

**Spec coverage:**
- ✅ `telecmi_recording_base_url` field in Settings UI (Task 1)
- ✅ `chat_handovers` table (Task 2 migration 043)
- ✅ `leads.needs_human_attention` + `escalation_reason` columns (Task 2 migration 043)
- ✅ `cold_assignment_enabled` setting seeded (Task 2 migration 044)
- ✅ `call_logs.evaluation` column (Task 2 migration 045)
- ✅ AI escalation detection in `ai_reply.py` + `_trigger_chat_escalation` (Task 3)
- ✅ `GET /api/v1/chat-handovers`, `GET /count`, `PATCH /{id}/resolve` (Task 3)
- ✅ Chat inbox page at `/dashboard/inbox` (Task 4)
- ✅ Inbox in sidebar for whatsapp-feature tenants (Task 4)
- ✅ `is_cold_assignment_enabled` check in `auto_assign_lead` for C segment (Task 5)
- ✅ `GET/PATCH /api/v1/callers/cold-assignment` endpoints (Task 5)
- ✅ Cold assignment toggle in leads page header (Task 5)
- ✅ `evaluate_call()` function in `call_summarizer.py` (Task 6)
- ✅ Evaluation stored in `call_logs.evaluation` after transcription (Task 6)

**No placeholders confirmed** — all code is complete.

**Note:** TeleCMI CDR webhook URL must be configured in the TeleCMI dashboard (Settings → Webhooks → CDR URL). This is not a code change — it's a configuration step: set it to `https://your-render-url.onrender.com/api/v1/calls/telecmi-cdr`. Without this, CDR events never arrive and recording/summary/evaluation never triggers.
