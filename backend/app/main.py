import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os
from app.config import settings
from app.routes import webhook, leads, messages, analytics, upload, segments, calls, callers, ai_tune, knowledge, system, follow_ups, numbers, incidents, lead_notes, voice_numbers, app_settings, templates

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Aira AI backend starting up...")
    logger.info(f"Supabase: {settings.supabase_url}")
    logger.info(f"Twilio number: {settings.twilio_whatsapp_number}")
    yield
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

# Webhook routes — no /api/v1/ prefix
app.include_router(webhook.router, prefix="/webhook/whatsapp", tags=["webhook"])
# Instagram webhook disabled — Phase 2

# API routes
app.include_router(leads.router, prefix="/api/v1/leads", tags=["leads"])
app.include_router(messages.router, prefix="/api/v1/messages", tags=["messages"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"])
app.include_router(segments.router, prefix="/api/v1/segments", tags=["segments"])
app.include_router(calls.router, prefix="/api/v1/calls", tags=["calls"])
app.include_router(callers.router, prefix="/api/v1/callers", tags=["callers"])
app.include_router(ai_tune.router, prefix="/api/v1/ai-tune", tags=["ai-tune"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["knowledge"])
app.include_router(system.router, prefix="/api/v1/system", tags=["system"])
app.include_router(follow_ups.router, prefix="/api/v1/follow-ups", tags=["follow-ups"])
app.include_router(numbers.router, prefix="/api/v1/numbers", tags=["numbers"])
app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["incidents"])
app.include_router(lead_notes.router, prefix="/api/v1/lead-notes", tags=["lead-notes"])
app.include_router(voice_numbers.router, prefix="/api/v1/voice-numbers", tags=["voice-numbers"])
app.include_router(app_settings.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"])
