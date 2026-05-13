# Aira AI — Claude Code Operating Manual

## Identity
Generic B2B SaaS — any business that does WhatsApp lead-gen + telecalling (not education-specific).
North Star: no single block/flag/outage stops a client's lead-gen for >5 minutes.
Solo dev. Terse. Code over prose. No trailing summaries. No explanations unless asked.

## Build State
| Component | Status |
|---|---|
| WhatsApp webhook (inbound/outbound) | ✅ Built |
| AI reply pipeline (FAQ → Groq/Llama fallback) | ✅ Built — uses Groq, NOT Gemini |
| Lead CRUD + CSV import | ✅ Built |
| Lead scoring (1–10, Groq/Llama) | ✅ Built |
| Segmentation A/B/C/D | ✅ Built |
| Callers CRUD (create/edit/delete) | ✅ Built |
| Manual dial via Twilio click-to-call | ✅ Built — migrated from Exotel |
| AI coaching post-call (call_coach.py) | ✅ Built |
| Call scoring (call_scorer.py) | ✅ Built |
| Follow-up scheduler | ✅ Built |
| Knowledge/FAQ base | ✅ Built |
| AI Tune (WA auto-reply prompt tuning) | ✅ Built |
| Analytics page | ✅ Built — needs repurpose to service metrics |
| Instagram webhook | ✅ Built — DISABLED (Phase 2, do not enable) |
| Provider abstraction layer | ✅ Built — meta_cloud.py + wati_cloud.py |
| MetaCloudProvider adapter | ✅ Built — services/meta_cloud.py |
| WatiProvider adapter | ✅ Built — services/wati_cloud.py |
| phone_numbers table + pool management | ✅ Built — migration 009 + numbers.py |
| Numbers page (frontend) | ✅ Built — dashboard/numbers/ |
| opt_in_source on leads + bulk-send gating | ✅ Built — migration 010 + upload.py |
| 7-step CSV upload upgrade | ✅ Built — upload.py + dashboard/upload/ |
| Meta quality webhook handler | ✅ Built — webhook.py + failover.py |
| Outbound router (pool-aware) | ✅ Built — services/outbound_router.py |
| Auto-failover + migration notice | ✅ Built — failover.py |
| Incidents page (frontend) | ✅ Built — dashboard/incidents/ |
| lead_notes table + briefing modal | ✅ Built — migration 012 + lead_notes.py + telecalling modal |
| Gemini transcription + AI call summary | ✅ Built — call_summarizer.py + BackgroundTasks |
| Notes page (/dashboard/notes) | ✅ Built — lead search, notes CRUD, AI summary cards, audio player |
| Message Templates page | ✅ Built + Meta-connected — dashboard/templates/, routes/templates.py |
| Template submission to Meta API | ✅ Built — uses meta_waba_id (1190331789463566), WABA ID in app_settings |
| Template approval webhook (Meta → dashboard) | ✅ Built — POST /api/v1/templates/webhook-status (public, no auth) |
| Manual template sync | ✅ Built — POST /api/v1/templates/{id}/sync → polls Meta API |
| Knowledge base (full-text injection, no embeddings) | ✅ Built — services/knowledge_service.py, full_text col on knowledge_documents |
| Reply source badge (FAQ / Knowledge Base / AI) | ✅ Built — messages.reply_source, chat-thread.tsx |
| Callback scheduler (Live Notes modal + Today's Callbacks) | ✅ Built — follow_up_jobs cadence=callback, telecalling/components/ |
| Telecaller multi-tenancy (role-based access + lead assignment) | ✅ Built — migration 025, services/assignment.py, AuthRoleContext, sidebar gating |
| Hot lead alert system (score ≥7, 5-min escalation, in-app banner) | ✅ Built — migration 026, routes/alerts.py, ai_reply.py trigger, hot-lead-alert-banner.tsx |
| Lead assignment (manual admin + round-robin auto on new lead) | ✅ Built — PATCH /api/v1/leads/{id}/assign + auto_assign_lead() in webhook |
| Team management page | ✅ Built — dashboard/team/, routes/team.py |
| Onboarding flow | ✅ Built — dashboard/onboarding/, routes/onboarding.py |
| App settings page | ✅ Built — dashboard/settings/, routes/app_settings.py |
| Homam V1 campaign prep | ✅ Built — migration 028, seed_homam_faqs.py, seed_homam_prompt.py, 8 Homam FAQs loaded |
| Bookings table + auto-reference (GPH-YYYY-NNNN) | ✅ Built — migration 029, trigger generate_booking_ref() |
| Lead conversation state machine | ✅ Built — migration 030, lead_conversation_state table, booking_flow.py |
| V2 WhatsApp booking automation | ✅ Built — guided data collection (name→rasi→nakshatram→gotram→address) → Razorpay payment link → auto-confirm |
| Razorpay payment service | ✅ Built — services/payment_razorpay.py, HMAC webhook verification |
| Admin bookings dashboard | ✅ Built — dashboard/bookings/, status cards + filter tabs + table |

## Hard Invariants — Never Break
1. **FAQ-first**: ai_reply.py checks FAQ table BEFORE any Groq/LLM call
2. Lead score always integer 1–10
3. Segments: A=Hot, B=Warm, C=Cold, D=Disqualified — labels immutable
4. WhatsApp 24h session window — approved templates only outside window
5. All segment lists: GET /api/v1/leads?segment=A&format=csv
6. Call recordings → Supabase Storage only, never local disk
7. Tenant RLS enforced always — one Meta Business Account per tenant
8. Bulk-send endpoint rejects leads with null opt_in_source
9. **Booking flow states (immutable order)**: collecting_name → collecting_rasi → collecting_nakshatram → collecting_gotram → collecting_address → awaiting_payment → confirmed
10. **Booking intent keywords** (frozenset in booking_flow.py): book, booking, register, enroll, புக், வேணும், பதிவு — intentionally narrow to avoid triggering on casual replies
11. **Template submission** always uses `meta_waba_id` (NOT `meta_phone_number_id`) — WABA ID ≠ Phone Number ID

## Stack
| Layer | Tech | Location |
|---|---|---|
| Backend | FastAPI, Python 3.11+, Pydantic v2 | backend/app/ |
| DB | Supabase (PostgreSQL + Realtime + RLS) | — |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind, custom design tokens | frontend/app/dashboard/ |
| AI (replies + scoring) | Groq — llama-3.3-70b-versatile | services/ai_reply.py, lead_scorer.py |
| WhatsApp | Meta Cloud API Direct (primary) + WATI (secondary) | — |
| Voice | Twilio click-to-call + recording | — |
| Payments | Razorpay Payment Links API | services/payment_razorpay.py |
| Queue | Celery + Redis | — |
| Cache | Redis (FAQ prompt cache, 60s TTL) | — |

> **AI stack correction:** CLAUDE.md previously said Gemini — that is wrong. Both `ai_reply.py` and `lead_scorer.py` import from `groq`, model `llama-3.3-70b-versatile`. Do NOT add Gemini imports without verifying.

## Task Router — Read This File Before Acting
| Task involves | Read first |
|---|---|
| WhatsApp, Meta API, WATI, provider layer, phone_numbers | .claude/context/whatsapp.md |
| Telecalling, Twilio, call logs, notes, briefing modal | .claude/context/telecalling.md |
| Leads, scoring, segments, opt-in | .claude/context/leads.md |
| Number pool, failover, Numbers page, Incidents page | .claude/context/resilience.md |
| CSV upload, bulk send, 7-step flow | .claude/context/upload.md |
| Bookings, booking flow, Razorpay payments | backend/app/services/booking_flow.py + routes/bookings.py |
| WhatsApp templates, Meta template API | backend/app/routes/templates.py + services/meta_cloud.py |

## Agent Dispatch
See .claude/rules/aira-agents.md (auto-loaded every session).
Spawn sub-agents automatically (never ask) when task has 2+ independent work units.
Each agent gets only its relevant context file — not the full CLAUDE.md.

## Provider Decisions (locked 2026-04-22, updated 2026-05-13)
- WhatsApp primary: Meta Cloud API Direct
- WhatsApp secondary: WATI
- Voice: Twilio (migrated from Exotel)
- AI (replies + scoring): Groq / llama-3.3-70b-versatile (NOT Gemini — confirmed 2026-05-13)
- Payments: Razorpay (Payment Links API — no SDK, direct httpx calls)

## Supabase Config (production)
- Project ID: `tovmebyyjhvszwgvyfdm`
- Region: ap-northeast-1
- WABA ID in app_settings: `meta_waba_id = 1190331789463566`
- Default tenant: `00000000-0000-0000-0000-000000000001`

## Known Tech Debt
- webhook_instagram.py exists but route is NOT registered in main.py — safe, leave disabled
- Analytics page shows ad metrics — repurpose to service metrics (WA + telecalling + funnel)
- Sidebar makes a duplicate /team/me call independent of AuthRoleContext — consolidate to useAuthRole()
- AdminView.tsx in telecalling has N+1 sequential fetches per caller — replace with Promise.allSettled
- services/growth.py + services/scheduled_tasks.py — verify wired to Celery or remove if dead
- AI Tune label may need rename to clarify it tunes WA auto-reply prompts only
- ai_reply.py `FALLBACK_PROMPT` still mentions "education consultancy" — update to match actual client's business before going live
- ai_reply.py docstring says "call Gemini for reply" on line 207 — wrong, it calls Groq. Update comment.
- **RLS DISABLED on 19 tables** (confirmed 2026-05-13 via Supabase MCP): faqs, callers, app_settings, follow_up_jobs, phone_numbers, incidents, lead_notes, voice_numbers, message_templates, tenants, tenant_users, hot_lead_alerts, conversations, call_logs, ad_campaigns, segment_templates, ai_prompts, ai_tune_suggestions, lead_stage_events — anyone with anon key can read/write these. Fix before production scale: enable RLS + add tenant-scoped policies per table. Do NOT enable RLS without policies or all access breaks.
- **Meta webhook signature not verified** on both webhook.py (inbound WA messages) and templates.py (template status updates) — no `X-Hub-Signature-256` check. Low risk while single-tenant; must fix before multi-tenant public launch.
- Razorpay payment links have no idempotency key — if httpx call succeeds at Razorpay but times out before response, retry creates a duplicate link. Add `X-Razorpay-Idempotency-Key: {booking_id}` header.
- Booking flow: no Twilio path — `webhook.py` only routes booking flow for Meta Cloud API inbound messages; the Twilio fallback branch (lines 183+) still calls `generate_reply` directly. If Twilio is used as inbound channel, booking flow is bypassed.

## Key File Locations
| File | Purpose |
|---|---|
| backend/app/main.py | FastAPI entry, route registration |
| backend/app/routes/webhook.py | WA webhook — inbound routing: booking flow intercept → AI reply |
| backend/app/routes/webhook_instagram.py | DISABLE — not registered |
| backend/app/routes/templates.py | Template CRUD + Meta submission + sync + public webhook-status |
| backend/app/routes/bookings.py | Booking REST + Razorpay payment webhook (public_router, no auth) |
| backend/app/services/ai_reply.py | FAQ check → Groq reply pipeline |
| backend/app/services/booking_flow.py | Booking state machine: step transitions, payment link send, confirm |
| backend/app/services/payment_razorpay.py | Razorpay payment link creation + HMAC webhook verification |
| backend/app/services/meta_cloud.py | Meta Cloud API: send_text, send_template, submit_template, get_template_status |
| backend/app/services/lead_scorer.py | Groq scoring (1–10) |
| backend/app/services/segmentation.py | A/B/C/D logic |
| backend/app/db/supabase.py | Supabase client singleton |
| backend/app/scripts/seed_homam_faqs.py | One-off: seed 8 Homam FAQs (already run 2026-05-13) |
| backend/app/scripts/seed_homam_prompt.py | One-off: upsert Homam AI reply prompt (already run 2026-05-13) |
| backend/supabase/migrations/ | All schema migrations 001–030 |
| frontend/app/dashboard/ | All dashboard pages |
| frontend/app/dashboard/bookings/ | Admin bookings page — status cards, filter tabs, booking table |
| frontend/app/dashboard/templates/ | Template management — category cards, live WA preview, bulk send button |

## Migration Index (latest)
| Migration | What |
|---|---|
| 028 | opt_in_source fix for uploaded leads → offline_event |
| 029 | bookings table + GPH-YYYY-NNNN auto-reference trigger |
| 030 | lead_conversation_state table (booking flow state machine) |

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
