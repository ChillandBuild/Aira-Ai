# Project Memory — Update This After Each Session

## Provider Decisions (locked 2026-04-22)
- WhatsApp primary: Meta Cloud API Direct
- WhatsApp secondary: WATI
- Voice: Exotel (built, commit 27d98a3)
- AI: Gemini (not Claude) — 2.5-pro for complex/scoring, 2.0-flash for FAQ classify

## Phase 1a — Build Next (priority order)
1. ✅ `phone_numbers` table — migration 009
2. ✅ `MetaCloudProvider` (concrete, no ABC) — services/meta_cloud.py
3. ✅ Outbound router — services/outbound_router.py
4. ✅ `opt_in_source` column on leads — migration 010
5. ✅ Numbers page (frontend) — dashboard/numbers/page.tsx
6. ⬜ WatiProvider adapter — services/wati_cloud.py (after MetaCloud is live)
7. ⬜ Meta quality webhook handler → phone_numbers update + incidents log (extend webhook.py)
8. ⬜ Bulk-send gating enforcement in upload.py (check opt_in_source)
9. ⬜ CSV upload 7-step upgrade

## Phase 1b — After 1a
9. Pre-approved channel-migration template in onboarding
10. Auto-promote standby on restriction event (failover sequence)
11. Auto-send migration notice to recent leads (<7 days activity)
12. Incidents page (frontend/app/dashboard/incidents/)
13. lead_notes table + briefing modal + live notes pane + Gemini AI summary (5.5 days)

## Known Tech Debt
- webhook_instagram.py registered in main.py — disable route
- Analytics page shows ad metrics — repurpose to service metrics (WA + telecalling + funnel)
- AI Tune label may need rename to clarify it tunes WA auto-reply prompts only

## Key File Locations
| File | Purpose |
|---|---|
| backend/app/main.py | FastAPI entry, route registration |
| backend/app/routes/webhook.py | WA webhook handler — extend for quality events |
| backend/app/routes/webhook_instagram.py | DISABLE this route |
| backend/app/services/ai_reply.py | FAQ cache → Gemini pipeline |
| backend/app/services/lead_scorer.py | Gemini scoring (1–10) |
| backend/app/services/segmentation.py | A/B/C/D logic |
| backend/app/db/supabase.py | Supabase client singleton |
| frontend/app/dashboard/ | All dashboard pages |
