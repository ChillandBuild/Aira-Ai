# Aira AI — Founder's Playbook for Seamless Service

## Context

If I'm the founder of Aira AI, my clients are education consultancies and colleges running lead-gen on WhatsApp and manual telecalling. Their entire pipeline sits on top of two fragile rails: (1) WhatsApp Business numbers that Meta can block on 10–20 reports, and (2) telecaller SIMs that carriers flag as spam within days. If either rail breaks and stays broken for 48 hours, my client loses a school-results season — which means they churn. "Seamless" therefore isn't a feature, it's the product. This doc is how I'd build the company around that promise.

---

## 1. The Promise (the North Star)

> **No single block, flag, outage, or provider failure ever stops a client's lead-gen for more than 5 minutes.**

Every architectural decision, every support SLA, every pricing choice flows from this one sentence. When I evaluate a feature or a shortcut, the test is: "Does this make the 5-minute promise harder or easier to keep?"

---

## 2. Dashboard Scope — Current → After

Per the scope decision on 2026-04-21 (boss call: WhatsApp + manual telecalling only for Phase 1).

| Page | Current purpose | Decision |
|---|---|---|
| Conversations | WhatsApp Clone (realtime) | **Keep** — core feature |
| Leads | A/B/C/D segmentation + CSV export | **Keep** |
| Telecalling | Callers, manual dial (Exotel), recordings | **Keep** — already on Exotel |
| Upload | Bulk CSV contact import | **Keep + enhance** (opt-in gate, see §5) |
| Knowledge | FAQ / knowledge base | **Keep** — feeds AI auto-reply |
| Settings | Config | **Keep** |
| AI Tune | Prompt auto-tuning | **Repurpose** — tunes WhatsApp auto-reply prompts from closed deals |
| Analytics | Ad campaign analytics | **Repurpose** — now shows service analytics (see §4) |
| (Instagram backend route `webhook_instagram.py`) | Instagram webhook | **Disable** — deferred to later phase |
| (AI telecalling / voice agent) | Not yet built | **Do not build** — deferred to later phase |
| **Numbers** (NEW) | Per-number health, pool management | **Add** (see §6) |
| **Incidents** (NEW) | Log of auto-actions (failover, migration, appeal) | **Add** (see §6) |

Net: 6 pages kept as-is, 2 repurposed, 1 backend route disabled, 2 new pages added = **10 pages total** post-cleanup.

---

## 3. The Architecture of Resilience — 6 Subsystems

### 3.1 Channel Pool (not a channel)

Every client onboards with:

- **Minimum 3 WhatsApp numbers** per tenant (1 active primary + 2 warmed standbys)
- **Minimum 1 voice pool** via Exotel (5–10 DID numbers, DLT-registered, Truecaller-Business-branded)
- A **provider abstraction layer** so clients can use Meta Cloud API direct, Gupshup, AiSensy, or 360dialog — picked by the client, even mixed within one tenant

Why 3 WA numbers minimum: if primary dies, standby must already be warmed. Warm-up takes ~14 days silently in the background — you can't do it reactively in 5 minutes.

### 3.2 Proactive Health Monitoring

Every number — WA or voice — has a live health score. Inputs:

- Meta `phone_number_quality_update` webhooks (Green/Yellow/Red)
- Meta messaging-tier transitions
- Per-number daily send count vs. tier cap
- Voice: Truecaller spam-flag rate + Exotel call-analytics
- Inbound response rate, read rate, opt-out rate, block rate

The system acts *before* the carrier or Meta does. Yellow → halve send volume. Red → route outbound away, promote standby. Client sees only a dashboard saying "3 numbers healthy, 1 warming, 0 issues."

### 3.3 Automated Failover + Migration

When a WhatsApp number flips to `restricted`:

1. Router promotes warmed standby to primary (<1 min)
2. Pre-approved "channel migration" utility template fires to all leads with ≤7-day activity, from the new number: *"We've moved — save this contact"*
3. Appeal auto-filed with Meta via Graph API
4. Client gets one dashboard alert summarizing what already happened
5. New standby provisioning kicked off so pool depth is restored

For voice: if spam-score climbs, router pulls number from rotation, triggers 48-hour cool-down, swaps in another from the pool.

### 3.4 Cross-Channel Fallback (the real safety net)

If WhatsApp is fully degraded for a tenant, hot leads (Segment A) don't disappear. The system:

- Flags the lead in the telecaller queue as `wa_fallback`
- Surfaces them at the top of the manual-dial list with "this lead was trying to reach you on WhatsApp"
- Auto-sends an SMS via a DLT-registered sender: *"Hi {{name}}, we got your message. Our team will call you shortly."*

Lead never feels the outage. That's seamless.

### 3.5 Compliance Architecture

- `opt_in_source` required on every lead; bulk-send endpoint rejects non-opted-in
- DLT template registration wizard built into onboarding
- Consent audit trail — immutable log of when/how each lead opted in
- One Meta Business Account per tenant (never share), so one client's violation can't cascade
- GDPR/DPDP export + delete endpoints from day one

### 3.6 Data Portability

Clients can export full lead DB, all conversations, call recordings, consent logs at any time. Their WABA is theirs — if they leave, they leave with everything. Ethics + sales weapon.

---

## 4. Repurposed Analytics Page — Service Metrics

Three dashboards on one page:

**WhatsApp metrics:**
- Messages sent / received per day
- Delivery rate, read rate, reply rate (overall + per-template + per-number)
- Avg AI reply time
- Top 10 FAQ matches (what leads ask most)
- Per-number health + daily volume distribution

**Telecalling metrics:**
- Calls made per caller per day
- Pickup rate, avg talk time
- Best time-of-day for pickup
- Per-caller score trend (feeds from existing `call_scorer.py`)
- Spam-flag rate per voice number

**Lead funnel:**
- Leads by source (WA inbound / CSV upload / manual add)
- A/B/C/D segment shift over time
- Time-to-first-contact
- Enrollment conversion %

---

## 5. CSV Upload Flow — The 7 Steps

What happens when a client uploads a CSV with 1,000 contacts:

**Step 1 — Parse & map.** Auto-detect columns (name, phone, email, course). User confirms mapping. E.164 phone validation. Duplicate check against existing leads.

**Step 2 — Opt-in declaration (mandatory gate).** User must pick where leads opted in:

| Source | Bulk-send allowed? | Template type |
|---|---|---|
| Click-to-WhatsApp ad | ✅ Yes | Marketing OK |
| Website form (with WA consent) | ✅ Yes | Marketing OK |
| Offline event (signed consent) | ✅ Yes (slow pace) | Utility preferred |
| Previous walk-in / phone enquiry | ⚠️ Utility only | No marketing |
| Imported from another tool | ⚠️ Utility only | No marketing |
| No explicit consent | ❌ Blocked | Manual call only |

Source stored per lead. Bulk-send gating uses it.

**Step 3 — Enrichment.** WhatsApp-number check via Meta API (~₹0.05/check). Flag landlines, disconnected, invalid format.

**Step 4 — Template + schedule.** User picks pre-approved template, previews with first contact's data, chooses: *send now* / *schedule for time* / *drip over N days*.

**Step 5 — Pool-aware dispatch.** System computes capacity:
> "You have 3 active numbers at Tier 1. Combined daily capacity = 3,000. Your 1,000 contacts fit comfortably. Suggested pace: ~333 per number, spread over 4 hours, 9 AM–1 PM."

Router spreads across pool; no single number dumps all 1,000. Each message uses client's branded display name. Failed sends logged with reason.

**Step 6 — Real-time progress.** Live counter: `247 / 1000 sent • 98% delivered • 43% read • 7% replied`. Replies flow into Conversations tab. Each replier auto-scored and segmented.

**Step 7 — Follow-up automation.** (Extends existing `follow_ups.py`):
- No reply in 24h → optional re-engagement template
- No reply in 3 days → auto-moved to Segment C
- No reply in 7 days → disqualified (D) or handed to telecaller queue

---

## 6. Self-Serve Numbers Page

### Numbers list view

Table showing every number in the pool:

| Display name | Number | Provider | Role | Status | Quality | Today's sends | Actions |
|---|---|---|---|---|---|---|---|
| Chennai office | +91 98xxx... | Meta Direct | Primary | Active | 🟢 Green | 847 / 1000 | ⋯ |
| Warm-up #2 | +91 87xxx... | Gupshup | Standby | Warming (day 9/14) | — | 120 / 200 | ⋯ |

### Actions

- **Add Number** wizard:
  1. Pick provider (Meta Direct / Gupshup / AiSensy / 360dialog)
  2. Provider-specific auth:
     - Meta: Embedded Signup OAuth flow
     - Gupshup / AiSensy / 360dialog: paste API key
  3. Enter display name + business profile (logo, website, description)
  4. Status = `warming`, 14-day schedule starts silently
  5. Appears in pool (not routable until warmed)

- **Delete Number** (soft delete):
  - Marks `status = archived`, stops routing
  - Does NOT delete from Meta/BSP side
  - Historical messages kept for audit
  - Confirmation: "This number has 247 active leads — they'll stop receiving messages from it. Continue?"

- **Per-number controls:**
  - Set primary / standby / archived
  - Pause outbound (keep inbound)
  - Rename (internal label)

### Safety guard

Minimum 1 active number must always exist. Block delete if it's the last one.

## 7. Incidents Page

Timeline log of every auto-action:

```
Apr 22, 2:14 PM · Primary number flagged Yellow → outbound volume halved
Apr 22, 2:15 PM · Standby "+91 87xxx" promoted to primary
Apr 22, 2:15 PM · Migration notice sent to 247 recent leads
Apr 22, 2:16 PM · Appeal filed with Meta (reference: APX-8821)
Apr 22, 2:17 PM · New standby provisioning started (ETA 14 days warm-up)
```

Client reads Monday morning, sees the platform handled a crisis they didn't know was happening. Trust-builder.

---

## 8. Telecaller Notes + Per-Lead Memory

The highest-ROI feature in the whole plan. Solves the real pain: a telecaller handling 50+ leads a day can't remember who said what, and parents feel it.

### Data model

New table:

```
lead_notes
  id
  lead_id          # FK
  caller_id        # which telecaller wrote it
  call_log_id      # optional — links to a specific call
  content          # free text
  structured       # jsonb: {course, budget, timeline, next_action, sentiment}
  is_pinned        # sticks at top forever (key facts)
  created_at
```

New fields on existing `call_logs`:
- `transcript` — from Exotel recording, transcribed via Gemini
- `ai_summary` — structured summary auto-generated post-call

### Three moments

**Moment 1: Pre-call briefing (20 seconds of context).** Telecaller clicks "Call." Before Exotel dials, a modal shows:

```
Calling Priya Sharma — +91 98xxx xxxxx

📌 Pinned facts
  • Parent: Raj Sharma
  • Course interest: B.Tech CSE
  • Budget: ₹2.5L/year
  • Deadline: before May 15

📞 Last 3 interactions
  • Apr 18 · WhatsApp — asked about fees
  • Apr 15 · Call (4 min) — wants campus visit, prefers weekend
  • Apr 12 · WhatsApp — initial enquiry

💡 Suggested next steps
  • Confirm weekend campus visit date
  • Mention hostel options (parent asked)

         [ Start Call ]  [ Cancel ]
```

Telecaller opens with "Hi Priya, I know you wanted to visit campus on the weekend — is Saturday the 26th good?" Parent thinks *"they actually remember me."* That's enrollment.

**Moment 2: During call — live notes pane.** Quick-tag buttons (Meeting scheduled / Not interested / Call back later / Discussed fees / Campus visit planned / Needs more info) plus free-text. Telecaller types highlights while talking.

**Moment 3: After call — AI-drafted summary.** Exotel webhook delivers recording → Supabase Storage (already working). Then:
1. Gemini transcribes recording
2. Gemini generates structured summary + extracts new facts
3. Telecaller reviews draft, edits if needed, saves
4. New pinned facts added to sidebar for next time

### Strategic value

- Enrollment conversion ↑ — leads feel remembered
- Telecaller churn becomes less painful — next caller has full context
- AI coaching (existing `call_coach.py`) sharpens — sees whole history, not just current call
- Manager can spot-check any lead's timeline for quality control

### Effort

| Task | Days |
|---|---|
| Schema migration + notes API | 1.0 |
| Briefing modal UI | 1.5 |
| Live notes pane in telecalling dashboard | 1.0 |
| Gemini transcription + summary integration | 1.5 |
| Pinned-facts sidebar | 0.5 |
| **Total** | **5.5** |

---

## 9. Multi-Provider Strategy

Each tenant can pick any supported provider, or mix providers across different numbers in their pool. Same resilience rules apply to all.

### Confirmed provider choices (2026-04-22)

| Channel | Provider | Status |
|---|---|---|
| WhatsApp (primary) | **Meta Cloud API Direct** | ✅ Confirmed |
| WhatsApp (secondary) | **WATI** | ✅ Confirmed |
| Voice | **Exotel** | ✅ Confirmed (already integrated — commit 27d98a3) |

### Indian BSP options (ranked by cost + fit)

| Provider | Monthly per number | Per-message markup | Best for |
|---|---|---|---|
| **Meta Cloud API (direct)** | ₹0 | No markup (~₹0.73–0.88 Meta pricing only) | Cheapest, most control |
| **WATI** | ₹2,499+ | Small markup | Managed, education-sector-friendly, Indian support |
| **Twilio** | $5 + fees | ~₹0.25+ markup | Global SDK reliability, premium price |
| **Gupshup** | ₹1,500–3,000 | Small markup | Largest Indian BSP |
| **AiSensy** | ₹999–2,999 | Small markup | SMBs, includes chatbot builder |
| **360dialog** | ~€49 (~₹4,400) | Near-zero markup | High-volume clients |

### Adapter build order

| Adapter | Effort | When |
|---|---|---|
| `MetaCloudProvider` | 2 days | **Phase 1a** — cheapest for clients, first to ship |
| `WatiProvider` | 1–1.5 days | **Phase 1a** — managed option for clients who prefer it |
| `GupshupProvider` / `AiSensyProvider` | 1 day each | **Phase 2+** — add based on real client demand |
| `360DialogProvider` | 1 day | **Phase 3** — nice-to-have for high-volume clients |

Launch with 2 adapters (Meta Direct + WATI). Add more based on actual client demand, not guesses.

### Support burden reality check

Each provider has its own template-approval flow, quality-event format, error codes. Two adapters is manageable for a solo dev. Four is not. Stay disciplined.

---

## 10. Client Experience — Three Modes

### Mode A: Onboarding (Days 0–14)

Onboarding *is* the product. A consultancy that signs up Monday and can send opted-in bulk by Friday stays. Wizard walks them through:

1. Meta Business Account + WABA registration (or BSP signup, depending on provider choice)
2. Business verification submission
3. Display name + business profile (logo, website, description)
4. Green tick application only if they qualify (no promises)
5. DLT Principal Entity registration + voice template registration
6. Truecaller for Business onboarding
7. Exotel account + DID number provisioning (matched to their market)
8. Template library seeded: welcome, follow-up, migration, appointment, results-declared — pre-approved
9. Opt-in pipeline — Click-to-WhatsApp ad setup + website widget + form embed
10. Silent warm-up starts on standby numbers

White-glove for cohort 1. Productized for cohort 2+.

### Mode B: Steady State

Numbers healthy, leads flowing, segments auto-updating, AI handling FAQs, telecaller queue priority-sorted. Weekly email: *"2,847 leads captured, 63% read rate, 12% reply rate, 8% Segment A, 4 calls scheduled. All numbers Green. You haven't needed us."*

Best client feedback is silence.

### Mode C: Crisis

Number dies. Client opens dashboard, sees:
> "Primary number flipped to restricted at 2:14 PM. Standby promoted automatically at 2:15 PM. Migration notice sent to 247 recent leads. Appeal filed. New standby provisioning in progress (ETA 14 days warm-up). No action needed from you."

Anxiety drops the moment they see it was handled. That's the business model — calm during chaos.

---

## 11. Build Order (Updated)

**Already built** (per git log): WhatsApp webhook, AI reply pipeline, lead CRUD + CSV, segments, callers, manual dial, Exotel click-to-call, AI coaching. Good foundation.

**Week 1 — Cleanup:**
- Disable Instagram webhook route
- Repurpose Analytics page (service metrics instead of ad metrics)
- Confirm AI Tune is wired to WA auto-reply prompts (keep, rename label if helpful)

**Phase 1a — Resilience Core (Weeks 2–4):**

1. `phone_numbers` table (tenant_id, provider, quality_rating, messaging_tier, status, role, daily_send_count, warm_up_stage)
2. Provider abstraction + `MetaCloudProvider` adapter
3. `WatiProvider` adapter
4. Meta quality webhook handler → DB + dashboard alerts
5. Outbound router (picks healthiest active number)
6. `leads.opt_in_source` column + bulk-send gating
7. **Numbers page** — list + Add Number wizard + per-number controls
8. CSV upload — upgrade to 7-step flow (opt-in gate, pool-aware dispatch)

**Phase 1b — Failover + Notes (Weeks 5–6):**

9. Pre-approved channel-migration template in onboarding
10. Auto-promote standby on restriction event
11. Auto-send migration notice to recent leads
12. **Incidents page** — auto-action timeline log
13. **Telecaller notes system** — `lead_notes` table + briefing modal + live notes pane + AI summary (5.5 days)

**Phase 2 (Months 2–3):**

14. Background warm-up scheduler for standby numbers
15. Auto-appeal filing via Meta Graph API
16. Cross-channel fallback: WA degradation → telecaller queue bump + SMS
17. Truecaller for Business integration (spam-score API + onboarding)
18. DLT registration wizard
19. Weekly auto-report email
20. `GupshupProvider` adapter (if client demand emerges)
21. `AiSensyProvider` adapter (if client demand emerges)

**Phase 3 (Months 4–6, after 5+ paying clients):**

22. `360DialogProvider` adapter
23. Dual-provider redundancy option for enterprise tier
24. Revisit Instagram channel
25. Revisit AI voice agent

---

## 12. What I Won't Build (Hard No's)

- **Shared number pools across tenants.** One bad client kills everyone.
- **Support for cold-list blasting.** Bulk endpoint rejects unopted leads, period.
- **Green-tick as a promise.** We help clients apply; Meta decides.
- **"Unlimited WhatsApp" pricing tier.** Creates wrong incentive to push clients through burning numbers.
- **Auto-reply to every inbound with LLM.** FAQ cache first, always.
- **Our own telephony stack.** Exotel / Gupshup solved this. We integrate.
- **Shared DB without tenant isolation.** RLS from day one.

---

## 13. Pricing — Aligned Incentives

Three axes, never one:

1. **Per active healthy number per month** (~₹999–1,999 per WA number, ~₹499 per voice number)
2. **Per lead captured** (~₹2–5 per opted-in lead from Click-to-WA ads)
3. **Per converted lead** (~5–10% of course fee per enrolled student — optional premium tier)

**Explicitly NOT charging per message.** Creates incentive to keep bad numbers live. Never ours.

**Blocked-number replacement:** free if our failure to detect; paid if client violated opt-in policy. Contract states this upfront.

---

## 14. Support SLAs

- **P0** (all channels down for tenant): 30-min response, 4-hour resolution, founder escalation
- **P1** (single number blocked or voice pool degraded): auto-failover within 5 min, no human needed
- **P2** (template rejected, DLT stuck): 24-hour turnaround
- **P3** (feature requests, UX): weekly triage

First 10 clients get founder WhatsApp number directly.

---

## 15. Risks I'm Carrying

- **Meta unilateral policy change.** Mitigation: multi-BSP + cross-channel fallback.
- **Provider pricing shift.** Mitigation: provider abstraction = config swap, not rewrite.
- **DLT/TRAI regulatory tightening.** Mitigation: compliance-first from day one.
- **Cold-start warm-up delay.** First client waits 14 days for full capacity. Mitigation: transparent timeline, interim manual-telecaller-only plan during warm-up.
- **Solo-dev bottleneck.** Mitigation: ruthless scope (boss's cut was correct), automation over features, defer Phase 3 until revenue justifies a hire.

---

## 16. The Measure

If a client opens the dashboard on a random Tuesday in month 3 — sees healthy numbers, leads flowing, no alerts — and forgets we exist, we've won. The moment they think *"did Aira do anything this week?"* is the moment they can't imagine running without us.

That's seamless. That's the whole company.
