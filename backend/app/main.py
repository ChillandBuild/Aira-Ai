import logging
import sys
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.dependencies.auth import get_current_user

import os
from app.config import settings
from app.routes import webhook, leads, messages, analytics, upload, segments, calls, callers, ai_tune, knowledge, system, follow_ups, numbers, incidents, lead_notes, voice_numbers, app_settings, templates, onboarding, team, media, todos, bookings, conversations, operator, chat_handovers, telegram, instagram, facebook, automations, tags, inbound_leads, reengagement, notifications, assignment_log
from app.routes.calls import public_router as calls_public_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# Initialize Sentry
if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=1.0,
    )
    logger.info("Sentry SDK initialized successfully.")

from datetime import datetime, timezone, timedelta
_startup_time = datetime.now(timezone.utc)
_heartbeats = {
    "scheduled-broadcasts": None,
    "automation-pending": None,
}


async def _process_automation_waits() -> None:
    """APScheduler job: resume automation wait-step executions that are due."""
    _heartbeats["automation-pending"] = datetime.now(timezone.utc)
    try:
        from app.services.automation_engine import resume_due_flow_runs
        count = await resume_due_flow_runs()
        if count:
            logger.info(f"Automation scheduler: resumed {count} flow run(s)")
    except Exception as e:
        logger.error(f"Automation scheduler error: {e}")


async def _process_scheduled_broadcasts() -> None:
    """APScheduler job: fire scheduled_broadcasts rows whose fire_at has passed."""
    _heartbeats["scheduled-broadcasts"] = datetime.now(timezone.utc)
    try:
        from app.db.supabase import get_supabase
        from app.services.broadcast_executor import execute_broadcast
        db = get_supabase()
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        rows = (
            db.table("scheduled_broadcasts")
            .select("*")
            .eq("status", "pending")
            .lte("fire_at", now)
            .limit(10)
            .execute()
        )
        for row in (rows.data or []):
            logger.info(f"Scheduled broadcast firing: id={row['id']} tenant={row['tenant_id']}")
            await execute_broadcast(row)
    except Exception as e:
        logger.error(f"Scheduled broadcast executor error: {e}")


async def _check_token_health() -> None:
    """APScheduler daily job: validate Meta tokens for all tenants, create incidents if invalid."""
    import httpx
    from app.db.supabase import get_supabase

    db = get_supabase()
    rows = (
        db.table("app_settings")
        .select("tenant_id,key,value")
        .in_("key", [
            "meta_access_token", "meta_phone_number_id",
            "instagram_access_token", "instagram_page_id",
            "facebook_access_token", "facebook_page_id",
        ])
        .not_.is_("value", "null")
        .execute()
    )
    if not rows.data:
        return

    tenant_cfg: dict[str, dict] = {}
    for row in rows.data:
        tid = row["tenant_id"]
        if tid not in tenant_cfg:
            tenant_cfg[tid] = {}
        tenant_cfg[tid][row["key"]] = row["value"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        for tenant_id, cfg in tenant_cfg.items():
            # WhatsApp
            wa_token = cfg.get("meta_access_token")
            wa_phone_id = cfg.get("meta_phone_number_id")
            if wa_token and wa_phone_id:
                try:
                    r = await client.get(
                        f"https://graph.facebook.com/v21.0/{wa_phone_id}",
                        params={"fields": "display_phone_number", "access_token": wa_token},
                    )
                    data = r.json()
                    if "error" in data:
                        _create_token_incident(db, tenant_id, "whatsapp", data["error"].get("message", "Token invalid"))
                except Exception as e:
                    logger.warning(f"Token health check error tenant={tenant_id} channel=whatsapp: {e}")

            # Instagram
            ig_token = cfg.get("instagram_access_token")
            if ig_token:
                try:
                    r = await client.get(
                        "https://graph.facebook.com/v21.0/me",
                        params={"fields": "name", "access_token": ig_token},
                    )
                    data = r.json()
                    if "error" in data:
                        _create_token_incident(db, tenant_id, "instagram", data["error"].get("message", "Token invalid"))
                except Exception as e:
                    logger.warning(f"Token health check error tenant={tenant_id} channel=instagram: {e}")

            # Facebook
            fb_token = cfg.get("facebook_access_token")
            if fb_token:
                try:
                    r = await client.get(
                        "https://graph.facebook.com/v21.0/me",
                        params={"fields": "name", "access_token": fb_token},
                    )
                    data = r.json()
                    if "error" in data:
                        _create_token_incident(db, tenant_id, "facebook", data["error"].get("message", "Token invalid"))
                except Exception as e:
                    logger.warning(f"Token health check error tenant={tenant_id} channel=facebook: {e}")

    logger.info(f"Token health check complete for {len(tenant_cfg)} tenant(s)")


async def _apply_engagement_decay() -> None:
    """APScheduler 6h job: decay scores for leads silent >24h."""
    try:
        from app.db.supabase import get_supabase
        from app.services.scoring_engine import apply_engagement_decay_all
        db = get_supabase()
        count = await apply_engagement_decay_all(db)
        if count:
            logger.info(f"Engagement decay: updated {count} lead(s)")
    except Exception as e:
        logger.error(f"Engagement decay scheduler error: {e}")


def _create_token_incident(db, tenant_id: str, channel: str, error_msg: str) -> None:
    try:
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=23)).isoformat()
        existing = (
            db.table("incidents")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("type", "token_invalid")
            .gte("created_at", cutoff)
            .execute()
        )
        if existing.data:
            return
        db.table("incidents").insert({
            "tenant_id": tenant_id,
            "type": "token_invalid",
            "detail": {"channel": channel, "error": error_msg},
        }).execute()
        logger.warning(f"Token invalid incident created: tenant={tenant_id} channel={channel}")
    except Exception as e:
        logger.error(f"Failed to create token incident: {e}")


async def _process_reengagement_rules() -> None:
    """APScheduler job: process due automated re-engagement steps."""
    try:
        from app.services.reengagement_service import process_due_reengagements
        count = await process_due_reengagements()
        if count:
            logger.info(f"Re-engagement scheduler: processed {count} re-engagement message(s)")
    except Exception as e:
        logger.error(f"Re-engagement scheduler error: {e}")


async def _sweep_unassigned_leads() -> None:
    """APScheduler job: state-based safety net that assigns any unassigned lead
    whose current segment qualifies under the tenant's telecalling_config."""
    try:
        from app.services.assignment import sweep_unassigned_leads
        sweep_unassigned_leads()
    except Exception as e:
        logger.error(f"Assignment sweep scheduler error: {e}")


async def _process_callback_reassignments() -> None:
    """APScheduler job: reassign overdue callbacks from non-active callers and handle missed callbacks."""
    try:
        from app.db.supabase import get_supabase
        from app.services.assignment import auto_assign_lead, get_telecalling_config, record_assignment_event
        db = get_supabase()
        now = datetime.now(timezone.utc)
        cutoff_reassign = (now - timedelta(minutes=30)).isoformat()
        cutoff_escalate = (now - timedelta(minutes=60)).isoformat()

        overdue = (
            db.table("follow_up_jobs")
            .select("id,lead_id,tenant_id,scheduled_for")
            .eq("cadence", "callback")
            .eq("status", "pending")
            .lte("scheduled_for", cutoff_reassign)
            .limit(50)
            .execute()
        )
        if not overdue.data:
            return

        for job in overdue.data:
            try:
                lead = (
                    db.table("leads")
                    .select("id,name,assigned_to,tenant_id,segment,score")
                    .eq("id", job["lead_id"])
                    .maybe_single()
                    .execute()
                )
                if not lead or not lead.data:
                    continue

                current_caller_id = lead.data.get("assigned_to")
                tid = job["tenant_id"]
                scheduled_for_str = job["scheduled_for"]
                lead_name = lead.data.get("name") or "Unknown"

                # Check caller details
                caller = None
                caller_status = "logged_out"
                old_caller_name = "Unknown"
                if current_caller_id:
                    caller_res = (
                        db.table("callers")
                        .select("id,name,status,user_id")
                        .eq("id", current_caller_id)
                        .maybe_single()
                        .execute()
                    )
                    if caller_res and caller_res.data:
                        caller = caller_res
                        caller_status = caller_res.data.get("status") or "logged_out"
                        old_caller_name = caller_res.data.get("name") or "Unknown"

                # Check if the scheduled_for time is overdue by 60 mins
                is_escalate_overdue = job["scheduled_for"] <= cutoff_escalate

                if caller_status == "active":
                    # Caller is active. Check if they missed the 60m escalation window
                    if is_escalate_overdue:
                        # Skip if currently on a live call
                        is_on_call = False
                        if current_caller_id:
                            live_call_res = (
                                db.table("call_logs")
                                .select("id")
                                .eq("caller_id", current_caller_id)
                                .in_("status", ["initiated", "in_progress"])
                                .limit(1)
                                .execute()
                            )
                            if live_call_res and live_call_res.data:
                                is_on_call = True

                        if is_on_call:
                            continue  # skip escalation for now

                        # Escalate/flag
                        db.table("leads").update({
                            "needs_human_attention": True,
                            "needs_human_intervention": True,
                            "escalation_reason": "Callback missed (caller online but did not call)",
                            "ai_enabled": False,
                        }).eq("id", job["lead_id"]).eq("tenant_id", tid).execute()

                        db.table("follow_up_jobs").update({
                            "status": "failed",
                            "last_error": "Callback missed (caller online but did not call)",
                        }).eq("id", job["id"]).eq("tenant_id", tid).execute()

                        # Notifications
                        owner = (
                            db.table("tenant_users")
                            .select("user_id")
                            .eq("tenant_id", tid)
                            .eq("role", "owner")
                            .limit(1)
                            .execute()
                        )
                        owner_user_id = (owner.data[0] if owner.data else {}).get("user_id")

                        if caller and caller.data.get("user_id"):
                            db.table("app_notifications").insert({
                                "tenant_id": tid,
                                "user_id": caller.data["user_id"],
                                "type": "missed_callback",
                                "title": "Missed Callback",
                                "message": f"You missed a scheduled callback for '{lead_name}'."
                            }).execute()

                        if owner_user_id:
                            db.table("app_notifications").insert({
                                "tenant_id": tid,
                                "user_id": owner_user_id,
                                "type": "missed_callback",
                                "title": "Missed Callback Alert",
                                "message": f"Caller {old_caller_name} missed a scheduled callback for '{lead_name}'."
                            }).execute()

                        logger.info(f"Callback missed escalation: job={job['id']} lead={job['lead_id']} caller={current_caller_id}")
                    continue

                # Caller is inactive (break/logged_out). Reassign to other active callers or release in PULL mode.
                cfg = get_telecalling_config(tid)
                if cfg.get("assignment_mode") == "pull":
                    # Release the overdue away-caller callback back to the pool
                    db.table("leads").update({
                        "assigned_to": None,
                    }).eq("id", job["lead_id"]).eq("tenant_id", tid).execute()

                    record_assignment_event(
                        lead_id=job["lead_id"],
                        tenant_id=tid,
                        segment=lead.data.get("segment"),
                        caller_id=None,
                        caller_name=None,
                        reason="caller_unavailable",
                        method="pull_release",
                        score=lead.data.get("score"),
                        matched_segments=cfg.get("segments", ["A"]),
                        prev_caller_id=current_caller_id,
                        prev_caller_name=old_caller_name,
                        event_type="reassigned",
                        db=db,
                    )
                    logger.info(
                        f"Callback reassignment (PULL release): job={job['id']} lead={job['lead_id']} "
                        f"from={current_caller_id}"
                    )
                    continue

                # Fetch all active callers in the same tenant (excluding current)
                active_callers_res = (
                    db.table("callers")
                    .select("id,user_id")
                    .eq("tenant_id", tid)
                    .eq("active", True)
                    .eq("status", "active")
                    .neq("id", current_caller_id)
                    .execute()
                )
                active_callers = active_callers_res.data or []

                # Parse scheduled_for to check ±30m window
                try:
                    job_time = datetime.fromisoformat(scheduled_for_str.replace("Z", "+00:00"))
                    window_start = (job_time - timedelta(minutes=30)).isoformat()
                    window_end = (job_time + timedelta(minutes=30)).isoformat()

                    # Find pending callbacks in this window for this tenant
                    conflicting_jobs_res = (
                        db.table("follow_up_jobs")
                        .select("lead_id")
                        .eq("tenant_id", tid)
                        .eq("cadence", "callback")
                        .eq("status", "pending")
                        .gte("scheduled_for", window_start)
                        .lte("scheduled_for", window_end)
                        .execute()
                    )
                    conflicting_jobs = conflicting_jobs_res.data or []
                except Exception:
                    conflicting_jobs = []

                # Extract caller IDs for these conflicting jobs
                conflicting_caller_ids = set()
                if conflicting_jobs:
                    lead_ids = [j["lead_id"] for j in conflicting_jobs]
                    if lead_ids:
                        leads_with_conflict = (
                            db.table("leads")
                            .select("assigned_to")
                            .in_("id", lead_ids)
                            .execute()
                        ).data or []
                        for lc in leads_with_conflict:
                            if lc.get("assigned_to"):
                                conflicting_caller_ids.add(lc["assigned_to"])

                exclude_ids = list(conflicting_caller_ids)
                if current_caller_id and current_caller_id not in exclude_ids:
                    exclude_ids.append(current_caller_id)

                # Reassign using auto_assign_lead which writes the reassignment event log
                new_caller_id = auto_assign_lead(
                    lead_id=job["lead_id"],
                    tenant_id=tid,
                    reason="caller_unavailable",
                    segment=lead.data.get("segment"),
                    score=lead.data.get("score"),
                    event_type="reassigned",
                    prev_caller_id=current_caller_id,
                    prev_caller_name=old_caller_name,
                    exclude_caller_ids=exclude_ids,
                )

                if new_caller_id:
                    # Restart the callback clock for the new caller: measure the
                    # 60m missed-callback escalation from reassignment, not the
                    # original (already-overdue) time, so the new caller gets a
                    # fair window and the job shows as due-now for them.
                    db.table("follow_up_jobs").update({
                        "scheduled_for": now.isoformat(),
                    }).eq("id", job["id"]).eq("tenant_id", tid).execute()

                    # Reassigned successfully
                    new_caller = (
                        db.table("callers")
                        .select("name,user_id")
                        .eq("id", new_caller_id)
                        .maybe_single()
                        .execute()
                    )
                    new_caller_name = (new_caller.data or {}).get("name") if new_caller else "another caller"
                    new_user_id = (new_caller.data or {}).get("user_id") if new_caller else None

                    # Send notifications
                    if new_user_id:
                        db.table("app_notifications").insert({
                            "tenant_id": tid,
                            "user_id": new_user_id,
                            "type": "reassignment",
                            "title": "Lead Reassigned To You",
                            "message": f"Lead '{lead_name}' has been switched to you because '{old_caller_name}' was not available."
                        }).execute()

                    if caller and caller.data.get("user_id"):
                        db.table("app_notifications").insert({
                            "tenant_id": tid,
                            "user_id": caller.data["user_id"],
                            "type": "reassignment",
                            "title": "Lead Reassigned",
                            "message": f"Lead '{lead_name}' has been switched to {new_caller_name} because you were not available."
                        }).execute()

                    logger.info(
                        f"Callback reassignment: job={job['id']} lead={job['lead_id']} "
                        f"from={current_caller_id} to={new_caller_id}"
                    )
                elif is_escalate_overdue:
                    # Reassignment failed and >= 60 mins overdue. Escalate!
                    db.table("leads").update({
                        "needs_human_attention": True,
                        "needs_human_intervention": True,
                        "escalation_reason": "Callback missed (caller unavailable, no active callers for reassignment)",
                        "ai_enabled": False,
                    }).eq("id", job["lead_id"]).eq("tenant_id", tid).execute()

                    db.table("follow_up_jobs").update({
                        "status": "failed",
                        "last_error": "Callback missed (caller unavailable, no active callers for reassignment)",
                    }).eq("id", job["id"]).eq("tenant_id", tid).execute()

                    # Find owner to notify
                    owner = (
                        db.table("tenant_users")
                        .select("user_id")
                        .eq("tenant_id", tid)
                        .eq("role", "owner")
                        .limit(1)
                        .execute()
                    )
                    owner_user_id = (owner.data[0] if owner.data else {}).get("user_id")
                    if owner_user_id:
                        db.table("app_notifications").insert({
                            "tenant_id": tid,
                            "user_id": owner_user_id,
                            "type": "missed_callback",
                            "title": "Missed Callback Alert",
                            "message": f"Callback for '{lead_name}' was missed because '{old_caller_name}' was unavailable, and no other active callers could be reassigned."
                        }).execute()

                    logger.info(f"Callback missed escalation (no active callers): job={job['id']} lead={job['lead_id']}")

            except Exception as e:
                logger.error(f"Callback reassignment failed for job {job['id']}: {e}")
    except Exception as e:
        logger.error(f"Callback reassignment scheduler error: {e}")


_scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Aira AI backend starting up...")
    logger.info(f"Supabase: {settings.supabase_url}")
    logger.info("Voice: TeleCMI")

    # Schedule automation wait-step processing every 5 minutes
    _scheduler.add_job(
        _process_automation_waits,
        trigger="interval",
        minutes=5,
        id="automation-pending",
        replace_existing=True,
    )
    _scheduler.add_job(
        _process_scheduled_broadcasts,
        trigger="interval",
        minutes=1,
        id="scheduled-broadcasts",
        replace_existing=True,
    )
    _scheduler.add_job(
        _check_token_health,
        trigger="interval",
        hours=24,
        id="token-health-check",
        replace_existing=True,
    )
    _scheduler.add_job(
        _apply_engagement_decay,
        trigger="interval",
        hours=6,
        id="engagement-decay",
        replace_existing=True,
    )
    _scheduler.add_job(
        _process_reengagement_rules,
        trigger="interval",
        minutes=1,
        id="reengagement-rules",
        replace_existing=True,
    )
    _scheduler.add_job(
        _process_callback_reassignments,
        trigger="interval",
        minutes=1,
        id="callback-reassignment",
        replace_existing=True,
    )
    _scheduler.add_job(
        _sweep_unassigned_leads,
        trigger="interval",
        minutes=2,
        id="assignment-sweep",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Schedulers started: automation(5m) + broadcasts(1m) + token-health(24h) + engagement-decay(6h) + reengagement(1m) + callback-reassignment(1m) + assignment-sweep(2m)")

    yield

    _scheduler.shutdown(wait=False)
    logger.info("Aira AI backend shutting down.")


app = FastAPI(
    title="Aira AI",
    version="0.1.0",
    description="B2B SaaS Lead Intelligence Platform for Education Consultancies",
    lifespan=lifespan,
)

# CORS — allow frontend origins
_allowed = ["http://localhost:3000", "http://localhost:3001"]
_frontend_url = os.environ.get("FRONTEND_URL", "")
if _frontend_url:
    _allowed.append(_frontend_url)
# Allow all *.vercel.app subdomains for preview deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check (no auth, no prefix)
@app.get("/health", tags=["system"])
async def health():
    from fastapi.responses import JSONResponse
    from datetime import datetime, timezone
    
    # 1. Ping the Supabase database
    db_ok = False
    db_error = None
    try:
        from app.db.supabase import get_supabase
        db = get_supabase()
        db.table("app_settings").select("key").limit(1).execute()
        db_ok = True
    except Exception as e:
        db_error = str(e)
        logger.error(f"Health check database ping failed: {db_error}")

    # 2. Check scheduled jobs heartbeats
    now = datetime.now(timezone.utc)
    
    # scheduled-broadcasts (runs every 1 minute)
    sb_heartbeat = _heartbeats["scheduled-broadcasts"]
    sb_ok = False
    if sb_heartbeat is not None:
        if (now - sb_heartbeat).total_seconds() <= 180: # 3 minutes threshold
            sb_ok = True
    else:
        # Grace period since startup
        if (now - _startup_time).total_seconds() <= 180:
            sb_ok = True

    # automation-pending (runs every 5 minutes)
    ap_heartbeat = _heartbeats["automation-pending"]
    ap_ok = False
    if ap_heartbeat is not None:
        if (now - ap_heartbeat).total_seconds() <= 600: # 10 minutes threshold
            ap_ok = True
    else:
        # Grace period since startup
        if (now - _startup_time).total_seconds() <= 600:
            ap_ok = True

    details = {
        "database": "ok" if db_ok else f"error: {db_error}",
        "scheduler_jobs": {
            "scheduled-broadcasts": {
                "status": "healthy" if sb_ok else "unhealthy",
                "last_heartbeat": sb_heartbeat.isoformat() if sb_heartbeat else None,
            },
            "automation-pending": {
                "status": "healthy" if ap_ok else "unhealthy",
                "last_heartbeat": ap_heartbeat.isoformat() if ap_heartbeat else None,
            }
        }
    }

    if db_ok and sb_ok and ap_ok:
        return {
            "status": "healthy",
            "service": "aira-ai",
            "details": details
        }
    else:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "aira-ai",
                "details": details
            }
        )

@app.get("/sentry-debug")
async def trigger_error():
    division_by_zero = 1 / 0

_auth = [Depends(get_current_user)]

# Webhook routes — no auth (Meta calls directly)
app.include_router(webhook.router, prefix="/webhook/whatsapp", tags=["webhook"])
app.include_router(telegram.router, prefix="/webhook/telegram", tags=["telegram-webhook"])
app.include_router(instagram.router, prefix="/webhook/instagram", tags=["instagram-webhook"])
app.include_router(facebook.router, prefix="/webhook/facebook", tags=["facebook-webhook"])
app.include_router(calls_public_router, prefix="/api/v1/calls", tags=["calls-telecmi"])
app.include_router(bookings.public_router, prefix="/api/v1/bookings", tags=["bookings-webhook"])

# API routes — all require auth
app.include_router(leads.router, prefix="/api/v1/leads", tags=["leads"], dependencies=_auth)
app.include_router(messages.router, prefix="/api/v1/messages", tags=["messages"], dependencies=_auth)
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"], dependencies=_auth)
app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"], dependencies=_auth)
app.include_router(segments.router, prefix="/api/v1/segments", tags=["segments"], dependencies=_auth)
app.include_router(calls.router, prefix="/api/v1/calls", tags=["calls"], dependencies=_auth)
app.include_router(callers.router, prefix="/api/v1/callers", tags=["callers"], dependencies=_auth)
app.include_router(ai_tune.router, prefix="/api/v1/ai-tune", tags=["ai-tune"], dependencies=_auth)
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["knowledge"], dependencies=_auth)
app.include_router(system.router, prefix="/api/v1/system", tags=["system"], dependencies=_auth)
app.include_router(follow_ups.router, prefix="/api/v1/follow-ups", tags=["follow-ups"], dependencies=_auth)
app.include_router(numbers.router, prefix="/api/v1/numbers", tags=["numbers"], dependencies=_auth)
app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["incidents"], dependencies=_auth)
app.include_router(lead_notes.router, prefix="/api/v1/lead-notes", tags=["lead-notes"], dependencies=_auth)
app.include_router(voice_numbers.router, prefix="/api/v1/voice-numbers", tags=["voice-numbers"], dependencies=_auth)
app.include_router(app_settings.router, prefix="/api/v1/settings", tags=["settings"], dependencies=_auth)
app.include_router(templates.public_router, prefix="/api/v1/templates", tags=["templates-webhook"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"], dependencies=_auth)
app.include_router(onboarding.router, prefix="/api/v1/onboarding", tags=["onboarding"], dependencies=_auth)
app.include_router(team.router, prefix="/api/v1/team", tags=["team"], dependencies=_auth)
app.include_router(media.router, prefix="/api/v1/leads", tags=["media"], dependencies=_auth)
app.include_router(todos.router, prefix="/api/v1/todos", tags=["todos"], dependencies=_auth)
app.include_router(bookings.router, prefix="/api/v1/bookings", tags=["bookings"], dependencies=_auth)
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["conversations"], dependencies=_auth)
app.include_router(operator.router, prefix="/api/v1/operator", tags=["operator"])
app.include_router(chat_handovers.router, prefix="/api/v1/chat-handovers", tags=["chat-handovers"], dependencies=_auth)
app.include_router(automations.router, prefix="/api/v1/automations", tags=["automations"], dependencies=_auth)
app.include_router(tags.router, prefix="/api/v1/broadcast-tags", tags=["broadcast-tags"], dependencies=_auth)
app.include_router(inbound_leads.router, prefix="/api/v1/inbound-leads", tags=["inbound-leads"], dependencies=_auth)
app.include_router(reengagement.router, prefix="/api/v1/reengagement", tags=["reengagement"], dependencies=_auth)
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"], dependencies=_auth)
app.include_router(assignment_log.router, prefix="/api/v1/assignment-log", tags=["assignment-log"], dependencies=_auth)


