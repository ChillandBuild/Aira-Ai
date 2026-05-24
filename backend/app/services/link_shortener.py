"""Outbound URL → short-code rewriter for click tracking.

Public entry points:
  - create_short_link(...)       — create a tracked short link
  - rewrite_urls_in_text(...)    — replace all http(s) URLs in text with short links
  - log_click(...)               — record a click + bump counters + boost lead score
"""

import hashlib
import logging
import os
import re
import secrets
from typing import Optional

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_SHORT_CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"
_SHORT_CODE_LEN = 7

CLICK_SCORE_BOOST = 1  # bump lead score by +1 on click (capped at 10)


def _public_base_url() -> str:
    """Base URL where the redirect endpoint is served. Falls back to render host."""
    return (
        os.environ.get("PUBLIC_BASE_URL")
        or os.environ.get("BACKEND_URL")
        or "https://aira-ai-5tfr.onrender.com"
    ).rstrip("/")


def _generate_short_code() -> str:
    return "".join(secrets.choice(_SHORT_CODE_ALPHABET) for _ in range(_SHORT_CODE_LEN))


def _hash_ip(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:16]


def create_short_link(
    tenant_id: str,
    long_url: str,
    lead_id: Optional[str] = None,
    broadcast_id: Optional[str] = None,
    campaign: Optional[str] = None,
    template_name: Optional[str] = None,
) -> str:
    """Insert a link_shortener row and return the fully-qualified short URL."""
    db = get_supabase()
    # Retry on rare collision
    for _ in range(5):
        code = _generate_short_code()
        try:
            db.table("link_shortener").insert({
                "tenant_id": tenant_id,
                "short_code": code,
                "long_url": long_url,
                "lead_id": lead_id,
                "broadcast_id": broadcast_id,
                "campaign": campaign,
                "template_name": template_name,
            }).execute()
            return f"{_public_base_url()}/l/{code}"
        except Exception as e:
            # Likely unique-violation — retry with a new code
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                continue
            logger.error("create_short_link failed: %s", e)
            raise
    raise RuntimeError("Failed to generate unique short code after 5 attempts")


def rewrite_urls_in_text(
    text: str,
    tenant_id: str,
    lead_id: Optional[str] = None,
    broadcast_id: Optional[str] = None,
    campaign: Optional[str] = None,
    template_name: Optional[str] = None,
) -> str:
    """Find every URL in text and replace it with a tracked short link.

    Safe to call on text without URLs (returns text unchanged).
    Each URL becomes a distinct short link so per-lead clicks are attributable.
    """
    if not text or "http" not in text:
        return text

    def _swap(match: re.Match) -> str:
        long_url = match.group(0).rstrip(".,);]>")
        trailing = match.group(0)[len(long_url):]
        try:
            short = create_short_link(
                tenant_id=tenant_id,
                long_url=long_url,
                lead_id=lead_id,
                broadcast_id=broadcast_id,
                campaign=campaign,
                template_name=template_name,
            )
            return short + trailing
        except Exception as e:
            logger.warning("URL rewrite failed for %s: %s", long_url, e)
            return match.group(0)

    return _URL_RE.sub(_swap, text)


def log_click(
    short_code: str,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    referer: Optional[str] = None,
) -> Optional[dict]:
    """Resolve a short code → long URL, log the click, bump counters.

    Returns the link_shortener row dict, or None if not found.
    """
    db = get_supabase()
    row = (
        db.table("link_shortener")
        .select("id,tenant_id,long_url,lead_id,total_clicks")
        .eq("short_code", short_code)
        .limit(1)
        .execute()
    )
    if not row.data:
        return None
    link = row.data[0]

    try:
        db.table("link_clicks").insert({
            "link_id": link["id"],
            "tenant_id": link["tenant_id"],
            "lead_id": link.get("lead_id"),
            "ip_hash": _hash_ip(ip),
            "user_agent": (user_agent or "")[:500],
            "referer": (referer or "")[:500],
        }).execute()
    except Exception as e:
        logger.warning("link_clicks insert failed: %s", e)

    try:
        db.table("link_shortener").update({
            "total_clicks": (link.get("total_clicks") or 0) + 1,
            "last_click_at": "now()",
        }).eq("id", link["id"]).execute()
    except Exception:
        # last_click_at may not accept the now() string in some clients; retry without it
        try:
            from datetime import datetime, timezone
            db.table("link_shortener").update({
                "total_clicks": (link.get("total_clicks") or 0) + 1,
                "last_click_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", link["id"]).execute()
        except Exception as e:
            logger.warning("link_shortener counter bump failed: %s", e)

    # Boost lead score on click (intent signal)
    lead_id = link.get("lead_id")
    if lead_id:
        try:
            lead_row = (
                db.table("leads")
                .select("score")
                .eq("id", lead_id)
                .limit(1)
                .execute()
            )
            current = (lead_row.data[0].get("score") if lead_row.data else None) or 0
            new_score = min(10, max(1, current + CLICK_SCORE_BOOST))
            if new_score != current:
                db.table("leads").update({"score": new_score}).eq("id", lead_id).execute()
        except Exception as e:
            logger.warning("Lead score boost on click failed: %s", e)

    return link
