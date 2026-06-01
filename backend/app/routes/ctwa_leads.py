"""
Meta Ad Leads — Inbound leads from Meta Ad click-to-message campaigns.

Covers all Meta Ad CTA channels:
  - Click-to-WhatsApp (CTWA)       → source = "whatsapp"
  - Click-to-Instagram DM          → source = "instagram"
  - Click-to-Facebook Messenger    → source = "facebook"

Segregation rule (single source of truth):
  ad_campaign_id IS NOT NULL  →  arrived via a Meta Ad
  ad_campaign_id IS NULL      →  organic / direct inbound (excluded here)

The "keyword" is the first inbound message the lead sent — this is the
pre-filled CTA text set by the ad (e.g. "I'm interested in your batch").
"""

import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()

CHANNEL_LABELS = {
    "whatsapp": "WhatsApp (Click-to-Ad)",
    "instagram": "Instagram DM Ad",
    "facebook": "Facebook Messenger Ad",
}

SEGMENT_LABELS = {
    "A": "Hot",
    "B": "Warm",
    "C": "Cold",
    "D": "Disqualified",
}


def _fmt_ist(iso: str) -> str:
    """Format UTC ISO timestamp to IST string."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
        return ist.strftime("%d %b %Y, %I:%M %p IST")
    except Exception:
        return iso


def _fetch_ad_leads(
    db,
    tenant_id: str,
    *,
    ad_campaign_id: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """
    Fetch leads where ad_campaign_id IS NOT NULL (came via a Meta Ad).
    Returns (rows, total_count).
    Uses two separate, simple queries — no JOIN — for maximum reliability.
    """
    # --- Main data query ---
    query = (
        db.table("leads")
        .select("id,phone,name,source,score,segment,created_at,ad_campaign_id")
        .eq("tenant_id", tenant_id)
        .not_.is_("ad_campaign_id", "null")
        .is_("deleted_at", "null")
    )
    if ad_campaign_id:
        query = query.eq("ad_campaign_id", ad_campaign_id)
    if source:
        query = query.eq("source", source)
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)

    data_result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    rows = data_result.data or []

    # --- Count query (same filters, no range) ---
    count_query = (
        db.table("leads")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .not_.is_("ad_campaign_id", "null")
        .is_("deleted_at", "null")
    )
    if ad_campaign_id:
        count_query = count_query.eq("ad_campaign_id", ad_campaign_id)
    if source:
        count_query = count_query.eq("source", source)
    if date_from:
        count_query = count_query.gte("created_at", date_from)
    if date_to:
        count_query = count_query.lte("created_at", date_to)
    count_result = count_query.execute()
    total = count_result.count or len(rows)

    return rows, total


def _fetch_campaign_names(db, tenant_id: str, campaign_ids: list[str]) -> dict[str, str]:
    """Look up campaign names for a set of campaign IDs. Returns {id: name}."""
    if not campaign_ids:
        return {}
    result = (
        db.table("ad_campaigns")
        .select("id,campaign_name")
        .in_("id", campaign_ids)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return {row["id"]: row["campaign_name"] for row in (result.data or [])}


def _fetch_first_keywords(db, tenant_id: str, lead_ids: list[str]) -> dict[str, str]:
    """
    For each lead_id, fetch the first inbound message (the CTA keyword/pre-fill text).
    Returns {lead_id: first_message_content}.
    """
    if not lead_ids:
        return {}
    result = (
        db.table("messages")
        .select("lead_id,content,created_at")
        .in_("lead_id", lead_ids)
        .eq("tenant_id", tenant_id)
        .eq("direction", "inbound")
        .order("created_at", desc=False)
        .execute()
    )
    keyword_map: dict[str, str] = {}
    for msg in (result.data or []):
        lid = msg.get("lead_id", "")
        if lid and lid not in keyword_map:
            keyword_map[lid] = (msg.get("content") or "").strip()
    return keyword_map


def _enrich(
    leads: list[dict],
    campaign_map: dict[str, str],
    keyword_map: dict[str, str],
) -> list[dict]:
    """Attach campaign name and keyword to each lead row."""
    enriched = []
    for lead in leads:
        cid = lead.get("ad_campaign_id") or ""
        src = lead.get("source", "whatsapp")
        enriched.append({
            "id": lead.get("id", ""),
            "phone": lead.get("phone") or "—",
            "name": lead.get("name") or "—",
            "source": src,
            "channel_label": CHANNEL_LABELS.get(src, src.title()),
            "score": lead.get("score", 5),
            "segment": lead.get("segment", "C"),
            "segment_label": SEGMENT_LABELS.get(lead.get("segment", "C"), "—"),
            "created_at": lead.get("created_at", ""),
            "ad_campaign_id": cid,
            "campaign_name": campaign_map.get(cid, "Unknown Campaign"),
            "keyword": keyword_map.get(lead.get("id", ""), "—") or "—",
        })
    return enriched


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/campaigns")
async def list_campaigns(tenant_id: str = Depends(get_tenant_id)):
    """Return all ad campaigns for this tenant (used for filter dropdown)."""
    db = get_supabase()
    try:
        result = (
            db.table("ad_campaigns")
            .select("id,campaign_name,platform")
            .eq("tenant_id", tenant_id)
            .order("campaign_name")
            .execute()
        )
        return {"data": result.data or []}
    except Exception as e:
        logger.error(f"meta-ad-leads campaigns fetch error: {e}")
        return {"data": []}


@router.get("/")
async def list_meta_ad_leads(
    ad_campaign_id: str | None = Query(None),
    source: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
):
    """
    List all inbound leads that arrived via a Meta Ad (ad_campaign_id IS NOT NULL).
    Each row includes: channel, first-message keyword, campaign name, segment, score, date.
    Organic inbound leads (no ad attribution) are NOT included here.
    """
    db = get_supabase()
    offset = (page - 1) * limit

    try:
        leads, total = _fetch_ad_leads(
            db, tenant_id,
            ad_campaign_id=ad_campaign_id,
            source=source,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error(f"meta-ad-leads list error: {e}")
        return {"data": [], "total": 0, "page": page, "limit": limit}

    if not leads:
        return {"data": [], "total": total, "page": page, "limit": limit}

    lead_ids = [l["id"] for l in leads]
    campaign_ids = list({l["ad_campaign_id"] for l in leads if l.get("ad_campaign_id")})

    campaign_map = _fetch_campaign_names(db, tenant_id, campaign_ids)
    keyword_map = _fetch_first_keywords(db, tenant_id, lead_ids)
    enriched = _enrich(leads, campaign_map, keyword_map)

    return {"data": enriched, "total": total, "page": page, "limit": limit}


@router.get("/export")
async def export_meta_ad_leads(
    ad_campaign_id: str | None = Query(None),
    source: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tenant_id: str = Depends(get_tenant_id),
):
    """
    CSV export for Meta Ad leads.
    Columns: Phone | Name | Channel | Keyword (First Message) |
             Ad Campaign | Date Joined (IST) | Segment | Score
    Uses UTF-8 BOM so Excel opens it correctly without encoding issues.
    """
    db = get_supabase()

    try:
        leads, _ = _fetch_ad_leads(
            db, tenant_id,
            ad_campaign_id=ad_campaign_id,
            source=source,
            date_from=date_from,
            date_to=date_to,
            limit=5000,
            offset=0,
        )
    except Exception as e:
        logger.error(f"meta-ad-leads export error: {e}")
        leads = []

    FIELDNAMES = [
        "phone", "name", "channel", "keyword",
        "ad_campaign", "date_joined_ist", "segment", "score",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=FIELDNAMES, extrasaction="ignore")
    writer.writeheader()

    if leads:
        lead_ids = [l["id"] for l in leads]
        campaign_ids = list({l["ad_campaign_id"] for l in leads if l.get("ad_campaign_id")})
        campaign_map = _fetch_campaign_names(db, tenant_id, campaign_ids)
        keyword_map = _fetch_first_keywords(db, tenant_id, lead_ids)
        enriched = _enrich(leads, campaign_map, keyword_map)

        for lead in enriched:
            writer.writerow({
                "phone": lead["phone"],
                "name": lead["name"],
                "channel": lead["channel_label"],
                "keyword": lead["keyword"],
                "ad_campaign": lead["campaign_name"],
                "date_joined_ist": _fmt_ist(lead["created_at"]),
                "segment": lead["segment_label"],
                "score": lead["score"],
            })

    filename = "meta_ad_leads.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
