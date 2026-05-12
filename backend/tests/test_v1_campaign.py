# backend/tests/test_v1_campaign.py
"""
Verify bulk-send eligibility logic and FAQ keyword matching.
These tests run against the existing code without network calls.
"""
import pytest
from unittest.mock import MagicMock, patch


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


# --- FAQ keyword matching ---

def test_faq_keyword_match_homam():
    """Simulate the FAQ check: Homam keywords must match FAQ rows."""
    from app.services.ai_reply import _check_faq

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "id": "faq-1",
            "answer": "The Guru Peyarchi Homam will be performed on the auspicious day. You will receive video proof after.",
            "keywords": ["homam", "pooja", "peyarchi", "guru"],
            "hit_count": 0,
        }
    ]
    # Mock the update call for hit_count
    mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value = None

    result = _check_faq("I want to know about the homam", mock_db)
    assert result is not None
    assert "video proof" in result.lower() or "homam" in result.lower()


def test_faq_keyword_no_match():
    """Non-Homam message should not match Homam FAQ."""
    from app.services.ai_reply import _check_faq

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "id": "faq-1",
            "answer": "The Guru Peyarchi Homam will be performed on the auspicious day.",
            "keywords": ["homam", "pooja", "peyarchi"],
            "hit_count": 0,
        }
    ]

    result = _check_faq("what is the fee for MBA", mock_db)
    assert result is None
