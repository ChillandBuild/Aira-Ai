# Inbound Lead Reporting

> 35 nodes · cohesion 0.09

## Key Concepts

- **InboundLead** (17 connections) — `frontend/lib/api.ts`
- **list_inbound_leads()** (9 connections) — `backend/app/routes/inbound_leads.py`
- **export_inbound_leads()** (9 connections) — `backend/app/routes/inbound_leads.py`
- **str** (8 connections) — `backend/app/routes/inbound_leads.py`
- **aggregate_inbound()** (7 connections) — `backend/app/services/inbound_leads_logic.py`
- **_fetch_inbound_leads()** (6 connections) — `backend/app/routes/inbound_leads.py`
- **_fetch_campaign_names()** (5 connections) — `backend/app/routes/inbound_leads.py`
- **_fetch_first_keywords()** (5 connections) — `backend/app/routes/inbound_leads.py`
- **_enrich()** (5 connections) — `backend/app/routes/inbound_leads.py`
- **lead_origin()** (5 connections) — `backend/app/services/inbound_leads_logic.py`
- **test_inbound_leads_logic.py** (5 connections) — `backend/tests/test_inbound_leads_logic.py`
- **_fmt_ist()** (4 connections) — `backend/app/routes/inbound_leads.py`
- **list_campaigns()** (4 connections) — `backend/app/routes/inbound_leads.py`
- **inbound_leads_logic.py** (4 connections) — `backend/app/services/inbound_leads_logic.py`
- **int** (2 connections) — `backend/app/routes/inbound_leads.py`
- **str** (2 connections) — `backend/app/services/inbound_leads_logic.py`
- **test_lead_origin_is_ad_when_campaign_present_else_organic()** (2 connections) — `backend/tests/test_inbound_leads_logic.py`
- **test_aggregate_inbound_splits_organic_vs_ad_and_buckets_by_utc_day()** (2 connections) — `backend/tests/test_inbound_leads_logic.py`
- **Inbound Leads — all leads that arrived through a messaging channel.  Inbound uni** (1 connections) — `backend/app/routes/inbound_leads.py`
- **Format UTC ISO timestamp to IST string.** (1 connections) — `backend/app/routes/inbound_leads.py`
- **Fetch inbound leads (source in INBOUND_SOURCES). Returns (rows, total_count).** (1 connections) — `backend/app/routes/inbound_leads.py`
- **Look up campaign names for a set of campaign IDs. Returns {id: name}.** (1 connections) — `backend/app/routes/inbound_leads.py`
- **For each lead_id, fetch the first inbound message (the CTA keyword/pre-fill text** (1 connections) — `backend/app/routes/inbound_leads.py`
- **Attach campaign name, keyword, and origin to each lead row.** (1 connections) — `backend/app/routes/inbound_leads.py`
- **Return all ad campaigns for this tenant (used for filter dropdown).** (1 connections) — `backend/app/routes/inbound_leads.py`
- *... and 10 more nodes in this community*

## Relationships

- [[Leads & Conversations API]] (3 shared connections)
- [[Upload / Broadcast Page]] (2 shared connections)
- [[Analytics (dashboard + API)]] (1 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Leads Page & API Client]] (1 shared connections)

## Source Files

- `backend/app/routes/inbound_leads.py`
- `backend/app/services/inbound_leads_logic.py`
- `backend/tests/test_inbound_leads_logic.py`
- `frontend/lib/api.ts`

## Audit Trail

- EXTRACTED: 110 (93%)
- INFERRED: 8 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*