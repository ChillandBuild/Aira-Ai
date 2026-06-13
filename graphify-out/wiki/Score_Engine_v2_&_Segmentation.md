# Score Engine v2 & Segmentation

> 24 nodes · cohesion 0.14

## Key Concepts

- **_apply_engagement_decay()** (16 connections) — `backend/app/main.py`
- **compute_score()** (15 connections) — `backend/app/services/scoring_engine.py`
- **scoring_engine.py** (14 connections) — `backend/app/services/scoring_engine.py`
- **str** (10 connections) — `backend/app/services/scoring_engine.py`
- **apply_engagement_decay_all()** (10 connections) — `backend/app/services/scoring_engine.py`
- **int** (8 connections) — `backend/app/services/scoring_engine.py`
- **_score_arc()** (7 connections) — `backend/app/services/scoring_engine.py`
- **_parse_dt()** (6 connections) — `backend/app/services/scoring_engine.py`
- **_rollup_tag_interest()** (5 connections) — `backend/app/services/scoring_engine.py`
- **_update_recipient_sentiment()** (4 connections) — `backend/app/services/scoring_engine.py`
- **datetime** (3 connections) — `backend/app/services/scoring_engine.py`
- **APScheduler 6h job: decay scores for leads silent >24h.** (1 connections) — `backend/app/main.py`
- **AIRA Score Engine v2  Composite score = clamp(arc + intent_delta + engagement_de** (1 connections) — `backend/app/services/scoring_engine.py`
- **LLM scores the conversation thread for overall purchase intent.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Main entry point. Computes composite score, persists to DB, returns breakdown.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Scheduler job: recompute engagement delta and score for all leads     that have** (1 connections) — `backend/app/services/scoring_engine.py`
- **APScheduler 6h job: decay scores for leads silent >24h.** (1 connections) — `backend/app/main.py`
- **APScheduler 6h job: decay scores for leads silent >24h.** (1 connections) — `backend/app/main.py`
- **APScheduler 6h job: decay scores for leads silent >24h.** (1 connections) — `backend/app/main.py`
- **LLM scores the conversation thread for overall purchase intent.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Main entry point. Computes composite score, persists to DB, returns breakdown.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Write reply_sentiment to the broadcast_recipients row for this lead.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Update lead_tag_interest with the most-recent broadcast's score.** (1 connections) — `backend/app/services/scoring_engine.py`
- **Scheduler job: recompute engagement delta and score for all leads     that have** (1 connections) — `backend/app/services/scoring_engine.py`

## Relationships

- [[Tests: Scoring Engine]] (20 shared connections)
- [[Callers CRUD & Coaching]] (1 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)

## Source Files

- `backend/app/main.py`
- `backend/app/services/scoring_engine.py`

## Audit Trail

- EXTRACTED: 100 (90%)
- INFERRED: 11 (10%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*