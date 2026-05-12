# backend/tests/test_payment_razorpay.py
import pytest
import hashlib
import hmac
from unittest.mock import patch, AsyncMock, MagicMock


# --- Test: payment link creation ---

@pytest.mark.asyncio
async def test_create_payment_link_returns_url():
    """create_payment_link returns the short_url from Razorpay."""
    from app.services.payment_razorpay import create_payment_link

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "id": "plink_abc123",
        "short_url": "https://rzp.io/l/abc123",
        "status": "created",
    }

    with patch("app.services.payment_razorpay._get_key_id", return_value="test_key_id"), \
         patch("app.services.payment_razorpay._get_key_secret", return_value="test_key_secret"), \
         patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=mock_response)

        result = await create_payment_link(
            booking_id="booking-uuid-1",
            booking_ref="GPH-2026-0001",
            amount_paise=50000,
            customer_name="Rajan Kumar",
            customer_phone="+919876543210",
            description="Guru Peyarchi Homam - Rajan Kumar",
        )

    assert result["payment_link_url"] == "https://rzp.io/l/abc123"
    assert result["razorpay_payment_link_id"] == "plink_abc123"


@pytest.mark.asyncio
async def test_create_payment_link_raises_on_failure():
    """create_payment_link raises RuntimeError when Razorpay returns non-2xx."""
    from app.services.payment_razorpay import create_payment_link

    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 400
    mock_response.text = '{"error": {"description": "Invalid amount"}}'

    with patch("app.services.payment_razorpay._get_key_id", return_value="test_key_id"), \
         patch("app.services.payment_razorpay._get_key_secret", return_value="test_key_secret"), \
         patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=mock_response)

        with pytest.raises(RuntimeError, match="Razorpay"):
            await create_payment_link(
                booking_id="booking-uuid-1",
                booking_ref="GPH-2026-0001",
                amount_paise=0,
                customer_name="Test",
                customer_phone="+919876543210",
                description="Test",
            )


def test_verify_razorpay_signature_valid():
    """verify_webhook_signature returns True for a valid signature."""
    from app.services.payment_razorpay import verify_webhook_signature

    secret = "test_webhook_secret"
    body = b'{"event": "payment_link.paid"}'
    expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch("app.services.payment_razorpay._get_webhook_secret", return_value=secret):
        assert verify_webhook_signature(body, expected_sig) is True


def test_verify_razorpay_signature_invalid():
    """verify_webhook_signature returns False for a tampered payload."""
    from app.services.payment_razorpay import verify_webhook_signature

    secret = "test_webhook_secret"
    body = b'{"event": "payment_link.paid"}'
    wrong_sig = "abc123deadbeef"

    with patch("app.services.payment_razorpay._get_webhook_secret", return_value=secret):
        assert verify_webhook_signature(body, wrong_sig) is False
