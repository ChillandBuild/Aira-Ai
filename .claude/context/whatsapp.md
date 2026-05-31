# WhatsApp / Provider Context

## Providers (Phase 1a — to build)
- Meta Cloud API Direct — primary, no markup (~₹0.73–0.88/msg Meta pricing)
- WATI — secondary managed option
- Build order: MetaCloudProvider first, WatiProvider second

## Provider Abstraction Layer (to build)
Abstract class `WhatsAppProvider`:
```python
class WhatsAppProvider:
    def send_message(self, to: str, content: str, template_id: str = None) -> dict
    def send_template(self, to: str, template_name: str, params: dict) -> dict
    def get_number_health(self) -> dict  # returns quality_rating, messaging_tier
```
Concrete: `MetaCloudProvider`, `WatiProvider`
Router picks healthiest number from `phone_numbers` pool before calling provider.

## phone_numbers Table (to build)
```sql
CREATE TABLE phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider text NOT NULL,         -- 'meta_cloud' | 'wati'
  number text NOT NULL,
  display_name text,
  role text DEFAULT 'standby',    -- 'primary' | 'standby' | 'archived'
  status text DEFAULT 'warming',  -- 'active' | 'warming' | 'restricted' | 'archived'
  quality_rating text DEFAULT 'green', -- 'green' | 'yellow' | 'red'
  messaging_tier int DEFAULT 1000,
  daily_send_count int DEFAULT 0,
  warm_up_day int DEFAULT 0,      -- 0–14; routable only at 14
  created_at timestamptz DEFAULT now()
);
```

## Meta Quality Webhook (to build)
Meta sends `phone_number_quality_update` to /webhook/whatsapp.
Payload fields: `phone_number_id`, `quality_rating` (GREEN/YELLOW/RED), `event_type`.
On RED → trigger failover (see resilience.md).
On YELLOW → halve outbound weight for this number.
Extend backend/app/routes/webhook.py — do not rewrite it.

## Outbound Router Logic (to build)
```sql
SELECT * FROM phone_numbers
WHERE status = 'active'
  AND quality_rating != 'red'
  AND warm_up_day >= 14
ORDER BY
  CASE quality_rating WHEN 'green' THEN 1 WHEN 'yellow' THEN 2 END,
  (daily_send_count::float / messaging_tier) ASC
LIMIT 1;
```
Increment `daily_send_count` after each send. Reset counts daily via Celery task.

## 24h Session Window Rule
Inbound message opens 24h free-form window. Outside window: approved templates ONLY.
Enforced in backend/app/services/ai_reply.py — never bypass.

## Key Env Vars (add to .env)
```
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=
WATI_API_KEY=
WATI_ENDPOINT=
```

## Existing Files to Extend
- backend/app/routes/webhook.py — add quality_update event handling
- backend/app/services/ai_reply.py — use router to pick outbound number
- backend/app/models/schemas.py — add PhoneNumber Pydantic models
