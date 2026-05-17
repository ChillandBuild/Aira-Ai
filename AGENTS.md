# Aira AI — Agent Registry (Ruflo V3)

Multi-agent orchestration via Ruflo V3. 98 base agents + 4 Aira-specific agents.

## Quick Start

```bash
# Start background workers (memory, optimization, learning)
npx ruflo daemon start

# Initialize memory database
npx ruflo memory init

# Check status
npx ruflo status
```

## Aira-Specific Agents (`.claude/agents/aira/`)

| Agent | Invoke When |
|---|---|
| `webhook-debugger` | WA messages not delivering, booking flow stuck, Meta 4xx errors |
| `tenant-auditor` | After writing any new FastAPI route — checks for data leak gaps |
| `migration-writer` | Need a new Supabase migration (auto-picks up from 035) |
| `lead-scorer-tuner` | Scoring feels off, too many false hot leads, low conversion |

## Ruflo Built-in Agents (`.claude/agents/`)

| Category | Key Agents |
|---|---|
| `core/` | coder, planner, researcher, reviewer, tester |
| `development/` | dev-backend-api, backend |
| `payments/` | agentic-payments |
| `swarm/` | hierarchical-coordinator, mesh-coordinator |
| `sparc/` | spec, pseudocode, architect, refine, code |

## Parallel Feature Pattern (3-layer)

For any feature touching schema + API + UI, launch all three in one message:

```
Agent 1 (migration-writer):  Migration 036 — <describe schema change>
Agent 2 (dev-backend-api):   FastAPI route at backend/app/routes/<file>.py
Agent 3 (coder):             Next.js page at frontend/app/dashboard/<page>/page.tsx
```

## Hooks (auto-run on every edit)

| Hook | Fires On | Checks |
|---|---|---|
| pre-edit | Write/Edit | Ruflo safety + file size |
| post-edit | Write/Edit | TypeScript check (tsx), Python syntax (py), tenant_id audit (routes) |
| post-bash | Bash | Ruflo command logging |
| route | Every prompt | Auto-selects best agent for the task |
| session-start | Session open | Loads memory + context |

## Commands (`.claude/commands/`)

```
/claude-flow-swarm   — launch a coordinated agent swarm
/claude-flow-memory  — query/store persistent memory
/claude-flow-help    — full command reference
```

## Model Routing

| Task | Model |
|---|---|
| Minor edits, single-file fixes | Haiku |
| Feature work, routes, migrations | Sonnet (default) |
| Architecture, RLS design, security audit | Opus |

## Runtime Files

```
.claude-flow/config.yaml   — Aira stack config + swarm settings
.claude-flow/data/         — persistent memory (HNSW vector DB)
.claude-flow/logs/         — agent execution logs
.claude-flow/sessions/     — session continuity
.mcp.json                  — MCP server config for ruflo tools
```
