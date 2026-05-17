# Aira AI — Universal Rules (all platforms)

> This is the single source of truth. CLAUDE.md, CODEX.md, .cursorrules, and .windsurfrules all point here.

## What is Aira
Generic B2B SaaS — WhatsApp lead-gen + telecalling for any business.
Solo dev. Terse responses. Code over prose. No trailing summaries.

## Stack
| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.11+, Pydantic v2 → `backend/app/` |
| Database | Supabase (PostgreSQL) |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind → `frontend/app/dashboard/` |
| AI (replies + scoring) | Groq — llama-3.3-70b-versatile (NOT Gemini, NOT OpenAI) |
| WhatsApp | Meta Cloud API (primary), WATI (secondary) |
| Voice | Twilio click-to-call |
| Payments | Razorpay Payment Links API |

## Hard Rules — Never Break
1. **FAQ-first**: ai_reply.py checks FAQ table BEFORE any LLM call
2. Lead score always integer 1–10
3. Segments: A=Hot, B=Warm, C=Cold, D=Disqualified — immutable
4. WhatsApp 24h session window — approved templates only outside window
5. Every Supabase query MUST include `.eq("tenant_id", tenant_id)`
6. Every route MUST have `tenant_id: str = Depends(get_tenant_id)`
7. Every INSERT MUST include `"tenant_id": tenant_id`
8. Call recordings → Supabase Storage only, never local disk
9. Bulk-send rejects leads with null opt_in_source
10. Booking flow order is immutable: collecting_name → collecting_rasi → collecting_nakshatram → collecting_gotram → collecting_address → awaiting_payment → confirmed
11. Template submission always uses `meta_waba_id` NOT `meta_phone_number_id`
12. AI model is Groq — do NOT add Gemini/OpenAI imports

## Key File Locations
| File | Purpose |
|---|---|
| `backend/app/routes/webhook.py` | WA inbound — booking intercept → AI reply |
| `backend/app/services/ai_reply.py` | FAQ check → Groq reply pipeline |
| `backend/app/services/booking_flow.py` | Booking state machine |
| `backend/app/services/meta_cloud.py` | Meta Cloud API send/template |
| `backend/app/services/lead_scorer.py` | Groq scoring (1–10) |
| `backend/app/db/supabase.py` | Supabase client singleton |
| `backend/supabase/migrations/` | All migrations 001–035 |
| `frontend/app/dashboard/` | All dashboard pages |

## Migration Convention
- Files: `backend/supabase/migrations/0NN_description.sql`
- Latest: 035 — next is 036
- Every table needs: `id UUID`, `tenant_id UUID NOT NULL`, `created_at TIMESTAMPTZ`

## Supabase Config
- Project ID: `tovmebyyjhvszwgvyfdm`
- WABA ID: `994218516456571`
- Default tenant: `00000000-0000-0000-0000-000000000001`

## Agents (for parallel work)
| Agent | Use when |
|---|---|
| webhook-debugger | WA delivery failures, Meta API errors |
| tenant-auditor | After writing any new route |
| migration-writer | New Supabase migration needed |
| lead-scorer-tuner | Scoring/conversion issues |

## Parallel Pattern (always use for 3-layer features)
```
Agent 1: migration (schema)
Agent 2: FastAPI route
Agent 3: Next.js page
→ all in one message, parallel
```

## Tech Debt (do not ignore)
- RLS disabled on 18 tables — app-layer tenant filter is only guard
- No Meta webhook signature verification
- Razorpay no idempotency key
- No self-service WABA onboarding
