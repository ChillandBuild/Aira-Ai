-- Scheduler run history for the operator Scheduler Health view.
--
-- SYSTEM-LEVEL, not per-tenant: the APScheduler jobs run once for the whole
-- platform (they iterate tenants internally), so health is global. No tenant_id.
-- Tenant-facing outcomes (did MY broadcast/callback fire) already live in the
-- client's own pages. This table is operator-only.

create table if not exists scheduler_runs (
    id           uuid primary key default gen_random_uuid(),
    job_id       text not null,
    status       text not null check (status in ('success', 'error', 'missed')),
    scheduled_at timestamptz,
    ran_at       timestamptz not null default now(),
    lateness_ms  integer,          -- ran_at - scheduled_at (the "missed by" lag)
    error        text,
    detail       jsonb,            -- optional per-run detail (e.g. per-tenant counts)
    created_at   timestamptz not null default now()
);

create index if not exists idx_scheduler_runs_job_ran on scheduler_runs (job_id, ran_at desc);
create index if not exists idx_scheduler_runs_status_ran on scheduler_runs (status, ran_at desc);

-- RLS on with NO policies → only the service-role backend can read/write.
-- Tenant clients can never see it; the operator endpoint is gated by get_system_admin.
alter table scheduler_runs enable row level security;
