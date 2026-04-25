import logging
from celery import Celery
from celery.schedules import crontab
from app.config import settings
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

celery_app = Celery("aira", broker=settings.redis_url)

celery_app.conf.beat_schedule = {
    "reset-daily-send-counts": {
        "task": "app.services.scheduled_tasks.reset_daily_send_counts",
        "schedule": crontab(hour=0, minute=0),
    },
    "warmup-phone-numbers": {
        "task": "app.services.scheduled_tasks.advance_warmup",
        "schedule": crontab(hour=1, minute=0),
    },
    "reset-voice-daily-counts": {
        "task": "app.services.scheduled_tasks.reset_voice_daily_counts",
        "schedule": crontab(hour=0, minute=5),
    },
}
celery_app.conf.timezone = "Asia/Kolkata"


@celery_app.task
def reset_daily_send_counts():
    db = get_supabase()
    db.table("phone_numbers").update({"daily_send_count": 0}).neq("status", "archived").execute()
    logger.info("Reset WhatsApp daily send counts")


@celery_app.task
def reset_voice_daily_counts():
    db = get_supabase()
    db.table("voice_numbers").update({"calls_today": 0}).neq("status", "archived").execute()
    logger.info("Reset voice daily call counts")


@celery_app.task
def advance_warmup():
    db = get_supabase()
    warming = db.table("phone_numbers").select("id,warm_up_day").eq("status", "warming").execute().data or []
    for row in warming:
        new_day = row["warm_up_day"] + 1
        if new_day >= 14:
            db.table("phone_numbers").update({"warm_up_day": 14, "status": "active"}).eq("id", row["id"]).execute()
            db.table("incidents").insert({
                "type": "warm_up_complete",
                "phone_number_id": row["id"],
                "detail": {"message": "Number completed 14-day warm-up, now active"},
            }).execute()
            logger.info(f"Phone number {row['id']} warm-up complete")
        else:
            db.table("phone_numbers").update({"warm_up_day": new_day}).eq("id", row["id"]).execute()
    logger.info(f"Advanced warm-up for {len(warming)} numbers")
