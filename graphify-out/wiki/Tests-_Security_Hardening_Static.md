# Tests: Security Hardening Static

> 13 nodes · cohesion 0.28

## Key Concepts

- **read()** (12 connections) — `backend/tests/test_security_hardening_static.py`
- **test_security_hardening_static.py** (11 connections) — `backend/tests/test_security_hardening_static.py`
- **test_whatsapp_webhook_requires_meta_signature_header()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_whatsapp_webhook_does_not_fallback_to_default_tenant_for_meta_messages()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_upload_campaign_lookup_is_tenant_scoped()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_voice_router_requires_tenant_id()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_call_delete_is_tenant_scoped()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_telecmi_callbacks_require_shared_secret()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_telecmi_webhook_secret_is_dynamic_setting()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_owner_only_gated_routers()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_segments_ensure_templates_scopes_by_tenant()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **test_template_webhook_status_requires_signature()** (2 connections) — `backend/tests/test_security_hardening_static.py`
- **str** (1 connections) — `backend/tests/test_security_hardening_static.py`

## Relationships

- No strong cross-community connections detected

## Source Files

- `backend/tests/test_security_hardening_static.py`

## Audit Trail

- EXTRACTED: 44 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*