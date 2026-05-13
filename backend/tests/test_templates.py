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

    public_paths = [r.path for r in templates.public_router.routes]
    auth_paths = [r.path for r in templates.router.routes]

    assert "/webhook-status" in public_paths, \
        f"webhook-status not found in public_router paths: {public_paths}"
    assert "/webhook-status" not in auth_paths, \
        f"webhook-status must NOT be in auth-gated router: {auth_paths}"
