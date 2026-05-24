"""Link click tracking routes.

  - GET /l/{short_code}        public — 302 to long URL, logs click
  - GET /api/v1/links/         authed — list tenant's tracked links + click counts
  - GET /api/v1/links/{id}/clicks  authed — recent click events for a link
  - GET /api/v1/links/summary  authed — aggregated stats (clicks per campaign/template)
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.link_shortener import log_click

logger = logging.getLogger(__name__)

router = APIRouter()          # authed — mounted at /api/v1/links
public_router = APIRouter()   # no auth — mounted at /l


@public_router.get("/{short_code}")
async def redirect_short_link(short_code: str, request: Request):
    ip = request.client.host if request.client else None
    if "x-forwarded-for" in request.headers:
        ip = request.headers["x-forwarded-for"].split(",")[0].strip() or ip
    link = log_click(
        short_code=short_code,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
        referer=request.headers.get("referer"),
    )
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return RedirectResponse(url=link["long_url"], status_code=302)


@router.get("/")
async def list_links(
    tenant_id: str = Depends(get_tenant_id),
    limit: int = 100,
    campaign: Optional[str] = None,
    broadcast_id: Optional[str] = None,
):
    db = get_supabase()
    q = (
        db.table("link_shortener")
        .select("id,short_code,long_url,campaign,template_name,broadcast_id,lead_id,total_clicks,last_click_at,created_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(min(limit, 500))
    )
    if campaign:
        q = q.eq("campaign", campaign)
    if broadcast_id:
        q = q.eq("broadcast_id", broadcast_id)
    rows = q.execute()
    return {"data": rows.data or []}


@router.get("/summary")
async def link_summary(tenant_id: str = Depends(get_tenant_id)):
    """Aggregate clicks per campaign and per template."""
    db = get_supabase()
    rows = (
        db.table("link_shortener")
        .select("campaign,template_name,total_clicks")
        .eq("tenant_id", tenant_id)
        .execute()
    )
    by_campaign: dict[str, int] = {}
    by_template: dict[str, int] = {}
    total = 0
    for r in (rows.data or []):
        c = r.get("total_clicks") or 0
        total += c
        if r.get("campaign"):
            by_campaign[r["campaign"]] = by_campaign.get(r["campaign"], 0) + c
        if r.get("template_name"):
            by_template[r["template_name"]] = by_template.get(r["template_name"], 0) + c
    return {
        "total_clicks": total,
        "by_campaign": [{"campaign": k, "clicks": v} for k, v in sorted(by_campaign.items(), key=lambda x: -x[1])],
        "by_template": [{"template": k, "clicks": v} for k, v in sorted(by_template.items(), key=lambda x: -x[1])],
    }


@router.get("/{link_id}/clicks")
async def list_clicks(link_id: str, tenant_id: str = Depends(get_tenant_id), limit: int = 100):
    db = get_supabase()
    rows = (
        db.table("link_clicks")
        .select("id,lead_id,clicked_at,user_agent,referer")
        .eq("link_id", link_id)
        .eq("tenant_id", tenant_id)
        .order("clicked_at", desc=True)
        .limit(min(limit, 500))
        .execute()
    )
    return {"data": rows.data or []}
