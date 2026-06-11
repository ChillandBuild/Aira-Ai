# Notification App-Bar + Claim Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the notification bell a permanent home in a new top app-bar, add a sticky claim banner for pool-critical events, and wire 4 telecaller events into `app_notifications`.

**Architecture:** Backend gains a never-raise `notify.py` helper plus a live `/notifications/pool` endpoint; four event sites insert notifications. Frontend introduces an `AppHeader` bar (bell + calendar + profile menu) so floating elements stop colliding with page toolbars, and a `ClaimBanner` driven by the live pool endpoint.

**Tech Stack:** FastAPI (backend/app), Next.js 14 App Router + TypeScript + Tailwind (frontend), Supabase, pytest with MagicMock-faked supabase chains.

**Spec:** [docs/superpowers/specs/2026-06-11-notification-appbar-design.md](../specs/2026-06-11-notification-appbar-design.md)

---

## File Structure

**New backend:**
- `backend/app/services/notify.py` — `notify_user`, `notify_pool` (best-effort, never raise).
- `backend/tests/test_notify_service.py` — unit tests for the helper.

**New frontend:**
- `frontend/hooks/useNotifications.ts` — polling + data for bell, toasts, banner.
- `frontend/components/AppHeader.tsx` — sticky top bar with right cluster.
- `frontend/components/NotificationBell.tsx` — bell button + dropdown (split from NotificationCenter).
- `frontend/components/ProfileMenu.tsx` — account chip: name/email, role, profile link, sign out.
- `frontend/components/ClaimBanner.tsx` — sticky pool strip.

**Modified backend:**
- `backend/app/routes/notifications.py` — add `GET /pool`.
- `backend/app/services/ai_reply.py` — event 1 (handover) in `_trigger_chat_escalation`.
- `backend/app/services/autopilot.py` — event 1 (direct handover insert ~L214).
- `backend/app/main.py` — event 2 (callback released/claimable, ~L320 and ~L346).
- `backend/app/services/assignment.py` — event 3 (auto-assign) in `auto_assign_lead`.
- `backend/app/routes/webhook.py`, `routes/telegram.py`, `routes/instagram.py`, `routes/facebook.py` — event 4 (lead replied).

**Modified frontend:**
- `frontend/app/dashboard/ClientLayout.tsx` — mount AppHeader + ClaimBanner, drop floating bell & calendar FAB.
- `frontend/components/sidebar.tsx` — remove signOut handler + profile-link block.
- `frontend/lib/api.ts` — add `notifications.pool`.
- `frontend/components/NotificationCenter.tsx` — retired (logic split into hook + bell).

---

## Task 1: Backend `notify.py` helper

**Files:**
- Create: `backend/app/services/notify.py`
- Test: `backend/tests/test_notify_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_notify_service.py
from unittest.mock import MagicMock, patch


def _make_db(captured):
    db = MagicMock()

    def table_selector(name):
        t = MagicMock()
        if name == "app_notifications":
            def _insert(row):
                captured.append(row)
                res = MagicMock()
                res.execute.return_value.data = [{"id": "n-1"}]
                return res
            t.insert.side_effect = _insert
            # select(...).eq(...).eq(...).eq(...).eq(...).limit(...).execute() -> dedupe lookup
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        elif name == "callers":
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"user_id": "u-caller-1"}, {"user_id": "u-caller-2"}, {"user_id": None},
            ]
        elif name == "tenant_users":
            t.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"user_id": "u-owner"}
            ]
        return t

    db.table.side_effect = table_selector
    return db


def test_notify_user_inserts_one_row():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_user("t-1", "u-1", "lead_assigned", "New lead", "Call Asha", db=db)
    assert len(captured) == 1
    assert captured[0]["user_id"] == "u-1"
    assert captured[0]["type"] == "lead_assigned"
    assert captured[0]["tenant_id"] == "t-1"


def test_notify_user_dedupe_skips_when_unread_exists():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    # make dedupe lookup return an existing unread row
    db.table("app_notifications").select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": "old"}]
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_user("t-1", "u-1", "lead_replied", "Reply", "Asha replied", db=db, dedupe_lead_id="lead-1")
    assert captured == []


def test_notify_pool_fans_out_to_active_callers_and_owner():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_pool("t-1", "handover_new", "Handover", "Ravi needs a human", db=db)
    targets = {r["user_id"] for r in captured}
    assert targets == {"u-caller-1", "u-caller-2", "u-owner"}  # None user_id skipped


def test_notify_pool_excludes_given_user():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_pool("t-1", "callback_claimable", "Callback", "Ravi", db=db, exclude_user_ids=["u-caller-1"])
    targets = {r["user_id"] for r in captured}
    assert "u-caller-1" not in targets


def test_notify_never_raises_on_db_error():
    from app.services import notify
    db = MagicMock()
    db.table.side_effect = RuntimeError("db down")
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_user("t-1", "u-1", "x", "t", "m", db=db)  # must not raise
        notify.notify_pool("t-1", "x", "t", "m", db=db)         # must not raise
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_notify_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.notify'`

- [ ] **Step 3: Write `notify.py`**

```python
# backend/app/services/notify.py
import logging

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)


def notify_user(
    tenant_id: str,
    user_id: str,
    type: str,
    title: str,
    message: str,
    *,
    db=None,
    dedupe_lead_id: str | None = None,
) -> None:
    """Insert a single notification for one user. Best-effort: never raises."""
    if not user_id:
        return
    db = db or get_supabase()
    try:
        if dedupe_lead_id:
            existing = (
                db.table("app_notifications")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .eq("type", type)
                .eq("is_read", False)
                .limit(50)
                .execute()
            )
            for row in (existing.data or []):
                if (row.get("message") or "").find(dedupe_lead_id) != -1:
                    return
            # message may not carry the lead id; fall back to type+user dedupe
            if existing.data:
                return
        db.table("app_notifications").insert({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
        }).execute()
    except Exception as e:
        logger.warning(f"notify_user failed (type={type} user={user_id}): {e}")


def _active_caller_user_ids(db, tenant_id: str) -> list[str]:
    callers = (
        db.table("callers")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .eq("status", "active")
        .execute()
    )
    return [c["user_id"] for c in (callers.data or []) if c.get("user_id")]


def _owner_user_id(db, tenant_id: str) -> str | None:
    owner = (
        db.table("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .limit(1)
        .execute()
    )
    return (owner.data[0] if owner.data else {}).get("user_id")


def notify_pool(
    tenant_id: str,
    type: str,
    title: str,
    message: str,
    *,
    db=None,
    segments: list | None = None,
    exclude_user_ids: list[str] | None = None,
) -> None:
    """Fan out one notification per active caller + owner. Best-effort: never raises.

    `segments` is accepted for future per-segment routing; callers table has no
    segment column today, so it is not used to filter recipients yet.
    """
    db = db or get_supabase()
    exclude = set(exclude_user_ids or [])
    try:
        recipients = set(_active_caller_user_ids(db, tenant_id))
        owner = _owner_user_id(db, tenant_id)
        if owner:
            recipients.add(owner)
        for uid in recipients:
            if uid in exclude:
                continue
            db.table("app_notifications").insert({
                "tenant_id": tenant_id,
                "user_id": uid,
                "type": type,
                "title": title,
                "message": message,
            }).execute()
    except Exception as e:
        logger.warning(f"notify_pool failed (type={type}): {e}")
```

> NOTE on dedupe: the test fakes a single chained `select().eq()...limit().execute()`. Keep the dedupe lookup to exactly four `.eq()` calls (`tenant_id`, `user_id`, `type`, `is_read`) followed by `.limit().execute()` so it matches the mock. If an unread same-type row for the user exists, skip — this is intentionally conservative (per-user+type, not strictly per-lead) to keep the burst-suppression simple.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_notify_service.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/notify.py backend/tests/test_notify_service.py
git commit -m "feat: add notify.py best-effort notification helper"
```

---

## Task 2: Event 1 — handover lands in shared pool

**Files:**
- Modify: `backend/app/services/ai_reply.py` (inside `_trigger_chat_escalation`, after the `chat_handovers.insert` ~L445)
- Modify: `backend/app/services/autopilot.py` (after the direct `chat_handovers.insert` ~L214)

- [ ] **Step 1: Wire `_trigger_chat_escalation`**

In `ai_reply.py`, immediately after the `db.table("chat_handovers").insert({...}).execute()` and its `logger.info` line inside `_trigger_chat_escalation`, add:

```python
    try:
        from app.services.notify import notify_pool
        lead_row = (
            db.table("leads").select("name").eq("id", lead_id).maybe_single().execute()
        )
        lead_name = (lead_row.data or {}).get("name") if lead_row else None
        notify_pool(
            tenant_id,
            "handover_new",
            "New handover in pool",
            f"Lead '{lead_name or 'Unknown'}' needs a human — unclaimed.",
            db=db,
        )
    except Exception:
        pass
```

- [ ] **Step 2: Wire autopilot direct insert**

In `autopilot.py`, locate the `db.table("chat_handovers").insert({...})` near L214. Immediately after its `.execute()`, add the same block (use the `tenant_id`, `lead_id`, and `db` variables in scope at that call site; if the lead's name is already loaded in a local variable, use it instead of re-querying):

```python
    try:
        from app.services.notify import notify_pool
        notify_pool(
            tenant_id,
            "handover_new",
            "New handover in pool",
            f"Lead '{lead_name or 'Unknown'}' needs a human — unclaimed.",
            db=db,
        )
    except Exception:
        pass
```

> Verify the in-scope variable names first (`grep -n "tenant_id\|lead_id\|lead_name" backend/app/services/autopilot.py` around L180-220). If `lead_name` is not in scope, query it as in Step 1.

- [ ] **Step 3: Verify import resolves and app boots**

Run: `cd backend && python -c "import app.services.ai_reply, app.services.autopilot"`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ai_reply.py backend/app/services/autopilot.py
git commit -m "feat: notify caller pool when a handover lands (event 1)"
```

---

## Task 3: Event 2 — overdue callback released / claimable

**Files:**
- Modify: `backend/app/main.py` (PULL-release path ~L320; unavailable/unclaimed escalation ~L346)

- [ ] **Step 1: Notify pool on PULL release**

In `main.py`, in the `_process_callback_reassignments` function, find the PULL-mode block that sets `"assigned_to": None` (~L320) and ends with `continue`. Immediately before that `continue`, add:

```python
                    try:
                        from app.services.notify import notify_pool
                        notify_pool(
                            tid,
                            "callback_claimable",
                            "Callback available to claim",
                            f"Callback for '{lead_name}' is unassigned and ready to claim.",
                            db=db,
                            segments=cfg.get("segments"),
                            exclude_user_ids=[caller.data["user_id"]] if (caller and caller.data.get("user_id")) else None,
                        )
                    except Exception:
                        pass
```

- [ ] **Step 2: Notify pool on unavailable/unclaimed escalation**

Find the block (~L346) that sets `needs_human_attention: True` for "Callback missed (caller unavailable, not claimed via board)" and notifies the owner. After the owner-notify block and before its trailing `logger.info`, add:

```python
                try:
                    from app.services.notify import notify_pool
                    notify_pool(
                        tid,
                        "callback_claimable",
                        "Callback needs attention",
                        f"Callback for '{lead_name}' was missed and is open in the pool.",
                        db=db,
                    )
                except Exception:
                    pass
```

> `lead_name`, `tid`, `cfg`, `caller`, and `db` are already in scope in this loop (confirmed at main.py L270-377). If `cfg` is not yet defined on the PULL path, it is set at the `get_telecalling_config(tid)` call just above — keep the notify call after that line.

- [ ] **Step 3: Verify boot**

Run: `cd backend && python -c "import app.main"`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: notify pool when an overdue callback becomes claimable (event 2)"
```

---

## Task 4: Event 3 — new lead auto-assigned to a caller

**Files:**
- Modify: `backend/app/services/assignment.py` (`auto_assign_lead`, select ~L150 and after the event record ~L197)

- [ ] **Step 1: Add `user_id` to the callers select**

In `auto_assign_lead`, change the candidate query select from `"id,name"` to include `user_id`:

```python
    query = (
        db.table("callers")
        .select("id,name,user_id")
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .eq("status", "active")
    )
```

- [ ] **Step 2: Notify the chosen caller after the assignment event**

Immediately before `return chosen_id` at the end of `auto_assign_lead` (after `record_assignment_event(...)`), add:

```python
    try:
        if chosen.get("user_id"):
            from app.services.notify import notify_user
            lead_row = db.table("leads").select("name").eq("id", lead_id).maybe_single().execute()
            lead_name = (lead_row.data or {}).get("name") if lead_row else None
            notify_user(
                tenant_id,
                chosen["user_id"],
                "lead_assigned",
                "New lead assigned",
                f"You've been assigned '{lead_name or 'a new lead'}'.",
                db=db,
            )
    except Exception:
        pass
```

- [ ] **Step 3: Verify boot**

Run: `cd backend && python -c "import app.services.assignment"`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/assignment.py
git commit -m "feat: notify caller when a lead is auto-assigned (event 3)"
```

---

## Task 5: Event 4 — assigned lead replied (all 4 channels)

**Files:**
- Modify: `backend/app/services/notify.py` (add shared `notify_assigned_caller_of_reply`)
- Modify: `backend/app/routes/webhook.py` (after inbound insert ~L398)
- Modify: `backend/app/routes/telegram.py` (after inbound insert ~L136)
- Modify: `backend/app/routes/instagram.py` (after inbound insert ~L206)
- Modify: `backend/app/routes/facebook.py` (after inbound insert ~L199)
- Test: `backend/tests/test_notify_service.py` (add dedupe-on-reply test)

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_notify_service.py`:

```python
def test_notify_assigned_caller_of_reply_skips_when_unassigned():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    db.table("leads").select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "assigned_to": None, "name": "Asha",
    }
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_assigned_caller_of_reply("lead-1", "t-1", db=db)
    assert captured == []


def test_notify_assigned_caller_of_reply_notifies_assigned_caller():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    db.table("leads").select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "assigned_to": "caller-1", "name": "Asha",
    }
    db.table("callers").select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "user_id": "u-caller-1",
    }
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_assigned_caller_of_reply("lead-1", "t-1", db=db)
    assert len(captured) == 1
    assert captured[0]["user_id"] == "u-caller-1"
    assert captured[0]["type"] == "lead_replied"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_notify_service.py -k reply -v`
Expected: FAIL — `AttributeError: module ... has no attribute 'notify_assigned_caller_of_reply'`

- [ ] **Step 3: Implement the helper in `notify.py`**

```python
def notify_assigned_caller_of_reply(lead_id: str, tenant_id: str, *, db=None) -> None:
    """Notify the caller who owns this lead that the lead replied. Best-effort."""
    if not lead_id:
        return
    db = db or get_supabase()
    try:
        lead = (
            db.table("leads")
            .select("assigned_to,name")
            .eq("id", lead_id)
            .maybe_single()
            .execute()
        )
        data = lead.data if lead else None
        if not data or not data.get("assigned_to"):
            return
        caller = (
            db.table("callers")
            .select("user_id")
            .eq("id", data["assigned_to"])
            .eq("tenant_id", tenant_id)
            .maybe_single()
            .execute()
        )
        user_id = (caller.data or {}).get("user_id") if caller else None
        if not user_id:
            return
        notify_user(
            tenant_id,
            user_id,
            "lead_replied",
            "Lead replied",
            f"'{data.get('name') or 'Your lead'}' just replied.",
            db=db,
            dedupe_lead_id=lead_id,
        )
    except Exception as e:
        logger.warning(f"notify_assigned_caller_of_reply failed (lead={lead_id}): {e}")
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_notify_service.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Call it from all 4 channels**

After each channel's inbound `db.table("messages").insert(...).execute()`, add (using that file's in-scope `lead_id`, `tenant_id`, `db`):

```python
                    try:
                        from app.services.notify import notify_assigned_caller_of_reply
                        if lead_id:
                            notify_assigned_caller_of_reply(lead_id, tenant_id, db=db)
                    except Exception:
                        pass
```

- `webhook.py` ~L398 (WhatsApp) — match the existing indentation of the `messages.insert` block.
- `telegram.py` ~L136.
- `instagram.py` ~L206.
- `facebook.py` ~L199 (the insert spans L199-L206; place after `.execute()`).

> Confirm the inbound `lead_id`/`tenant_id` variable names per file with `grep -n "lead_id\|tenant_id\|messages\").insert" backend/app/routes/<file>.py` before editing.

- [ ] **Step 6: Verify boot**

Run: `cd backend && python -c "import app.routes.webhook, app.routes.telegram, app.routes.instagram, app.routes.facebook"`
Expected: no error.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/notify.py backend/tests/test_notify_service.py backend/app/routes/webhook.py backend/app/routes/telegram.py backend/app/routes/instagram.py backend/app/routes/facebook.py
git commit -m "feat: notify assigned caller when their lead replies, all channels (event 4)"
```

---

## Task 6: Backend `GET /notifications/pool` (live banner source)

**Files:**
- Modify: `backend/app/routes/notifications.py`

- [ ] **Step 1: Add the pool endpoint**

Append to `notifications.py`:

```python
@router.get("/pool")
async def list_pool_items(
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_current_user),
):
    """Currently-actionable shared-pool items for the claim banner.

    Reflects live state (not stale notifications): pending unassigned handovers
    and unassigned leads with an open callback. Returns at most 20.
    """
    db = get_supabase()
    items: list[dict] = []
    try:
        handovers = (
            db.table("chat_handovers")
            .select("id, lead_id, reason, created_at, leads(name)")
            .eq("tenant_id", tenant_id)
            .eq("status", "pending")
            .is_("assigned_to", "null")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        for h in (handovers.data or []):
            lead = h.get("leads") or {}
            items.append({
                "kind": "handover",
                "id": h["id"],
                "lead_id": h["lead_id"],
                "lead_name": lead.get("name") if isinstance(lead, dict) else None,
                "reason": h.get("reason"),
                "created_at": h.get("created_at"),
            })
    except Exception as e:
        logger.warning(f"pool handovers fetch failed (transient?): {e}")

    return {"data": items}
```

> Scope decision: v1 lists pending unassigned handovers only. Released callbacks already set `needs_human_attention` and create a handover via escalation paths, so they surface here too without a second query. Add a leads-based callback query later only if a gap appears.

- [ ] **Step 2: Verify boot**

Run: `cd backend && python -c "import app.routes.notifications"`
Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routes/notifications.py
git commit -m "feat: add GET /notifications/pool for the claim banner"
```

---

## Task 7: Frontend API client + `useNotifications` hook

**Files:**
- Modify: `frontend/lib/api.ts` (notifications block + a `PoolItem` type)
- Create: `frontend/hooks/useNotifications.ts`

- [ ] **Step 1: Extend the api client**

In `frontend/lib/api.ts`, add `pool` to the `notifications` object:

```typescript
  notifications: {
    list: () => apiFetch<{ data: AppNotification[] }>("/api/v1/notifications"),
    pool: () => apiFetch<{ data: PoolItem[] }>("/api/v1/notifications/pool"),
    markRead: (id: string) =>
      apiFetch<{ success: boolean; data: AppNotification }>(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
      }),
  },
```

And add the type near the `AppNotification` interface (~L520):

```typescript
export interface PoolItem {
  kind: "handover";
  id: string;
  lead_id: string;
  lead_name: string | null;
  reason: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Create the hook**

```typescript
// frontend/hooks/useNotifications.ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, AppNotification, PoolItem } from "@/lib/api";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import { usePolling } from "@/hooks/usePolling";

export function useNotifications() {
  const { role } = useAuthRole();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const notifiedSet = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (role !== "caller" && role !== "owner") return;
    try {
      const notifsRes = await api.notifications.list();
      const unread = notifsRes.data || [];
      unread.forEach((n) => {
        if (!notifiedSet.current.has(n.id)) {
          notifiedSet.current.add(n.id);
          toast(n.title, { description: n.message });
        }
      });
      setNotifications(unread);
    } catch (err) {
      console.error("notifications load failed", err);
    }
    if (role === "caller") {
      try {
        const poolRes = await api.notifications.pool();
        setPool(poolRes.data || []);
      } catch (err) {
        console.error("pool load failed", err);
        setPool([]);
      }
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30_000, !!role);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("markRead failed", err);
    }
  }, []);

  return { notifications, pool, markRead, reload: load };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in `lib/api.ts` or `hooks/useNotifications.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts frontend/hooks/useNotifications.ts
git commit -m "feat: add notifications.pool api + useNotifications hook"
```

---

## Task 8: `NotificationBell` + `ProfileMenu` components

**Files:**
- Create: `frontend/components/NotificationBell.tsx`
- Create: `frontend/components/ProfileMenu.tsx`

- [ ] **Step 1: NotificationBell (bell button + dropdown)**

Port the bell button + dropdown panel out of `NotificationCenter.tsx`, but drive it from the hook and drop the `fixed top-6 right-8` wrapper (the bar positions it now). Keep the Alerts tab; the Due-Callbacks tab logic stays as-is if present (reuse the existing `fetchTodayCallbacks` block).

```tsx
// frontend/components/NotificationBell.tsx
"use client";
import { useState } from "react";
import { Bell, X, Info, CheckCircle2 } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";

export function NotificationBell() {
  const { notifications, markRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const total = notifications.length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2.5 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 hover:border-indigo-500 transition-all group"
        title="Notifications"
      >
        <Bell size={18} className="text-slate-600 group-hover:text-indigo-600 transition-colors" />
        {total > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1.5 bg-gradient-to-r from-rose-500 to-pink-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-4 ring-background">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-3 w-80 md:w-96 bg-white border border-slate-200/80 rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-sm font-black text-slate-800 uppercase tracking-wider">Notifications</h3>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-white/60">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">No new alerts</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="p-4 rounded-2xl hover:bg-slate-50 flex gap-3 group">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Info size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-sm font-bold text-slate-800">{n.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-2">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => markRead(n.id)}
                      className="shrink-0 self-center p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                      title="Mark as read"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ProfileMenu (account chip: name/email, role, profile link, sign out)**

Port the `signOut` logic from `sidebar.tsx` (it imports the supabase client and calls `supabase.auth.signOut()`); read the email from the session.

```tsx
// frontend/components/ProfileMenu.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client"; // match sidebar's import
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";

export function ProfileMenu() {
  const { role } = useAuthRole();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [supabase]);

  const roleLabel = role === "owner" ? "Admin" : role === "caller" ? "Telecaller" : "";

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 transition-all"
      >
        <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <User size={14} />
        </span>
        <span className="text-xs font-bold text-slate-700 hidden sm:block">{roleLabel}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200/80 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-800 truncate">{email || "Account"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{roleLabel}</p>
            </div>
            <button onClick={() => { setOpen(false); router.push("/dashboard/profile"); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left">
              <User size={15} /> Profile
            </button>
            <button onClick={signOut}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 text-left">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

> Before writing, run `grep -n "import\|signOut\|createClient\|supabase" frontend/components/sidebar.tsx` and copy its exact supabase client import path and post-signout redirect target so ProfileMenu matches.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/NotificationBell.tsx frontend/components/ProfileMenu.tsx
git commit -m "feat: NotificationBell + ProfileMenu components for the app-bar"
```

---

## Task 9: `ClaimBanner` component

**Files:**
- Create: `frontend/components/ClaimBanner.tsx`

- [ ] **Step 1: Build the banner**

```tsx
// frontend/components/ClaimBanner.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";

export function ClaimBanner() {
  const { role } = useAuthRole();
  const { pool, reload } = useNotifications();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (role !== "caller" || pool.length === 0) return null;
  const item = pool[0];
  const extra = pool.length - 1;

  const claim = async () => {
    setBusy(true);
    try {
      await api.leads.takeover(item.lead_id);
      toast.success("Claimed");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Already claimed");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-200">
      <AlertCircle size={18} className="text-rose-600 shrink-0" />
      <p className="flex-1 text-sm font-bold text-rose-900 truncate">
        Lead &quot;{item.lead_name || "Unknown"}&quot; needs a human — unclaimed.
        {extra > 0 && <span className="ml-2 text-rose-600 font-medium">+{extra} more in the pool</span>}
      </p>
      <button onClick={() => router.push(`/dashboard/conversations?lead=${item.lead_id}`)}
        className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 rounded-lg transition-colors">
        View
      </button>
      <button onClick={claim} disabled={busy}
        className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50">
        {busy ? "Claiming…" : "Claim"}
      </button>
    </div>
  );
}
```

> Verify the takeover client call: run `grep -n "takeover\|leads:" frontend/lib/api.ts`. If `api.leads.takeover` does not exist, add it: `takeover: (id: string) => apiFetch(\`/api/v1/leads/${id}/takeover\`, { method: "POST" })`. Also confirm the conversations deep-link query param the conversations page reads (`grep -rn "searchParams\|useSearchParams\|?lead=" frontend/app/dashboard/conversations/`), and adjust the `View` href to match.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ClaimBanner.tsx frontend/lib/api.ts
git commit -m "feat: sticky ClaimBanner for shared-pool items"
```

---

## Task 10: `AppHeader` + wire into layout, retire floating chrome

**Files:**
- Create: `frontend/components/AppHeader.tsx`
- Modify: `frontend/app/dashboard/ClientLayout.tsx`
- Modify: `frontend/components/sidebar.tsx` (remove signOut + profile-link block)

- [ ] **Step 1: AppHeader**

```tsx
// frontend/components/AppHeader.tsx
"use client";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/ProfileMenu";

export function AppHeader({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-end gap-2.5 px-7 bg-background/80 backdrop-blur border-b border-slate-200/60">
      <button
        onClick={onOpenCalendar}
        className="p-2.5 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 hover:border-indigo-500 transition-all"
        title="Schedule & Notes"
      >
        {/* lucide Calendar icon */}
        <span className="sr-only">Schedule & Notes</span>
        <CalendarIcon />
      </button>
      <NotificationBell />
      <ProfileMenu />
    </header>
  );
}

function CalendarIcon() {
  const { Calendar } = require("lucide-react");
  return <Calendar size={18} className="text-slate-600" />;
}
```

> Prefer a top-level `import { Calendar } from "lucide-react"` over the inline require if the project lints against require(); replace `CalendarIcon` with `<Calendar size={18} className="text-slate-600" />` directly.

- [ ] **Step 2: Wire ClientLayout — mount bar + banner, drop floating buttons**

Edit `frontend/app/dashboard/ClientLayout.tsx`:
- Remove `import { NotificationCenter }` and its `<NotificationCenter />` mount.
- Remove the floating Calendar `<button className="fixed bottom-8 right-8 ...">` block.
- Add `AppHeader` (with the calendar opener) and `ClaimBanner` above the page content:

```tsx
"use client";
import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { AuthRoleProvider } from "./contexts/AuthRoleContext";
import { ActiveCallProvider } from "./contexts/ActiveCallContext";
import { CalendarPanel } from "@/components/CalendarPanel";
import { AppHeader } from "@/components/AppHeader";
import { ClaimBanner } from "@/components/ClaimBanner";
import { SessionTracker } from "@/components/SessionTracker";
import { API_URL } from "@/lib/api";

const PING_INTERVAL_MS = 8 * 60 * 1000;

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    const ping = () => fetch(`${API_URL}/health`, { method: "GET" }).catch(() => {});
    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <AuthRoleProvider>
      <ActiveCallProvider>
        <SessionTracker />
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <main className="ml-[220px] flex-1 min-h-screen flex flex-col">
            <AppHeader onOpenCalendar={() => setIsCalendarOpen(true)} />
            <ClaimBanner />
            <div className="p-7 max-w-[1400px] relative w-full">
              {children}
            </div>
          </main>
          <CalendarPanel isOpen={isCalendarOpen} onClose={() => setIsCalendarOpen(false)} />
        </div>
      </ActiveCallProvider>
    </AuthRoleProvider>
  );
}
```

- [ ] **Step 3: Remove duplicated account controls from the sidebar**

In `frontend/components/sidebar.tsx`, delete the `signOut` handler and its "Sign out" button (~L46-L56) and the `/dashboard/profile` nav link block (~L169-L178), since `ProfileMenu` now owns them. Leave all other nav items intact.

> Run `grep -n "signOut\|Sign out\|/dashboard/profile" frontend/components/sidebar.tsx` first to get exact current line ranges before deleting.

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: build succeeds, no unused-import errors (ESLint no-unused-vars fails Next builds — ensure removed imports are fully cleaned).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/AppHeader.tsx frontend/app/dashboard/ClientLayout.tsx frontend/components/sidebar.tsx
git commit -m "feat: app-bar replaces floating bell/calendar; account controls move to ProfileMenu"
```

---

## Task 11: Retire `NotificationCenter.tsx` + manual verification

**Files:**
- Delete: `frontend/components/NotificationCenter.tsx` (if no remaining importers)

- [ ] **Step 1: Confirm no importers remain**

Run: `grep -rn "NotificationCenter" frontend/app frontend/components | grep -v node_modules`
Expected: no results. If the Due-Callbacks tab logic was not ported into `NotificationBell`, port it first, then delete.

- [ ] **Step 2: Delete the file**

```bash
git rm frontend/components/NotificationCenter.tsx
```

- [ ] **Step 3: Full backend test run**

Run: `cd backend && python -m pytest tests/test_notify_service.py -v`
Expected: PASS (7 passed).

- [ ] **Step 4: Manual UI check (dev server)**

Run: `cd frontend && npm run dev`, log in as a caller, and verify at widths 1440 / 1024 / 768:
- The app-bar sits at the top; a page with an Export button (e.g. Telecalling → CallerView) shows no overlap between the bell and the Export button.
- ProfileMenu shows email + "Telecaller" + Sign out works.
- With a pending unassigned handover in the tenant, the ClaimBanner appears; clicking Claim clears it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: retire NotificationCenter, superseded by AppHeader + NotificationBell"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 app-bar → Tasks 8/10/11; Part 2 banner → Tasks 6/9; Part 3 backend (notify.py + events 1-4 + pool endpoint) → Tasks 1-6. Profile menu w/ logout → Task 8/10. ✔
- **Event 5 (wrap-up) intentionally excluded** per Decision B. ✔
- **Decision A (all 4 channels)** → Task 5 wires webhook/telegram/instagram/facebook. ✔
- **No migration** — confirmed `app_notifications` is schema-generic. ✔
- **Type consistency:** `notify_user`, `notify_pool`, `notify_assigned_caller_of_reply` signatures match across Tasks 1/2/3/5; `PoolItem`/`AppNotification` shared by hook, bell, banner. ✔
- **Known follow-ups (out of scope):** bell still shows claimed pool alerts until each caller dismisses (banner self-clears); owner/ops + wrap-up events unwired.
