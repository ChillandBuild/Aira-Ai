# Template Management Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WhatsApp template submission and approval fully functional end-to-end, with a non-technical-friendly UI that lets clients create, track, and use templates without ever visiting Meta's website.

**Architecture:** Two targeted backend bug fixes (wrong Meta ID + auth-gated webhook) plus a new sync endpoint, a `get_template_status` service function, and a complete frontend overhaul of the template form and list. The upload page gets a one-line change to pre-populate the template name from a URL query param.

**Tech Stack:** FastAPI, Python 3.11, Supabase, Meta Cloud API (Graph v18.0), Next.js 14, TypeScript, Tailwind CSS.

---

## File Structure

| File | Action | What changes |
|---|---|---|
| `backend/app/routes/templates.py` | Modify | Fix WABA ID bug, add `public_router`, move webhook endpoint, add sync endpoint |
| `backend/app/services/meta_cloud.py` | Modify | Add `get_template_status()` function |
| `backend/app/main.py` | Modify | Register `templates.public_router` without auth |
| `backend/tests/test_templates.py` | Create | Tests for WABA ID fix, public webhook, sync endpoint |
| `frontend/app/dashboard/templates/page.tsx` | Rewrite | Category cards, title→name, live preview, sync button, bulk send button |
| `frontend/app/dashboard/upload/page.tsx` | Modify | Pre-populate `templateName` from `?template=` URL param |

---

## Task 1: Fix Bug 1 — WABA ID and add public_router for webhook

**Files:**
- Modify: `backend/app/routes/templates.py`
- Create: `backend/tests/test_templates.py`

The file currently has one `router = APIRouter()`. We need a second `public_router = APIRouter()` for endpoints Meta calls without auth. The WABA ID fix is a one-line change on line 34.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_templates.py`:

```python
# backend/tests/test_templates.py
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


# ── Bug 1: WABA ID ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_template_uses_waba_id_not_phone_number_id():
    """create_template must read meta_waba_id, not meta_phone_number_id."""
    from app.routes.templates import create_template, CreateTemplate

    payload = CreateTemplate(name="test_template", category="UTILITY", language="en", body_text="Hello {{1}}")

    captured_waba_id = []

    async def mock_submit(waba_id, name, category, language, body_text):
        captured_waba_id.append(waba_id)
        return {"id": "meta-123"}

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
    mock_db.table.return_value.insert.return_value.execute.return_value.data = [{
        "id": "row-1", "name": "test_template", "category": "UTILITY",
        "language": "en", "body_text": "Hello {{1}}", "status": "PENDING",
        "meta_template_id": "meta-123", "tenant_id": "tenant-1",
        "submitted_at": "2026-05-13T00:00:00Z", "approved_at": None, "rejection_reason": None,
    }]

    with patch("app.routes.templates.get_setting", side_effect=lambda k: "waba-999" if k == "meta_waba_id" else None), \
         patch("app.routes.templates.get_supabase", return_value=mock_db), \
         patch("app.routes.templates.submit_template", side_effect=mock_submit):

        result = await create_template(payload, tenant_id="tenant-1")

    assert captured_waba_id == ["waba-999"], f"Expected waba-999, got {captured_waba_id}"


# ── Bug 2: public_router ──────────────────────────────────────────────────────

def test_webhook_status_is_on_public_router():
    """webhook-status must be on public_router, not the auth-gated router."""
    from app.routes import templates

    # Collect routes from each router
    public_paths = [r.path for r in templates.public_router.routes]
    auth_paths = [r.path for r in templates.router.routes]

    assert "/webhook-status" in public_paths, \
        f"webhook-status not found in public_router paths: {public_paths}"
    assert "/webhook-status" not in auth_paths, \
        f"webhook-status must NOT be in auth-gated router: {auth_paths}"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -m pytest tests/test_templates.py -v 2>&1 | tail -15
```

Expected: `FAILED` — `test_create_template_uses_waba_id_not_phone_number_id` fails because code still uses `meta_phone_number_id`. `test_webhook_status_is_on_public_router` fails because `public_router` doesn't exist yet.

- [ ] **Step 3: Implement both fixes in templates.py**

Replace the entire `backend/app/routes/templates.py` with:

```python
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.meta_cloud import submit_template, get_template_status
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()  # No auth — Meta calls these endpoints directly


class CreateTemplate(BaseModel):
    name: str
    category: str
    language: str = "en"
    body_text: str


@router.get("/")
async def list_templates(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("message_templates").select("*").eq("tenant_id", tenant_id).order("submitted_at", desc=True).execute()
    return {"data": result.data or []}


@router.post("/")
async def create_template(payload: CreateTemplate, tenant_id: str = Depends(get_tenant_id)):
    name = payload.name.strip().lower().replace(" ", "_")
    category = payload.category.upper()
    if category not in ("MARKETING", "UTILITY", "AUTHENTICATION"):
        raise HTTPException(status_code=400, detail="Invalid category")

    waba_id = get_setting("meta_waba_id")  # Fixed: was meta_phone_number_id

    db = get_supabase()
    existing = db.table("message_templates").select("id").eq("name", name).eq("tenant_id", tenant_id).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Template '{name}' already exists")

    meta_template_id = None
    status = "PENDING"
    if waba_id:
        try:
            meta_response = await submit_template(
                waba_id=waba_id,
                name=name,
                category=category,
                language=payload.language,
                body_text=payload.body_text,
            )
            meta_template_id = str(meta_response.get("id", ""))
        except Exception as e:
            logger.warning(f"Meta template submission failed for {name}: {e}, saved as PENDING")
    else:
        logger.info(f"No meta_waba_id configured — saving template '{name}' locally as PENDING")

    result = db.table("message_templates").insert({
        "name": name,
        "category": category,
        "language": payload.language,
        "body_text": payload.body_text,
        "status": status,
        "meta_template_id": meta_template_id,
        "tenant_id": tenant_id,
    }).execute()

    return result.data[0]


@router.delete("/{template_id}")
async def delete_template(template_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    db.table("message_templates").delete().eq("id", template_id).eq("tenant_id", tenant_id).execute()
    return {"deleted": True}


@router.post("/{template_id}/sync")
async def sync_template_status(template_id: str, tenant_id: str = Depends(get_tenant_id)):
    """Pull current status from Meta API and update the local record."""
    db = get_supabase()
    row = db.table("message_templates").select("name,meta_template_id").eq("id", template_id).eq("tenant_id", tenant_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Template not found")

    waba_id = get_setting("meta_waba_id")
    if not waba_id:
        raise HTTPException(status_code=400, detail="meta_waba_id not configured in Settings")

    meta_info = await get_template_status(waba_id=waba_id, template_name=row.data["name"])
    if not meta_info:
        return {"synced": False, "detail": "Template not found on Meta"}

    new_status = meta_info.get("status", "PENDING").upper()
    updates: dict = {"status": new_status}
    if new_status == "APPROVED":
        updates["approved_at"] = "now()"
    if meta_info.get("rejected_reason"):
        updates["rejection_reason"] = meta_info["rejected_reason"]

    db.table("message_templates").update(updates).eq("id", template_id).execute()
    updated = db.table("message_templates").select("*").eq("id", template_id).maybe_single().execute()
    return updated.data


@public_router.post("/webhook-status")
async def template_status_webhook(payload: dict):
    """Meta calls this when template status changes (APPROVED/REJECTED). No auth."""
    entry = payload.get("entry", [])
    for e in entry:
        for change in e.get("changes", []):
            value = change.get("value", {})
            if change.get("field") != "message_template_status_update":
                continue
            meta_id = str(value.get("message_template_id", ""))
            new_status = value.get("event", "").upper()
            reason = value.get("reason")
            if not meta_id or new_status not in ("APPROVED", "REJECTED", "PAUSED"):
                continue
            db = get_supabase()
            updates: dict = {"status": new_status}
            if reason:
                updates["rejection_reason"] = reason
            if new_status == "APPROVED":
                updates["approved_at"] = "now()"
            db.table("message_templates").update(updates).eq("meta_template_id", meta_id).execute()
            logger.info(f"Template {meta_id} status → {new_status}")
    return {"status": "ok"}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -m pytest tests/test_templates.py -v 2>&1 | tail -15
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && git add app/routes/templates.py tests/test_templates.py && git commit -m "fix: use meta_waba_id for template submission, move webhook to public_router"
```

---

## Task 2: Add get_template_status to meta_cloud.py

**Files:**
- Modify: `backend/app/services/meta_cloud.py` (append after line 256)

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_templates.py`:

```python
# ── get_template_status ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_template_status_returns_status():
    """get_template_status fetches template status from Meta API."""
    from app.services.meta_cloud import get_template_status

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "data": [{"name": "my_template", "status": "APPROVED", "id": "meta-123"}]
    }

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(return_value=mock_response)

        result = await get_template_status(
            waba_id="1190331789463566",
            template_name="my_template",
        )

    assert result is not None
    assert result["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_get_template_status_returns_none_when_not_found():
    """get_template_status returns None when Meta has no matching template."""
    from app.services.meta_cloud import get_template_status

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {"data": []}

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(return_value=mock_response)

        result = await get_template_status(
            waba_id="1190331789463566",
            template_name="nonexistent_template",
        )

    assert result is None
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -m pytest tests/test_templates.py::test_get_template_status_returns_status tests/test_templates.py::test_get_template_status_returns_none_when_not_found -v 2>&1 | tail -10
```

Expected: `ImportError` — `get_template_status` not yet defined.

- [ ] **Step 3: Add get_template_status to meta_cloud.py**

Append after the last function (after line 256) in `backend/app/services/meta_cloud.py`:

```python

async def get_template_status(
    waba_id: str,
    template_name: str,
    access_token: Optional[str] = None,
) -> dict | None:
    """
    Fetch current template status from Meta.
    Returns the template dict or None if not found.
    """
    _, tok = _creds("placeholder", access_token)
    url = f"{_GRAPH_BASE}/{waba_id}/message_templates"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            params={"name": template_name, "fields": "name,status,rejected_reason"},
            headers={"Authorization": f"Bearer {tok}"},
        )
    if not resp.is_success:
        logger.error("get_template_status failed: %s %s", resp.status_code, resp.text)
        return None
    data = resp.json().get("data", [])
    return data[0] if data else None
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -m pytest tests/test_templates.py -v 2>&1 | tail -15
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && git add app/services/meta_cloud.py tests/test_templates.py && git commit -m "feat: add get_template_status to meta_cloud for manual sync"
```

---

## Task 3: Register public_router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Register the public router**

In `backend/app/main.py`, find the line:

```python
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"], dependencies=_auth)
```

Add this line **directly before** it:

```python
app.include_router(templates.public_router, prefix="/api/v1/templates", tags=["templates-webhook"])
```

The file section should look like:

```python
app.include_router(templates.public_router, prefix="/api/v1/templates", tags=["templates-webhook"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"], dependencies=_auth)
```

- [ ] **Step 2: Verify app loads cleanly**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -c "from app.main import app; print('OK')" 2>&1
```

Expected: `OK`

- [ ] **Step 3: Run full test suite — no regressions**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: all tests pass (24 total).

- [ ] **Step 4: Commit**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && git add app/main.py && git commit -m "feat: register templates public_router — Meta webhook can now reach /webhook-status"
```

---

## Task 4: Upload page — pre-populate template from URL param

**Files:**
- Modify: `frontend/app/dashboard/upload/page.tsx:1-5` (imports) and line 87 (templateName state)

This is a small change — add `useSearchParams` and read `?template=` on mount.

- [ ] **Step 1: Add useSearchParams import**

In `frontend/app/dashboard/upload/page.tsx`, find the first line:

```tsx
"use client";
import { useState, useRef } from "react";
```

Replace with:

```tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
```

- [ ] **Step 2: Add param reading inside the component**

Find the line (around line 87):

```tsx
const [templateName, setTemplateName] = useState("");
```

Replace with:

```tsx
const searchParams = useSearchParams();
const [templateName, setTemplateName] = useState(searchParams.get("template") ?? "");
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/prem/Documents/Aira\ Ai/frontend && npx tsc --noEmit 2>&1 | grep -i "upload" | head -10
```

Expected: no errors for upload/page.tsx.

- [ ] **Step 4: Commit**

```bash
cd /Users/prem/Documents/Aira\ Ai && git add frontend/app/dashboard/upload/page.tsx && git commit -m "feat: pre-populate template name from ?template= URL param on upload page"
```

---

## Task 5: Rewrite templates page — non-technical UX

**Files:**
- Modify: `frontend/app/dashboard/templates/page.tsx` (full rewrite)

This replaces the entire file. Read the current file at `frontend/app/dashboard/templates/page.tsx` before replacing.

- [ ] **Step 1: Replace templates/page.tsx**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Check, Clock, AlertCircle, RefreshCw, Send } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  body_text: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";
  rejection_reason: string | null;
  submitted_at: string;
  approved_at: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  APPROVED: { label: "Approved",       badgeClass: "bg-emerald-100 text-emerald-700", icon: Check },
  PENDING:  { label: "Pending Review", badgeClass: "bg-amber-100 text-amber-700",    icon: Clock },
  REJECTED: { label: "Rejected",       badgeClass: "bg-red-100 text-red-700",        icon: AlertCircle },
  PAUSED:   { label: "Paused",         badgeClass: "bg-gray-100 text-gray-500",      icon: AlertCircle },
} as const;

const CATEGORY_OPTIONS = [
  {
    value: "MARKETING" as const,
    label: "📣 Promotional",
    description: "Event invites, offers, campaign messages",
  },
  {
    value: "UTILITY" as const,
    label: "🔔 Service Update",
    description: "Booking confirmations, reminders, alerts",
  },
  {
    value: "AUTHENTICATION" as const,
    label: "🔐 Verification",
    description: "OTP codes, login verification",
  },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTemplateName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function renderPreview(text: string): string {
  return text
    .replace(/\{\{1\}\}/g, "[Variable 1]")
    .replace(/\{\{2\}\}/g, "[Variable 2]")
    .replace(/\{\{3\}\}/g, "[Variable 3]")
    .replace(/\{\{(\d+)\}\}/g, "[Variable $1]");
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("en");
  const [bodyText, setBodyText] = useState("");

  const generatedName = toTemplateName(title);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ data: Template[] }>("/api/v1/templates/");
      setTemplates(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function resetModal() {
    setTitle(""); setBodyText(""); setCategory("UTILITY"); setLanguage("en");
    setError(null); setShowModal(false);
  }

  async function handleSubmit() {
    if (!title.trim() || !bodyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/templates/", {
        method: "POST",
        body: JSON.stringify({ name: generatedName, category, language, body_text: bodyText.trim() }),
      });
      resetModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await apiFetch(`/api/v1/templates/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const updated = await apiFetch<Template>(`/api/v1/templates/${id}/sync`, { method: "POST" });
      setTemplates(prev => prev.map(t => t.id === id ? updated : t));
    } catch {
      /* toast could go here */
    } finally {
      setSyncingId(null);
    }
  }

  function handleBulkSend(templateName: string) {
    router.push(`/dashboard/upload?template=${encodeURIComponent(templateName)}`);
  }

  const approved = templates.filter(t => t.status === "APPROVED");
  const pending  = templates.filter(t => t.status === "PENDING");
  const rejected = templates.filter(t => t.status === "REJECTED" || t.status === "PAUSED");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Message Templates</h1>
          <p className="page-subtitle">
            Create templates and submit them to WhatsApp for approval. Once approved, use them for bulk sending.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} />Refresh</button>
          <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={14} />New Template</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Approved",       count: approved.length, color: "#059669", bg: "#d1fae5" },
          { label: "Pending Review", count: pending.length,  color: "#d97706", bg: "#fef3c7" },
          { label: "Rejected",       count: rejected.length, color: "#dc2626", bg: "#fee2e2" },
        ].map(s => (
          <div key={s.label} className="card rounded-3xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
              <span className="stat-num" style={{ fontSize: "1.1rem", color: s.color }}>{s.count}</span>
            </div>
            <div>
              <p className="font-body font-medium text-ink text-sm">{s.label}</p>
              <p className="stat-label">templates</p>
            </div>
          </div>
        ))}
      </div>

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card rounded-3xl h-20 animate-pulse bg-border-subtle" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="card rounded-3xl text-center py-16">
          <p className="font-display font-bold text-ink text-lg mb-2">No templates yet</p>
          <p className="font-body text-sm text-ink-muted mb-5">
            Create your first template — WhatsApp will review it within 24–72 hours
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary mx-auto">
            <Plus size={14} />Create Template
          </button>
        </div>
      ) : (
        <div className="card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Name", "Category", "Message", "Status", "Submitted", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left stat-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {templates.map(t => {
                const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.PENDING;
                const catOption = CATEGORY_OPTIONS.find(c => c.value === t.category);
                return (
                  <tr key={t.id} className="hover:bg-surface-subtle transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-label font-semibold text-ink text-sm">{t.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-body text-xs text-ink-secondary">
                        {catOption?.label ?? t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-body text-sm text-ink-secondary truncate">{t.body_text}</p>
                      {t.rejection_reason && (
                        <p className="font-body text-xs text-red-500 mt-0.5 truncate">
                          Rejected: {t.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${sc.badgeClass}`}>
                        <sc.icon size={10} />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-body text-xs text-ink-muted">
                        {new Date(t.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {t.status === "APPROVED" ? (
                          <button
                            onClick={() => handleBulkSend(t.name)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium transition-colors"
                          >
                            <Send size={11} />Use for Bulk Send
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSync(t.id)}
                            disabled={syncingId === t.id}
                            className="p-1.5 rounded-lg hover:bg-surface-subtle text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
                            title="Check approval status"
                          >
                            <RefreshCw size={13} className={syncingId === t.id ? "animate-spin" : ""} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New Template Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.05rem" }}>
                New WhatsApp Template
              </h2>
              <button onClick={resetModal} className="p-1.5 rounded-xl hover:bg-surface-subtle text-ink-muted">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-2xl bg-red-50 text-red-700 font-body text-sm flex items-center gap-2">
                <AlertCircle size={14} />{error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Left: Form */}
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                    Template Title
                  </label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Guru Peyarchi Homam Invite"
                    className="input"
                  />
                  {generatedName && (
                    <p className="font-body text-xs text-ink-muted mt-1">
                      Will be submitted as: <span className="font-mono text-ink">{generatedName}</span>
                    </p>
                  )}
                </div>

                {/* Category cards */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-2 block">
                    Message Type
                  </label>
                  <div className="space-y-2">
                    {CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`w-full text-left p-3 rounded-2xl border-2 transition-colors ${
                          category === opt.value
                            ? "border-primary bg-primary/5"
                            : "border-border-subtle hover:border-border bg-white"
                        }`}
                      >
                        <p className="font-body text-sm font-medium text-ink">{opt.label}</p>
                        <p className="font-body text-xs text-ink-muted mt-0.5">{opt.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="input">
                    {LANGUAGE_OPTIONS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {/* Body text */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Message Body</label>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    placeholder={"🙏 Namaskaram {{1}},\n\nWe are performing the Guru Peyarchi Homam on your behalf.\n\nReply YES to book your spot. 🙏"}
                    rows={5}
                    className="input resize-none"
                  />
                  <p className="font-body text-xs text-ink-muted mt-1">
                    Use {"{{"}"1{"}}"}, {"{{"}"2{"}}"} etc. for personalised values like name, date.
                  </p>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div>
                <label className="font-body text-sm font-medium text-ink mb-2 block">
                  Preview
                </label>
                <div className="bg-[#ECE5DD] rounded-2xl p-4 min-h-40">
                  <div className="bg-white rounded-2xl rounded-tl-none px-3 py-2 max-w-[85%] shadow-sm">
                    <p className="font-body text-sm text-[#111B21] whitespace-pre-wrap break-words">
                      {bodyText ? renderPreview(bodyText) : (
                        <span className="text-gray-400 italic">Your message will appear here…</span>
                      )}
                    </p>
                    <p className="font-body text-[10px] text-gray-400 text-right mt-1">12:00 PM ✓✓</p>
                  </div>
                </div>
                <p className="font-body text-xs text-ink-muted mt-2">
                  This is how your message will look on WhatsApp.
                </p>
                <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="font-body text-xs text-amber-800">
                    ⏱ WhatsApp reviews new templates within <strong>24–72 hours</strong>. You will see the status update automatically here once approved.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={resetModal} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !bodyText.trim()}
                className="btn-primary flex-1"
              >
                {submitting ? "Submitting…" : "Submit to WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/prem/Documents/Aira\ Ai/frontend && npx tsc --noEmit 2>&1 | grep -i "template" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/prem/Documents/Aira\ Ai && git add frontend/app/dashboard/templates/page.tsx && git commit -m "feat: template UX overhaul — category cards, title→name, live WA preview, sync + bulk send buttons"
```

---

## Task 6: Final verification and push

- [ ] **Step 1: Run full backend test suite**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 2: Verify app boots cleanly**

```bash
cd /Users/prem/Documents/Aira\ Ai/backend && source venv/bin/activate && python -c "from app.main import app; routes = [r.path for r in app.routes]; print([r for r in routes if 'template' in r])"
```

Expected output includes both:
```
['/api/v1/templates/webhook-status', '/api/v1/templates/', '/api/v1/templates/', '/api/v1/templates/{template_id}', '/api/v1/templates/{template_id}/sync']
```

- [ ] **Step 3: Push to main**

```bash
cd /Users/prem/Documents/Aira\ Ai && git push origin main
```
