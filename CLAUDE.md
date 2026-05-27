# Aira AI — Claude Code Operating Manual

## Identity
Generic B2B SaaS — any business that does WhatsApp lead-gen + telecalling.
North Star: no single block/flag/outage stops a client's lead-gen for >5 minutes.
Solo dev. Terse. Code over prose. No trailing summaries. No explanations unless asked.

## Build State
| Component | Status |
|---|---|
| WhatsApp webhook (inbound/outbound) | ✅ Built — X-Hub-Signature-256 verified |
| AI reply pipeline (FAQ → Groq/Llama fallback) | ✅ Built — uses Groq, NOT Gemini |
| Lead CRUD + CSV import | ✅ Built |
| Lead scoring (1–10, Groq/Llama) | ✅ Built |
| Segmentation A/B/C/D | ✅ Built |
| Callers CRUD (create/edit/delete) | ✅ Built |
| Manual dial via TeleCMI click-to-call | ✅ Built |
| AI coaching post-call (call_coach.py) | ✅ Built |
| Call scoring (call_scorer.py) | ✅ Built |
| Follow-up scheduler | ✅ Built |
| Knowledge/FAQ base | ✅ Built |
| AI Tune (integrated into Knowledge page tab) | ✅ Built |
| Analytics page | ✅ Built — WhatsApp tab + Telecalling tab + funnel API |
| Instagram webhook | ✅ Built — tenant-scoped at /webhook/instagram/{tenant_id}, X-Hub-Signature-256 verified |
| Telegram webhook + Bot API | ✅ Built — secret_token verified, per-tenant |
| Facebook Messenger webhook | ✅ Built — tenant-scoped at /webhook/facebook/{tenant_id}, X-Hub-Signature-256 verified |
| Provider abstraction layer | ✅ Built — meta_cloud.py + wati_cloud.py |
| phone_numbers table + pool management | ✅ Built — migration 009 + numbers.py |
| Numbers page (frontend) | ✅ Built — dashboard/numbers/ |
| opt_in_source on leads + bulk-send gating | ✅ Built — migration 010 + upload.py |
| 7-step CSV upload | ✅ Built — upload.py + dashboard/upload/ |
| Multi-variable template personalization | ✅ Built — variable_mapping + extra_cols per lead |
| Scheduled broadcasts (APScheduler) | ✅ Built — scheduled_broadcasts table, migration 057 |
| Drip broadcasts | ✅ Built — schedule_type=drip, leads split over N days |
| Meta quality webhook handler | ✅ Built — webhook.py + failover.py |
| Auto-failover on RED quality | ✅ Built — handle_quality_red() wired in webhook.py |
| Outbound router (pool-aware) | ✅ Built — services/outbound_router.py |
| Incidents page (frontend) | ✅ Built — dashboard/incidents/ |
| lead_notes table + briefing modal | ✅ Built — migration 012 + lead_notes.py |
| Groq Whisper transcription + AI call summary | ✅ Built — call_summarizer.py |
| Notes page (/dashboard/notes) | ✅ Built |
| Message Templates page | ✅ Built — dashboard/templates/, routes/templates.py |
| Template submission to Meta API | ✅ Built — uses meta_waba_id |
| Template approval webhook | ✅ Built — POST /api/v1/templates/webhook-status |
| Manual template sync | ✅ Built — POST /api/v1/templates/{id}/sync |
| Template Quick Reply buttons | ✅ Built — up to 3 buttons |
| Knowledge base (full-text injection, no embeddings) | ✅ Built — services/knowledge_service.py |
| Reply source badge (FAQ / Knowledge Base / AI) | ✅ Built — messages.reply_source |
| Callback scheduler | ✅ Built — follow_up_jobs cadence=callback |
| Telecaller multi-tenancy + role-based access | ✅ Built — migration 025 |
| Hot lead alert system (score ≥7, 5-min escalation) | ✅ Built — migration 026 |
| Lead assignment (manual + round-robin auto) | ✅ Built |
| Team management page | ✅ Built — dashboard/team/, routes/team.py |
| Onboarding flow | ✅ Built — dashboard/onboarding/, routes/onboarding.py |
| App settings page | ✅ Built — dashboard/settings/, routes/app_settings.py |
| Settings: webhook guides + copy buttons | ✅ Built — per-channel setup guide with correct URLs |
| Settings: Validate & Activate | ✅ Built — POST /api/v1/settings/activate (validates token + subscribes webhook) |
| Settings: webhook health check | ✅ Built — GET /api/v1/settings/webhook-health, health badge per channel |
| Settings: token expiry alerts | ✅ Built — APScheduler daily job, token_invalid incidents |
| CTWA referral auto-capture | ✅ Built — referral object parsed in webhook.py, linked to ad_campaign |
| Bookings table + booking flow state machine | ✅ Built — migrations 029–030, booking_flow.py |
| Razorpay payment links | ✅ Built — services/payment_razorpay.py |
| Admin bookings dashboard | ✅ Built — dashboard/bookings/ |
| Multi-tenancy (app-layer) | ✅ Built — tenant_id on all tables |
| Role-based access | ✅ Built — owner and caller roles |
| Automations engine | ✅ Built — migration 055, routes/automations.py |
| Broadcast history + fail reason tracking | ✅ Built — migration 058_broadcast_fail_reason |
| Carousel templates (2–10 cards via Meta API) | ✅ Built — migration 060, dashboard/templates/carousel/ |
| WABA onboarding (self-service) | ❌ Not built — manual env config only |

## Hard Invariants — Never Break
1. **FAQ-first**: ai_reply.py checks FAQ table BEFORE any Groq/LLM call
2. Lead score always integer 1–10
3. Segments: A=Hot, B=Warm, C=Cold, D=Disqualified — labels immutable
4. WhatsApp 24h session window — approved templates only outside window
5. All segment lists: GET /api/v1/leads?segment=A&format=csv
6. Call recordings → Supabase Storage only, never local disk
7. Tenant isolation enforced at app layer via `get_tenant_and_role()` — DB-level RLS not yet enabled
8. Bulk-send endpoint rejects leads with null opt_in_source
9. **Template submission** always uses `meta_waba_id` (NOT `meta_phone_number_id`)
10. AI model is Groq `llama-3.3-70b-versatile` — do NOT add Gemini/OpenAI imports
11. WhatsApp webhook verifies X-Hub-Signature-256 before processing — returns 200 but drops invalid

## Stack
| Layer | Tech | Location |
|---|---|---|
| Backend | FastAPI, Python 3.11+, Pydantic v2 | backend/app/ |
| DB | Supabase (PostgreSQL + Realtime) | — |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind | frontend/app/dashboard/ |
| AI (replies + scoring) | Groq — llama-3.3-70b-versatile | services/ai_reply.py, lead_scorer.py |
| WhatsApp | Meta Cloud API Direct (primary) + WATI (secondary) | — |
| Voice | TeleCMI click-to-call + recording | services/telecmi_client.py |
| Payments | Razorpay Payment Links API | services/payment_razorpay.py |
| Scheduler | APScheduler (AsyncIO) — automations, broadcasts, token health | app/main.py |
| Cache | Redis (FAQ prompt cache, 60s TTL) | — |

## Provider Decisions (locked)
- WhatsApp primary: Meta Cloud API Direct
- WhatsApp secondary: WATI
- Voice: TeleCMI
- AI (replies + scoring): Groq / llama-3.3-70b-versatile (NOT Gemini)
- Payments: Razorpay (Payment Links API — no SDK, direct httpx calls)

## Supabase Config (production)
- Project ID: `ayftynkgmfkaqmmnlmoc`
- Region: ap-northeast-1
- WABA ID in app_settings: `meta_waba_id = 994218516456571`
- Default tenant: `00000000-0000-0000-0000-000000000001`

## Render Config (production)
- Backend URL: `https://aira-ai-5tfr.onrender.com`
- WhatsApp webhook: `https://aira-ai-5tfr.onrender.com/webhook/whatsapp`
- Instagram webhook: `https://aira-ai-5tfr.onrender.com/webhook/instagram/{tenant_id}`
- Facebook webhook: `https://aira-ai-5tfr.onrender.com/webhook/facebook/{tenant_id}`
- Telegram webhook: `https://aira-ai-5tfr.onrender.com/webhook/telegram/{tenant_id}`

## APScheduler Jobs (all in main.py)
| Job | Interval | Purpose |
|---|---|---|
| _process_automation_waits | 5 min | Resume automation wait-step executions |
| _process_scheduled_broadcasts | 1 min | Fire pending scheduled_broadcasts rows |
| _check_token_health | 24 h | Validate Meta tokens, create token_invalid incidents |

## Task Router — Read This File Before Acting
| Task involves | Read first |
|---|---|
| WhatsApp, Meta API, WATI, provider layer, phone_numbers | backend/app/routes/webhook.py + services/meta_cloud.py + services/outbound_router.py |
| Telecalling, TeleCMI, call logs, notes, briefing modal | backend/app/routes/calls.py + services/telecmi_client.py + services/call_summarizer.py |
| Leads, scoring, segments, opt-in | backend/app/routes/leads.py + services/lead_scorer.py |
| Number pool, failover, Numbers page, Incidents page | backend/app/routes/numbers.py + services/failover.py + routes/incidents.py |
| CSV upload, bulk send, scheduled/drip broadcasts | backend/app/routes/upload.py + services/broadcast_executor.py |
| Bookings, booking flow, Razorpay payments | backend/app/services/booking_flow.py + routes/bookings.py |
| WhatsApp templates, Meta template API | backend/app/routes/templates.py + services/meta_cloud.py |
| Settings, channel activation, token health | backend/app/routes/app_settings.py |

## Agent Dispatch
Spawn sub-agents automatically for tasks with 2+ independent work units.
Parallel pattern: schema + API route + frontend page → all 3 in one message.

## Known Tech Debt
- RLS DISABLED on 18 tables — app-layer tenant filter is only guard
- Booking automation amount hardcoded at ₹500 flat (needs booking_type + dynamic pricing)

## Key File Locations
| File | Purpose |
|---|---|
| backend/app/main.py | FastAPI entry, route registration, all APScheduler jobs |
| backend/app/routes/webhook.py | WA webhook — inbound routing + signature verification |
| backend/app/routes/app_settings.py | Settings CRUD, activate channel, webhook health |
| backend/app/routes/templates.py | Template CRUD + Meta submission |
| backend/app/routes/bookings.py | Booking REST + Razorpay webhook |
| backend/app/routes/upload.py | CSV upload, bulk send, scheduled/drip broadcasts |
| backend/app/services/ai_reply.py | FAQ check → Groq reply pipeline |
| backend/app/services/booking_flow.py | Booking state machine |
| backend/app/services/broadcast_executor.py | Executes a scheduled_broadcasts row |
| backend/app/services/failover.py | Quality RED/YELLOW handlers + auto-failover |
| backend/app/services/meta_webhook_verify.py | X-Hub-Signature-256 verification (shared by WA/IG/FB) |
| backend/app/services/meta_cloud.py | Meta Cloud API (text/media/template + carousel submission) |
| backend/app/services/lead_scorer.py | Groq scoring (1–10) |
| backend/app/services/telecmi_client.py | TeleCMI click-to-call |
| backend/app/db/supabase.py | Supabase client singleton |
| backend/supabase/migrations/ | All schema migrations 001–058 |
| frontend/app/dashboard/ | All dashboard pages |

## Migration Index (latest = 064)
| Migration | What |
|---|---|
| 051 | Telegram support — tg_user_id on leads |
| 052 | Instagram dynamic credentials in app_settings |
| 053 | Facebook support — fb_user_id on leads |
| 054 | Multichannel security fixes (unique indexes) |
| 055 | Automations engine table |
| 056 | Automations: score threshold + follow-up trigger types |
| 057 | scheduled_broadcasts table (APScheduler-based) |
| 058_broadcast_fail_reason | fail_reason column on broadcast_recipients |
| 058_incidents_token_health | incidents: tenant_id column + token_invalid/webhook_unhealthy types |
| 060 | carousel_cards JSONB column on message_templates |
| 061_message_delivery_error | message delivery error tracking |
| 061_number_health_engagement | phone_number_quality_history + outbound_no_reply_count + template variations |
| 062 | conversation_last_message RPC |
| 064 | leads.pinned_at |

## Response Style
- One sentence per progress update while working
- No trailing summaries
- No inline comments unless WHY is non-obvious
- No multi-line docstrings
- Mark TodoWrite tasks done immediately after finishing
- File refs: [file.py](path/file.py#L42)
- API errors: `{"error": "message", "code": "ERROR_CODE"}`
- All routes prefixed `/api/v1/`
- Pagination: `?page=1&limit=50`
