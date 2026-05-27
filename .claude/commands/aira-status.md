---
name: aira-status
description: Session-end checklist — save memories, audit stale files, show backlog and session starter
---

When this skill is invoked, do the following in order:

## Step 1 — Save session memories
Review this conversation and save anything worth remembering:
- New decisions, architectural choices, fixes
- Corrections to previously wrong memory
- Patterns or rules learned
Write to ~/.claude/projects/-Users-prem-Documents-Aira-Ai/memory/ using the Write tool.

## Step 2 — Audit all memory files
Check every file in ~/.claude/projects/-Users-prem-Documents-Aira-Ai/memory/:
- Delete anything no longer true
- Update stale facts
- Merge duplicates
- Update MEMORY.md index to match

## Step 3 — Print remaining backlog
```
AIRA AI — REMAINING BACKLOG
════════════════════════════
TECH DEBT (only real items left)
  [ ] RLS on 18 tables — app-layer tenant filter is only guard, DB-level RLS not enabled
  [ ] Booking dynamic pricing — amount hardcoded at ₹500, needs booking_type + per-type pricing
```
