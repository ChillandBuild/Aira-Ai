# Telecalling Context

## What's Built
- Exotel click-to-call dialer (commit 27d98a3)
- Callers CRUD: create/edit/delete
- call_logs table with recording_url (Supabase Storage)
- AI coaching post-call: backend/app/services/call_coach.py
- Call scoring: backend/app/services/call_scorer.py
- Manual dial with null lead_id (commit ed5caa7)

## Existing Schema
```sql
callers (id uuid, name text, phone_extension text, overall_score numeric, active bool)
call_logs (id uuid, lead_id uuid NULLABLE, caller_id uuid, duration int,
           recording_url text, score numeric, created_at timestamptz)
```

## lead_notes Table (Phase 1b — to build)
```sql
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id),
  caller_id uuid REFERENCES callers(id),
  call_log_id uuid NULLABLE REFERENCES call_logs(id),
  content text,
  structured jsonb,  -- {course, budget, timeline, next_action, sentiment}
  is_pinned bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

Migration on call_logs (Phase 1b):
```sql
ALTER TABLE call_logs
  ADD COLUMN transcript text,
  ADD COLUMN ai_summary jsonb;
```

## Briefing Modal (Phase 1b — to build)
Shown BEFORE Exotel dials. Query:
```sql
-- Pinned notes
SELECT * FROM lead_notes WHERE lead_id = $1 AND is_pinned = true ORDER BY created_at DESC;
-- Last 3 interactions (calls + messages merged by timestamp)
-- AI suggested next steps from latest call_logs.ai_summary
```
Component lives in: frontend/app/dashboard/telecalling/
Trigger: intercept the "Call" button click, show modal, then dial on confirm.

## AI Transcription + Summary Flow (Phase 1b)
1. Exotel webhook delivers recording URL → already in call_logs.recording_url
2. Download from Supabase Storage → send bytes to Gemini 2.0-flash for transcription
3. Gemini 2.5-pro generates structured summary: {course, budget, timeline, next_action, sentiment}
4. UPDATE call_logs SET transcript = ..., ai_summary = ... WHERE id = $log_id
5. Telecaller reviews draft in UI → can edit → save
6. Pinnable facts extracted → INSERT into lead_notes WHERE is_pinned = true

## Gemini Model Choice
- Transcription: gemini-2.0-flash (cheap, fast)
- Structured summary: gemini-2.5-pro (reasoning needed)

## Frontend Location
frontend/app/dashboard/telecalling/ — all telecalling UI
Existing: caller list, dial button, call log table.
Phase 1b adds: briefing modal, live notes pane (quick-tag buttons + free text).
