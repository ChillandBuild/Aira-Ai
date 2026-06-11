# CTWA Leads

> 20 nodes · cohesion 0.19

## Key Concepts

- **CtwaLead** (12 connections) — `frontend/lib/api.ts`
- **list_meta_ad_leads()** (9 connections) — `backend/app/routes/ctwa_leads.py`
- **export_meta_ad_leads()** (9 connections) — `backend/app/routes/ctwa_leads.py`
- **str** (8 connections) — `backend/app/routes/ctwa_leads.py`
- **_fetch_ad_leads()** (6 connections) — `backend/app/routes/ctwa_leads.py`
- **_fetch_campaign_names()** (5 connections) — `backend/app/routes/ctwa_leads.py`
- **_fetch_first_keywords()** (5 connections) — `backend/app/routes/ctwa_leads.py`
- **_enrich()** (5 connections) — `backend/app/routes/ctwa_leads.py`
- **_fmt_ist()** (4 connections) — `backend/app/routes/ctwa_leads.py`
- **list_campaigns()** (4 connections) — `backend/app/routes/ctwa_leads.py`
- **int** (2 connections) — `backend/app/routes/ctwa_leads.py`
- **Meta Ad Leads — Inbound leads from Meta Ad click-to-message campaigns.  Covers a** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **Format UTC ISO timestamp to IST string.** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **Fetch leads where ad_campaign_id IS NOT NULL (came via a Meta Ad).     Returns (** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **Look up campaign names for a set of campaign IDs. Returns {id: name}.** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **For each lead_id, fetch the first inbound message (the CTA keyword/pre-fill text** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **Attach campaign name and keyword to each lead row.** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **Return all ad campaigns for this tenant (used for filter dropdown).** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **List all inbound leads that arrived via a Meta Ad (ad_campaign_id IS NOT NULL).** (1 connections) — `backend/app/routes/ctwa_leads.py`
- **CSV export for Meta Ad leads.     Columns: Phone | Name | Channel | Keyword (Fir** (1 connections) — `backend/app/routes/ctwa_leads.py`

## Relationships

- [[Leads API]] (3 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Upload Page]] (1 shared connections)
- [[API Client (frontend)]] (1 shared connections)

## Source Files

- `backend/app/routes/ctwa_leads.py`
- `frontend/lib/api.ts`

## Audit Trail

- EXTRACTED: 75 (96%)
- INFERRED: 3 (4%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*