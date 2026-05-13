# Template Management Phase 1 — Design Spec

**Date:** 2026-05-13
**Status:** Approved for implementation

---

## Goal

Make the WhatsApp template submission and approval flow fully functional and usable by non-technical clients directly from the Aira dashboard — with zero visits to Meta Business Manager after initial setup.

---

## Current State (what's broken)

The template page UI and backend are already built. Two bugs prevent it from working end-to-end:

### Bug 1 — Wrong Meta ID for template submission
`backend/app/routes/templates.py:34` uses `get_setting("meta_phone_number_id")` as the WABA ID, but Meta's template API requires the **WhatsApp Business Account ID (WABA ID)**, which is a different value. The phone number ID (e.g. `639558505904219`) is not a valid WABA ID.

### Bug 2 — Approval webhook is auth-gated
`POST /api/v1/templates/webhook-status` is registered under `templates.router` which has `dependencies=_auth`. Meta cannot call it — it receives a 401. Template statuses never auto-update from PENDING to APPROVED/REJECTED.

---

## Architecture

### Files modified

| File | Change |
|---|---|
| `backend/app/routes/templates.py` | Fix Bug 1 (WABA ID), Fix Bug 2 (public_router), add sync endpoint |
| `backend/app/services/meta_cloud.py` | Add `get_template_status()` for manual sync |
| `backend/app/main.py` | Register `templates.public_router` without auth |
| `frontend/app/dashboard/templates/page.tsx` | Full UX overhaul for non-technical clients |

### No schema changes needed

The `message_templates` table already has all required columns. One new `app_settings` row is required: `meta_waba_id` (operator adds manually after lookup in Meta Business Manager — one-time setup).

---

## Backend Design

### templates.py changes

**Fix 1 — WABA ID:**
```python
# Before (wrong)
waba_id = get_setting("meta_phone_number_id")

# After (correct)
waba_id = get_setting("meta_waba_id")
if not waba_id:
    logger.warning("meta_waba_id not configured — saving template as PENDING without Meta submission")
```

**Fix 2 — Public router for webhook:**
```python
router = APIRouter()        # auth-gated (existing)
public_router = APIRouter() # no auth — Meta calls this

# Move webhook-status from router to public_router
@public_router.post("/webhook-status")
async def template_status_webhook(payload: dict): ...
```

**New endpoint — Manual sync:**
```
POST /api/v1/templates/{template_id}/sync
```
Calls Meta's GET `/{waba_id}/message_templates` filtered by name, updates status in DB. Returns updated template row. Used by the "Sync Status" button in the UI.

### meta_cloud.py addition

```python
async def get_template_status(
    waba_id: str,
    template_name: str,
    access_token: Optional[str] = None,
) -> dict | None:
    """Fetch current template status from Meta. Returns None if not found."""
```

Calls `GET /{waba_id}/message_templates?name={template_name}` and returns the first matching result.

### main.py addition

```python
app.include_router(
    templates.public_router,
    prefix="/api/v1/templates",
    tags=["templates-webhook"]
)  # No dependencies=_auth — Meta calls this directly
```

---

## Frontend Design

### Category picker (replaces dropdown)

Three clickable cards instead of a technical dropdown. Each card shows:
- A bold plain-English label
- One line describing what it's for
- Visual selection state (border highlight)

```
┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐
│  📣 Promotional             │  │  🔔 Service Update          │  │  🔐 Verification            │
│  Event invites, offers,     │  │  Booking confirmations,     │  │  OTP codes,                 │
│  campaign messages          │  │  reminders, alerts          │  │  login verification         │
└─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘
        (= MARKETING)                    (= UTILITY)                  (= AUTHENTICATION)
```

The Meta category value (MARKETING/UTILITY/AUTHENTICATION) is derived internally — the client never sees these terms.

### Title → name auto-generation

Replace the raw `name` input with a `title` field:

```
Title:  [Guru Peyarchi Homam Invite          ]
         Will be submitted as: guru_peyarchi_homam_invite  ← shown in muted text below
```

Auto-generation rule: lowercase, replace spaces and special chars with `_`, strip leading/trailing underscores. Shown live as user types.

### Live WhatsApp preview

As the user types the body text, a WhatsApp-style message bubble renders on the right (or below on mobile). Variables are shown with friendly placeholders:

- `{{1}}` → `[Variable 1]`
- `{{2}}` → `[Variable 2]`

The bubble uses WhatsApp's green color scheme so the client can visualise exactly what their message will look like.

### Template list additions

Two new actions per template row:

**Sync Status button** (all non-approved templates):
- Small refresh icon button
- Calls `POST /api/v1/templates/{id}/sync`
- Updates the row's status badge inline
- Shows a spinner while loading

**"Use for Bulk Send" button** (APPROVED templates only):
- Green primary button
- Navigates to `/dashboard/upload?template={template_name}`
- The upload/bulk send page reads this query param and pre-selects the template in the template picker

### Modal layout

Two-column layout inside the modal:
- Left: form fields (title, category cards, language, body text)
- Right: live WhatsApp preview (updates as user types)

On mobile: stacked (form first, preview below).

---

## Data Flow

```
Client fills form → clicks "Submit to Meta"
  → POST /api/v1/templates
  → backend looks up meta_waba_id from app_settings
  → calls submit_template(waba_id, name, category, language, body_text)
  → Meta returns template ID
  → saved to message_templates with status=PENDING

Meta reviews template (24–72 hrs)
  → Meta calls POST /api/v1/templates/webhook-status (no auth)
  → backend updates message_templates.status = APPROVED / REJECTED

Client can also manually check:
  → clicks Sync button on a template row
  → POST /api/v1/templates/{id}/sync
  → backend calls Meta GET API, updates status

Client sees APPROVED → clicks "Use for Bulk Send"
  → navigates to /dashboard/upload?template=guru_peyarchi_homam_invite
  → template pre-selected in upload flow
```

---

## Setup Requirement (one-time, operator)

Before template submission works, the `meta_waba_id` must be added to `app_settings`. This is a one-time step per tenant:

1. Go to Meta Business Manager → WhatsApp Manager
2. Copy the **WhatsApp Business Account ID** (not the phone number ID)
3. Add to Aira app_settings:

```sql
INSERT INTO app_settings (key, value, tenant_id)
VALUES ('meta_waba_id', '<your_waba_id>', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value;
```

This should also be added as a field in the Settings UI page (out of scope for this spec — simple follow-up).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `meta_waba_id` not configured | Template saved locally as PENDING, warning logged, UI shows "Pending Meta submission" |
| Meta rejects submission (4xx) | Error shown in modal, template NOT saved to DB |
| Meta webhook arrives for unknown template | Logged and ignored |
| Sync called but Meta returns no match | Status left unchanged, UI shows "Not found on Meta" toast |

---

## Out of Scope

- Embedded Signup (Tech Provider approval required — Phase 2/3)
- WhatsApp Health widget
- Business profile editing
- Template variables beyond simple `{{n}}` body-only templates (header/footer/buttons — future)
- Template editing after submission (Meta does not support editing approved templates)
