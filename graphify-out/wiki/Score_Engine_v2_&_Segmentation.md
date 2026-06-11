# Score Engine v2 & Segmentation

> 21 nodes · cohesion 0.17

## Key Concepts

- **compute_score()** (16 connections) — `backend/app/services/scoring_engine.py`
- **scoring_engine.py** (13 connections) — `backend/app/services/scoring_engine.py`
- **_apply_engagement_decay()** (12 connections) — `backend/app/main.py`
- **str** (9 connections) — `backend/app/services/scoring_engine.py`
- **int** (7 connections) — `backend/app/services/scoring_engine.py`
- **_score_arc()** (6 connections) — `backend/app/services/scoring_engine.py`
- **_parse_dt()** (5 connections) — `backend/app/services/scoring_engine.py`
- **_rollup_tag_interest()** (5 connections) — `backend/app/services/scoring_engine.py`
- **_update_recipient_sentiment()** (4 connections) — `backend/app/services/scoring_engine.py`
- **datetime** (3 connections) — `backend/app/services/scoring_engine.py`
- **score_to_segment()** (3 connections) — `backend/app/services/segmentation.py`
- **parse_thresholds()** (3 connections) — `backend/app/services/segmentation.py`
- **APScheduler 6h job: decay scores for leads silent >24h.** (1 connections) — `backend/app/main.py`
- **AIRA Score Engine v2  Composite score = clamp(arc + intent_delta + engagement_de** (1 connections) — `backend/app/services/scoring_engine.py`
- **LLM scores the conversation thread for overall purchase intent.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Main entry point. Computes composite score, persists to DB, returns breakdown.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Write reply_sentiment to the broadcast_recipients row for this lead.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Update lead_tag_interest with the most-recent broadcast's score.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Scheduler job: recompute engagement delta and score for all leads     that have** (1 connections) — `backend/app/services/scoring_engine.py`
- **int** (1 connections) — `backend/app/services/segmentation.py`
- **str** (1 connections) — `backend/app/services/segmentation.py`

## Relationships

- [[Tests: Scoring Engine]] (18 shared connections)
- [[Leads API]] (1 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[Templates API]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Bot Flow / Automation Engine]] (1 shared connections)
- [[Autopilot & AI Agent Runtime]] (1 shared connections)

## Source Files

- `backend/app/main.py`
- `backend/app/services/scoring_engine.py`
- `backend/app/services/segmentation.py`

## Audit Trail

- EXTRACTED: 82 (86%)
- INFERRED: 13 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*