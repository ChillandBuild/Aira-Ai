# Aira AI — Claude Code Operating Manual

## Identity
B2B SaaS for education consultancies. Leads via WhatsApp + manual telecalling.
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
| Manual dial via Exotel click-to-call | ✅ Built — commit 27d98a3 |
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
| Voice | Exotel click-to-call | — |
| Queue | Celery + Redis | — |
| Cache | Redis (FAQ embedding cache) | — |

## Task Router — Read This File Before Acting
| Task involves | Read first |
|---|---|
| WhatsApp, Meta API, WATI, provider layer, phone_numbers | .claude/context/whatsapp.md |
| Telecalling, Exotel, call logs, notes, briefing modal | .claude/context/telecalling.md |
| Leads, scoring, segments, opt-in | .claude/context/leads.md |
| Number pool, failover, Numbers page, Incidents page | .claude/context/resilience.md |
| CSV upload, bulk send, 7-step flow | .claude/context/upload.md |

## Agent Dispatch
See .claude/agents.md for full rules.
Spawn sub-agents automatically (never ask) when task has 2+ independent work units.
Each agent gets only its relevant context file — not the full CLAUDE.md.

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
