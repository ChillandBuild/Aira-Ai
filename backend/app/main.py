import logging
import sys
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.dependencies.auth import get_current_user

import os
from app.config import settings
from app.routes import webhook, leads, messages, analytics, upload, segments, calls, callers, ai_tune, knowledge, system, follow_ups, numbers, incidents, lead_notes, voice_numbers, app_settings, templates, onboarding, team, media, alerts, todos, bookings, conversations, operator, chat_handovers, telegram, instagram, facebook, automations
from app.routes.calls import public_router as calls_public_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def _process_automation_waits() -> None:
    """APScheduler job: resume automation wait-step executions that are due."""
    try:
        from app.services.automation_engine import resume_pending_executions
        count = await resume_pending_executions()
        if count:
            logger.info(f"Automation scheduler: resumed {count} pending execution(s)")
    except Exception as e:
        logger.error(f"Automation scheduler error: {e}")


async def _process_scheduled_broadcasts() -> None:
    """APScheduler job: fire scheduled_broadcasts rows whose fire_at has passed."""
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


async def _sync_all_number_quality():
    """APScheduler daily job: pull quality_rating + messaging_tier from Meta for all numbers that have meta_phone_number_id set."""
    from app.db.supabase import get_supabase
    from app.services.meta_cloud import get_number_quality
    from datetime import datetime, timezone

    _QUALITY_MAP = {"HIGH": "green", "MEDIUM": "yellow", "LOW": "red"}
    _TIER_MAP_STR = {
        "TIER_50": 250, "TIER_250": 250, "TIER_1K": 1000,
        "TIER_10K": 10000, "TIER_100K": 100000, "UNLIMITED": 100000,
    }
    db = get_supabase()
    rows = db.table("phone_numbers").select("id,tenant_id,meta_phone_number_id,quality_rating,messaging_tier,status,warm_up_day,last_reset_at").neq("meta_phone_number_id", None).neq("status", "archived").execute().data or []
    now = datetime.now(timezone.utc)
    for row in rows:
        try:
            meta_pid = row["meta_phone_number_id"]
            tenant_id = row["tenant_id"]
            meta_data = await get_number_quality(phone_number_id=meta_pid, tenant_id=tenant_id)
            raw_quality = meta_data.get("quality_rating", "")
            new_quality = _QUALITY_MAP.get(raw_quality.upper(), row["quality_rating"])
            new_tier = meta_data.get("messaging_tier") or row["messaging_tier"]
            updates = {"quality_rating": new_quality, "messaging_tier": new_tier, "daily_send_count": 0, "last_reset_at": now.isoformat()}
            last_reset_raw = row.get("last_reset_at")
            days_elapsed = 0
            if last_reset_raw:
                from datetime import datetime as _dt
                last_reset = _dt.fromisoformat(last_reset_raw.replace("Z", "+00:00"))
                days_elapsed = max(0, (now - last_reset).days)
            if row["status"] == "warming" and days_elapsed > 0:
                new_day = min(row["warm_up_day"] + days_elapsed, 14)
                updates["warm_up_day"] = new_day
                if new_day >= 14:
                    updates["status"] = "active"
            db.table("phone_numbers").update(updates).eq("id", row["id"]).execute()
            # Write quality history row
            db.table("phone_number_quality_history").insert({
                "phone_number_id": row["id"],
                "tenant_id": tenant_id,
                "quality_rating": new_quality,
                "messaging_tier": new_tier,
                "recorded_at": now.isoformat(),
            }).execute()
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Quality sync failed for number {row['id']}: {e}")


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
        _sync_all_number_quality,
        trigger="interval",
        hours=24,
        id="number-quality-sync",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Schedulers started: automation(5m) + broadcasts(1m) + token-health(24h) + quality-sync(24h)")

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
    return {"status": "ok", "service": "aira-ai"}

_auth = [Depends(get_current_user)]

# Webhook routes — no auth (Meta/Twilio call directly)
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
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"], dependencies=_auth)
app.include_router(todos.router, prefix="/api/v1/todos", tags=["todos"], dependencies=_auth)
app.include_router(bookings.router, prefix="/api/v1/bookings", tags=["bookings"], dependencies=_auth)
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["conversations"], dependencies=_auth)
app.include_router(operator.router, prefix="/api/v1/operator", tags=["operator"])
app.include_router(chat_handovers.router, prefix="/api/v1/chat-handovers", tags=["chat-handovers"], dependencies=_auth)
app.include_router(automations.router, prefix="/api/v1/automations", tags=["automations"], dependencies=_auth)

