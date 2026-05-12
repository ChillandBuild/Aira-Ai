# Aira AI — Claude Code Operating Manual

## Identity
Generic B2B SaaS — any business that does WhatsApp lead-gen + telecalling (not education-specific).
North Star: no single block/flag/outage stops a client's lead-gen for >5 minutes.
Solo dev. Terse. Code over prose. No trailing summaries. No explanations unless asked.

## Build State
| Component | Status |
|---|---|
| WhatsApp webhook (inbound/outbound) | ✅ Built |
| AI reply pipeline (FAQ → Gemini fallback) | ✅ Built |
| Lead CRUD + CSV import | ✅ Built |
| Lead scoring (1–10, Gemini) | ✅ Built |
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
| Message Templates page | ✅ Built — dashboard/templates/ |
| Knowledge base (full-text injection, no embeddings) | ✅ Built — services/knowledge_service.py, full_text col on knowledge_documents |
| Reply source badge (FAQ / Knowledge Base / AI) | ✅ Built — messages.reply_source, chat-thread.tsx |
| Callback scheduler (Live Notes modal + Today's Callbacks) | ✅ Built — follow_up_jobs cadence=callback, telecalling/components/ |
| Telecaller multi-tenancy (role-based access + lead assignment) | ✅ Built — migration 025, services/assignment.py, AuthRoleContext, sidebar gating |
| Hot lead alert system (score ≥7, 5-min escalation, in-app banner) | ✅ Built — migration 026, routes/alerts.py, ai_reply.py trigger, hot-lead-alert-banner.tsx |
| Lead assignment (manual admin + round-robin auto on new lead) | ✅ Built — PATCH /api/v1/leads/{id}/assign + auto_assign_lead() in webhook |
| Team management page | ✅ Built — dashboard/team/, routes/team.py |
| Onboarding flow | ✅ Built — dashboard/onboarding/, routes/onboarding.py |
| App settings page | ✅ Built — dashboard/settings/, routes/app_settings.py |

## Hard Invariants — Never Break
1. **FAQ-first**: ai_reply.py checks Redis BEFORE any Gemini call
2. Lead score always integer 1–10
3. Segments: A=Hot, B=Warm, C=Cold, D=Disqualified — labels immutable
4. WhatsApp 24h session window — approved templates only outside window
5. All segment lists: GET /api/v1/leads?segment=A&format=csv
6. Call recordings → Supabase Storage only, never local disk
7. Tenant RLS enforced always — one Meta Business Account per tenant
8. Bulk-send endpoint rejects leads with null opt_in_source

## Stack
| Layer | Tech | Location |
|---|---|---|
| Backend | FastAPI, Python 3.11+, Pydantic v2 | backend/app/ |
| DB | Supabase (PostgreSQL + Realtime + RLS) | — |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui | frontend/app/dashboard/ |
| AI | Gemini 2.5-pro (scoring/complex), Gemini 2.0-flash (FAQ/classify) | — |
| WhatsApp | Meta Cloud API Direct (primary) + WATI (secondary) | — |
| Voice | Twilio click-to-call + recording | — |
| Queue | Celery + Redis | — |
| Cache | Redis (FAQ embedding cache) | — |

## Task Router — Read This File Before Acting
| Task involves | Read first |
|---|---|
| WhatsApp, Meta API, WATI, provider layer, phone_numbers | .claude/context/whatsapp.md |
| Telecalling, Twilio, call logs, notes, briefing modal | .claude/context/telecalling.md |
| Leads, scoring, segments, opt-in | .claude/context/leads.md |
| Number pool, failover, Numbers page, Incidents page | .claude/context/resilience.md |
| CSV upload, bulk send, 7-step flow | .claude/context/upload.md |

## Agent Dispatch
See .claude/rules/aira-agents.md (auto-loaded every session).
Spawn sub-agents automatically (never ask) when task has 2+ independent work units.
Each agent gets only its relevant context file — not the full CLAUDE.md.

## Provider Decisions (locked 2026-04-22)
- WhatsApp primary: Meta Cloud API Direct
- WhatsApp secondary: WATI
- Voice: Twilio (migrated from Exotel)
- AI: Gemini (not Claude) — 2.5-pro for complex/scoring, 2.0-flash for FAQ classify

## Known Tech Debt
- webhook_instagram.py exists but route is NOT registered in main.py — safe, leave disabled
- Analytics page shows ad metrics — repurpose to service metrics (WA + telecalling + funnel)
- Sidebar makes a duplicate /team/me call independent of AuthRoleContext — consolidate to useAuthRole()
- AdminView.tsx in telecalling has N+1 sequential fetches per caller — replace with Promise.allSettled
- services/growth.py + services/scheduled_tasks.py — verify wired to Celery or remove if dead
- AI Tune label may need rename to clarify it tunes WA auto-reply prompts only
- **RLS DISABLED on 19 tables** (confirmed 2026-05-13 via Supabase MCP): faqs, callers, app_settings, follow_up_jobs, phone_numbers, incidents, lead_notes, voice_numbers, message_templates, tenants, tenant_users, hot_lead_alerts, conversations, call_logs, ad_campaigns, segment_templates, ai_prompts, ai_tune_suggestions, lead_stage_events — anyone with anon key can read/write these. Fix before production scale: enable RLS + add tenant-scoped policies per table. Do NOT enable RLS without policies or all access breaks.

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
