---
name: aira-status
description: Show Aira AI current backlog, recent decisions, and a copy-paste session starter prompt
---

When this skill is invoked, output the following in this exact order:

## 1. Remaining Backlog

Read the current state from memory and CLAUDE.md, then print:

```
AIRA AI — REMAINING BACKLOG
════════════════════════════
TECH DEBT (only real items left)
  [ ] RLS on 18 tables — app-layer tenant filter is only guard, DB-level RLS not enabled
  [ ] Booking dynamic pricing — amount hardcoded at ₹500, needs booking_type + per-type pricing
```

## 2. Copy-Paste Session Starter

Print this block exactly (user will copy-paste it as their first message in a new session):

```
Continue building Aira AI.

Stack: FastAPI (backend/app/) + Next.js 14 (frontend/app/dashboard/) + Supabase + Groq.
AI model: llama-3.3-70b-versatile (Groq only — never Gemini/OpenAI).
All routes: /api/v1/. Tenant isolation via get_tenant_and_role().

Today I want to work on: [FILL IN]
```

## 3. Quick Memory Audit Reminder

Check mtimes of files in ~/.claude/projects/-Users-prem-Documents-Aira-Ai/memory/ and list each file with its age. Flag any older than 7 days with ⚠️.
End with: "If anything above is wrong → tell me and I'll update the memory files."
