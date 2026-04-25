# Number Pool / Failover / Resilience Context

## Architecture
Every tenant: min 3 WA numbers (1 primary + 2 warmed standbys).
Pool in phone_numbers table (schema in whatsapp.md).
Warm-up: 14 days silent sends. NOT routable until warm_up_day >= 14.

## Failover Sequence (fully automated)
Trigger: Meta webhook quality_rating = RED (or status = restricted)
1. Find warmest standby: `WHERE role='standby' AND warm_up_day >= 14 ORDER BY warm_up_day DESC LIMIT 1`
2. Promote: `UPDATE phone_numbers SET role='primary' WHERE id = $standby_id`
3. Demote old primary: `UPDATE phone_numbers SET role='standby', status='restricted'`
4. Send pre-approved channel-migration template to leads with activity in last 7 days
5. File Meta appeal via Graph API — store reference in incidents
6. INSERT into incidents log (type='failover', detail={old_number, new_number, appeal_ref})
7. Push Supabase Realtime event → dashboard alert

On YELLOW: halve routing weight (don't failover), INSERT incident type='quality_yellow'.

## incidents Table (Phase 1b — to build)
```sql
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type text NOT NULL,  -- 'quality_yellow'|'quality_red'|'failover'|'migration_sent'|'appeal_filed'|'standby_promoted'
  phone_number_id uuid REFERENCES phone_numbers(id),
  detail jsonb,
  created_at timestamptz DEFAULT now()
);
```

## Numbers Page (Phase 1a — to build)
Path: frontend/app/dashboard/numbers/ (new directory + page.tsx)
Add to dashboard nav layout (frontend/app/dashboard/layout.tsx).

Table columns: display_name, number, provider, role, status, quality_rating, today's sends / tier limit, actions menu.

Actions:
- **Add Number wizard**: provider → auth → display name → status='warming' starts
- **Delete** (soft): status='archived', stop routing. Block if last active number.
- **Set role**: primary / standby / archived
- **Pause outbound**: keep inbound active, stop sending
- **Rename**: update display_name

Safety guard: `SELECT count(*) FROM phone_numbers WHERE status='active'` must stay >= 1.
Show confirmation dialog listing affected leads count before delete.

## Incidents Page (Phase 1b — to build)
Path: frontend/app/dashboard/incidents/ (new directory + page.tsx)
Add to dashboard nav layout.
Timeline view, newest first. Human-readable event descriptions.
Example: "Apr 22 2:14 PM — Primary number flagged Yellow → outbound halved"

## Key Files to Create/Extend
- backend/app/routes/numbers.py (new) — phone_numbers CRUD
- backend/app/routes/incidents.py (new) — incidents log read
- backend/app/services/failover.py (new) — failover sequence logic
- backend/app/routes/webhook.py — extend for quality_update events
- frontend/app/dashboard/numbers/page.tsx (new)
- frontend/app/dashboard/incidents/page.tsx (new)
- frontend/app/dashboard/layout.tsx — add Numbers + Incidents to nav
