# Inbound Lead Reporting — Design Spec

**Date:** 2026-06-06
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** Close the inbound-side reporting gaps. Outbound (broadcast) reporting is already done and is out of scope.

---

## 1. Problem

Outbound broadcast reporting is complete: per-broadcast stats, downloads by
Hot/Warm/Cold/Disqualified + opted-out, grouped under tags.

The **inbound** side has gaps. Inbound leads arrive two ways:

- **Meta Ad leads** — clicked a WhatsApp / Instagram / Facebook ad CTA.
- **Organic leads** — messaged directly, no ad.

What is missing today:

1. No way to download Meta Ad leads filtered by **segment** (the export carries a
   segment *column* but has no segment *filter*).
2. No dedicated **organic leads** view — the Meta Ad Leads page explicitly excludes
   organic; the main Leads page mixes them in with no origin filter.
3. No metric for **how many leads were acquired per day**, split organic vs ad.

## 2. Data model (foundation — all reporting derives from these rules)

Two **independent** dimensions exist on every lead and must not be conflated:

| Dimension | Column | Values | Meaning |
|---|---|---|---|
| Channel | `leads.source` | whatsapp / instagram / facebook / telegram / upload / manual | which pipe |
| Acquisition origin | `leads.ad_campaign_id` | NOT NULL = Ad · NULL = Organic | whether an ad paid for it |

**Derived definitions:**

| Concept | Rule |
|---|---|
| Inbound lead | `source IN ('whatsapp','instagram','facebook','telegram')` — **excludes** `upload` and `manual` |
| Origin = Ad | inbound lead AND `ad_campaign_id IS NOT NULL` |
| Origin = Organic | inbound lead AND `ad_campaign_id IS NULL` |
| Acquisition day | `leads.created_at` (first contact), bucketed in **IST** |
| Segment | `leads.segment` (A=Hot, B=Warm, C=Cold, D=Disqualified) — already maintained |

**Confirmed consequences:**
- Upload/manual leads never appear in any inbound report.
- Opted-out leads **are still counted** as inbound leads (opt-out is an outbound /
  broadcast concept and is irrelevant to inbound acquisition).
- Deleted leads (`deleted_at IS NOT NULL`) are excluded.
- The failed-broadcast-only exclusion (used by the main leads export) does **not**
  apply here — inbound acquisition is independent of broadcast outcomes.

The unit of reporting is **new leads acquired** (each lead counted once, on its
acquisition day) — not raw message count, not unique active conversations.

## 3. Feature A — Inbound Leads page

Rename the existing Meta Ad Leads page to **"Inbound Leads"** — full rename for a
clean end state (no `ctwa` naming left in the user-facing surface or routes).

**Rename map:**

| Layer | From | To |
|---|---|---|
| Frontend page folder | `frontend/app/dashboard/ctwa-leads/` | `frontend/app/dashboard/inbound-leads/` |
| API client key | `api.ctwaLeads` in `frontend/lib/api.ts` | `api.inboundLeads` |
| API client paths | `/api/v1/ctwa-leads/...` | `/api/v1/inbound-leads/...` |
| Export filename | `ctwa_leads_ad_traffic.csv` | `inbound_leads.csv` |
| Sidebar | href `/dashboard/ctwa-leads`, label "Meta Ad Leads" | href `/dashboard/inbound-leads`, label "Inbound Leads" |
| Backend route file | `backend/app/routes/ctwa_leads.py` | `backend/app/routes/inbound_leads.py` |
| Backend prefix | `/api/v1/ctwa-leads` (in `main.py`) | `/api/v1/inbound-leads` |
| Page copy | "Meta Ad Leads", empty-state, footer | "Inbound Leads" wording |

The per-row "Meta Ad" origin badge in `conversation-list.tsx` is unrelated (it
labels a lead's origin, not the page) and is left unchanged.

### UI

```
Inbound Leads
┌──────────────────────────────────────────────────────────┐
│ Origin: [ All ][ Organic ][ Ad ]      Segment: [ All ▾ ]  │
│ Channel:[ All ▾ ]  Campaign:[ All ▾ ]  Date:[__]→[__]      │
│                                          [ Export CSV ]    │
├──────────────────────────────────────────────────────────┤
│ Phone     Name    Origin   Channel   Keyword   Seg  Score │
│ +91…      Asha    Organic  WhatsApp   —         A    8     │
│ +91…      Ravi    Ad       WhatsApp   "interested" B   6   │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- **Origin toggle** (All / Organic / Ad) drives the `ad_campaign_id` filter:
  All = no filter · Organic = `IS NULL` · Ad = `IS NOT NULL`.
- **Campaign filter** auto-disables when Origin = Organic (organic leads have no campaign).
- **Segment filter** (All / A / B / C / D).
- **Channel + Campaign + Date** filters retained from the current page.
- New **Origin** column in both the table and the CSV.
- **Keyword** column retained (ad CTA pre-fill text; blank for organic — expected).
- **Export** respects every active filter, including segment and origin. This is the
  primary gap-closer: e.g. "download Hot ad leads" or "download Disqualified organic leads".

## 4. Feature B — Analytics "Inbound" tab

Add a new **Inbound** tab to the Analytics page
(`frontend/app/dashboard/analytics/page.tsx`), between Channels and Telecalling.
Respects the existing global date-range selector.

```
[Overview][Channels][Inbound ◄new][Telecalling][Pipeline][Templates]

┌─ KPIs ──────────────────────────────────────────────┐
│ New Leads (today) 42 │ Organic 18 │ Ad 24            │
│ New Leads (range) 310 │ Organic 120 │ Ad 190         │
├─ Daily trend (stacked bars: organic vs ad) ─────────┤
│  ▆▆ ▇▇ ██ ▅▅ ▆▆  …                                   │
├─ By segment (inbound only) ─┬─ By channel ──────────┤
│ Hot 60 Warm 110 Cold 120 DQ │ WA 240 IG 40 FB 20 TG │
└─────────────────────────────┴───────────────────────┘
```

- All counts use the Section 2 rules (inbound universe, IST day buckets).
- "By segment" is **inbound-only** and will not match the Pipeline tab (which counts
  all leads including upload/manual). Label it clearly to avoid confusion.

## 5. Backend changes

### 5.1 `inbound_leads.py` (renamed from `ctwa_leads.py`, extended)

- Rename file + route prefix per the table in §3; update the import line and
  `include_router` call in `backend/app/main.py`.
- Add query params `origin` (`all` | `organic` | `ad`, default `all`) and
  `segment` (`A`|`B`|`C`|`D`, optional) to `GET /` and `GET /export`.
- Replace the hard-coded `.not_.is_("ad_campaign_id", "null")` with logic driven by
  `origin`.
- Add the inbound-universe filter `source IN ('whatsapp','instagram','facebook','telegram')`
  to every data and count query.
- Add `origin` to the enriched row output and to the CSV columns.
- `_fetch_ad_leads` → generalize to `_fetch_inbound_leads` with the new params
  (keep the function focused; the helper functions `_fetch_campaign_names`,
  `_fetch_first_keywords`, `_enrich` are reused as-is, with `_enrich` adding origin).

### 5.2 `analytics.py` — new endpoint

`GET /api/v1/analytics/inbound?range=<range>` returns:

```json
{
  "kpis": {
    "today": { "total": 42, "organic": 18, "ad": 24 },
    "range": { "total": 310, "organic": 120, "ad": 190 }
  },
  "daily": [ { "day": "2026-06-01", "organic": 12, "ad": 20 }, ... ],
  "by_segment": { "A": 60, "B": 110, "C": 120, "D": 20 },
  "by_channel": { "whatsapp": 240, "instagram": 40, "facebook": 20, "telegram": 10 }
}
```

- Single fetch of inbound leads in range (`source IN (...)`, `deleted_at IS NULL`),
  then aggregate in Python (mirrors existing analytics endpoints' style).
- UTC day bucketing (`created_at[:10]` + `_range_params` days), matching the existing
  Overview/Channels daily series.

### 5.3 No migration

All required columns (`source`, `ad_campaign_id`, `segment`, `created_at`,
`deleted_at`) already exist. No schema change.

## 6. Edge cases

| Case | Handling |
|---|---|
| Opted-out lead | Counted (opt-out is outbound-only) |
| Deleted lead | Excluded (`deleted_at IS NULL`) |
| Upload / manual lead | Excluded from all inbound reports |
| Organic + campaign filter set | Campaign filter ignored / disabled in UI |
| Failed-broadcast-only lead | Not excluded (independent of broadcast outcome) |
| Day boundaries | UTC day (`created_at[:10]`), consistent with existing analytics daily series (Overview/Channels bucket by UTC, not IST) |

## 7. Out of scope

- Outbound / broadcast reporting (already done).
- Any change to how `source` or `ad_campaign_id` is populated at ingestion
  (webhook attribution logic is unchanged).
- Opt-out filtering on inbound (deliberately excluded — outbound-only concept).
- New database migrations.

## 8. Testing

- Backend: param-matrix tests for `ctwa_leads` list + export (origin × segment ×
  channel), asserting upload/manual excluded and organic = `ad_campaign_id IS NULL`.
- Backend: `analytics/inbound` aggregation correctness (organic/ad split, IST day
  bucketing, segment/channel totals).
- Frontend: Inbound Leads page filter wiring (origin toggle disables campaign for
  organic; export passes active filters). Analytics Inbound tab renders KPIs + chart.
