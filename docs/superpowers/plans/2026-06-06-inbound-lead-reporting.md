# Inbound Lead Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboard a unified Inbound Leads page (organic + ad, segment-filterable, segmented CSV export) and an Analytics "Inbound" tab reporting new leads acquired per day split organic vs ad.

**Architecture:** Extract inbound reporting logic into a pure-Python module (`services/inbound_leads_logic.py`) that is unit-tested deterministically. The existing `ctwa_leads.py` route is renamed to `inbound_leads.py` and extended with `origin`/`segment` params + an inbound-channel filter. A new `GET /api/v1/analytics/inbound` endpoint aggregates via the pure module. Frontend renames the page folder, adds an origin toggle + segment filter + segmented export, and adds an Analytics Inbound tab.

**Tech Stack:** FastAPI (backend/app/), Supabase client, Next.js 14 App Router + TypeScript + Tailwind + Recharts (frontend/app/dashboard/), pytest/unittest for backend tests.

**Spec:** `docs/superpowers/specs/2026-06-06-inbound-lead-reporting-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `backend/app/services/inbound_leads_logic.py` | Pure constants + helpers + analytics aggregation | Create |
| `backend/tests/test_inbound_leads_logic.py` | Unit tests for the pure module | Create |
| `backend/app/routes/inbound_leads.py` | Inbound Leads list/export route (renamed + extended) | Create (from `ctwa_leads.py`) |
| `backend/app/routes/ctwa_leads.py` | Old route file | Delete |
| `backend/app/routes/analytics.py` | Add `GET /inbound` endpoint | Modify |
| `backend/app/main.py` | Swap import + router registration | Modify |
| `backend/tests/test_inbound_leads_route_static.py` | Static assertions on route + analytics wiring | Create |
| `frontend/app/dashboard/inbound-leads/page.tsx` | Inbound Leads page (renamed + filters) | Create (from `ctwa-leads/page.tsx`) |
| `frontend/app/dashboard/ctwa-leads/page.tsx` | Old page | Delete |
| `frontend/lib/api.ts` | Rename `ctwaLeads`→`inboundLeads`, new params/paths | Modify |
| `frontend/components/sidebar.tsx` | Rename link + label | Modify |
| `frontend/app/dashboard/analytics/page.tsx` | Add Inbound tab | Modify |

Run all backend test commands from `backend/`. Run all frontend build commands from `frontend/`.

---

## Task 1: Pure inbound logic module

**Files:**
- Create: `backend/app/services/inbound_leads_logic.py`
- Test: `backend/tests/test_inbound_leads_logic.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_inbound_leads_logic.py`:

```python
"""Tests for inbound lead reporting pure logic. No DB, no network."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.inbound_leads_logic import (
    INBOUND_SOURCES,
    is_inbound_lead,
    lead_origin,
    aggregate_inbound,
)


def test_inbound_sources_are_the_four_messaging_channels():
    assert set(INBOUND_SOURCES) == {"whatsapp", "instagram", "facebook", "telegram"}


def test_is_inbound_lead_excludes_upload_and_manual():
    assert is_inbound_lead({"source": "whatsapp"}) is True
    assert is_inbound_lead({"source": "telegram"}) is True
    assert is_inbound_lead({"source": "upload"}) is False
    assert is_inbound_lead({"source": "manual"}) is False
    assert is_inbound_lead({"source": None}) is False
    assert is_inbound_lead({}) is False


def test_lead_origin_is_ad_when_campaign_present_else_organic():
    assert lead_origin({"ad_campaign_id": "abc"}) == "ad"
    assert lead_origin({"ad_campaign_id": None}) == "organic"
    assert lead_origin({}) == "organic"


def test_aggregate_inbound_splits_organic_vs_ad_and_buckets_by_utc_day():
    days = ["2026-06-05", "2026-06-06"]
    today = "2026-06-06"
    leads = [
        # organic whatsapp today
        {"source": "whatsapp", "ad_campaign_id": None, "segment": "A",
         "created_at": "2026-06-06T03:00:00+00:00"},
        # ad whatsapp today
        {"source": "whatsapp", "ad_campaign_id": "c1", "segment": "B",
         "created_at": "2026-06-06T10:00:00+00:00"},
        # ad instagram yesterday
        {"source": "instagram", "ad_campaign_id": "c1", "segment": "C",
         "created_at": "2026-06-05T22:00:00+00:00"},
        # upload lead must be ignored entirely
        {"source": "upload", "ad_campaign_id": None, "segment": "A",
         "created_at": "2026-06-06T05:00:00+00:00"},
    ]
    out = aggregate_inbound(leads, days, today)

    assert out["kpis"]["today"] == {"total": 2, "organic": 1, "ad": 1}
    assert out["kpis"]["range"] == {"total": 3, "organic": 1, "ad": 2}
    assert out["daily"] == [
        {"day": "2026-06-05", "organic": 0, "ad": 1},
        {"day": "2026-06-06", "organic": 1, "ad": 1},
    ]
    assert out["by_segment"] == {"A": 1, "B": 1, "C": 1, "D": 0}
    assert out["by_channel"] == {"whatsapp": 2, "instagram": 1, "facebook": 0, "telegram": 0}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_inbound_leads_logic.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.inbound_leads_logic'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/inbound_leads_logic.py`:

```python
"""Pure logic for inbound lead reporting. No DB, no network — unit-testable."""

INBOUND_SOURCES = ("whatsapp", "instagram", "facebook", "telegram")


def is_inbound_lead(lead: dict) -> bool:
    """True when the lead arrived through a messaging channel (not upload/manual)."""
    return (lead.get("source") or "") in INBOUND_SOURCES


def lead_origin(lead: dict) -> str:
    """'ad' when an ad campaign is attributed, else 'organic'."""
    return "ad" if lead.get("ad_campaign_id") else "organic"


def aggregate_inbound(leads: list[dict], days_iso: list[str], today_iso: str) -> dict:
    """
    Aggregate already-fetched inbound leads into the analytics payload.
    Day bucketing uses UTC date (created_at[:10]) to match existing analytics tabs.
    Non-inbound leads are skipped defensively.
    """
    daily = {d: {"organic": 0, "ad": 0} for d in days_iso}
    by_segment = {"A": 0, "B": 0, "C": 0, "D": 0}
    by_channel = {s: 0 for s in INBOUND_SOURCES}
    today = {"total": 0, "organic": 0, "ad": 0}
    rng = {"total": 0, "organic": 0, "ad": 0}

    for lead in leads:
        if not is_inbound_lead(lead):
            continue
        origin = lead_origin(lead)
        day = (lead.get("created_at") or "")[:10]

        rng["total"] += 1
        rng[origin] += 1
        if day in daily:
            daily[day][origin] += 1
        if day == today_iso:
            today["total"] += 1
            today[origin] += 1

        seg = lead.get("segment")
        if seg in by_segment:
            by_segment[seg] += 1
        src = lead.get("source")
        if src in by_channel:
            by_channel[src] += 1

    return {
        "kpis": {"today": today, "range": rng},
        "daily": [
            {"day": d, "organic": daily[d]["organic"], "ad": daily[d]["ad"]}
            for d in days_iso
        ],
        "by_segment": by_segment,
        "by_channel": by_channel,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_inbound_leads_logic.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/inbound_leads_logic.py backend/tests/test_inbound_leads_logic.py
git commit -m "feat(analytics): inbound lead reporting pure logic"
```

---

## Task 2: Analytics `/inbound` endpoint

**Files:**
- Modify: `backend/app/routes/analytics.py` (add endpoint near the other `@router.get` handlers)

- [ ] **Step 1: Add the import**

At the top of `backend/app/routes/analytics.py`, after the existing imports, add:

```python
from app.services.inbound_leads_logic import INBOUND_SOURCES, aggregate_inbound
```

- [ ] **Step 2: Add the endpoint**

Append to `backend/app/routes/analytics.py`:

```python
@router.get("/inbound")
async def inbound_analytics(
    range: str = "7d",
    tenant_id: str = Depends(get_tenant_id),
):
    """New inbound leads acquired, split organic vs ad. Range: today|7d|30d."""
    db = get_supabase()
    start_dt, days_iso = _range_params(range)
    today_iso = datetime.now(timezone.utc).date().isoformat()

    rows = (
        db.table("leads")
        .select("id,source,ad_campaign_id,segment,created_at")
        .eq("tenant_id", tenant_id)
        .in_("source", list(INBOUND_SOURCES))
        .is_("deleted_at", "null")
        .gte("created_at", start_dt.isoformat())
        .execute()
    )
    leads = rows.data or []
    return aggregate_inbound(leads, days_iso, today_iso)
```

- [ ] **Step 3: Verify it imports cleanly**

Run: `cd backend && python -c "import app.routes.analytics"`
Expected: no output, exit 0 (no ImportError)

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/analytics.py
git commit -m "feat(analytics): GET /analytics/inbound organic-vs-ad endpoint"
```

---

## Task 3: Rename + extend the inbound leads route

**Files:**
- Create: `backend/app/routes/inbound_leads.py`
- Delete: `backend/app/routes/ctwa_leads.py`

This task renames `ctwa_leads.py` → `inbound_leads.py` and adds `origin` + `segment`
params plus the inbound-channel filter. The route prefix change happens in Task 4.

- [ ] **Step 1: Copy the file**

```bash
git mv backend/app/routes/ctwa_leads.py backend/app/routes/inbound_leads.py
```

- [ ] **Step 2: Replace the module docstring**

In `backend/app/routes/inbound_leads.py`, replace the top docstring with:

```python
"""
Inbound Leads — all leads that arrived through a messaging channel.

Inbound universe:  source IN ('whatsapp','instagram','facebook','telegram')
  (upload / manual leads are NOT inbound and never appear here)

Origin (independent of channel):
  ad_campaign_id IS NOT NULL  →  origin = "ad"      (clicked a Meta Ad CTA)
  ad_campaign_id IS NULL      →  origin = "organic" (messaged directly)

The "keyword" is the first inbound message the lead sent — for ad leads this is
the pre-filled CTA text; for organic leads it is just their opening message.
"""
```

- [ ] **Step 3: Add the inbound-sources constant**

In `backend/app/routes/inbound_leads.py`, add near the top imports:

```python
from app.services.inbound_leads_logic import INBOUND_SOURCES
```

- [ ] **Step 4: Replace `_fetch_ad_leads` with `_fetch_inbound_leads`**

Replace the entire `_fetch_ad_leads` function with this `_fetch_inbound_leads`
(adds `origin` + `segment`, applies the inbound-source filter, origin-drives the
`ad_campaign_id` predicate on BOTH the data and count queries):

```python
def _fetch_inbound_leads(
    db,
    tenant_id: str,
    *,
    origin: str = "all",
    segment: str | None = None,
    ad_campaign_id: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """
    Fetch inbound leads (source in INBOUND_SOURCES). Returns (rows, total_count).
    origin: "all" | "organic" | "ad". Two simple queries, no JOIN.
    """
    def _apply_common(q):
        q = (
            q.eq("tenant_id", tenant_id)
            .in_("source", list(INBOUND_SOURCES))
            .is_("deleted_at", "null")
        )
        if origin == "ad":
            q = q.not_.is_("ad_campaign_id", "null")
        elif origin == "organic":
            q = q.is_("ad_campaign_id", "null")
        if segment:
            q = q.eq("segment", segment)
        if ad_campaign_id:
            q = q.eq("ad_campaign_id", ad_campaign_id)
        if source:
            q = q.eq("source", source)
        if date_from:
            q = q.gte("created_at", date_from)
        if date_to:
            q = q.lte("created_at", date_to)
        return q

    data_q = _apply_common(
        db.table("leads").select(
            "id,phone,name,source,score,segment,created_at,ad_campaign_id"
        )
    )
    data_result = (
        data_q.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    rows = data_result.data or []

    count_q = _apply_common(db.table("leads").select("id", count="exact"))
    count_result = count_q.execute()
    total = count_result.count or len(rows)

    return rows, total
```

- [ ] **Step 5: Add origin to `_enrich`**

In `_enrich`, add an `origin` key to each appended dict (right after `"source": src,`):

```python
            "origin": "ad" if lead.get("ad_campaign_id") else "organic",
```

- [ ] **Step 6: Update the list endpoint**

Replace the `list_meta_ad_leads` handler signature + body so it accepts the new
params and calls `_fetch_inbound_leads`:

```python
@router.get("/")
async def list_inbound_leads(
    origin: str = Query("all", pattern="^(all|organic|ad)$"),
    segment: str | None = Query(None, pattern="^[ABCD]$"),
    ad_campaign_id: str | None = Query(None),
    source: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
):
    """List inbound leads (organic + ad) with optional origin/segment/channel filters."""
    db = get_supabase()
    offset = (page - 1) * limit
    try:
        leads, total = _fetch_inbound_leads(
            db, tenant_id,
            origin=origin, segment=segment,
            ad_campaign_id=ad_campaign_id, source=source,
            date_from=date_from, date_to=date_to,
            limit=limit, offset=offset,
        )
    except Exception as e:
        logger.error(f"inbound-leads list error: {e}")
        return {"data": [], "total": 0, "page": page, "limit": limit}

    if not leads:
        return {"data": [], "total": total, "page": page, "limit": limit}

    lead_ids = [l["id"] for l in leads]
    campaign_ids = list({l["ad_campaign_id"] for l in leads if l.get("ad_campaign_id")})
    campaign_map = _fetch_campaign_names(db, tenant_id, campaign_ids)
    keyword_map = _fetch_first_keywords(db, tenant_id, lead_ids)
    enriched = _enrich(leads, campaign_map, keyword_map)
    return {"data": enriched, "total": total, "page": page, "limit": limit}
```

- [ ] **Step 7: Update the export endpoint**

Replace the `export_meta_ad_leads` handler so it accepts `origin` + `segment`, adds
an `origin` CSV column, and downloads as `inbound_leads.csv`:

```python
@router.get("/export")
async def export_inbound_leads(
    origin: str = Query("all", pattern="^(all|organic|ad)$"),
    segment: str | None = Query(None, pattern="^[ABCD]$"),
    ad_campaign_id: str | None = Query(None),
    source: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tenant_id: str = Depends(get_tenant_id),
):
    """CSV export for inbound leads. Respects origin/segment/channel/campaign/date filters."""
    db = get_supabase()
    try:
        leads, _ = _fetch_inbound_leads(
            db, tenant_id,
            origin=origin, segment=segment,
            ad_campaign_id=ad_campaign_id, source=source,
            date_from=date_from, date_to=date_to,
            limit=5000, offset=0,
        )
    except Exception as e:
        logger.error(f"inbound-leads export error: {e}")
        leads = []

    FIELDNAMES = [
        "phone", "name", "origin", "channel", "keyword",
        "ad_campaign", "date_joined_ist", "segment", "score",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=FIELDNAMES, extrasaction="ignore")
    writer.writeheader()

    if leads:
        lead_ids = [l["id"] for l in leads]
        campaign_ids = list({l["ad_campaign_id"] for l in leads if l.get("ad_campaign_id")})
        campaign_map = _fetch_campaign_names(db, tenant_id, campaign_ids)
        keyword_map = _fetch_first_keywords(db, tenant_id, lead_ids)
        enriched = _enrich(leads, campaign_map, keyword_map)
        for lead in enriched:
            writer.writerow({
                "phone": lead["phone"],
                "name": lead["name"],
                "origin": lead["origin"],
                "channel": lead["channel_label"],
                "keyword": lead["keyword"],
                "ad_campaign": lead["campaign_name"],
                "date_joined_ist": _fmt_ist(lead["created_at"]),
                "segment": lead["segment_label"],
                "score": lead["score"],
            })

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inbound_leads.csv"},
    )
```

- [ ] **Step 8: Verify the module imports**

Run: `cd backend && python -c "import app.routes.inbound_leads"`
Expected: no output, exit 0

- [ ] **Step 9: Commit** (defer — commit together with Task 4 so the app stays runnable)

---

## Task 4: Wire the renamed route into main.py

**Files:**
- Modify: `backend/app/main.py:11` (import line), `:281` (router registration)

- [ ] **Step 1: Update the import line**

In `backend/app/main.py`, on the `from app.routes import ...` line, replace
`ctwa_leads` with `inbound_leads`.

- [ ] **Step 2: Update the router registration**

Replace the existing line:

```python
app.include_router(ctwa_leads.router, prefix="/api/v1/ctwa-leads", tags=["ctwa-leads"], dependencies=_auth)
```

with:

```python
app.include_router(inbound_leads.router, prefix="/api/v1/inbound-leads", tags=["inbound-leads"], dependencies=_auth)
```

- [ ] **Step 3: Verify the app imports**

Run: `cd backend && python -c "import app.main"`
Expected: no output, exit 0 (no ImportError, no leftover `ctwa_leads` reference)

- [ ] **Step 4: Verify no stray references remain**

Run: `cd backend && grep -rn "ctwa_leads\|ctwa-leads" app/ ; echo "exit:$?"`
Expected: no matches (grep exit 1 printed as `exit:1`)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/inbound_leads.py backend/app/main.py
git commit -m "feat(inbound): rename ctwa-leads route to inbound-leads + add origin/segment filters"
```

---

## Task 5: Static test for route + analytics wiring

**Files:**
- Create: `backend/tests/test_inbound_leads_route_static.py`

Matches the repo's existing static-assertion test pattern (no live DB).

- [ ] **Step 1: Write the test**

Create `backend/tests/test_inbound_leads_route_static.py`:

```python
"""Static assertions on the inbound leads route + analytics wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_old_ctwa_route_file_is_gone():
    assert not (ROOT / "app/routes/ctwa_leads.py").exists()


def test_inbound_route_filters_to_messaging_channels_and_origin():
    src = read("app/routes/inbound_leads.py")
    assert "INBOUND_SOURCES" in src
    assert '.in_("source", list(INBOUND_SOURCES))' in src
    # origin drives the ad_campaign_id predicate
    assert 'origin == "ad"' in src
    assert 'origin == "organic"' in src
    assert '.not_.is_("ad_campaign_id", "null")' in src
    assert '.is_("ad_campaign_id", "null")' in src
    # segment filter present
    assert '.eq("segment", segment)' in src
    # origin column in CSV
    assert '"origin"' in src
    assert "filename=inbound_leads.csv" in src


def test_main_registers_inbound_leads_prefix_not_ctwa():
    main = read("app/main.py")
    assert "/api/v1/inbound-leads" in main
    assert "inbound_leads.router" in main
    assert "ctwa_leads" not in main
    assert "ctwa-leads" not in main


def test_analytics_has_inbound_endpoint():
    src = read("app/routes/analytics.py")
    assert '@router.get("/inbound")' in src
    assert "aggregate_inbound" in src
    assert 'in_("source", list(INBOUND_SOURCES))' in src
```

- [ ] **Step 2: Run the test**

Run: `cd backend && python -m pytest tests/test_inbound_leads_route_static.py -v`
Expected: PASS (4 tests)

- [ ] **Step 3: Run the full inbound test set**

Run: `cd backend && python -m pytest tests/test_inbound_leads_logic.py tests/test_inbound_leads_route_static.py -v`
Expected: PASS (8 tests total)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_inbound_leads_route_static.py
git commit -m "test(inbound): static wiring assertions for inbound leads route + analytics"
```

---

## Task 6: Frontend — rename page folder + API client

**Files:**
- Create: `frontend/app/dashboard/inbound-leads/page.tsx` (from `ctwa-leads/page.tsx`)
- Delete: `frontend/app/dashboard/ctwa-leads/page.tsx`
- Modify: `frontend/lib/api.ts:759-799` (`ctwaLeads` block)
- Modify: `frontend/components/sidebar.tsx:230-242`

- [ ] **Step 1: Move the page folder**

```bash
git mv frontend/app/dashboard/ctwa-leads frontend/app/dashboard/inbound-leads
```

- [ ] **Step 2: Update the API client block**

In `frontend/lib/api.ts`, replace the `ctwaLeads: { ... }` object with `inboundLeads`.
Update the key name, the three paths (`/api/v1/ctwa-leads/...` → `/api/v1/inbound-leads/...`),
add `origin`/`segment` to the query params of both `list` and `exportCsv`, and change
the download filename. Concretely:

```ts
  inboundLeads: {
    async campaigns() {
      const res = await apiFetch<{ data: { id: string; campaign_name: string; platform: string }[] }>(`/api/v1/inbound-leads/campaigns`);
      return res.data;
    },
    async list(params: {
      origin?: string;
      segment?: string;
      ad_campaign_id?: string;
      source?: string;
      date_from?: string;
      date_to?: string;
      page?: number;
      limit?: number;
    }) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null && v !== "") as [string, string][]
      ).toString();
      return apiFetch<{ data: CtwaLead[]; total: number; page: number; limit: number }>(`/api/v1/inbound-leads/?${qs}`);
    },
    async exportCsv(params: {
      origin?: string;
      segment?: string;
      ad_campaign_id?: string;
      source?: string;
      date_from?: string;
      date_to?: string;
    }) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null && v !== "") as [string, string][]
      ).toString();
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/api/v1/inbound-leads/export?${qs}`, { headers });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "inbound_leads.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    },
  },
```

> Note: keep the exact `authHeaders()` / `API_URL` / `apiFetch` helpers already used in the original block — copy their real names from the surrounding file if they differ from the above.

- [ ] **Step 3: Rename the `CtwaLead` type → `InboundLead` and add `origin`**

In `frontend/lib/api.ts`, rename the `CtwaLead` interface to `InboundLead`, add an
`origin: string;` field, and update every reference (the `list` return type above uses
`CtwaLead[]` → `InboundLead[]`). Then update the import/usage in
`frontend/app/dashboard/inbound-leads/page.tsx` (`CtwaLead` → `InboundLead`).

```bash
cd frontend && grep -rn "CtwaLead" app lib
```
Update each hit. After this step no `CtwaLead` identifier should remain.

- [ ] **Step 4: Update the sidebar**

In `frontend/components/sidebar.tsx` (around lines 230-242), change:
- `href="/dashboard/ctwa-leads"` → `href="/dashboard/inbound-leads"`
- both `pathname.startsWith("/dashboard/ctwa-leads")` → `pathname.startsWith("/dashboard/inbound-leads")`
- `<span>Meta Ad Leads</span>` → `<span>Inbound Leads</span>`
- the comment `{/* TOP LEVEL: Meta Ad Leads */}` → `{/* TOP LEVEL: Inbound Leads */}`

- [ ] **Step 5: Verify no stray references**

Run: `cd frontend && grep -rni "ctwa" app lib components ; echo "exit:$?"`
Expected: no matches (`exit:1`) — covers `ctwa-leads`, `ctwaLeads`, and `CtwaLead`.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/inbound-leads frontend/lib/api.ts frontend/components/sidebar.tsx
git commit -m "refactor(frontend): rename Meta Ad Leads page to Inbound Leads"
```

---

## Task 7: Frontend — Inbound Leads page filters

**Files:**
- Modify: `frontend/app/dashboard/inbound-leads/page.tsx`

Add the Origin toggle + Segment filter, an Origin column, page copy, and pass the new
params to list + export.

- [ ] **Step 1: Add filter state + constants**

Near the existing filter state (`selectedCampaign`, `selectedSource`, etc.), add:

```tsx
  const [origin, setOrigin] = useState<"all" | "organic" | "ad">("all");
  const [selectedSegment, setSelectedSegment] = useState("");
```

And near the top-level constants add:

```tsx
const ORIGIN_OPTIONS = [
  { value: "all", label: "All" },
  { value: "organic", label: "Organic" },
  { value: "ad", label: "Ad" },
] as const;

const SEGMENT_FILTER_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "A", label: "Hot" },
  { value: "B", label: "Warm" },
  { value: "C", label: "Cold" },
  { value: "D", label: "Disqualified" },
];
```

- [ ] **Step 2: Pass new params to list + export + deps**

In the load function, pass `origin: origin === "all" ? undefined : origin` and
`segment: selectedSegment || undefined` to `api.inboundLeads.list({...})`. When
`origin === "organic"`, also pass `ad_campaign_id: undefined` (campaign filter is
meaningless for organic). Add `origin` and `selectedSegment` to the effect dependency
array. Mirror the same params into the `handleExport` call to `api.inboundLeads.exportCsv`.

```tsx
        origin: origin === "all" ? undefined : origin,
        segment: selectedSegment || undefined,
        ad_campaign_id: origin === "organic" ? undefined : (selectedCampaign || undefined),
```

- [ ] **Step 3: Render the Origin toggle + Segment select**

In the filters panel, add an origin segmented control and a segment `<select>`
(follow the existing markup style of the campaign/source selects in the file):

```tsx
        <div className="flex gap-1 rounded-lg bg-surface-mid p-1">
          {ORIGIN_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setOrigin(o.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                origin === o.value ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <select
          value={selectedSegment}
          onChange={(e) => setSelectedSegment(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
        >
          {SEGMENT_FILTER_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
```

Disable the campaign select when `origin === "organic"` (add `disabled={origin === "organic"}`
to the existing campaign select).

- [ ] **Step 4: Add the Origin column to the table**

Add a header cell `<th>…Origin…</th>` and a body cell rendering `lead.origin`
(capitalized) in the existing table, positioned after the Name/Channel column to match
the page layout.

- [ ] **Step 5: Update page copy**

Replace the user-facing strings: page title "Meta Ad Leads" → "Inbound Leads";
subtitle → "All inbound leads — organic and Meta Ad, across WhatsApp, Instagram,
Facebook & Telegram."; empty-state "No Meta Ad Leads Yet" → "No Inbound Leads Yet";
footer "{total} Meta Ad leads" → "{total} inbound leads".

- [ ] **Step 6: Include `origin`/`selectedSegment` in active-filter chips**

Update `hasFilters` / `activeFilterCount` to also consider `origin !== "all"` and
`selectedSegment` so the filter badge count is correct.

- [ ] **Step 7: Lint + build**

Run: `cd frontend && npx eslint app/dashboard/inbound-leads/page.tsx --fix && npx next build`
Expected: build succeeds (no unused-vars/type errors). Per project history, unused
imports break the Next.js build — remove any that linger after edits.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/dashboard/inbound-leads/page.tsx
git commit -m "feat(inbound): origin toggle + segment filter + segmented export on Inbound Leads page"
```

---

## Task 8: Frontend — Analytics Inbound tab

**Files:**
- Modify: `frontend/app/dashboard/analytics/page.tsx`

- [ ] **Step 1: Add the API client method**

In `frontend/lib/api.ts`, add to the `analytics` block (alongside the existing
analytics methods):

```ts
    async inbound(range: string) {
      return apiFetch<{
        kpis: {
          today: { total: number; organic: number; ad: number };
          range: { total: number; organic: number; ad: number };
        };
        daily: { day: string; organic: number; ad: number }[];
        by_segment: { A: number; B: number; C: number; D: number };
        by_channel: { whatsapp: number; instagram: number; facebook: number; telegram: number };
      }>(`/api/v1/analytics/inbound?range=${range}`);
    },
```

- [ ] **Step 2: Add `"inbound"` to the Tab union + TABS array**

In `frontend/app/dashboard/analytics/page.tsx`:
- Extend the `Tab` type (line ~35): add `| "inbound"`.
- Add `{ id: "inbound", label: "Inbound" }` to the `TABS` array (after the `channels` entry).

- [ ] **Step 3: Write the `InboundTab` component**

Add this component (reuse existing `KpiCard`, `SectionCard`, and the Recharts imports
already in the file):

```tsx
function InboundTab({ range }: { range: DateRange }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.analytics.inbound>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    api.analytics.inbound(range)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, [range]);

  if (err) return <div className="p-8 text-center text-red-600">{err}</div>;
  if (!data) return <div className="p-8 text-center text-on-surface-muted">Loading…</div>;

  const segMax = Math.max(data.by_segment.A, data.by_segment.B, data.by_segment.C, data.by_segment.D, 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="New Leads Today" value={data.kpis.today.total.toLocaleString()} sub={`Organic ${data.kpis.today.organic} · Ad ${data.kpis.today.ad}`} />
        <KpiCard label="New Leads (range)" value={data.kpis.range.total.toLocaleString()} sub={`Organic ${data.kpis.range.organic} · Ad ${data.kpis.range.ad}`} />
        <KpiCard label="Ad Share" value={`${data.kpis.range.total ? Math.round((data.kpis.range.ad / data.kpis.range.total) * 100) : 0}%`} sub="of inbound in range" />
      </div>

      <SectionCard title="Daily Inbound — Organic vs Ad">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.daily}>
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="organic" stackId="a" fill="#10b981" name="Organic" />
            <Bar dataKey="ad" stackId="a" fill="#6366f1" name="Ad" />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="By Segment (inbound only)">
          <div className="space-y-3">
            {([["A", "Hot"], ["B", "Warm"], ["C", "Cold"], ["D", "Disqualified"]] as const).map(([k, label]) => (
              <div key={k} className="flex items-center gap-3">
                <span className="font-label text-xs text-on-surface-muted w-24 shrink-0">{label}</span>
                <div className="flex-1 bg-surface-mid rounded-full h-4 overflow-hidden">
                  <div className="h-4 rounded-full bg-indigo-500" style={{ width: `${Math.round((data.by_segment[k] / segMax) * 100)}%` }} />
                </div>
                <span className="font-label text-xs w-8 text-right shrink-0">{data.by_segment[k]}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="By Channel">
          <div className="space-y-2">
            {([["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["telegram", "Telegram"]] as const).map(([k, label]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-on-surface-muted">{label}</span>
                <span className="font-medium">{data.by_channel[k]}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
```

> If `BarChart`, `Bar`, `Legend`, `Tooltip`, `XAxis`, `YAxis`, `ResponsiveContainer`
> are not already imported in the file, add them to the existing `recharts` import.
> Match the actual `DateRange` type name used by sibling tabs (e.g. `OverviewTab`).

- [ ] **Step 4: Render the tab**

Where the other tabs render (around line 1008), add:

```tsx
      {activeTab === "inbound" && <InboundTab range={range} />}
```

- [ ] **Step 5: Lint + build**

Run: `cd frontend && npx eslint app/dashboard/analytics/page.tsx lib/api.ts --fix && npx next build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/analytics/page.tsx frontend/lib/api.ts
git commit -m "feat(analytics): Inbound tab — organic vs ad daily trend + segment/channel breakdown"
```

---

## Final verification

- [ ] **Backend tests pass**

Run: `cd backend && python -m pytest tests/test_inbound_leads_logic.py tests/test_inbound_leads_route_static.py -v`
Expected: 8 passed.

- [ ] **Backend app imports**

Run: `cd backend && python -c "import app.main"`
Expected: exit 0.

- [ ] **Frontend builds**

Run: `cd frontend && npx next build`
Expected: build succeeds, route list shows `/dashboard/inbound-leads` (no `/dashboard/ctwa-leads`).

- [ ] **No stray ctwa references repo-wide**

Run: `grep -rn "ctwa" backend/app frontend/app frontend/lib frontend/components ; echo "exit:$?"`
Expected: no matches (`exit:1`). The per-row "Meta Ad" origin badge in
`conversation-list.tsx` is acceptable (it is not a `ctwa` reference).

---

## Notes for the implementer

- **Deploy:** Render backend auto-deploy is OFF — pushing does not deploy. A manual
  deploy is required for the new endpoint to go live.
- **No migration:** every column used (`source`, `ad_campaign_id`, `segment`,
  `created_at`, `deleted_at`) already exists.
- **Invariants honored:** segments stay A/B/C/D; no Gemini/OpenAI; no new AI calls;
  reporting is read-only over existing data.
- **Opt-out is intentionally absent** — it is an outbound/broadcast concept and does
  not filter inbound acquisition.
