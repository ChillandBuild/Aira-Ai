"""Tests for transient WhatsApp delivery error classification. No DB, no network."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routes.webhook import TRANSIENT_DELIVERY_ERROR_CODES, _is_transient_delivery_error


def test_known_transient_codes_are_transient():
    for code in (131049, 131048, 131056, 130472):
        assert _is_transient_delivery_error(code) is True
        assert code in TRANSIENT_DELIVERY_ERROR_CODES


def test_transient_code_as_string_is_transient():
    assert _is_transient_delivery_error("131049") is True


def test_permanent_codes_are_not_transient():
    assert _is_transient_delivery_error(131026) is False
    assert _is_transient_delivery_error(131050) is False


def test_none_and_garbage_are_not_transient():
    assert _is_transient_delivery_error(None) is False
    assert _is_transient_delivery_error("not-a-code") is False
