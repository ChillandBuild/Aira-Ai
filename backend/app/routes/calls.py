import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
import httpx
from fastapi import Depends, Query
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel
from app.config import settings
from app.config_dynamic import get_setting
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id, get_tenant_and_role
from app.services.call_scorer import score_from_outcome, recompute_caller_score
from app.services.call_summarizer import transcribe_recording, summarize_call
from app.services.growth import record_stage_event, sync_follow_up_jobs
from app.services.telecmi_client import initiate_click2call
from app.services.voice_router import get_best_voice_number, increment_voice_call_count

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()  # No auth — TeleCMI calls these directly

Outcome = Literal["converted", "callback", "not_interested", "no_answer"]


class InitiateCall(BaseModel):
    lead_id: UUID | None = None
    phone: str | None = None      # manual dial — provide either lead_id or phone
    caller_id: UUID | None = None


class OutcomeUpdate(BaseModel):
    outcome: Outcome
    callback_time: datetime | None = None


@router.post("/initiate")
async def initiate_call(payload: InitiateCall, ctx: dict = Depends(get_tenant_and_role)):
    tenant_id = ctx["tenant_id"]
    role = ctx.get("role")

    telecmi_user_id = get_setting("telecmi_user_id") or settings.telecmi_user_id
    telecmi_secret = get_setting("telecmi_secret") or settings.telecmi_secret
    if not telecmi_user_id or not telecmi_secret:
        raise HTTPException(status_code=400, detail="TeleCMI credentials not configured. Set them in Settings.")

    if not payload.lead_id and not payload.phone:
        raise HTTPException(status_code=400, detail="Provide either lead_id or phone")

    db = get_supabase()

    matched_lead_id: str | None = None
    matched_lead_name: str | None = None

    if payload.lead_id:
        lead = db.table("leads").select("phone,name").eq("id", str(payload.lead_id)).eq("tenant_id", tenant_id).maybe_single().execute()
        if not lead.data:
            raise HTTPException(status_code=404, detail="Lead not found")
        lead_phone = lead.data["phone"]
        matched_lead_id = str(payload.lead_id)
        matched_lead_name = lead.data.get("name")
    else:
        lead_phone = payload.phone
        # try to find a lead by phone so live notes can be linked
        match = db.table("leads").select("id,name").eq("phone", lead_phone).eq("tenant_id", tenant_id).maybe_single().execute()
        if match and match.data:
            matched_lead_id = match.data["id"]
            matched_lead_name = match.data.get("name")

    # Owners can call directly without a caller record; telecallers require their phone
    if role != "owner":
        caller_phone: str | None = None
        if payload.caller_id:
            caller = db.table("callers").select("phone").eq("id", str(payload.caller_id)).eq("tenant_id", tenant_id).maybe_single().execute()
            if caller.data:
                caller_phone = caller.data.get("phone")
        if not caller_phone:
            raise HTTPException(status_code=400, detail="Caller has no phone number configured")

    best_number = await get_best_voice_number()
    if not best_number:
        raise HTTPException(status_code=400, detail="No active voice numbers in pool")

    log_insert = db.table("call_logs").insert({
        "lead_id": str(payload.lead_id) if payload.lead_id else None,
        "caller_id": str(payload.caller_id) if payload.caller_id else None,
        "status": "initiated",
        "tenant_id": tenant_id,
    }).execute()
    call_log_id = log_insert.data[0]["id"]

    try:
        # TeleCMI click-to-call: rings the caller first, then bridges to the lead
        telecmi_callerid = get_setting("telecmi_callerid") or settings.telecmi_callerid or best_number["number"]
        result = await initiate_click2call(
            user_id=telecmi_user_id,
            secret=telecmi_secret,
            to=lead_phone,
            callerid=telecmi_callerid,
            extra_params={"call_log_id": call_log_id},
        )
        request_id = result.get("request_id", "")
    except Exception as e:
        logger.error(f"TeleCMI call failed: {e}")
        db.table("call_logs").update({"status": "failed"}).eq("id", call_log_id).execute()
        raise HTTPException(status_code=502, detail=f"TeleCMI call failed: {e}")

    db.table("call_logs").update({"call_sid": request_id}).eq("id", call_log_id).execute()
    await increment_voice_call_count(best_number["id"])
    return {
        "call_log_id": call_log_id,
        "call_sid": request_id,
        "status": "initiated",
        "lead_id": matched_lead_id,
        "lead_name": matched_lead_name,
    }


# ── TeleCMI CDR Webhook ──────────────────────────────────────────────
# TeleCMI sends JSON CDR to this endpoint after a call completes.
# Configure this URL in your TeleCMI dashboard → SETTINGS → WEBHOOKS.
# URL: https://YOUR-RENDER-URL.onrender.com/api/v1/calls/telecmi-cdr

@public_router.post("/telecmi-cdr")
async def telecmi_cdr(request: Request, background_tasks: BackgroundTasks):
    """Receive Call Detail Record (CDR) from TeleCMI."""
    cdr = await request.json()
    logger.info(f"TeleCMI CDR received: {cdr}")

    status = cdr.get("status")

    # TeleCMI sends separate CDRs for user_missed / user_answered (agent leg).
    # We only process outbound CDRs with a call_log_id embedded in custom.
    if status == "user_missed":
        logger.info("TeleCMI CDR: agent missed the call, updating call log")
        call_log_id = cdr.get("custom")
        if call_log_id and call_log_id != "aira_ai_call":
            db = get_supabase()
            db.table("call_logs").update({
                "status": "missed",
                "outcome": "no_answer",
            }).eq("id", call_log_id).execute()
        return {"ok": True}

    # We embed call_log_id in the `custom` field when initiating the call.
    call_log_id = cdr.get("custom")
    if not call_log_id or call_log_id == "aira_ai_call":
        logger.warning(f"TeleCMI CDR missing call_log_id in custom field, ignoring: {cdr}")
        return {"ok": True}

    db = get_supabase()

    log_row = (
        db.table("call_logs")
        .select("id,caller_id,lead_id")
        .eq("id", call_log_id)
        .maybe_single()
        .execute()
    )
    if not log_row.data:
        logger.warning(f"TeleCMI CDR: no call_log found for id={call_log_id}")
        return {"ok": True}

    call_log_id = log_row.data["id"]
    updates: dict = {}

    # TeleCMI final CDR statuses: "answered", "missed", "user_missed"
    if status == "answered":
        updates["status"] = "completed"
        answered_sec = cdr.get("answeredsec") or cdr.get("bilsec")
        if answered_sec is not None:
            try:
                updates["duration_seconds"] = int(answered_sec)
            except (ValueError, TypeError):
                pass
    elif status in ("missed", "no_answer"):
        updates["status"] = "no_answer"
        updates["outcome"] = "no_answer"
    else:
        updates["status"] = "failed"

    # Handle recording if present
    recording_filename = cdr.get("filename")
    if recording_filename:
        recording_base_url = get_setting("telecmi_recording_base_url") or ""
        if recording_base_url:
            full_url = f"{recording_base_url.rstrip('/')}/{recording_filename}"
            updates["recording_url"] = full_url
            background_tasks.add_task(_process_telecmi_recording, call_log_id, full_url)

    if updates:
        db.table("call_logs").update(updates).eq("id", call_log_id).execute()

    # Recompute caller score on terminal statuses
    if updates.get("status") in ("completed", "no_answer"):
        row = log_row.data
        score = score_from_outcome(updates.get("outcome"), updates.get("duration_seconds"))
        db.table("call_logs").update({"score": score}).eq("id", call_log_id).execute()
        if row.get("caller_id"):
            recompute_caller_score(row["caller_id"], db)

    return {"ok": True}


# ── TeleCMI Live Events Webhook ───────────────────────────────────────
# Optional: receive real-time call status events (started, answered, hangup)

@public_router.post("/telecmi-events")
async def telecmi_live_events(request: Request):
    """Receive live call events from TeleCMI (optional — for real-time UI updates)."""
    event = await request.json()
    logger.info(f"TeleCMI event: status={event.get('status')}, request_id={event.get('request_id')}")
    # Can be used for real-time call status updates in the future
    return {"ok": True}


# ── Recording Processing ─────────────────────────────────────────────

async def _process_telecmi_recording(call_log_id: str, recording_url: str) -> None:
    """Download TeleCMI recording and run AI summarization."""
    db = get_supabase()

    for attempt in range(1, 4):
        delay = 10 * attempt
        logger.info(f"Recording download attempt {attempt}/3 for {call_log_id} — waiting {delay}s")
        await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(recording_url)
                if resp.status_code == 404:
                    logger.warning(f"Recording not ready yet (attempt {attempt}): {recording_url}")
                    continue
                resp.raise_for_status()
                audio_bytes = resp.content

            storage_path = f"{call_log_id}.mp3"
            db.storage.from_("call-recordings").upload(
                storage_path,
                audio_bytes,
                {"content-type": "audio/mpeg", "upsert": "true"},
            )
            public_url = db.storage.from_("call-recordings").get_public_url(storage_path)
            db.table("call_logs").update({"recording_url": public_url}).eq("id", call_log_id).execute()
            logger.info(f"Recording saved for {call_log_id}: {public_url}")

            # Run AI summarization
            await _run_summarization(call_log_id, public_url)
            return

        except Exception as e:
            logger.error(f"Recording attempt {attempt} failed for {call_log_id}: {e}")

    logger.error(f"All recording attempts failed for {call_log_id}")


async def _run_summarization(call_log_id: str, recording_url: str) -> None:
    try:
        transcript = await transcribe_recording(recording_url)
        if not transcript:
            return
        summary = await summarize_call(transcript)
        db = get_supabase()
        db.table("call_logs").update({
            "transcript": transcript,
            "ai_summary": summary,
        }).eq("id", call_log_id).execute()
        if summary.get("next_action"):
            log_row = db.table("call_logs").select("lead_id").eq("id", call_log_id).maybe_single().execute()
            lead_id = (log_row.data or {}).get("lead_id")
            if lead_id:
                db.table("lead_notes").insert({
                    "lead_id": lead_id,
                    "call_log_id": call_log_id,
                    "content": f"AI Summary: {summary.get('next_action', '')}",
                    "structured": summary,
                    "is_pinned": False,
                }).execute()
        logger.info(f"Summarization complete for {call_log_id}")
    except Exception as e:
        logger.error(f"Summarization failed for {call_log_id}: {e}")


# ── Outcome & Other Endpoints (unchanged) ────────────────────────────

@router.patch("/{call_log_id}/outcome")
async def set_outcome(call_log_id: str, payload: OutcomeUpdate):
    db = get_supabase()
    log = (
        db.table("call_logs")
        .select("caller_id,duration_seconds,lead_id")
        .eq("id", call_log_id)
        .maybe_single()
        .execute()
    )
    if not log.data:
        raise HTTPException(status_code=404, detail="Call log not found")

    score = score_from_outcome(payload.outcome, log.data.get("duration_seconds"))
    db.table("call_logs").update({
        "outcome": payload.outcome,
        "score": score,
    }).eq("id", call_log_id).execute()

    new_caller_score = None
    if log.data.get("caller_id"):
        new_caller_score = recompute_caller_score(log.data["caller_id"], db)

    lead_id = log.data.get("lead_id")
    if lead_id:
        lead = (
            db.table("leads")
            .select("segment,phone,ai_enabled,converted_at,tenant_id")
            .eq("id", str(lead_id))
            .maybe_single()
            .execute()
        )
        lead_data = lead.data or {}
        if lead_data:
            lead_updates: dict[str, str | None] = {}
            target_segment = lead_data.get("segment")
            event_type = "call_outcome"
            if payload.outcome == "converted":
                target_segment = "A"
                lead_updates["segment"] = "A"
                lead_updates["converted_at"] = datetime.now(timezone.utc).isoformat()
                event_type = "converted"
            elif payload.outcome == "callback":
                if (lead_data.get("segment") or "D") not in {"A", "B"}:
                    target_segment = "B"
                    lead_updates["segment"] = "B"
            elif payload.outcome == "not_interested":
                target_segment = "D"
                lead_updates["segment"] = "D"

            if lead_updates:
                updated_lead = db.table("leads").update(lead_updates).eq("id", str(lead_id)).execute()
                if updated_lead.data:
                    lead_data = updated_lead.data[0]
            if target_segment and target_segment != lead.data.get("segment"):
                record_stage_event(
                    str(lead_id),
                    from_segment=lead.data.get("segment"),
                    to_segment=target_segment,
                    event_type=event_type,
                    metadata={"outcome": payload.outcome},
                    tenant_id=lead_data.get("tenant_id"),
                    db=db,
                )
            sync_follow_up_jobs(
                str(lead_id),
                segment=lead_data.get("segment") or target_segment,
                phone=lead_data.get("phone"),
                converted_at=lead_data.get("converted_at"),
                ai_enabled=lead_data.get("ai_enabled", True),
                reason=f"call_{payload.outcome}",
                db=db,
            )
            if payload.outcome == "callback" and payload.callback_time:
                job = (
                    db.table("follow_up_jobs")
                    .select("id")
                    .eq("lead_id", str(lead_id))
                    .eq("status", "pending")
                    .order("scheduled_for")
                    .limit(1)
                    .execute()
                )
                if job.data:
                    db.table("follow_up_jobs").update({
                        "scheduled_for": payload.callback_time.isoformat(),
                    }).eq("id", job.data[0]["id"]).execute()

    return {
        "call_log_id": call_log_id,
        "outcome": payload.outcome,
        "score": score,
        "caller_overall_score": new_caller_score,
    }


@router.get("/recent-by-leads")
async def recent_by_leads(lead_ids: str = Query(..., description="Comma-separated lead UUIDs, max 50")):
    ids = [i.strip() for i in lead_ids.split(",") if i.strip()][:50]
    if not ids:
        return {}
    db = get_supabase()
    rows = (
        db.table("call_logs")
        .select("lead_id,created_at")
        .in_("lead_id", ids)
        .order("created_at", desc=True)
        .execute()
    )
    seen: dict[str, str] = {}
    for row in rows.data or []:
        lid = row["lead_id"]
        if lid not in seen:
            seen[lid] = row["created_at"]
    return seen


@router.post("/backfill-summaries")
async def backfill_summaries(background_tasks: BackgroundTasks, limit: int = Query(10, ge=1, le=50)):
    """Re-run summarization on call logs that have recording_url but no ai_summary."""
    db = get_supabase()
    rows = (
        db.table("call_logs")
        .select("id,recording_url")
        .not_.is_("recording_url", "null")
        .is_("ai_summary", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []

    for row in rows:
        background_tasks.add_task(_run_summarization, row["id"], row["recording_url"])

    return {"queued": len(rows)}


@router.delete("/{call_log_id}")
async def delete_call_log(call_log_id: str):
    db = get_supabase()
    result = db.table("call_logs").delete().eq("id", call_log_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call log not found")
    return {"deleted": True}
