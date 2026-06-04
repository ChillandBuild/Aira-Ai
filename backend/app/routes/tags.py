import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


class TagCreate(BaseModel):
    name: str
    color: str = "#6D28D9"


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


@router.get("/")
def list_tags(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    tags = db.table("broadcast_tags").select("*").eq("tenant_id", tenant_id).order("created_at", desc=False).execute()
    return {"data": tags.data or []}


@router.post("/")
def create_tag(body: TagCreate, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name is required")
    try:
        result = db.table("broadcast_tags").insert({
            "tenant_id": tenant_id,
            "name": name,
            "color": body.color,
        }).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Tag '{name}' already exists")
        raise HTTPException(status_code=500, detail=str(e))
    return {"data": result.data[0] if result.data else None}


@router.patch("/{tag_id}")
def update_tag(tag_id: str, body: TagUpdate, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    update: dict = {}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.color is not None:
        update["color"] = body.color
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = db.table("broadcast_tags").update(update).eq("id", tag_id).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"data": result.data[0]}


@router.delete("/{tag_id}")
def delete_tag(tag_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("broadcast_tags").delete().eq("id", tag_id).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"deleted": True}


@router.get("/stats")
def get_tag_stats(tenant_id: str = Depends(get_tenant_id)):
    """Return per-tag stats: total_sent, hot, warm, cold, disqualified, opted_out counts."""
    db = get_supabase()

    tags = db.table("broadcast_tags").select("id").eq("tenant_id", tenant_id).execute()
    tag_ids = [t["id"] for t in (tags.data or [])]
    if not tag_ids:
        return {"data": []}

    # Count sent + failed recipients per tag
    br_rows = (
        db.table("broadcast_recipients")
        .select("tag_id, send_status")
        .eq("tenant_id", tenant_id)
        .in_("tag_id", tag_ids)
        .in_("send_status", ["sent", "failed", "rejected"])
        .execute()
    )
    sent_counts: dict[str, int] = {}
    failed_counts: dict[str, int] = {}
    for br in (br_rows.data or []):
        tid = br.get("tag_id")
        if not tid:
            continue
        if br.get("send_status") == "sent":
            sent_counts[tid] = sent_counts.get(tid, 0) + 1
        else:
            failed_counts[tid] = failed_counts.get(tid, 0) + 1

    # Get distinct sent lead_ids per tag, then join current leads.segment
    sent_lead_rows = (
        db.table("broadcast_recipients")
        .select("tag_id, lead_id")
        .eq("tenant_id", tenant_id)
        .in_("tag_id", tag_ids)
        .eq("send_status", "sent")
        .not_.is_("lead_id", "null")
        .execute()
    )
    tag_lead_ids: dict[str, set] = {}
    all_lead_ids: set[str] = set()
    for row in (sent_lead_rows.data or []):
        tid = row.get("tag_id")
        lid = row.get("lead_id")
        if tid and lid:
            if tid not in tag_lead_ids:
                tag_lead_ids[tid] = set()
            tag_lead_ids[tid].add(lid)
            all_lead_ids.add(lid)

    lead_segment_map: dict[str, str] = {}
    if all_lead_ids:
        leads_resp = (
            db.table("leads")
            .select("id, segment")
            .eq("tenant_id", tenant_id)
            .in_("id", list(all_lead_ids))
            .execute()
        )
        for l in (leads_resp.data or []):
            lead_segment_map[l["id"]] = l.get("segment") or "C"

    hot_counts: dict[str, int] = {}
    warm_counts: dict[str, int] = {}
    cold_counts: dict[str, int] = {}
    dq_counts: dict[str, int] = {}
    for tid, lead_ids in tag_lead_ids.items():
        for lid in lead_ids:
            seg = lead_segment_map.get(lid, "C")
            if seg == "A":
                hot_counts[tid] = hot_counts.get(tid, 0) + 1
            elif seg == "B":
                warm_counts[tid] = warm_counts.get(tid, 0) + 1
            elif seg == "C":
                cold_counts[tid] = cold_counts.get(tid, 0) + 1
            elif seg == "D":
                dq_counts[tid] = dq_counts.get(tid, 0) + 1

    # Count opted-out leads per tag (distinct lead_id where opted_out_at IS NOT NULL)
    oo_rows = (
        db.table("broadcast_recipients")
        .select("tag_id, lead_id")
        .eq("tenant_id", tenant_id)
        .in_("tag_id", tag_ids)
        .filter("opted_out_at", "not.is", "null")
        .execute()
    )
    oo_seen: dict[str, set] = {}
    for r in (oo_rows.data or []):
        tid = r.get("tag_id")
        lid = r.get("lead_id")
        if tid and lid:
            if tid not in oo_seen:
                oo_seen[tid] = set()
            oo_seen[tid].add(lid)
    oo_counts: dict[str, int] = {tid: len(lids) for tid, lids in oo_seen.items()}

    data = []
    for tid in tag_ids:
        data.append({
            "tag_id": tid,
            "total_sent": sent_counts.get(tid, 0),
            "hot": hot_counts.get(tid, 0),
            "warm": warm_counts.get(tid, 0),
            "cold": cold_counts.get(tid, 0),
            "disqualified": dq_counts.get(tid, 0),
            "opted_out": oo_counts.get(tid, 0),
            "failed": failed_counts.get(tid, 0),
        })

    return {"data": data}
