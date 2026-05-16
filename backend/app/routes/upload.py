import csv
import io
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
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
    digits_only = PHONE_RE.sub("", raw.strip())
    if not digits_only:
        return None

    # Strip + and leading zeros
    digits_only = digits_only.lstrip("+").lstrip("0")

    # Indian 10-digit mobile: starts with 6/7/8/9, auto-add +91
    if len(digits_only) == 10 and digits_only[0] in "6789":
        return f"+91{digits_only}"

    # Already has 91 prefix (12 digits): 919876543210 → +919876543210
    if len(digits_only) == 12 and digits_only.startswith("91") and digits_only[2] in "6789":
        return f"+{digits_only}"

    # Has explicit + or other country code — keep as-is
    if raw.strip().startswith("+"):
        result = f"+{digits_only}"
        if 8 <= len(digits_only) <= 15:
            return result
        return None

    # Fallback: add + and validate length
    if 8 <= len(digits_only) <= 15:
        return f"+{digits_only}"
    return None


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
    existing = db.table("leads").select("phone").in_("phone", phones).eq("tenant_id", tenant_id).is_("deleted_at", "null").execute()
    existing_set = {r["phone"] for r in (existing.data or [])}

    soft_deleted = db.table("leads").select("phone,id").in_("phone", phones).eq("tenant_id", tenant_id).not_.is_("deleted_at", "null").execute()
    if soft_deleted.data:
        soft_deleted_phones = [r["phone"] for r in soft_deleted.data]
        db.table("leads").update({"deleted_at": None, "ai_enabled": True}).in_("phone", soft_deleted_phones).eq("tenant_id", tenant_id).execute()
        for phone in soft_deleted_phones:
            if phone in existing_set:
                existing_set.remove(phone)

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
                tenant_id=lead.get("tenant_id") or tenant_id,
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
            sid = await send_whatsapp(phone, campaign_message, tenant_id=tenant_id)
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
    csv_file_url: Optional[str] = None
    csv_file_name: Optional[str] = None


@router.post("/parse")
async def parse_csv(file: UploadFile = File(...), tenant_id: str = Depends(get_tenant_id)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    raw_bytes = await file.read()
    raw = raw_bytes.decode("utf-8-sig", errors="replace")
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
    existing_resp = db.table("leads").select("phone").eq("tenant_id", tenant_id).is_("deleted_at", "null").execute()
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
        if len(preview) < 5:
            preview.append({k.strip(): v for k, v in row.items()})

    csv_file_url = None
    csv_file_name = file.filename
    try:
        import uuid
        safe_filename = file.filename.replace(" ", "_") if file.filename else "upload.csv"
        storage_path = f"{tenant_id}/{uuid.uuid4().hex[:8]}_{safe_filename}"
        db.storage.from_("broadcast-csvs").upload(storage_path, raw_bytes, {"content-type": "text/csv"})
        csv_file_url = db.storage.from_("broadcast-csvs").get_public_url(storage_path)
    except Exception as storage_err:
        logger.exception("Failed to upload CSV to storage")

    return {
        "columns": columns,
        "suggested_mapping": suggested_mapping,
        "total_rows": total_rows,
        "duplicate_count": duplicate_count,
        "preview": preview,
        "csv_file_url": csv_file_url,
        "csv_file_name": csv_file_name,
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
    broadcast_id = str(uuid.uuid4())
    broadcast_timestamp = datetime.now(timezone.utc)

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

    db = get_supabase()
    
    number_rows = (
        db.table("phone_numbers")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("role", "primary")
        .eq("paused_outbound", False)
        .execute()
        .data
    )
    best_number = number_rows[0] if number_rows else await get_best_number(tenant_id)

    if best_number is None:
        raise HTTPException(status_code=503, detail="No primary or healthy number available. Please set a Primary Number.")

    # Download original CSV, add broadcast_id column, re-upload
    if body.csv_file_url:
        try:
            import httpx
            csv_resp = httpx.get(body.csv_file_url, timeout=30)
            if csv_resp.status_code == 200:
                raw_csv = csv_resp.text
                csv_reader = csv.DictReader(io.StringIO(raw_csv))
                if csv_reader.fieldnames:
                    output = io.StringIO()
                    new_fieldnames = list(csv_reader.fieldnames) + ["broadcast_id"]
                    writer = csv.DictWriter(output, fieldnames=new_fieldnames)
                    writer.writeheader()
                    for row in csv_reader:
                        row["broadcast_id"] = broadcast_id
                        writer.writerow(row)
                    modified_csv_bytes = output.getvalue().encode("utf-8")
                    safe_filename = (body.csv_file_name or "broadcast.csv").replace(" ", "_")
                    storage_path = f"{tenant_id}/{broadcast_id[:8]}_{safe_filename}"
                    db.storage.from_("broadcast-csvs").upload(storage_path, modified_csv_bytes, {"content-type": "text/csv"})
                    body.csv_file_url = db.storage.from_("broadcast-csvs").get_public_url(storage_path)
                    logger.info(f"Modified CSV uploaded with broadcast_id column: {storage_path}")
        except Exception as csv_err:
            logger.error(f"Failed to add broadcast_id to CSV: {csv_err}")

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
        db.table("leads").upsert(upsert_rows, on_conflict="tenant_id,phone").execute()
        batch_opt_in_source = _clean_text(eligible[0].opt_in_source) if eligible else "imported"
        batch_phones = [r["phone"] for r in upsert_rows]
        db.table("leads") \
            .update({"opt_in_source": batch_opt_in_source or "imported"}) \
            .in_("phone", batch_phones) \
            .eq("tenant_id", tenant_id) \
            .is_("opt_in_source", "null") \
            .execute()

    all_phones = [_normalize_phone(l.phone or "") for l in eligible if _normalize_phone(l.phone or "")]
    lead_rows = db.table("leads").select("id,phone,name").in_("phone", all_phones).eq("tenant_id", tenant_id).execute()
    phone_to_lead_id = {r["phone"]: r["id"] for r in (lead_rows.data or [])}
    phone_to_lead_name = {r["phone"]: r.get("name") for r in (lead_rows.data or [])}

    opted_out_phones: set[str] = set()
    if all_phones:
        rows = db.table("leads").select("phone").in_("phone", all_phones).eq("tenant_id", tenant_id).eq("opted_out", True).execute()
        opted_out_phones = {r["phone"] for r in (rows.data or [])}

    # Fetch template metadata
    tpl_lang = "en"
    tpl_body = ""
    tpl_row = (
        db.table("message_templates")
        .select("language,body_text")
        .eq("name", body.template_name)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    if tpl_row.data:
        tpl_lang = tpl_row.data[0].get("language") or "en"
        tpl_body = tpl_row.data[0].get("body_text") or ""

    import re as _re
    has_vars = bool(_re.search(r"\{\{\d+\}\}", tpl_body))

    sent = 0
    failed = 0
    recipient_rows = []

    for lead in eligible:
        phone = _normalize_phone(lead.phone or "")
        if not phone:
            continue

        lead_id = phone_to_lead_id.get(phone)
        lead_name = phone_to_lead_name.get(phone)

        if phone in opted_out_phones:
            failed += 1
            recipient_rows.append({
                "tenant_id": tenant_id,
                "broadcast_id": broadcast_id,
                "lead_id": lead_id,
                "phone": phone,
                "name": lead_name,
                "send_status": "opted_out_skip",
            })
            logger.info(f"Bulk-send skipped opted-out lead {phone}")
            continue

        try:
            components: list[dict] = []
            if has_vars:
                lead_name_for_tpl = _clean_text(lead.name) or "Customer"
                components = [{
                    "type": "body",
                    "parameters": [{"type": "text", "text": lead_name_for_tpl}]
                }]

            result = await send_template_message(
                to_number=phone,
                template_name=body.template_name,
                lang_code=tpl_lang,
                components=components,
                phone_number_id=best_number.get("meta_phone_number_id"),
                tenant_id=tenant_id,
            )
            sent += 1
            recipient_rows.append({
                "tenant_id": tenant_id,
                "broadcast_id": broadcast_id,
                "lead_id": lead_id,
                "phone": phone,
                "name": lead_name,
                "send_status": "sent",
            })

            meta_msg_id: str | None = None
            try:
                meta_msg_id = result.get("messages", [{}])[0].get("id")
            except Exception:
                pass

            if lead_id:
                try:
                    msg_row = {
                        "lead_id": lead_id,
                        "tenant_id": tenant_id,
                        "direction": "outbound",
                        "channel": "whatsapp",
                        "content": f"[Template: {body.template_name}]",
                        "is_ai_generated": False,
                    }
                    if meta_msg_id:
                        msg_row["meta_message_id"] = meta_msg_id
                    db.table("messages").insert(msg_row).execute()
                except Exception as db_err:
                    logger.error(f"messages insert failed for {phone}: {db_err}")
        except Exception as e:
            logger.error(f"Bulk-send failed for {phone}: {e}")
            failed += 1
            recipient_rows.append({
                "tenant_id": tenant_id,
                "broadcast_id": broadcast_id,
                "lead_id": lead_id,
                "phone": phone,
                "name": lead_name,
                "send_status": "failed",
            })

    for rej_lead in rejected:
        phone = _normalize_phone(rej_lead.phone or "")
        lead_id = phone_to_lead_id.get(phone)
        lead_name = phone_to_lead_name.get(phone)
        recipient_rows.append({
            "tenant_id": tenant_id,
            "broadcast_id": broadcast_id,
            "lead_id": lead_id,
            "phone": phone,
            "name": lead_name,
            "send_status": "rejected",
        })

    if recipient_rows:
        for i in range(0, len(recipient_rows), 100):
            batch = recipient_rows[i:i+100]
            try:
                db.table("broadcast_recipients").insert(batch).execute()
            except Exception as br_err:
                logger.error(f"broadcast_recipients insert failed: {br_err}")

    if sent > 0:
        await increment_send_count(best_number["id"], delta=sent)

    lead_ids = [phone_to_lead_id.get(p) for p in all_phones if phone_to_lead_id.get(p)]
    delivered_count = 0
    opened_count = 0
    
    if lead_ids:
        try:
            window_start = (broadcast_timestamp - timedelta(minutes=2)).isoformat()
            window_end = (broadcast_timestamp + timedelta(minutes=10)).isoformat()
            
            delivered_rows = db.table("messages") \
                .select("id") \
                .in_("lead_id", lead_ids) \
                .eq("direction", "outbound") \
                .eq("delivery_status", "delivered") \
                .gte("created_at", window_start) \
                .lte("created_at", window_end) \
                .execute()
            delivered_count = len(delivered_rows.data or [])
            
            opened_rows = db.table("messages") \
                .select("id") \
                .in_("lead_id", lead_ids) \
                .eq("direction", "outbound") \
                .eq("delivery_status", "read") \
                .gte("created_at", window_start) \
                .lte("created_at", window_end) \
                .execute()
            opened_count = len(opened_rows.data or [])
        except Exception as e:
            logger.error(f"Failed to query delivery status: {e}")

    try:
        history_key = "broadcast_history"
        existing = (
            db.table("app_settings")
            .select("value")
            .eq("tenant_id", tenant_id)
            .eq("key", history_key)
            .maybe_single()
            .execute()
        )
        
        history: list[dict] = []
        if existing and existing.data and existing.data.get("value"):
            try:
                history = json.loads(existing.data["value"])
            except Exception:
                history = []

        opt_in_src = _clean_text(eligible[0].opt_in_source) if eligible else "unknown"
        total_failed = failed + len(rejected)

        history.insert(0, {
            "broadcast_id": broadcast_id,
            "timestamp": broadcast_timestamp.isoformat(),
            "template_name": body.template_name,
            "opt_in_source": opt_in_src or "unknown",
            "sent": sent,
            "delivered": delivered_count,
            "opened": opened_count,
            "failed": total_failed,
            "total_leads": len(eligible),
            "number_used": best_number.get("number"),
            "csv_file_url": body.csv_file_url,
            "csv_file_name": body.csv_file_name,
        })
        history = history[:50]
        new_value = json.dumps(history)

        db.table("app_settings").upsert({
            "tenant_id": tenant_id,
            "key": history_key,
            "value": new_value,
        }, on_conflict="tenant_id,key").execute()
    except Exception as hist_err:
        logger.exception("broadcast_history save failed")

    return {
        "queued": len(upsert_rows),
        "sent": sent,
        "failed": failed + len(rejected),
        "number_used": best_number.get("number"),
        "broadcast_id": broadcast_id,
    }


@router.get("/failed-csv")
async def get_failed_csv(
    broadcast_id: str = Query(..., description="Broadcast UUID to generate failed CSV for"),
    tenant_id: str = Depends(get_tenant_id),
):
    """Generate a CSV of all failed/unreached/opted-out contacts for a broadcast."""
    db = get_supabase()

    recipients = db.table("broadcast_recipients") \
        .select("lead_id, phone, name, send_status") \
        .eq("tenant_id", tenant_id) \
        .eq("broadcast_id", broadcast_id) \
        .execute()

    if not recipients.data:
        return {"message": "Recipient tracking data not available for this broadcast"}

    lead_ids = [r["lead_id"] for r in recipients.data if r.get("lead_id")]

    opted_out_map = {}
    if lead_ids:
        opted_out_rows = db.table("leads") \
            .select("id, opted_out_at") \
            .in_("id", lead_ids) \
            .eq("opted_out", True) \
            .execute()
        for row in (opted_out_rows.data or []):
            opted_out_map[row["id"]] = row.get("opted_out_at")

    failed_delivery_leads = set()
    if lead_ids:
        failed_msg_rows = db.table("messages") \
            .select("lead_id") \
            .in_("lead_id", lead_ids) \
            .eq("direction", "outbound") \
            .eq("delivery_status", "failed") \
            .execute()
        for row in (failed_msg_rows.data or []):
            failed_delivery_leads.add(row["lead_id"])

    broadcast_timestamp = None
    try:
        history_row = db.table("app_settings") \
            .select("value") \
            .eq("tenant_id", tenant_id) \
            .eq("key", "broadcast_history") \
            .maybe_single() \
            .execute()
        if history_row and history_row.data and history_row.data.get("value"):
            history = json.loads(history_row.data["value"])
            for record in history:
                if record.get("broadcast_id") == broadcast_id:
                    broadcast_timestamp = record.get("timestamp")
                    break
    except Exception:
        pass

    if not broadcast_timestamp:
        broadcast_timestamp = datetime.now(timezone.utc).isoformat()

    failed_rows = []
    seen_phones = set()

    for r in recipients.data:
        phone = r.get("phone", "")
        name = r.get("name") or ""
        send_status = r.get("send_status", "")
        lead_id = r.get("lead_id")

        reason = None
        opted_out_at = None

        if send_status in ("failed", "rejected"):
            reason = send_status
        elif lead_id in failed_delivery_leads:
            reason = "failed"
        elif lead_id in opted_out_map:
            reason = "not_interested"
            opted_out_at = opted_out_map[lead_id]

        if reason and phone not in seen_phones:
            seen_phones.add(phone)
            failed_rows.append({
                "phone": phone,
                "name": name,
                "reason": reason,
                "opted_out_at": opted_out_at or "",
                "broadcast_id": broadcast_id,
                "broadcast_timestamp": broadcast_timestamp,
            })

    if not failed_rows:
        return Response(content="No failures detected", media_type="text/plain")

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["phone", "name", "reason", "opted_out_at", "broadcast_id", "broadcast_timestamp"])
    writer.writeheader()
    for row in failed_rows:
        writer.writerow(row)

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=failed_{broadcast_id[:8]}.csv"
        }
    )


@router.get("/history")
async def get_broadcast_history(tenant_id: str = Depends(get_tenant_id)):
    """Return the last 50 broadcast records stored in app_settings."""
    db = get_supabase()
    row = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", "broadcast_history")
        .maybe_single()
        .execute()
    )
    history: list[dict] = []
    if row and row.data and row.data.get("value"):
        try:
            history = json.loads(row.data["value"])
        except Exception:
            history = []
    return {"data": history}


def _refresh_delivered_opened_timewindow(db, record, tenant_id, window_start, window_end):
    """Update delivered/opened counts via time-window fallback (legacy/compat)."""
    delivered_rows = db.table("messages") \
        .select("id") \
        .eq("tenant_id", tenant_id) \
        .eq("direction", "outbound") \
        .eq("delivery_status", "delivered") \
        .gte("created_at", window_start) \
        .lte("created_at", window_end) \
        .execute()
    record["delivered"] = len(delivered_rows.data or [])
    
    opened_rows = db.table("messages") \
        .select("id") \
        .eq("tenant_id", tenant_id) \
        .eq("direction", "outbound") \
        .eq("delivery_status", "read") \
        .gte("created_at", window_start) \
        .lte("created_at", window_end) \
        .execute()
    record["opened"] = len(opened_rows.data or [])


@router.post("/history/refresh")
async def refresh_broadcast_metrics(tenant_id: str = Depends(get_tenant_id)):
    """Re-query delivery status for all broadcasts and update history."""
    db = get_supabase()
    
    row = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", "broadcast_history")
        .maybe_single()
        .execute()
    )
    
    if not row or not row.data or not row.data.get("value"):
        return {"refreshed": 0}
    
    try:
        history = json.loads(row.data["value"])
    except Exception:
        return {"refreshed": 0}
    
    refreshed_count = 0
    
    for record in history:
        try:
            broadcast_id = record.get("broadcast_id")
            record_time = datetime.fromisoformat(record["timestamp"])
            window_start = (record_time - timedelta(minutes=2)).isoformat()
            window_end = (record_time + timedelta(minutes=10)).isoformat()
            
            if broadcast_id:
                recipients = db.table("broadcast_recipients") \
                    .select("lead_id, phone, send_status") \
                    .eq("tenant_id", tenant_id) \
                    .eq("broadcast_id", broadcast_id) \
                    .execute()
                
                if recipients.data:
                    lead_ids = [r["lead_id"] for r in recipients.data if r.get("lead_id")]
                    
                    # Get delivery status from messages (scoped by lead_ids + time window)
                    msg_status_by_lead = {}
                    if lead_ids:
                        msg_rows = db.table("messages") \
                            .select("lead_id, delivery_status") \
                            .in_("lead_id", lead_ids) \
                            .eq("direction", "outbound") \
                            .gte("created_at", window_start) \
                            .lte("created_at", window_end) \
                            .execute()
                        for msg in (msg_rows.data or []):
                            lid = msg["lead_id"]
                            status = msg.get("delivery_status")
                            if lid not in msg_status_by_lead:
                                msg_status_by_lead[lid] = status
                            else:
                                priority = {"failed": 0, "sent": 1, "delivered": 2, "read": 3}
                                if priority.get(status, 0) > priority.get(msg_status_by_lead[lid], 0):
                                    msg_status_by_lead[lid] = status
                    
                    # Get opted-out leads
                    opted_out_lead_ids = set()
                    if lead_ids:
                        opted_rows = db.table("leads") \
                            .select("id") \
                            .in_("id", lead_ids) \
                            .eq("opted_out", True) \
                            .execute()
                        for row in (opted_rows.data or []):
                            opted_out_lead_ids.add(row["id"])
                    
                    # Recalculate all 4 metrics
                    sent_count = 0
                    delivered_count = 0
                    opened_count = 0
                    failed_count = 0
                    
                    for r in recipients.data:
                        send_status = r.get("send_status", "")
                        lead_id = r.get("lead_id")
                        
                        if send_status in ("failed", "rejected", "opted_out_skip"):
                            failed_count += 1
                            continue
                        
                        if lead_id in opted_out_lead_ids:
                            failed_count += 1
                            continue
                        
                        delivery_status = msg_status_by_lead.get(lead_id)
                        if delivery_status == "failed":
                            failed_count += 1
                        elif delivery_status == "delivered":
                            sent_count += 1
                            delivered_count += 1
                        elif delivery_status == "read":
                            sent_count += 1
                            opened_count += 1
                        # else: in-flight (no delivery webhook yet) — not counted
                    
                    record["sent"] = sent_count
                    record["delivered"] = delivered_count
                    record["opened"] = opened_count
                    record["failed"] = failed_count
                else:
                    # broadcast_id exists but no recipients yet — fallback to time-window
                    _refresh_delivered_opened_timewindow(db, record, tenant_id, window_start, window_end)
            else:
                # Legacy record without broadcast_id — fallback to time-window
                _refresh_delivered_opened_timewindow(db, record, tenant_id, window_start, window_end)
            
            refreshed_count += 1
        except Exception as e:
            logger.error(f"Failed to refresh broadcast record: {e}")
            continue
    
    # Save updated history
    db.table("app_settings").upsert({
        "tenant_id": tenant_id,
        "key": "broadcast_history",
        "value": json.dumps(history),
    }, on_conflict="tenant_id,key").execute()
    
    return {"refreshed": refreshed_count}
