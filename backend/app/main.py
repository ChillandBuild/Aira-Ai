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
    _scheduler.start()
    logger.info("Automation scheduler started (every 5 min)")

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
app.include_router(instagram.router, prefix="/instagram", tags=["instagram-webhook"])
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

