# Tests: Scoring Engine

> 15 nodes · cohesion 0.23

## Key Concepts

- **_compute_engagement_delta()** (12 connections) — `backend/app/services/scoring_engine.py`
- **test_scoring_engine.py** (8 connections) — `backend/tests/test_scoring_engine.py`
- **TestEngagementDelta** (8 connections) — `backend/tests/test_scoring_engine.py`
- **._days_ago()** (7 connections) — `backend/tests/test_scoring_engine.py`
- **.test_replied_today_is_zero()** (3 connections) — `backend/tests/test_scoring_engine.py`
- **.test_replied_yesterday_is_zero()** (3 connections) — `backend/tests/test_scoring_engine.py`
- **.test_2_days_silent_is_minus1()** (3 connections) — `backend/tests/test_scoring_engine.py`
- **.test_10_days_silent_is_minus3()** (3 connections) — `backend/tests/test_scoring_engine.py`
- **datetime** (2 connections) — `backend/tests/test_scoring_engine.py`
- **.test_none_last_inbound_is_zero()** (2 connections) — `backend/tests/test_scoring_engine.py`
- **.test_naive_datetime_handled()** (2 connections) — `backend/tests/test_scoring_engine.py`
- **Time-decay based on days since last inbound message.** (1 connections) — `backend/app/services/scoring_engine.py`
- **_score_to_segment()** (1 connections) — `backend/tests/test_scoring_engine.py`
- **float** (1 connections) — `backend/tests/test_scoring_engine.py`
- **Tests for Score Engine v2 pure functions. No DB, no Groq — only deterministic lo** (1 connections) — `backend/tests/test_scoring_engine.py`

## Relationships

- [[Score Engine v2 & Segmentation]] (5 shared connections)
- [[Tests: Scoring Engine]] (4 shared connections)

## Source Files

- `backend/app/services/scoring_engine.py`
- `backend/tests/test_scoring_engine.py`

## Audit Trail

- EXTRACTED: 45 (79%)
- INFERRED: 12 (21%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*