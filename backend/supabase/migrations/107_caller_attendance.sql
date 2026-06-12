-- 107_caller_attendance.sql
-- Admin-marked attendance overrides. Resolution (in app code) falls back to
-- caller_status_logs activity when no override exists for a date.

create table if not exists public.caller_attendance_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  caller_id uuid not null references public.callers(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present', 'absent')),
  marked_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (caller_id, date)
);

create index if not exists idx_caller_attendance_tenant on public.caller_attendance_overrides (tenant_id);
create index if not exists idx_caller_attendance_caller_date on public.caller_attendance_overrides (caller_id, date);

alter table public.caller_attendance_overrides enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'caller_attendance_overrides'
          and policyname = 'caller_attendance_overrides_tenant_member_select'
    ) then
        execute format(
            'create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id))',
            'caller_attendance_overrides_tenant_member_select',
            'caller_attendance_overrides'
        );
    end if;
end $$;
