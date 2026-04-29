# STOP Opt-Out + Daily Number Limit Hard Cap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Automatically opt out any lead who replies STOP/UNSUBSCRIBE and block them from all future sends. (2) Skip WhatsApp numbers that have hit their daily Meta tier limit instead of letting sends fail silently.

**Architecture:** STOP detection is added to the inbound webhook before `generate_reply` is called. An `opted_out` boolean column on `leads` gates all outbound paths. Daily limit cap is enforced in `get_best_number()` by comparing `daily_send_count` against a tier→limit mapping; numbers over the cap are excluded from the pool entirely.

**Tech Stack:** FastAPI, Supabase (PostgreSQL), Python 3.11+, Supabase MCP for migrations.

---

## File Map

| File | Change |
|---|---|
| `backend/app/routes/webhook.py` | Detect STOP before `generate_reply`; mark lead opted_out |
| `backend/app/routes/upload.py` | Skip `opted_out=true` leads in bulk-send |
| `backend/app/services/outbound_router.py` | Add tier limit cap to `get_best_number()` |
| Supabase migration | Add `opted_out boolean default false` to `leads` table |

---

## Task 1: DB Migration — add `opted_out` to leads

**Files:**
- Supabase migration (run via MCP or psql)

- [ ] **Step 1: Apply migration**

Run via Supabase MCP `execute_sql` or psql:

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS leads_opted_out_idx ON leads (opted_out) WHERE opted_out = true;
COMMENT ON COLUMN leads.opted_out IS 'True when lead replied STOP/UNSUBSCRIBE — blocks all outbound sends';
```

- [ ] **Step 2: Verify column exists**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'opted_out';
```

Expected output: one row with `boolean`, default `false`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add opted_out column to leads"
```

---

## Task 2: STOP detection in inbound webhook

**Files:**
- Modify: `backend/app/routes/webhook.py` — lines ~68–114 (Meta inbound) and ~149–162 (Twilio inbound)

- [ ] **Step 1: Add STOP word set near top of file**

In `backend/app/routes/webhook.py`, after the imports, add:

```python
_STOP_WORDS = frozenset({"stop", "unsubscribe", "cancel", "quit", "end", "optout", "opt out", "opt-out"})
```

- [ ] **Step 2: Add opt-out helper function**

After `_STOP_WORDS`, add:

```python
def _handle_opt_out(phone: str, db) -> bool:
    """Mark lead as opted out if phone matches. Returns True if opted out."""
    lead = db.table("leads").select("id").eq("phone", phone).maybe_single().execute()
    if not lead.data:
        return False
    db.table("leads").update({"opted_out": True, "ai_enabled": False}).eq("id", lead.data["id"]).execute()
    logger.info(f"Lead {lead.data['id']} opted out via STOP from {phone}")
    return True
```

- [ ] **Step 3: Wire STOP detection into Meta inbound handler**

Find the block inside `whatsapp_webhook` where `body` is extracted and `generate_reply` is called. It looks like:

```python
if not phone or not body:
    continue
logger.info(f"Inbound Meta WhatsApp from {phone}: {body!r}")
# ... message stored ...
await generate_reply(lead_id=lead_id, message=body, phone=phone)
```

Replace with:

```python
if not phone or not body:
    continue
logger.info(f"Inbound Meta WhatsApp from {phone}: {body!r}")
if body.lower().strip() in _STOP_WORDS:
    _handle_opt_out(phone, db)
    continue
# ... rest of existing message storage and generate_reply unchanged ...
```

- [ ] **Step 4: Wire STOP detection into Twilio inbound handler**

Find the Twilio webhook section where `Body` is processed and `generate_reply` is called (~line 149). Add the same guard:

```python
if Body and Body.lower().strip() in _STOP_WORDS:
    _handle_opt_out(phone, db)
    return Response(content=twiml, media_type="text/xml")
```

Add this BEFORE the `db.table("messages").insert(...)` block.

- [ ] **Step 5: Manual test**

```bash
curl -X POST http://localhost:8000/api/v1/webhook/twilio \
  -d "From=%2B919876543210&Body=STOP&MessageSid=SMtest"
```

Expected: 200 response. In Supabase, the matching lead should have `opted_out=true` and `ai_enabled=false`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routes/webhook.py
git commit -m "feat(webhook): detect STOP/UNSUBSCRIBE and mark lead opted_out"
```

---

## Task 3: Block opted-out leads from bulk-send

**Files:**
- Modify: `backend/app/routes/upload.py` — `bulk_send` function (~line 294)

- [ ] **Step 1: Find the opt_in_source check in bulk_send**

In `upload.py` inside `bulk_send`, there is already:

```python
source = (lead.opt_in_source or "").strip().lower()
```

- [ ] **Step 2: Add opted_out guard immediately after**

Add this check right after the `opt_in_source` check (before sending):

```python
if lead.opted_out:
    results.append({"phone": lead.phone, "status": "skipped", "reason": "opted_out"})
    continue
```

If the `lead` object doesn't have `opted_out` yet, update the Pydantic/dict access to include it. The lead data comes from Supabase — `lead.get("opted_out")` or `lead["opted_out"]` depending on how it's accessed.

- [ ] **Step 3: Verify opted-out lead is skipped**

Set a test lead's `opted_out = true` in Supabase directly, then trigger a bulk-send that includes their phone. Confirm they appear in results as `"status": "skipped", "reason": "opted_out"`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/upload.py
git commit -m "feat(bulk-send): skip opted_out leads"
```

---

## Task 4: Daily tier limit hard cap in outbound router

**Files:**
- Modify: `backend/app/services/outbound_router.py` — `get_best_number()` function

**Context:** `phone_numbers` table has `daily_send_count` (int) and `messaging_tier` (int). Current code sorts by usage ratio but never excludes numbers that have hit their cap. Meta tier limits: tier 1 = 1,000/day, tier 2 = 10,000/day, tier 3 = 100,000/day.

- [ ] **Step 1: Add tier limit mapping**

At the top of `outbound_router.py`, after imports, add:

```python
_TIER_DAILY_LIMITS: dict[int, int] = {1: 1_000, 2: 10_000, 3: 100_000}
```

- [ ] **Step 2: Add cap filter inside `get_best_number()`**

The current function ends with:

```python
rows.sort(key=_sort_key)
return rows[0]
```

Before the sort, add a filter that excludes numbers over their cap:

```python
def _under_limit(row: dict) -> bool:
    tier = row.get("messaging_tier") or 1
    limit = _TIER_DAILY_LIMITS.get(tier, 1_000)
    return (row.get("daily_send_count") or 0) < limit

rows = [r for r in rows if _under_limit(r)]
if not rows:
    logger.warning("All outbound numbers have hit their daily tier limit")
    return None

rows.sort(key=_sort_key)
return rows[0]
```

- [ ] **Step 3: Manual test — simulate exhausted number**

In Supabase, set one number's `daily_send_count = 1000` and `messaging_tier = 1`. Confirm `get_best_number()` skips it and returns another number (or None if only one exists).

```sql
UPDATE phone_numbers SET daily_send_count = 1000 WHERE id = '<your-number-id>';
```

Then call the bulk-send endpoint and check logs for which number was selected.

Reset after test:

```sql
UPDATE phone_numbers SET daily_send_count = 0 WHERE id = '<your-number-id>';
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/outbound_router.py
git commit -m "feat(router): skip numbers that have hit daily Meta tier limit"
```

---

## Task 5: Show opted-out badge in Conversations UI

**Files:**
- Modify: `frontend/components/conversation-list.tsx`
- Modify: `frontend/lib/api.ts` — ensure `Lead` type has `opted_out: boolean`

- [ ] **Step 1: Add `opted_out` to Lead type in api.ts**

Find the `Lead` interface/type in `frontend/lib/api.ts` and add:

```typescript
opted_out: boolean;
```

- [ ] **Step 2: Add opted-out indicator in conversation list item**

In `conversation-list.tsx`, inside the lead button, after `<SegmentBadge segment={lead.segment} />` add:

```tsx
{lead.opted_out && (
  <span className="font-label text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
    STOP
  </span>
)}
```

- [ ] **Step 3: Verify in browser**

Set a lead's `opted_out = true` in Supabase. Open Conversations page. That lead should show a red STOP badge.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/conversation-list.tsx frontend/lib/api.ts
git commit -m "feat(conversations): show STOP badge for opted-out leads"
```

---

## Self-Review

**Spec coverage:**
- STOP detection in Meta webhook ✅ Task 2
- STOP detection in Twilio webhook ✅ Task 2
- opted_out blocks bulk-send ✅ Task 3
- Daily tier limit hard cap ✅ Task 4
- UI indicator for opted-out leads ✅ Task 5

**No placeholders found.**

**Type consistency:** `opted_out` used consistently as `boolean` in DB, Python `bool`, TypeScript `boolean` across all tasks.
