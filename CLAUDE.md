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
| Manual dial via TeleCMI click-to-call | ✅ Built — migrated from Exotel → Twilio → TeleCMI |
| AI coaching post-call (call_coach.py) | ✅ Built |
| Call scoring (call_scorer.py) | ✅ Built |
| Follow-up scheduler | ✅ Built |
| Knowledge/FAQ base | ✅ Built |
| AI Tune (integrated into Knowledge page tab) | ✅ Built |
| Analytics page | ✅ Built — WhatsApp tab + Telecalling tab + funnel API |
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
| Template submission to Meta API | ✅ Built — uses meta_waba_id, WABA ID in app_settings |
| Template approval webhook (Meta → dashboard) | ✅ Built — POST /api/v1/templates/webhook-status (public, no auth) |
| Manual template sync | ✅ Built — POST /api/v1/templates/{id}/sync → polls Meta API |
| Template Quick Reply buttons | ✅ Built — up to 3 buttons per template |
| Template view modal | ✅ Built |
| Template example values auto-inject | ✅ Built |
| Knowledge base (full-text injection, no embeddings) | ✅ Built — services/knowledge_service.py |
| Reply source badge (FAQ / Knowledge Base / AI) | ✅ Built — messages.reply_source, chat-thread.tsx |
| Callback scheduler | ✅ Built — follow_up_jobs cadence=callback |
| Telecaller multi-tenancy (role-based access + lead assignment) | ✅ Built — migration 025 |
| Hot lead alert system (score ≥7, 5-min escalation, in-app banner) | ✅ Built — migration 026 |
| Lead assignment (manual admin + round-robin auto on new lead) | ✅ Built |
| Team management page | ✅ Built — dashboard/team/, routes/team.py |
| Onboarding flow | ✅ Built — dashboard/onboarding/, routes/onboarding.py |
| App settings page | ✅ Built — dashboard/settings/, routes/app_settings.py |
| Bookings table + auto-reference | ✅ Built — migration 029 |
| Lead conversation state machine | ✅ Built — migration 030, booking_flow.py |
| V2 WhatsApp booking automation | ✅ Built |
| Razorpay payment service | ✅ Built — services/payment_razorpay.py |
| Admin bookings dashboard | ✅ Built — dashboard/bookings/ |
| CSV Indian number auto-format | ✅ Built |
| Opt-out expanded | ✅ Built |
| Multi-tenancy (app-layer) | ✅ Built — tenant_id on all tables |
| Role-based access | ✅ Built — owner and caller roles |
| WABA onboarding (self-service) | ❌ Not built — manual env config required |
| Ruflo V3 multi-agent setup | ✅ Built — .claude/agents/, hooks, lefthook |
| Cross-platform rules | ✅ Built — AI_RULES.md, .cursorrules, .windsurfrules, CODEX.md |

## Hard Invariants — Never Break
1. **FAQ-first**: ai_reply.py checks FAQ table BEFORE any Groq/LLM call
2. Lead score always integer 1–10
3. Segments: A=Hot, B=Warm, C=Cold, D=Disqualified — labels immutable
4. WhatsApp 24h session window — approved templates only outside window
5. All segment lists: GET /api/v1/leads?segment=A&format=csv
6. Call recordings → Supabase Storage only, never local disk
7. Tenant isolation enforced at app layer via `get_tenant_and_role()` — DB-level RLS not yet enabled
8. Bulk-send endpoint rejects leads with null opt_in_source
9. **Booking flow states (immutable order)**: collecting_name → collecting_rasi → collecting_nakshatram → collecting_gotram → collecting_address → awaiting_payment → confirmed
10. **Booking intent keywords** (frozenset in booking_flow.py): book, booking, register, enroll, புக், வேணும், பதிவு
11. **Template submission** always uses `meta_waba_id` (NOT `meta_phone_number_id`)
12. AI model is Groq `llama-3.3-70b-versatile` — do NOT add Gemini/OpenAI imports

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
| Queue | Celery + Redis | — |
| Cache | Redis (FAQ prompt cache, 60s TTL) | — |
| Agents | Ruflo V3 — 4 Aira agents + 98 base agents | .claude/agents/ |
| Hooks | lefthook (git) + Claude Code + Cursor + Windsurf | lefthook.yml, .cursor/, .windsurf/ |

## Provider Decisions (locked)
- WhatsApp primary: Meta Cloud API Direct
- WhatsApp secondary: WATI
- Voice: TeleCMI (migrated from Exotel → Twilio → TeleCMI)
- AI (replies + scoring): Groq / llama-3.3-70b-versatile (NOT Gemini)
- Payments: Razorpay (Payment Links API — no SDK, direct httpx calls)

## Supabase Config (production)
- Project ID: `tovmebyyjhvszwgvyfdm`
- Region: ap-northeast-1
- WABA ID in app_settings: `meta_waba_id = 994218516456571`
- Default tenant: `00000000-0000-0000-0000-000000000001`

## Task Router — Read This File Before Acting
| Task involves | Read first |
|---|---|
| WhatsApp, Meta API, WATI, provider layer, phone_numbers | .claude/context/whatsapp.md |
| Telecalling, TeleCMI, call logs, notes, briefing modal | .claude/context/telecalling.md |
| Leads, scoring, segments, opt-in | .claude/context/leads.md |
| Number pool, failover, Numbers page, Incidents page | .claude/context/resilience.md |
| CSV upload, bulk send, 7-step flow | .claude/context/upload.md |
| Bookings, booking flow, Razorpay payments | backend/app/services/booking_flow.py + routes/bookings.py |
| WhatsApp templates, Meta template API | backend/app/routes/templates.py + services/meta_cloud.py |

## Agent Dispatch
See AGENTS.md — spawn sub-agents automatically for tasks with 2+ independent work units.
Parallel pattern: schema + API route + frontend page → all 3 in one message.

## Known Tech Debt
- RLS DISABLED on 18 tables — app-layer tenant filter is only guard
- Meta webhook signature not verified on webhook.py and templates.py
- Razorpay payment links have no idempotency key
- Booking automation amount not updated (₹500 flat, needs booking_type + dynamic pricing)
- Bulk send via single number only (needs split across 2 numbers for 15k sends)
- Numbers page auto-failover not wired (handle_quality_red() exists but not triggered)
- ai_reply.py FALLBACK_PROMPT mentions "education consultancy" — update before going live

## Key File Locations
| File | Purpose |
|---|---|
| backend/app/main.py | FastAPI entry, route registration |
| backend/app/routes/webhook.py | WA webhook — inbound routing |
| backend/app/routes/templates.py | Template CRUD + Meta submission |
| backend/app/routes/bookings.py | Booking REST + Razorpay webhook |
| backend/app/services/ai_reply.py | FAQ check → Groq reply pipeline |
| backend/app/services/booking_flow.py | Booking state machine |
| backend/app/services/payment_razorpay.py | Razorpay payment links |
| backend/app/services/meta_cloud.py | Meta Cloud API |
| backend/app/services/lead_scorer.py | Groq scoring (1–10) |
| backend/app/services/telecmi_client.py | TeleCMI click-to-call |
| backend/app/db/supabase.py | Supabase client singleton |
| backend/supabase/migrations/ | All schema migrations 001–038 |
| frontend/app/dashboard/ | All dashboard pages |

## Migration Index (latest)
| Migration | What |
|---|---|
| 035 | phone_numbers messaging_tier constraint adds 250 |
| 036 | broadcast_csvs_bucket |
| 037 | message_delivery_status |
| 038 | broadcast_tracking |

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
