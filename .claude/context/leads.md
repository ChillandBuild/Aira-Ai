# Leads / Scoring / Segmentation Context

## Schema
```sql
leads (id uuid, phone text, name text, source text, score int, segment text,
       opt_in_source text,  -- ADD this column (Phase 1a migration)
       created_at timestamptz)
messages (id uuid, lead_id uuid, direction text, channel text, content text,
          timestamp timestamptz, is_ai_generated bool)
conversations (id uuid, lead_id uuid, status text, opened_at timestamptz, closed_at timestamptz)
faqs (id uuid, question_embedding vector, answer text, hit_count int)
```

## opt_in_source Column (Phase 1a — migration needed)
```sql
ALTER TABLE leads ADD COLUMN opt_in_source text;
```
Values and bulk-send permissions:
| opt_in_source | Bulk send | Template type |
|---|---|---|
| 'click_to_wa_ad' | ✅ Yes | Marketing OK |
| 'website_form' | ✅ Yes | Marketing OK |
| 'offline_event' | ✅ Yes | Utility preferred |
| 'previous_enquiry' | ⚠️ Utility only | No marketing |
| 'imported' | ⚠️ Utility only | No marketing |
| null | ❌ Blocked | Manual call only |

Bulk-send route must enforce this gate. Reject with 400 if null.

## Scoring Rules (Gemini 2.5-pro)
Score recomputed on every inbound message. Always integer 1–10.
- 9–10 → Segment A: mentioned college visit, specific course, asked for fees
- 7–8  → Segment B: detailed questions, multiple exchanges
- 5–6  → Segment C: general inquiry, single message
- 1–4  → Segment D: no reply after 3 attempts, explicitly disinterested

## Segmentation Labels — Immutable
A=Hot/High Intent, B=Warm/In Discussion, C=Cold/No Reply, D=Disqualified
Never rename. Never add new segments without explicit instruction.

## Export Endpoint
GET /api/v1/leads?segment=A&format=csv  (all 4 segments must support this)

## Key Files
- backend/app/services/lead_scorer.py — Gemini 2.5-pro scoring
- backend/app/services/segmentation.py — A/B/C/D assignment
- backend/app/routes/leads.py — CRUD + export endpoint
- backend/app/routes/segments.py — segment-specific queries
- frontend/app/dashboard/leads/ — lead list UI
