import asyncio
import hmac
import logging
import re
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
from app.services.call_summarizer import transcribe_recording, summarize_call, evaluate_call, analyze_call
from app.services.growth import record_stage_event, sync_follow_up_jobs
from app.services.telecmi_client import initiate_click2call
from app.services.voice_router import get_best_voice_number, increment_voice_call_count

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()  # No auth — TeleCMI calls these directly

Outcome = Literal["converted", "callback", "not_interested", "no_answer"]
Disposition = Literal["answered", "no_answer", "busy", "switched_off", "followup_required"]

# Map a connection-state disposition to the business outcome that drives scoring/segments.
# "answered" alone implies no business result (caller may set outcome separately), so it
# maps to None — disposition + notes are still recorded, but scoring stays untouched.
_DISPOSITION_TO_OUTCOME: dict[str, str | None] = {
    "answered": None,
    "no_answer": "no_answer",
    "busy": "no_answer",
    "switched_off": "no_answer",
    "followup_required": "callback",
}


class InitiateCall(BaseModel):
    lead_id: UUID | None = None
    phone: str | None = None      # manual dial — provide either lead_id or phone
    caller_id: UUID | None = None


class OutcomeUpdate(BaseModel):
    outcome: Outcome | None = None
    disposition: Disposition | None = None
    notes: str | None = None
    callback_time: datetime | None = None


@router.post("/initiate")
async def initiate_call(payload: InitiateCall, ctx: dict = Depends(get_tenant_and_role)):
    tenant_id = ctx["tenant_id"]
    role = ctx.get("role")

    telecmi_secret = get_setting("telecmi_secret", tenant_id=tenant_id) or settings.telecmi_secret
    if not telecmi_secret:
        raise HTTPException(status_code=400, detail="TeleCMI App Secret not configured. Set it in Settings.")

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
        else:
            # auto-create a minimal lead so notes can always be saved
            try:
                new_lead = db.table("leads").insert({
                    "phone": lead_phone,
                    "source": "manual",
                    "score": 5,
                    "segment": "C",
                    "tenant_id": tenant_id,
                }).execute()
                if new_lead.data:
                    matched_lead_id = new_lead.data[0]["id"]
                    matched_lead_name = None
            except Exception as e:
                logger.warning(f"Auto-create lead failed for {lead_phone}: {e}")

    # Owners can call directly without a caller record; telecallers require their phone
    caller_telecmi_agent_id: str | None = None
    if role != "owner":
        caller_phone: str | None = None
        if payload.caller_id:
            caller = db.table("callers").select("phone,telecmi_agent_id").eq("id", str(payload.caller_id)).eq("tenant_id", tenant_id).maybe_single().execute()
            if caller.data:
                caller_phone = caller.data.get("phone")
                caller_telecmi_agent_id = caller.data.get("telecmi_agent_id") or None
        if not caller_phone:
            raise HTTPException(status_code=400, detail="Caller has no phone number configured")
    elif payload.caller_id:
        caller = db.table("callers").select("telecmi_agent_id").eq("id", str(payload.caller_id)).eq("tenant_id", tenant_id).maybe_single().execute()
        if caller.data:
            caller_telecmi_agent_id = caller.data.get("telecmi_agent_id") or None

    best_number = await get_best_voice_number(tenant_id)
    if not best_number:
        raise HTTPException(status_code=400, detail="No active voice numbers in pool")

    log_insert = db.table("call_logs").insert({
        "lead_id": matched_lead_id,
        "caller_id": str(payload.caller_id) if payload.caller_id else None,
        "status": "initiated",
        "tenant_id": tenant_id,
    }).execute()
    call_log_id = log_insert.data[0]["id"]

    try:
        # TeleCMI click-to-call: rings the caller first, then bridges to the lead
        telecmi_callerid = get_setting("telecmi_callerid", tenant_id=tenant_id) or settings.telecmi_callerid or best_number["number"]
        # Caller's own agent ID takes priority; admin direct calls fall back to global setting
        # Fallback: owner's own caller record agent_id, then global setting
        effective_agent_id = caller_telecmi_agent_id
        if not effective_agent_id:
            owner_member = db.table("tenant_users").select("user_id").eq("tenant_id", tenant_id).eq("role", "owner").maybe_single().execute()
            if owner_member.data:
                owner_caller = db.table("callers").select("telecmi_agent_id").eq("user_id", owner_member.data["user_id"]).eq("tenant_id", tenant_id).maybe_single().execute()
                if owner_caller.data:
                    effective_agent_id = owner_caller.data.get("telecmi_agent_id")
        if not effective_agent_id:
            effective_agent_id = get_setting("telecmi_user_id", tenant_id=tenant_id) or settings.telecmi_user_id
        if not effective_agent_id:
            raise HTTPException(status_code=400, detail="No TeleCMI Agent ID found. Assign one from the Team page.")
        result = await initiate_click2call(
            user_id=effective_agent_id,
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

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _verify_telecmi_webhook_secret(request: Request) -> bool:
    configured_secret = get_setting("telecmi_webhook_secret")
    received_secret = request.query_params.get("webhook_secret")
    if not configured_secret or not received_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    if not hmac.compare_digest(received_secret, configured_secret):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    return True


def _extract_call_log_id(cdr: dict) -> str | None:
    """Pull a usable call_log_id from a TeleCMI CDR `custom` field.

    TeleCMI sends the literal string `"none"` (lowercase) when no custom value
    was attached at dial time — treat that like a missing field. Also reject
    our own marker `"aira_ai_call"` and anything that isn't a UUID, to avoid
    sending invalid UUIDs to PostgREST (which returns 400 and crashes the
    handler via maybe_single).
    """
    raw = cdr.get("custom")
    if not raw or not isinstance(raw, str):
        return None
    val = raw.strip()
    if val.lower() in {"", "none", "null", "aira_ai_call"}:
        return None
    if not _UUID_RE.match(val):
        return None
    return val


@public_router.post("/telecmi-cdr")
async def telecmi_cdr(request: Request, background_tasks: BackgroundTasks):
    """Receive Call Detail Record (CDR) from TeleCMI."""
    _verify_telecmi_webhook_secret(request)
    cdr = await request.json()
    logger.info(f"TeleCMI CDR received: {cdr}")

    status = cdr.get("status")
    call_log_id = _extract_call_log_id(cdr)

    # TeleCMI sends separate CDRs for user_missed / user_answered (agent leg).
    # We only process outbound CDRs with a call_log_id embedded in custom.
    if status == "user_missed":
        logger.info("TeleCMI CDR: agent missed the call, updating call log")
        if call_log_id:
            db = get_supabase()
            db.table("call_logs").update({
                "status": "missed",
                "outcome": "no_answer",
            }).eq("id", call_log_id).execute()
        return {"ok": True}

    if not call_log_id:
        logger.warning(f"TeleCMI CDR missing/invalid call_log_id, ignoring: {cdr}")
        return {"ok": True}

    db = get_supabase()

    log_row = (
        db.table("call_logs")
        .select("id,caller_id,lead_id,tenant_id")
        .eq("id", call_log_id)
        .maybe_single()
        .execute()
    )
    if not log_row or not log_row.data:
        logger.warning(f"TeleCMI CDR: no call_log found for id={call_log_id}")
        return {"ok": True}

    call_log_id = log_row.data["id"]

    # If call_log has no lead linked, try to match/create one from the dialed number
    if not log_row.data.get("lead_id"):
        dialed = cdr.get("to") or cdr.get("customer_number") or cdr.get("did")
        tenant_id = log_row.data.get("tenant_id")
        if dialed and tenant_id:
            match = db.table("leads").select("id").eq("phone", dialed).eq("tenant_id", tenant_id).maybe_single().execute()
            if match and match.data:
                resolved_lead_id = match.data["id"]
            else:
                try:
                    new_lead = db.table("leads").insert({
                        "phone": dialed, "source": "manual", "score": 5,
                        "segment": "C", "tenant_id": tenant_id,
                    }).execute()
                    resolved_lead_id = new_lead.data[0]["id"] if new_lead.data else None
                except Exception as e:
                    logger.warning(f"CDR: auto-create lead failed for {dialed}: {e}")
                    resolved_lead_id = None
            if resolved_lead_id:
                db.table("call_logs").update({"lead_id": resolved_lead_id}).eq("id", call_log_id).execute()
                log_row.data["lead_id"] = resolved_lead_id
                logger.info(f"CDR: linked call {call_log_id} to lead {resolved_lead_id} via phone {dialed}")

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
    # TeleCMI recording URL: https://piopiy.telecmi.com/v1/play?appid=<appid>&token=<secret>&file=<filename>
    recording_filename = cdr.get("filename")
    if recording_filename:
        appid = cdr.get("appid")
        secret = get_setting("telecmi_secret", tenant_id=log_row.data.get("tenant_id")) or settings.telecmi_secret
        if appid and secret:
            full_url = (
                f"https://piopiy.telecmi.com/v1/play"
                f"?appid={appid}&token={secret}&file={recording_filename}"
            )
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
    _verify_telecmi_webhook_secret(request)
    event = await request.json()
    logger.info(f"TeleCMI event: status={event.get('status')}, request_id={event.get('request_id')}")
    # Can be used for real-time call status updates in the future
    return {"ok": True}


# ── Recording Processing ─────────────────────────────────────────────

# Max concurrent Groq (Whisper + LLM) requests — prevents rate-limit failures
# when many calls end at the same time (shift end, break, etc.)
_GROQ_SEMAPHORE = asyncio.Semaphore(5)


async def _process_telecmi_recording(call_log_id: str, recording_url: str) -> None:
    """Download TeleCMI recording and run AI summarization."""
    async with _GROQ_SEMAPHORE:
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


_SKIP_OUTCOMES = {"no_answer", "voicemail"}


async def _run_summarization(call_log_id: str, recording_url: str) -> None:
    try:
        db = get_supabase()

        # ── Gate: skip calls with no conversation (not answered / voicemail) ──
        call_row = (
            db.table("call_logs")
            .select("outcome,duration_seconds,lead_id,caller_id,tenant_id")
            .eq("id", call_log_id)
            .maybe_single()
            .execute()
        )
        call_data = (call_row.data or {})
        outcome = call_data.get("outcome")

        if outcome in _SKIP_OUTCOMES:
            logger.info(f"Skipping AI analysis for {call_log_id}: outcome={outcome}")
            return

        # ── Transcribe ───────────────────────────────────────────────────
        transcript = await transcribe_recording(recording_url)
        if not transcript:
            return

        # ── Single-pass analysis (summary + evaluation) ──────────────────
        lead_id = call_data.get("lead_id")
        lead_name: str | None = None
        if lead_id:
            lead_row = db.table("leads").select("name").eq("id", lead_id).maybe_single().execute()
            lead_name = (lead_row.data or {}).get("name")

        summary, evaluation = await analyze_call(transcript, lead_name=lead_name)

        updates: dict = {"transcript": transcript}
        if summary:
            updates["ai_summary"] = summary
        if evaluation:
            updates["evaluation"] = evaluation
            logger.info(f"Call evaluation stored for {call_log_id}: score={evaluation.get('overall_score')}")

        db.table("call_logs").update(updates).eq("id", call_log_id).execute()

        if summary.get("next_action") and lead_id:
            note_row = {
                "lead_id": lead_id,
                "call_log_id": call_log_id,
                "content": f"AI Summary: {summary.get('next_action', '')}",
                "structured": summary,
                "is_pinned": False,
            }
            if call_data.get("tenant_id"):
                note_row["tenant_id"] = call_data["tenant_id"]
            db.table("lead_notes").insert(note_row).execute()

        # ── Re-score caller now that AI evaluation is stored ─────────────
        # The first recompute (at outcome-set time) only had the outcome score.
        # Now that evaluation JSONB is persisted, blend it in.
        caller_id = call_data.get("caller_id")
        if caller_id and evaluation:
            recompute_caller_score(caller_id, db)

        logger.info(f"Summarization complete for {call_log_id}")
    except Exception as e:
        logger.error(f"Summarization failed for {call_log_id}: {e}")


# ── Outcome & Other Endpoints (unchanged) ────────────────────────────

@router.patch("/{call_log_id}/outcome")
async def set_outcome(call_log_id: str, payload: OutcomeUpdate, ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    log = (
        db.table("call_logs")
        .select("caller_id,duration_seconds,lead_id")
        .eq("id", call_log_id)
        .eq("tenant_id", ctx["tenant_id"])
        .maybe_single()
        .execute()
    )
    if not log.data:
        raise HTTPException(status_code=404, detail="Call log not found")

    if not payload.outcome and not payload.disposition:
        raise HTTPException(status_code=400, detail="Provide an outcome or a disposition")

    # A disposition implies a business outcome for scoring; an explicit outcome wins.
    effective_outcome = payload.outcome or _DISPOSITION_TO_OUTCOME.get(payload.disposition or "")

    log_updates: dict = {}
    if payload.disposition is not None:
        log_updates["disposition"] = payload.disposition
    if payload.notes is not None and payload.notes.strip():
        log_updates["notes"] = payload.notes.strip()
    score = None
    if effective_outcome is not None:
        score = score_from_outcome(effective_outcome, log.data.get("duration_seconds"))
        log_updates["outcome"] = effective_outcome
        log_updates["score"] = score
    if log_updates:
        db.table("call_logs").update(log_updates).eq("id", call_log_id).eq("tenant_id", ctx["tenant_id"]).execute()

    new_caller_score = None
    if effective_outcome is not None and log.data.get("caller_id"):
        new_caller_score = recompute_caller_score(log.data["caller_id"], db)

    lead_id = log.data.get("lead_id")
    if lead_id and effective_outcome is not None:
        lead = (
            db.table("leads")
            .select("segment,phone,ai_enabled,converted_at,tenant_id,assigned_to")
            .eq("id", str(lead_id))
            .maybe_single()
            .execute()
        )
        lead_data = lead.data or {}
        if lead_data:
            lead_updates: dict[str, str | None] = {}
            target_segment = lead_data.get("segment")
            event_type = "call_outcome"
            if effective_outcome == "converted":
                target_segment = "A"
                lead_updates["segment"] = "A"
                lead_updates["converted_at"] = datetime.now(timezone.utc).isoformat()
                event_type = "converted"
            elif effective_outcome == "callback":
                if (lead_data.get("segment") or "D") not in {"A", "B"}:
                    target_segment = "B"
                    lead_updates["segment"] = "B"
            elif effective_outcome == "not_interested":
                target_segment = "D"
                lead_updates["segment"] = "D"

            if lead_updates:
                updated_lead = db.table("leads").update(lead_updates).eq("id", str(lead_id)).eq("tenant_id", ctx["tenant_id"]).execute()
                if updated_lead.data:
                    lead_data = updated_lead.data[0]
            if target_segment and target_segment != lead.data.get("segment"):
                record_stage_event(
                    str(lead_id),
                    from_segment=lead.data.get("segment"),
                    to_segment=target_segment,
                    event_type=event_type,
                    metadata={"outcome": effective_outcome, "disposition": payload.disposition},
                    tenant_id=lead_data.get("tenant_id"),
                    db=db,
                )
            sync_follow_up_jobs(
                str(lead_id),
                segment=lead_data.get("segment") or target_segment,
                phone=lead_data.get("phone"),
                converted_at=lead_data.get("converted_at"),
                ai_enabled=lead_data.get("ai_enabled", True),
                reason=f"call_{effective_outcome}",
                tenant_id=lead_data.get("tenant_id"),
                db=db,
            )
            # A call can promote an unassigned lead into a qualifying segment
            # (e.g. owner-dialed lead asks for a callback → B). Converted leads
            # are closed, so they are never queued for telecalling.
            if effective_outcome != "converted" and not lead_data.get("assigned_to"):
                from app.services.assignment import maybe_assign_lead
                maybe_assign_lead(
                    str(lead_id), ctx["tenant_id"],
                    lead_data.get("segment") or target_segment, None,
                    reason=f"call_{effective_outcome}",
                )
            if effective_outcome == "callback" and payload.callback_time:
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
        "outcome": effective_outcome,
        "disposition": payload.disposition,
        "score": score,
        "caller_overall_score": new_caller_score,
    }


@router.get("/stats-today")
async def stats_today(ctx: dict = Depends(get_tenant_and_role)):
    from datetime import datetime, timezone
    db = get_supabase()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    result = db.table("call_logs").select("id,outcome").eq("tenant_id", ctx["tenant_id"]).gte("created_at", today).execute()
    logs = result.data or []
    return {
        "calls_today": len(logs),
        "conversions_today": sum(1 for l in logs if l.get("outcome") == "converted"),
    }


@router.get("/recent-by-leads")
async def recent_by_leads(lead_ids: str = Query(..., description="Comma-separated lead UUIDs, max 50"), ctx: dict = Depends(get_tenant_and_role)):
    ids = [i.strip() for i in lead_ids.split(",") if i.strip()][:50]
    if not ids:
        return {}
    db = get_supabase()
    rows = (
        db.table("call_logs")
        .select("lead_id,created_at")
        .in_("lead_id", ids)
        .eq("tenant_id", ctx["tenant_id"])
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
async def backfill_summaries(background_tasks: BackgroundTasks, limit: int = Query(10, ge=1, le=50), ctx: dict = Depends(get_tenant_and_role)):
    """Re-run summarization on call logs that have recording_url but no ai_summary."""
    db = get_supabase()
    rows = (
        db.table("call_logs")
        .select("id,recording_url")
        .eq("tenant_id", ctx["tenant_id"])
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
async def delete_call_log(call_log_id: str, ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    result = db.table("call_logs").delete().eq("id", call_log_id).eq("tenant_id", ctx["tenant_id"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call log not found")
    return {"deleted": True}
