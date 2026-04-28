import csv
import io
import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.ai_reply import send_whatsapp
from app.services.growth import get_or_create_campaign, record_stage_event, sync_follow_up_jobs
from app.services.meta_cloud import send_template_message
from app.services.outbound_router import get_best_number, increment_send_count

logger = logging.getLogger(__name__)
router = APIRouter()

PHONE_RE = re.compile(r"[^\d+]")


def _normalize_phone(raw: str) -> str | None:
    if not raw:
        return None
    cleaned = PHONE_RE.sub("", raw.strip())
    if not cleaned:
        return None
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned.lstrip("+")
    digits = cleaned.lstrip("+")
    if len(digits) < 8 or len(digits) > 15:
        return None
    return cleaned


def _clean_text(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def _to_float(value: str | None) -> float | None:
    text = _clean_text(value)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid numeric value: {text}")


def _value_for(row: dict, fieldmap: dict[str, str], key: str, fallback: str | None = None) -> str | None:
    csv_key = fieldmap.get(key)
    if csv_key:
        return _clean_text(row.get(csv_key))
    return _clean_text(fallback)


@router.post("/leads")
async def upload_leads(
    file: UploadFile = File(...),
    campaign_message: str | None = Form(None),
    segment_override: str | None = Form(None),
    platform: str | None = Form(None),
    campaign_name: str | None = Form(None),
    external_campaign_id: str | None = Form(None),
    ad_set_name: str | None = Form(None),
    external_ad_set_id: str | None = Form(None),
    ad_name: str | None = Form(None),
    external_ad_id: str | None = Form(None),
    utm_source: str | None = Form(None),
    utm_campaign: str | None = Form(None),
    utm_content: str | None = Form(None),
    spend_inr: str | None = Form(None),
    tenant_id: str = Depends(get_tenant_id),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")
    if segment_override and segment_override not in {"A", "B", "C", "D"}:
        raise HTTPException(status_code=400, detail="segment_override must be A/B/C/D")

    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames or "phone" not in [f.strip().lower() for f in reader.fieldnames]:
        raise HTTPException(status_code=400, detail="CSV must contain a 'phone' column")

    db = get_supabase()
    fieldmap = {f.strip().lower(): f for f in reader.fieldnames}
    rows_by_phone: dict[str, dict] = {}
    campaign_cache: dict[tuple[str | None, str | None, str | None, float | None], dict | None] = {}
    spend_default = _to_float(spend_inr)
    for row in reader:
        phone = _normalize_phone(row.get(fieldmap.get("phone", "phone"), ""))
        if not phone:
            continue
        name_key = fieldmap.get("name")
        row_platform = _value_for(row, fieldmap, "platform", platform)
        row_campaign_name = _value_for(row, fieldmap, "campaign_name", campaign_name)
        row_external_campaign_id = _value_for(row, fieldmap, "external_campaign_id", external_campaign_id)
        row_ad_set_name = _value_for(row, fieldmap, "ad_set_name", ad_set_name)
        row_external_ad_set_id = _value_for(row, fieldmap, "external_ad_set_id", external_ad_set_id)
        row_ad_name = _value_for(row, fieldmap, "ad_name", ad_name)
        row_external_ad_id = _value_for(row, fieldmap, "external_ad_id", external_ad_id)
        row_utm_source = _value_for(row, fieldmap, "utm_source", utm_source)
        row_utm_campaign = _value_for(row, fieldmap, "utm_campaign", utm_campaign)
        row_utm_content = _value_for(row, fieldmap, "utm_content", utm_content)
        row_spend = _to_float(_value_for(row, fieldmap, "spend_inr", spend_inr)) if fieldmap.get("spend_inr") else spend_default

        payload = {
            "phone": phone,
            "name": (row.get(name_key) or "").strip() or None if name_key else None,
            "source": "upload",
            "score": 5,
            "segment": segment_override or "C",
            "tenant_id": tenant_id,
        }
        campaign_key = (row_platform, row_campaign_name, row_external_campaign_id, row_spend)
        campaign = None
        if any(campaign_key[:3]):
            if campaign_key not in campaign_cache:
                campaign_cache[campaign_key] = get_or_create_campaign(
                    db,
                    platform=row_platform,
                    campaign_name=row_campaign_name,
                    external_campaign_id=row_external_campaign_id,
                    spend_inr=row_spend,
                )
            campaign = campaign_cache[campaign_key]
        if campaign:
            payload.update(
                {
                    "ad_campaign_id": campaign["id"],
                    "ad_set_name": row_ad_set_name,
                    "external_ad_set_id": row_external_ad_set_id,
                    "ad_name": row_ad_name,
                    "external_ad_id": row_external_ad_id,
                    "utm_source": row_utm_source,
                    "utm_campaign": row_utm_campaign,
                    "utm_content": row_utm_content,
                }
            )
        rows_by_phone[phone] = payload

    if not rows_by_phone:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    phones = list(rows_by_phone.keys())
    existing = db.table("leads").select("phone").in_("phone", phones).eq("tenant_id", tenant_id).execute()
    existing_set = {r["phone"] for r in (existing.data or [])}

    to_insert = [rows_by_phone[p] for p in phones if p not in existing_set]
    inserted = 0
    attributed = 0
    for i in range(0, len(to_insert), 100):
        batch = to_insert[i : i + 100]
        result = db.table("leads").insert(batch).execute()
        inserted += len(result.data or [])
        for lead in (result.data or []):
            if lead.get("ad_campaign_id"):
                attributed += 1
            record_stage_event(
                lead["id"],
                to_segment=lead.get("segment") or "C",
                event_type="created",
                metadata={"source": "upload"},
                db=db,
            )
            sync_follow_up_jobs(
                lead["id"],
                segment=lead.get("segment"),
                phone=lead.get("phone"),
                converted_at=lead.get("converted_at"),
                ai_enabled=lead.get("ai_enabled", True),
                reason="upload",
                db=db,
            )

    sent = 0
    failed = 0
    if campaign_message:
        for phone in phones:
            sid = await send_whatsapp(phone, campaign_message)
            if sid:
                sent += 1
                lead = db.table("leads").select("id").eq("phone", phone).limit(1).execute()
                if lead.data:
                    db.table("messages").insert({
                        "lead_id": lead.data[0]["id"],
                        "tenant_id": tenant_id,
                        "direction": "outbound",
                        "channel": "whatsapp",
                        "content": campaign_message,
                        "is_ai_generated": False,
                        "meta_message_id": sid,
                    }).execute()
            else:
                failed += 1

    return {
        "total": len(phones),
        "inserted": inserted,
        "skipped": len(phones) - inserted,
        "attributed": min(attributed, inserted),
        "campaign_sent": sent,
        "campaign_failed": failed,
    }


_OPTIN_MAP = {
    "click_to_wa_ad": ("marketing", True),
    "website_form": ("marketing", True),
    "offline_event": ("utility", True),
    "previous_enquiry": ("utility", True),
    "imported": ("utility", True),
    "manual": ("blocked", False),
}

_OPTIN_MESSAGES = {
    "marketing": "Leads from this source can receive WhatsApp marketing templates.",
    "utility": "Leads from this source can receive WhatsApp utility templates.",
    "blocked": "Leads without explicit consent cannot receive WhatsApp messages. Use call-only outreach.",
}


class OptInRequest(BaseModel):
    opt_in_source: str


class BulkLeadItem(BaseModel):
    phone: str
    name: Optional[str] = None
    opt_in_source: Optional[str] = None


class BulkSendRequest(BaseModel):
    leads: list[BulkLeadItem]
    template_name: str
    schedule_type: str
    schedule_at: Optional[str] = None
    drip_days: Optional[int] = None


@router.post("/parse")
async def parse_csv(file: UploadFile = File(...), tenant_id: str = Depends(get_tenant_id)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    columns = [f.strip() for f in reader.fieldnames]
    suggested_mapping: dict[str, str | None] = {"name": None, "phone": None, "email": None, "course": None}
    for col in columns:
        col_lower = col.lower()
        for key in suggested_mapping:
            if key in col_lower and suggested_mapping[key] is None:
                suggested_mapping[key] = col

    db = get_supabase()
    existing_resp = db.table("leads").select("phone").eq("tenant_id", tenant_id).execute()
    existing_phones = {r["phone"] for r in (existing_resp.data or []) if r.get("phone")}

    rows = list(reader)
    total_rows = len(rows)
    duplicate_count = 0
    preview: list[dict] = []

    phone_col = suggested_mapping.get("phone")
    for row in rows:
        raw_phone = row.get(phone_col, "") if phone_col else ""
        normalized = _normalize_phone(raw_phone or "")
        if normalized and normalized in existing_phones:
            duplicate_count += 1
        if len(preview) < 3:
            preview.append({k.strip(): v for k, v in row.items()})

    return {
        "columns": columns,
        "suggested_mapping": suggested_mapping,
        "total_rows": total_rows,
        "duplicate_count": duplicate_count,
        "preview": preview,
    }


@router.post("/validate-optin")
async def validate_optin(body: OptInRequest):
    source = (body.opt_in_source or "").strip().lower()
    template_type, allowed = _OPTIN_MAP.get(source, ("blocked", False))
    return {
        "allowed": allowed,
        "template_type": template_type,
        "message": _OPTIN_MESSAGES.get(template_type, "Unknown opt-in source."),
    }


@router.post("/bulk-send")
async def bulk_send(body: BulkSendRequest, tenant_id: str = Depends(get_tenant_id)):
    eligible = []
    rejected = []
    for lead in body.leads:
        source = (lead.opt_in_source or "").strip().lower()
        if not source or source == "manual":
            rejected.append(lead)
        else:
            eligible.append(lead)

    if not eligible:
        raise HTTPException(status_code=400, detail="No eligible leads")

    best_number = await get_best_number()
    if best_number is None:
        raise HTTPException(status_code=503, detail="No healthy number available")

    db = get_supabase()
    upsert_rows = []
    for lead in eligible:
        phone = _normalize_phone(lead.phone or "")
        if not phone:
            rejected.append(lead)
            continue
        upsert_rows.append({
            "phone": phone,
            "name": _clean_text(lead.name),
            "source": "upload",
            "score": 5,
            "segment": "C",
            "tenant_id": tenant_id,
        })

    if upsert_rows:
        db.table("leads").upsert(upsert_rows, on_conflict="phone").execute()

    all_phones = [_normalize_phone(l.phone or "") for l in eligible if _normalize_phone(l.phone or "")]
    opted_out_phones: set[str] = set()
    if all_phones:
        rows = db.table("leads").select("phone").in_("phone", all_phones).eq("tenant_id", tenant_id).eq("opted_out", True).execute()
        opted_out_phones = {r["phone"] for r in (rows.data or [])}

    sent = 0
    failed = 0
    for lead in eligible:
        phone = _normalize_phone(lead.phone or "")
        if not phone:
            continue
        if phone in opted_out_phones:
            failed += 1
            logger.info(f"Bulk-send skipped opted-out lead {phone}")
            continue
        try:
            await send_template_message(
                to_number=phone,
                template_name=body.template_name,
                lang_code="en",
                components=[],
                phone_number_id=best_number.get("meta_phone_number_id"),
            )
            sent += 1
        except Exception as e:
            logger.error(f"Bulk-send failed for {phone}: {e}")
            failed += 1

    if sent > 0:
        await increment_send_count(best_number["id"])

    return {
        "queued": len(upsert_rows),
        "sent": sent,
        "failed": failed,
        "rejected": len(rejected),
        "number_used": best_number["number"],
    }
