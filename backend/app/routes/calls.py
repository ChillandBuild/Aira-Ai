import logging
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote
from uuid import UUID
import httpx
from fastapi import Query
from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Response
from pydantic import BaseModel
from twilio.rest import Client as TwilioClient
from app.config import settings
from app.config_dynamic import get_setting
from app.db.supabase import get_supabase
from app.services.call_scorer import score_from_outcome, recompute_caller_score
from app.services.call_summarizer import transcribe_recording, summarize_call
from app.services.growth import record_stage_event, sync_follow_up_jobs
from app.services.voice_router import get_best_voice_number, increment_voice_call_count

logger = logging.getLogger(__name__)
router = APIRouter()

Outcome = Literal["converted", "callback", "not_interested", "no_answer"]


class InitiateCall(BaseModel):
    lead_id: UUID | None = None
    phone: str | None = None      # manual dial — provide either lead_id or phone
    caller_id: UUID | None = None


class OutcomeUpdate(BaseModel):
    outcome: Outcome
    callback_time: datetime | None = None


@router.api_route("/twiml", methods=["GET", "POST"])
async def twiml_connect(lead_phone: str | None = None):
    dial_body = f"<Dial>{lead_phone}</Dial>" if lead_phone else ""
    xml = f'<?xml version="1.0"?><Response><Say>Connecting your call.</Say>{dial_body}</Response>'
    return Response(content=xml, media_type="application/xml")


@router.post("/initiate")
async def initiate_call(payload: InitiateCall):
    twilio_sid = get_setting("twilio_account_sid") or settings.twilio_account_sid
    twilio_token = get_setting("twilio_auth_token") or settings.twilio_auth_token
    if not twilio_sid or not twilio_token:
        raise HTTPException(status_code=400, detail="Twilio credentials not configured. Set them in Settings.")
    if not settings.public_base_url:
        raise HTTPException(status_code=400, detail="PUBLIC_BASE_URL not configured")

    if not payload.lead_id and not payload.phone:
        raise HTTPException(status_code=400, detail="Provide either lead_id or phone")

    db = get_supabase()

    if payload.lead_id:
        lead = db.table("leads").select("phone").eq("id", str(payload.lead_id)).maybe_single().execute()
        if not lead.data:
            raise HTTPException(status_code=404, detail="Lead not found")
        lead_phone = lead.data["phone"]
    else:
        lead_phone = payload.phone

    caller_phone: str | None = None
    if payload.caller_id:
        caller = db.table("callers").select("phone").eq("id", str(payload.caller_id)).maybe_single().execute()
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
    }).execute()
    call_log_id = log_insert.data[0]["id"]

    base_url = settings.public_base_url.rstrip("/")
    status_cb = f"{base_url}/api/v1/calls/voice-status?call_log_id={call_log_id}"
    twiml_url = f"{base_url}/api/v1/calls/twiml?lead_phone={quote(lead_phone or '')}"

    try:
        client = TwilioClient(twilio_sid, twilio_token)
        call = client.calls.create(
            to=caller_phone,
            from_=best_number["number"],
            url=twiml_url,
            status_callback=status_cb,
            status_callback_event=["completed"],
            record=True,
        )
    except Exception as e:
        logger.error(f"Twilio call failed: {e}")
        db.table("call_logs").update({"status": "failed"}).eq("id", call_log_id).execute()
        raise HTTPException(status_code=502, detail=f"Twilio call failed: {e}")

    db.table("call_logs").update({"call_sid": call.sid}).eq("id", call_log_id).execute()
    await increment_voice_call_count(best_number["id"])
    return {"call_log_id": call_log_id, "call_sid": call.sid, "status": call.status}


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
    except Exception as e:
        logger.error(f"Summarization failed for {call_log_id}: {e}")


@router.post("/voice-status")
async def twilio_voice_status(
    background_tasks: BackgroundTasks,
    call_log_id: str,
    CallSid: str | None = Form(None),
    CallStatus: str | None = Form(None),
    CallDuration: str | None = Form(None),
    RecordingUrl: str | None = Form(None),
):
    Status = CallStatus
    Duration = CallDuration
    db = get_supabase()
    updates: dict = {}

    if Status == "completed":
        updates["status"] = "completed"
    elif Status == "no-answer":
        updates["status"] = "no_answer"
        updates["outcome"] = "no_answer"
    elif Status in ("busy", "failed", "canceled"):
        updates["status"] = "failed"
    else:
        updates["status"] = "in_progress"

    if Duration:
        try:
            updates["duration_seconds"] = int(Duration)
        except ValueError:
            pass

    if RecordingUrl:
        try:
            twilio_sid = get_setting("twilio_account_sid") or settings.twilio_account_sid
            twilio_token = get_setting("twilio_auth_token") or settings.twilio_auth_token
            recording_mp3 = RecordingUrl if RecordingUrl.endswith(".mp3") else f"{RecordingUrl}.mp3"
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(recording_mp3, auth=(twilio_sid, twilio_token))
                resp.raise_for_status()
                audio_bytes = resp.content
            storage_path = f"{call_log_id}.mp3"
            db.storage.from_("call-recordings").upload(
                storage_path,
                audio_bytes,
                {"content-type": "audio/mpeg", "upsert": "true"},
            )
            public_url = db.storage.from_("call-recordings").get_public_url(storage_path)
            updates["recording_url"] = public_url
            background_tasks.add_task(_run_summarization, call_log_id, public_url)
        except Exception as e:
            logger.error(f"Recording upload failed for {call_log_id}: {e}")

    if updates:
        db.table("call_logs").update(updates).eq("id", call_log_id).execute()

    if updates.get("status") in ("completed", "no_answer"):
        log_row = (
            db.table("call_logs")
            .select("caller_id,outcome,duration_seconds")
            .eq("id", call_log_id)
            .maybe_single()
            .execute()
        )
        row = log_row.data or {}
        score = score_from_outcome(row.get("outcome"), row.get("duration_seconds"))
        db.table("call_logs").update({"score": score}).eq("id", call_log_id).execute()
        if row.get("caller_id"):
            recompute_caller_score(row["caller_id"], db)

    return Response(content="", media_type="text/xml")


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
            .select("segment,phone,ai_enabled,converted_at")
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
