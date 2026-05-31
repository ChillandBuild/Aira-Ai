"""
CTWA Leads — Click-to-WhatsApp / Meta Ad Inbound Leads
Returns leads that arrived via a Meta Ad click (ad_campaign_id IS NOT NULL),
enriched with the first inbound message (keyword) and ad campaign name.

Segregation rule:
  - ad_campaign_id IS NOT NULL  →  came via a Meta Ad (CTWA / IG DM / FB Messenger ad)
  - ad_campaign_id IS NULL      →  organic / direct inbound (no ad attribution)
"""

import csv
import io
import logging
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()

CHANNEL_LABELS = {
    "whatsapp": "WhatsApp (CTWA)",
    "instagram": "Instagram DM Ad",
    "facebook": "Facebook Messenger Ad",
    "telegram": "Telegram",
    "upload": "Upload",
    "manual": "Manual",
}

SEGMENT_LABELS = {
    "A": "Hot",
    "B": "Warm",
    "C": "Cold",
    "D": "Disqualified",
}


def _fetch_ctwa_leads(
    db,
    tenant_id: str,
    ad_campaign_id: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 200,
    offset: int = 0,
):
    """
    Fetch leads with ad_campaign_id IS NOT NULL (Meta Ad leads).
    Joins ad_campaigns for campaign name.
    Returns list of dicts.
    """
    # Fetch ad leads with campaign info
    query = (
        db.table("leads")
        .select(
            "id,phone,name,source,score,segment,created_at,"
            "ad_campaign_id,ad_campaigns(campaign_name,platform)"
        )
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

    result = (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data or []


def _fetch_first_messages(db, tenant_id: str, lead_ids: list[str]) -> dict[str, str]:
    """
    For each lead_id, fetch the first inbound message (the CTA keyword).
    Returns a dict: lead_id -> first message content.
    """
    if not lead_ids:
        return {}

    # Fetch all inbound messages for these leads ordered by created_at asc
    result = (
        db.table("messages")
        .select("lead_id,content,created_at")
        .in_("lead_id", lead_ids)
        .eq("tenant_id", tenant_id)
        .eq("direction", "inbound")
        .order("created_at", desc=False)
        .execute()
    )

    # Keep only the first message per lead
    keyword_map: dict[str, str] = {}
    for msg in (result.data or []):
        lid = msg["lead_id"]
        if lid not in keyword_map:
            keyword_map[lid] = msg["content"] or ""
    return keyword_map


def _fetch_campaigns(db, tenant_id: str) -> list[dict]:
    """Return all ad campaigns for this tenant (for filter dropdown)."""
    result = (
        db.table("ad_campaigns")
        .select("id,campaign_name,platform")
        .eq("tenant_id", tenant_id)
        .order("campaign_name")
        .execute()
    )
    return result.data or []


def _enrich_leads(leads: list[dict], keyword_map: dict[str, str]) -> list[dict]:
    """Attach keyword and channel_label to each lead dict."""
    enriched = []
    for lead in leads:
        campaign_info = lead.get("ad_campaigns") or {}
        lead_copy = {
            "id": lead.get("id"),
            "phone": lead.get("phone") or "—",
            "name": lead.get("name") or "—",
            "source": lead.get("source", "whatsapp"),
            "channel_label": CHANNEL_LABELS.get(lead.get("source", "whatsapp"), lead.get("source", "—")),
            "score": lead.get("score", 5),
            "segment": lead.get("segment", "C"),
            "segment_label": SEGMENT_LABELS.get(lead.get("segment", "C"), lead.get("segment", "C")),
            "created_at": lead.get("created_at", ""),
            "ad_campaign_id": lead.get("ad_campaign_id"),
            "campaign_name": campaign_info.get("campaign_name") or "Unknown Campaign",
            "campaign_platform": campaign_info.get("platform") or lead.get("source", "—"),
            "keyword": keyword_map.get(lead.get("id", ""), "—"),
        }
        enriched.append(lead_copy)
    return enriched


@router.get("/campaigns")
async def list_campaigns(tenant_id: str = Depends(get_tenant_id)):
    """Return all ad campaigns for filter dropdown."""
    db = get_supabase()
    campaigns = _fetch_campaigns(db, tenant_id)
    return {"data": campaigns}


@router.get("/")
async def list_ctwa_leads(
    ad_campaign_id: str | None = Query(None),
    source: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
):
    """
    List leads that came via Meta Ads (ad_campaign_id IS NOT NULL).
    Each row includes: phone, name, channel, keyword (first message),
    campaign name, segment, score, date joined.
    """
    db = get_supabase()
    offset = (page - 1) * limit

    leads = _fetch_ctwa_leads(
        db, tenant_id,
        ad_campaign_id=ad_campaign_id,
        source=source,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )

    if not leads:
        return {"data": [], "total": 0, "page": page, "limit": limit}

    lead_ids = [l["id"] for l in leads]
    keyword_map = _fetch_first_messages(db, tenant_id, lead_ids)
    enriched = _enrich_leads(leads, keyword_map)

    # Count total for pagination
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

    return {
        "data": enriched,
        "total": count_result.count or len(enriched),
        "page": page,
        "limit": limit,
    }


@router.get("/export")
async def export_ctwa_leads(
    ad_campaign_id: str | None = Query(None),
    source: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tenant_id: str = Depends(get_tenant_id),
):
    """
    Download CTWA leads as CSV.
    Columns: Phone, Name, Channel, Keyword (First Message),
             Ad Campaign, Date Joined, Segment, Score
    """
    db = get_supabase()

    # Fetch up to 5000 for export
    leads = _fetch_ctwa_leads(
        db, tenant_id,
        ad_campaign_id=ad_campaign_id,
        source=source,
        date_from=date_from,
        date_to=date_to,
        limit=5000,
        offset=0,
    )

    if not leads:
        # Return empty CSV with headers
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["phone", "name", "channel", "keyword", "ad_campaign", "date_joined", "segment", "score"],
        )
        writer.writeheader()
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=ctwa_leads.csv"},
        )

    lead_ids = [l["id"] for l in leads]
    keyword_map = _fetch_first_messages(db, tenant_id, lead_ids)
    enriched = _enrich_leads(leads, keyword_map)

    output = io.StringIO()
    fieldnames = ["phone", "name", "channel", "keyword", "ad_campaign", "date_joined", "segment", "score"]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for lead in enriched:
        # Format date nicely for Indian locale
        raw_dt = lead.get("created_at", "")
        try:
            from datetime import datetime, timezone, timedelta
            dt = datetime.fromisoformat(raw_dt.replace("Z", "+00:00"))
            ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
            formatted_dt = ist.strftime("%d %b %Y, %I:%M %p IST")
        except Exception:
            formatted_dt = raw_dt

        writer.writerow({
            "phone": lead["phone"],
            "name": lead["name"],
            "channel": lead["channel_label"],
            "keyword": lead["keyword"],
            "ad_campaign": lead["campaign_name"],
            "date_joined": formatted_dt,
            "segment": lead["segment_label"],
            "score": lead["score"],
        })

    # Use utf-8-sig (BOM) so Excel opens it correctly
    filename = "ctwa_leads_ad_traffic.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
