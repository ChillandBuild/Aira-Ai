# Aira AI — Production Readiness Roadmap

**Audience:** founder / solo dev preparing to ship to first paying client.
**Tone:** blunt, opinionated, ordered by impact. No fluff.
**Last updated:** 2026-04-28.

---

## Where we are right now

| Area | Status |
|---|---|
| WhatsApp inbound (Meta Cloud API direct) | ✅ Working end-to-end |
| AI auto-reply (FAQ → Gemini fallback) | ✅ Working |
| Lead CRUD, scoring, A/B/C/D segmentation | ✅ Working |
| CSV upload + bulk send | ✅ Built |
| Manual telecalling (Twilio click-to-call + recording) | ✅ Working |
| Gemini transcription + AI call summary | ✅ Built |
| Notes page (lead notes + AI summaries) | ✅ Built |
| Message templates page | ✅ Built |
| STOP/opt-out handling | ✅ Built — webhook detection + bulk-send gate |
| Daily WhatsApp number tier limit cap | ✅ Built — auto-skips exhausted numbers |
| Conversation segment filter | ✅ Built |
| Auth (login/logout/session/route protection) | ✅ Built — Supabase Auth + Next.js middleware + backend JWT |
| Multi-tenancy, RLS, roles | ❌ Not implemented — next priority |
| Auto-assign leads to telecallers | ❌ Not implemented |
| Webhook signature verification | ❌ Not implemented |
| Async outbound queue | ⚠️ Webhook handler awaits Meta + Gemini inline (5–6s response) |
| Billing / subscriptions | ❌ Not built |
| Onboarding wizard | ❌ Not built |
| Privacy Policy / T&C pages | ❌ Not in repo (Meta requires for production WABA) |
| Error monitoring | ❌ No Sentry, no structured logs, no alerting |
| Backups / DR | ⚠️ Supabase auto-backups only — restore never tested |
| Render plan | ⚠️ Free tier — service sleeps on inactivity |

This document lists everything still needed, ordered by priority.

---

# Tier 0 — Ship blockers

You cannot take money for this until every line in this tier is done. Some are 30 minutes, some are 2 days. None are optional.

### 0.1 Authentication
- [ ] Email/password signup + login (Supabase Auth or NextAuth)
- [ ] Password reset flow
- [ ] Session management (HttpOnly Secure SameSite cookies, sliding expiry)
- [ ] 2FA via TOTP for admin accounts (highly recommend)
- [ ] Brute-force protection (rate-limit + lockout after N failed attempts)
- [ ] Logout endpoint that invalidates server-side session

**Why:** anyone with your URL currently reads every lead in the DB. **Effort:** 1–2 days with Supabase Auth.

### 0.2 Multi-tenancy
- [ ] `tenants` table — id, name, plan, created_at, owner_user_id, status
- [ ] `tenant_users` join table for role-based access (owner / admin / caller / viewer)
- [ ] `tenant_id` foreign key on every existing table — `leads`, `messages`, `call_logs`, `callers`, `phone_numbers`, `lead_notes`, `follow_up_jobs`, `segment_templates`, `faqs`, `app_settings`, `incidents`, `lead_stage_events`
- [ ] Migration script to backfill existing data into a default tenant
- [ ] Supabase RLS policies enforcing `tenant_id = current_tenant()` on every table
- [ ] Backend: extract tenant from JWT, set `current_tenant()` per request
- [ ] All existing routes filter by tenant — currently zero do
- [ ] Webhook handler maps inbound number → tenant via `phone_numbers.tenant_id`

**Why:** without this, your second client sees your first client's leads. Worst-case data breach. **Effort:** 2–3 days, mostly mechanical but high-blast-radius.

### 0.3 Webhook signature verification
- [ ] Validate Meta's `X-Hub-Signature-256` header on every POST to `/webhook/whatsapp`
- [ ] Use the App Secret (not the access token) — store as `meta_app_secret` in app_settings
- [ ] Reject 401 if signature missing or invalid
- [ ] Same for any other webhook endpoint (Twilio voice status, Razorpay/Stripe webhooks)

**Why:** anyone can POST fake "inbound messages" right now → creates leads, burns Gemini quota, pollutes your dashboard. **Effort:** 1 hour.

### 0.4 Async outbound + webhook ack
- [ ] Move `generate_reply` out of the webhook handler into a Celery task (you already have Redis + Celery in the stack)
- [ ] Webhook returns `{"status":"ok"}` in <100ms — Celery worker handles the AI reply asynchronously
- [ ] Idempotency: keep the existing `meta_message_id` dedup check — extend to set a Redis lock for in-flight processing
- [ ] Retry with exponential backoff on Meta/Gemini transient failures (3 attempts, 1s/4s/16s)
- [ ] Dead-letter queue: failed messages after 3 retries go into a `failed_outbound` table with the error reason; admin UI shows them and can re-queue or discard

**Why:** Meta retries the webhook if response is slow or 5xx → we send duplicate replies. Also the current webhook blocks for 5–6s, which doesn't scale past ~10 concurrent leads. **Effort:** 1 day.

### 0.5 Permanent Meta token onboarding
- [ ] In Settings, only accept System User tokens — done (warning/banner already removed per latest preference)
- [ ] On token save, validate it via `GET https://graph.facebook.com/v18.0/me` → reject if Meta returns auth error, with a clear message
- [ ] Show last validation timestamp + status (✓ Valid / ✗ Expired) on the Settings card

**Why:** the issue we hit today must never silently happen to a paying client. **Effort:** 2 hours.

### 0.6 Privacy Policy + Terms of Service
- [ ] Public `/privacy` and `/terms` pages with real content
- [ ] DPDP-compliant: data collected, retention, third parties (Supabase, Gemini, Meta), user rights, contact for grievances
- [ ] Linked from app footer + signup form (consent checkbox)
- [ ] Data Processing Addendum (DPA) template ready to sign with B2B clients

**Why:** Meta will not approve your WhatsApp Business API for production use without these public URLs. Without approval you stay in dev mode → 5 test recipients only. Also DPDP Act compliance. **Effort:** 0.5 day for content (use a template + customize) + 1 hour to add pages.

### 0.7 Backup verification
- [ ] Confirm Supabase PITR (Point-in-Time Recovery) is enabled — required for paid Pro plan
- [ ] **Run a restore drill** — restore yesterday's backup to a staging project, confirm data integrity. Most teams skip this and find out the hard way that backups were broken.
- [ ] Document the restore runbook (steps to restore prod in <2 hours)

**Why:** "we have backups" without a tested restore is a lie you tell yourself. **Effort:** 0.5 day.

---

# Tier 1 — Real product

The difference between "demo" and "product." Ship within 2 weeks of first paying client.

### 1.1 Onboarding wizard (`/onboarding`)
Steps:
1. Connect Meta WABA (paste creds + verify)
2. Configure webhook URL (auto-show their tenant's webhook URL + verify token to paste in Meta)
3. Send test message to founder's own number
4. Upload first leads CSV (or skip)
5. Tour the dashboard

**Why:** new clients otherwise hit a blank dashboard, get confused, churn. **Effort:** 1–1.5 days.

### 1.2 Billing
- [ ] **Razorpay** for India clients (better INR support than Stripe, lower fees, GST-compliant invoices)
- [ ] Subscription tiers: e.g. ₹2,999/mo (1 number, 5K msgs, 1 caller seat) / ₹9,999/mo (3 numbers, 25K msgs, 5 seats) / Enterprise
- [ ] Free trial: 14 days, full features, no credit card required for trial
- [ ] State machine: trialing → active → past_due → suspended → cancelled
- [ ] Webhook handler for `payment.captured`, `subscription.charged`, `subscription.cancelled`
- [ ] Quota enforcement middleware: reject sends when monthly limit hit, warn at 80%
- [ ] Invoice PDFs auto-emailed
- [ ] Self-serve upgrade/downgrade in Settings → Billing page

**Effort:** 2–3 days. Razorpay has decent docs and a Python SDK.

### 1.3 Template management
- [ ] Templates page lists Meta WABA templates with status (APPROVED / PENDING / REJECTED) — pulled live from Meta Graph API
- [ ] "Submit new template" form — body text, category (MARKETING/UTILITY/AUTHENTICATION), language, variables (`{{1}}`, `{{2}}`)
- [ ] Send-template endpoint takes template name + variable values → calls Meta with proper `components` payload
- [ ] Compose modal (the "+ New Message" button I added) auto-detects 24h-window state and switches to template selector when outside window
- [ ] Broadcast page also uses templates for cold outreach

**Why:** outside the 24h window, freeform text fails. Without this, the product can only message warm leads. **Effort:** 1.5 days.

### 1.4 Read receipts + delivery status
- [ ] Webhook handler for `field: "messages"` `statuses` array — Meta sends `sent → delivered → read` updates
- [ ] Add `status` column to `messages` (`queued`/`sent`/`delivered`/`read`/`failed`)
- [ ] UI shows ✓ / ✓✓ / ✓✓ (blue) like WhatsApp
- [ ] Failed status surfaces the error reason to the chat thread

**Effort:** 0.5 day.

### 1.5 Media messages
- [ ] Receive: store image/audio/document refs from Meta webhook, fetch via Graph API media endpoint, upload to Supabase Storage
- [ ] Send: client picks file → upload to Supabase → POST media to Meta Graph API
- [ ] UI renders images inline, audio as a player, documents with download

**Effort:** 1 day.

### 1.6 Notifications
- [ ] Browser push (Web Push API) when a Hot (Segment A) lead replies and AI is paused
- [ ] Email digest 9 AM daily: yesterday's hot leads, unreplied >24h, conversion count
- [ ] Optional Slack webhook for tenants who want it

**Effort:** 1 day.

### 1.7 Audit log
- [ ] `audit_log` table — tenant_id, user_id, action, resource_type, resource_id, metadata (jsonb), timestamp
- [ ] Log: lead deleted, AI toggled, segment template edited, broadcast sent, settings changed, member invited, plan changed
- [ ] Settings page shows last 100 entries; export to CSV

**Why:** when a caller "accidentally" deletes a lead, the owner needs to see who did it. **Effort:** 0.5 day.

---

# Tier 2 — Polish

Ship within 1 month of first client. Each one moves you from "works" to "loved."

- [ ] Bulk lead actions — multi-select rows, then delete / change segment / assign caller / tag
- [ ] Custom tags per lead (free-text labels)
- [ ] Custom fields per tenant (e.g. "course of interest", "year of study")
- [ ] Global search bar (⌘K) — search leads by phone/name, jump to conversation
- [ ] Notes timeline visible from chat thread (currently exists as data but not in chat UI)
- [ ] Conversation → PDF export (for handing over to counsellor)
- [ ] Mobile-responsive layout — telecallers will use this on phones
- [ ] Dark mode (low priority but cheap with Tailwind)
- [ ] Keyboard shortcuts: J/K next/prev lead, R reply, M mark converted, D delete
- [ ] Auto opt-out: if inbound message contains "STOP" / "UNSUB" / "REMOVE" → set `ai_enabled=false`, mark lead `do_not_contact=true`, never message again
- [ ] Cohort/funnel analytics: weekly conversion rate by source, time-to-convert distribution

---

# Tier 3 — Telecalling depth

Bundle these once you have your real telephony provider live (Twilio recommended given your situation).

- [ ] Switch voice provider abstraction to support Twilio alongside Exotel
- [ ] **Test Mode** for voice (mock provider) — lets clients validate without real telephony, also lets you demo without burning money
- [ ] Callback scheduling — "call this lead at 4pm tomorrow" creates a queued task
- [ ] Auto-dial mode: caller clicks "Start dialling" → system queues hot leads, dials one after another
- [ ] In-browser recording playback (currently a Supabase URL — embed an audio player)
- [ ] Per-caller leaderboard: calls/day, connect rate, avg duration, conversion contribution
- [ ] Manager view for caller coaching: list of low-scoring calls flagged for review
- [ ] Live call monitoring (whisper / barge-in) — premium feature

---

# Tier 4 — Production operations (the SRE work)

This is what separates "shipped" from "survived." Skip this and your first 3am outage will lose you the client.

### 4.1 Error monitoring
- [ ] **Sentry** — frontend (Next.js) + backend (FastAPI). Free tier covers 5K errors/month.
- [ ] Source maps uploaded so stack traces are readable
- [ ] Tag every error with `tenant_id` and `user_id` so you can filter by client
- [ ] Critical errors page Slack channel `#aira-alerts` immediately
- [ ] Set up alert rules: any 5xx >1% sustained for 5 min, any unhandled exception in webhook handler, any Meta/Gemini API failure rate >5%

### 4.2 Structured logging
- [ ] Replace `print` and bare `logger.info` with structured JSON logs
- [ ] Every log line includes: `request_id`, `tenant_id`, `user_id`, `path`, `latency_ms`
- [ ] Logs ship to **Better Stack** (formerly Logtail) or **Datadog** — Better Stack free tier sufficient at your stage
- [ ] Searchable by request_id end-to-end (frontend → backend → DB)

### 4.3 Metrics / dashboards
- [ ] Uptime: **Better Stack Uptime** pings `/health` every 30s, alerts on 2 consecutive failures
- [ ] App metrics: Datadog or Grafana Cloud (free tier)
  - Request rate, p50/p95/p99 latency by endpoint
  - Error rate by endpoint
  - Meta API latency + error rate
  - Gemini API latency + error rate + tokens consumed per tenant
  - Outbound queue depth + DLQ count
  - DB connection pool saturation
- [ ] Public **status page** at `status.aira.ai` (Better Stack does this) — clients see incidents in real-time, reduces support tickets

### 4.4 Synthetic monitoring
- [ ] Cron-style script every 5 min: send a test webhook payload to your own staging tenant, confirm it lands in DB. If it doesn't, page you.
- [ ] Daily script: simulate a full lead flow (webhook → AI reply → DB write) on staging, confirm latency p95 under 3s.

### 4.5 Incident response
Document and rehearse:
- **Severity definitions:** SEV1 (data loss / >50% users down) / SEV2 (degraded for >25% users) / SEV3 (single-feature broken) / SEV4 (cosmetic)
- **On-call rotation** (just you initially — but document where the bat-phone lives)
- **Runbooks** for the top 5 likely incidents:
  1. Meta token expired → see Settings → re-paste → Settings auto-validates
  2. Render service down → check Render dashboard, contact support, communicate via status page
  3. Supabase outage → check status.supabase.com, wait — there's no fallback at this stage
  4. Webhook signature failures spike → check if Meta rotated app secret
  5. Gemini quota exhausted → temporarily disable AI auto-reply globally, top up
- **Postmortem template** in `docs/postmortems/` — every SEV1/SEV2 gets one. Blameless. What happened, why, what we'll change.

### 4.6 Reliability patterns
- [ ] **Circuit breaker** on Meta + Gemini calls (e.g. py-breaker) — if 5 failures in 30s, open circuit for 60s, fall back gracefully
- [ ] **Timeout everything**: HTTP calls (15s), DB queries (5s), AI calls (30s)
- [ ] **Graceful shutdown:** SIGTERM → stop accepting new requests, finish in-flight, close DB pool, exit
- [ ] **Connection pooling:** confirm Supabase pool sized for peak load (Render concurrent requests × tenants)
- [ ] **Rate limiting:** per-IP rate limit on public endpoints (signup, login, webhook). Use `slowapi` or Redis+Lua.

### 4.7 Disaster recovery (DR)
Define and test:
- **RTO (Recovery Time Objective):** how long can the app be down? Set a target (e.g. 2 hours for SEV1)
- **RPO (Recovery Point Objective):** how much data can we lose? (e.g. <15 min)
- **Backup schedule:** Supabase PITR with 7-day window minimum
- **Restore runbook:** documented steps, **tested every quarter**
- **Failover plan:** what if Render goes down for 12 hours? Have a `Procfile`/`Dockerfile` ready to deploy to Fly.io or Railway in 30 min

---

# Tier 5 — Security hardening

Some of this overlaps Tier 0. The list below is the full security checklist a senior engineer audits before shipping.

### Authentication & authorization
- [x] Already in Tier 0
- [ ] Session fixation prevention (rotate session ID after login)
- [ ] CSRF tokens on all state-changing requests
- [ ] Password requirements: min 10 chars, breach-checked via HIBP API
- [ ] Account lockout after 10 failed logins (with email alert to user)
- [ ] Suspicious login email (new IP, new device, new country)

### Network / transport
- [ ] HTTPS everywhere — Vercel + Render handle this
- [ ] HSTS header with `max-age=31536000; includeSubDomains; preload`
- [ ] CORS lockdown — currently allows any `*.vercel.app` (too loose, exploitable). Restrict to your prod + a single staging URL.
- [ ] CSP (Content-Security-Policy) header — blocks inline scripts, restricts external sources
- [ ] Other security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`

### Secrets
- [ ] Move secrets out of `app_settings` table (per-tenant) into Supabase Vault or AWS Secrets Manager for the global stuff (DB URL, service keys)
- [ ] Per-tenant Meta tokens stay in `app_settings` but **encrypted at rest** with a KMS key (Supabase pgsodium or AWS KMS)
- [ ] Quarterly secret rotation procedure — documented, calendar-reminded
- [ ] Never log secrets — add a redactor that scrubs `Authorization` headers, tokens, passwords from logs
- [ ] No secrets in git — verify with `gitleaks` in CI

### Input validation
- [ ] Pydantic v2 strict mode on all request schemas — already mostly there
- [ ] Phone number format validation (E.164)
- [ ] CSV upload: file size cap (10 MB), row cap (50K), MIME-type check, sanitize cell values
- [ ] HTML sanitization on any user-content rendered as HTML (DOMPurify on frontend)
- [ ] SQL injection: Supabase client parameterizes — verify no raw SQL with f-strings anywhere

### Authorization at object level
- [ ] Every `GET /api/v1/leads/{id}` confirms the lead's `tenant_id` matches the caller's tenant — even with RLS, defense in depth
- [ ] Same for messages, calls, every resource
- [ ] Role-based: only `owner`/`admin` can change billing or invite members; `caller` can only manage assigned leads

### Abuse / anti-fraud
- [ ] Rate limit: signup (5/IP/hr), login (10/IP/hr), webhook (1000/IP/min), broadcast (per-tenant quota)
- [ ] Disposable-email block on signup (use a service or maintained list)
- [ ] Captcha on signup if abuse detected (hCaptcha free)
- [ ] Suspicious activity flags: sudden message-volume spike → temporary hold + email admin

### Dependency hygiene
- [ ] **Dependabot** on GitHub for both `requirements.txt` and `package.json`
- [ ] **Snyk** or **GitHub Advanced Security** for vulnerability scanning
- [ ] Pin versions in production (`requirements.lock`, `package-lock.json` already there)
- [ ] Monthly review of new advisories

### Data minimization
- [ ] Don't store more than you need. Currently storing full message content forever — fine for now but plan a 12-month retention policy.
- [ ] Soft-delete with hard-delete after 90 days (already started for leads)
- [ ] PII scrubber for tenants on cancellation: anonymize phone/name after 30-day grace period

---

# Tier 6 — Compliance (India focus, expandable)

### DPDP Act 2023 (India) — mandatory
- [ ] Privacy Policy with required disclosures
- [ ] Consent capture at signup (explicit checkbox, separate from T&C)
- [ ] Data Principal Rights endpoints:
  - Export ("download all my data" → ZIP of leads, messages, settings)
  - Erasure ("delete my account") — full purge after 30-day grace
  - Correction (already exists via Settings)
- [ ] Data Protection Officer (DPO) contact in Privacy Policy — initially you, eventually a separate role
- [ ] Breach notification procedure: 72-hour reporting to Data Protection Board if PII breached
- [ ] Data localization — Supabase has a Mumbai region. **Use it** to keep Indian customer data in India.
- [ ] Subprocessor list page: Supabase, Render, Vercel, Google (Gemini), Meta — disclose what each processes

### GDPR (if you take EU clients)
- Most of the above maps directly. Add: DPA signing flow with EU clients, EU representative.

### Meta WABA policies
- [ ] Public Privacy Policy URL (linked in your Meta App → Settings → Basic)
- [ ] Public Terms URL
- [ ] Data Deletion URL — endpoint that lets a user request all their data deleted (Meta requires this for app review)
- [ ] Honour opt-outs (already in Tier 2)
- [ ] Don't message users who haven't opted in — already enforced by your `opt_in_source` gating

---

# Tier 7 — Business / revenue

### Pricing & packaging
- [ ] Pricing page on the marketing site
- [ ] In-app upgrade nudges when hitting limits (80% / 100%)
- [ ] Annual plans with discount (improves cashflow + retention)

### Customer success
- [ ] Welcome email sequence (day 0, 1, 3, 7, 14)
- [ ] Onboarding call offer (Calendly link in onboarding wizard)
- [ ] Weekly success email: "Last week you converted 3 leads, AI handled 87% of replies, your top FAQ was X"
- [ ] Monthly check-in email from founder for first 90 days
- [ ] In-app NPS survey at day 30 + day 90
- [ ] Churn prediction: leads-handled-per-week trending down 4 weeks → flag, reach out

### Support
- [ ] In-app chat support widget — **Crisp** (free tier) or **Plain** (cheap, beautiful)
- [ ] Help docs site — Notion / GitBook / Mintlify, linked from in-app `?` button
- [ ] Email support address: `support@aira.ai` → routes to inbox + Slack channel
- [ ] Response SLA: <4h business hours, <24h weekend
- [ ] Public roadmap (Canny, Featurebase) so clients see what's coming

### Internal tools
- [ ] Admin dashboard (separate route, hard auth) — see all tenants, usage, MRR, churn risk
- [ ] One-click "impersonate tenant" for support (with audit log entry)
- [ ] Billing dashboard: MRR, ARR, churn, CAC, LTV

---

# Tier 8 — Engineering quality / dev velocity

You can skip these for the first 30 days but they pay dividends after.

### Testing
- [ ] **Pytest** for backend — unit tests for services (FAQ matcher, scoring, segmentation), integration tests for webhook flow
- [ ] **Playwright** for frontend e2e — login → create lead → send message → verify delivered
- [ ] CI runs all tests on every PR — block merge on red
- [ ] Code coverage minimum 60% for services, 40% overall
- [ ] Smoke test suite that runs against production after every deploy

### CI/CD
- [ ] **GitHub Actions** pipeline:
  - On PR: lint, typecheck, test, build
  - On merge to main: deploy to staging, smoke test, then deploy to prod
- [ ] **Staging environment** — separate Supabase project + separate Render service. Currently you have only prod. Test risky changes on staging first.
- [ ] Deploy notifications to Slack
- [ ] Easy rollback: `git revert && push` triggers redeploy

### Code quality
- [ ] `ruff` + `black` for Python; `eslint` + `prettier` for TS — pre-commit hook
- [ ] Type checking: `mypy --strict` for backend, TS already strict
- [ ] PR template: what / why / how to test / screenshots
- [ ] Code review even if you're solo (let yourself sleep on big PRs)

### Performance
- [ ] Database query analysis — `pg_stat_statements`, find slow queries
- [ ] Add missing indexes (you'll find some on `messages.lead_id`, `call_logs.created_at` etc.)
- [ ] Frontend: Lighthouse score >90 (already mostly OK with Next.js)
- [ ] Image optimization (Next.js Image component)
- [ ] Bundle analysis — strip unused lucide icons, dynamic-import heavy pages

### Feature flags
- [ ] **GrowthBook** (open source, free) or **Unleash**
- [ ] Wrap risky new features in flags so you can roll out per-tenant or kill instantly

---

# Recommended ship sequence

If I were you, this is the order. Not all tiers must be fully done before the next — overlap aggressively.

| Week | Focus |
|---|---|
| **Week 1** | Tier 0 — auth, multi-tenancy, webhook signature, async queue, Meta token validation |
| **Week 2** | Tier 0 finish — Privacy Policy, T&C, backup drill. Tier 4 — Sentry, Better Stack uptime, basic structured logging |
| **Week 3** | Tier 1 — onboarding wizard, billing (Razorpay), template management |
| **Week 4** | Tier 1 finish — read receipts, media, notifications. **Onboard first paying client.** |
| **Week 5–8** | Tier 2 polish + Tier 4 finishing (incident runbooks, status page, DR drill) |
| **Week 9–12** | Tier 3 telecalling depth (after Twilio integration), Tier 5 security audit, Tier 6 DPDP compliance review |
| **Quarter 2** | Tier 7 customer success automation, Tier 8 testing + CI/CD investment |

**First paying client target: end of Week 4.** Anything later means you're over-engineering before market validation.

---

# Tooling shortlist

What I'd actually pick for this stack at this stage. Defaults — change only with reason.

| Concern | Tool | Why |
|---|---|---|
| Auth | Supabase Auth | Already using Supabase; zero extra infra |
| Errors | Sentry | Industry standard, free tier ample |
| Logs | Better Stack | Generous free tier, Logtail bought out, beautiful UI |
| Metrics | Grafana Cloud free tier | Or Datadog if you can afford it later |
| Uptime | Better Stack Uptime | Same vendor as logs, simple |
| Status page | Better Stack | Same vendor, included |
| Email | Resend | DX is best-in-class; React Email templates |
| Support chat | Crisp (free) → Plain (paid) | Crisp for week 1, Plain when you have budget |
| Help docs | Mintlify | Beautiful, MDX-based, free for OSS-style |
| Billing | Razorpay | India-first, GST invoices, INR-friendly |
| Feature flags | GrowthBook self-hosted | Free, full-featured, on Supabase |
| CI | GitHub Actions | Free 2K min/mo for private repos |
| Staging Supabase | Same project, schema branch | Use Supabase branching — cheap |
| Secrets | Doppler or AWS Secrets Manager | Doppler easier; AWS if you'll grow into it |
| Search/⌘K | cmdk (React) | Lightweight, Vercel-built |
| Voice | Twilio (international US number → India) | Only viable path for unregistered Indian devs (see voice analysis) |

---

# How to handle errors when clients hit them (the operational playbook)

Concrete process, not abstractions.

### 1. Detection
- Sentry catches unhandled exceptions automatically — a Slack message lands within seconds
- Better Stack pings `/health` every 30s — alert after 2 consecutive fails
- Sentry alert rules: error rate > 1% on any endpoint for 5 min → Slack
- Daily synthetic test: full inbound→reply flow on staging tenant — fails alert you

### 2. Triage (within 5 minutes of alert)
1. Open Sentry → look at error stack trace + tenant_id + recent breadcrumbs
2. Decide severity (SEV1–4)
3. If SEV1: post to `#aira-alerts`, put up status page incident, start a timer
4. If SEV2: same but no status page yet, work it
5. If SEV3/4: file a GitHub issue, fix in next deploy window

### 3. Communicate
- For SEV1/2: post status page within 10 min — even just "Investigating: some users may see errors when sending messages. Updates in 15 min."
- For affected client: email the owner directly within 15 min — short, honest, what you know, when you'll update
- Don't promise ETAs you can't keep. "We'll update in 30 min" is always better than "fixed in 1 hour."

### 4. Mitigate
- Mitigation > root cause when users are down. Roll back the deploy. Disable the feature flag. Switch to backup provider. Whatever stops the bleeding.
- Then dig for root cause.

### 5. Postmortem (within 48 hours of resolution)
Template every SEV1/SEV2:
- **Timeline** (UTC, minute-precise): when alert fired, when triaged, when mitigated, when fixed
- **Impact:** which tenants, how many users, what they saw, how much data affected
- **Root cause:** technical truth
- **What we did right** (don't skip this — it builds team confidence)
- **What we did wrong**
- **Action items:** owner + deadline. Track them in a `postmortems-actions` GitHub project. **Burn rate of action items = your maturity.**

### 6. Trends
Once a week, look at top 10 Sentry issues. Are they recurring? Are they spiking? File an issue, fix the top 1–2 each week before they become incidents.

---

# What separates "live" from "production-grade" — my opinionated take

After 30 years of shipping, the things people skip and regret:

1. **Untested backups.** Everyone has backups. Almost nobody has tested restores. Test it before you need it.
2. **No staging environment.** Means every change is deployed to production. Means inevitable downtime. Make staging the day you have your first paying customer.
3. **No error monitoring on day 1.** You'll discover bugs from angry support tickets instead of metrics. Sentry takes 30 minutes to set up. Do it tomorrow.
4. **No structured logging.** When the worst happens, you'll be grepping through Render's web log viewer with no request_id. Add it before you have customers, not after.
5. **Treating webhooks as fire-and-forget.** They retry. They duplicate. They send out-of-order. Idempotency keys aren't optional.
6. **Coupling auth to a single provider.** Use a layer (Supabase Auth, Auth.js) that lets you swap if you need SSO later for enterprise.
7. **Deploying to free tier.** Render free sleeps. Render starter ($7) doesn't. The difference between losing a client and not is $7/mo.
8. **No status page.** When you're down, half your support load is "is the service up?" A status page kills that question and builds trust.
9. **Skipping the DPA.** First enterprise client will ask for one. If you don't have a template ready, you'll be scrambling for two weeks.
10. **No runbooks.** When you're paged at 3am, you don't want to be reading code. Five short runbooks for the most likely incidents are worth their weight.
11. **Letting tech debt compound silently.** Allocate 20% of every sprint to debt. Compound interest is real here too.
12. **Not having a "delete my data" button.** DPDP requires it. GDPR requires it. Your conscience requires it. Build it before regulators force you to.
13. **Confusing growth with product-market fit.** Onboard slowly. Talk to every client weekly for the first 30 days. Most "features" you think you need are wrong; the right ones come from those calls.
14. **Skimping on observability budget.** $100/mo on Sentry + Better Stack + Grafana is the cheapest insurance you'll ever buy.
15. **Forgetting the maintenance cost of every line of code shipped.** Every feature has a TCO. Some of the best PRs delete code.

---

# Estimated effort & cost (solo dev)

### Time
- Tier 0: ~10 working days
- Tier 1: ~10 working days
- Tier 2: ~8 working days (can overlap with revenue)
- Tier 3: ~6 working days (after Twilio live)
- Tier 4 (ops): ~5 working days (front-loaded), then continuous
- Tier 5/6/7/8: ongoing

**Realistic timeline to first paying client production-ready: 4–6 weeks of focused work.**

### Monthly running cost (estimate, INR)
| Item | Cost |
|---|---|
| Render starter (backend) | ~₹600 |
| Vercel hobby (frontend) | Free → ~₹1,700 if you exceed |
| Supabase Pro | ~₹2,100 |
| Sentry team | ~₹2,400 |
| Better Stack (logs+uptime+status) | ~₹1,700 |
| Resend (email) | Free → ~₹1,700 |
| Razorpay | 2% of revenue |
| Twilio (voice) | Per-call, ~₹0.70/min |
| Gemini API | Per-token, free tier covers light usage |
| Domain + misc | ~₹500 |
| **Total fixed** | **~₹9,000/mo to start** |

You need ~3 paying clients at ₹3K/mo to be profitable on infra alone. Five clients gives margin.

---

# Final note

This roadmap is opinionated. You will disagree with parts of it. **Good.** What matters more than the exact ordering is that:
1. You've named every gap.
2. You've decided which gaps matter for your specific first client.
3. You've put dates next to the work.

Print this. Mark off lines. Update weekly.

Ship.
