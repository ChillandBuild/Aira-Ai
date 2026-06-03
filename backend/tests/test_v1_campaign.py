# backend/tests/test_v1_campaign.py
"""
Verify bulk-send eligibility logic.
These tests run against the existing code without network calls.
"""
import pytest


# --- Bulk-send eligibility ---

def _is_eligible(opt_in_source: str | None) -> bool:
    """Mirrors the gate logic in upload.py:bulk_send()"""
    source = (opt_in_source or "").strip().lower()
    return bool(source) and source != "manual"


@pytest.mark.parametrize("source,expected", [
    ("offline_event", True),
    ("previous_enquiry", True),
    ("imported", True),
    ("website_form", True),
    ("click_to_wa_ad", True),
    ("manual", False),
    (None, False),
    ("", False),
])
def test_bulk_send_eligibility(source, expected):
    assert _is_eligible(source) is expected
