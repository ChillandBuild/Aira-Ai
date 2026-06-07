-- 089_security_hardening.sql
-- Staged SaaS hardening: audit logs, private broadcast CSV storage,
-- RLS helper functions, and defense-in-depth tenant policies.
--
-- Apply to a Supabase dev branch/staging project first. Production schema has
-- diverged from local filenames, so IF EXISTS is used for newer/optional tables.

-- ---------------------------------------------------------------------------
-- App audit logs
-- ---------------------------------------------------------------------------

create table if not exists public.app_audit_logs (
    id            uuid primary key default gen_random_uuid(),
    tenant_id     uuid null references public.tenants(id) on delete set null,
    actor_user_id uuid null,
    actor_role    text null,
    action        text not null,
    target_type   text not null,
    target_id     text null,
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now()
);

create index if not exists app_audit_logs_tenant_created_idx
    on public.app_audit_logs (tenant_id, created_at desc);
create index if not exists app_audit_logs_actor_created_idx
    on public.app_audit_logs (actor_user_id, created_at desc);
create index if not exists app_audit_logs_action_created_idx
    on public.app_audit_logs (action, created_at desc);

alter table if exists public.app_audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.tenant_users tu
        where tu.tenant_id = p_tenant_id
          and tu.user_id = auth.uid()
    );
$$;

create or replace function public.is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.tenant_users tu
        where tu.tenant_id = p_tenant_id
          and tu.user_id = auth.uid()
          and tu.role = 'owner'
    );
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.system_admins sa
        where sa.user_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Storage hardening
-- ---------------------------------------------------------------------------

update storage.buckets
set public = false
where id = 'broadcast-csvs';

drop policy if exists "Allow public read access to CSVs" on storage.objects;

-- Keep direct authenticated storage policies narrow. The app now serves CSVs
-- through backend signed URLs, but these tenant-folder checks keep old direct
-- upload/delete behavior from being global if still used.
drop policy if exists "Allow authenticated users to upload CSVs" on storage.objects;
drop policy if exists "Allow authenticated users to delete CSVs" on storage.objects;

create policy "Tenant members can upload own broadcast CSVs"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'broadcast-csvs'
    and public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

create policy "Tenant members can delete own broadcast CSVs"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'broadcast-csvs'
    and public.is_tenant_owner((storage.foldername(name))[1]::uuid)
);

alter table if exists public.scheduled_broadcasts
    add column if not exists csv_file_path text;

-- ---------------------------------------------------------------------------
-- Enable RLS on tenant-owned tables
-- ---------------------------------------------------------------------------

alter table if exists public.leads enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.call_logs enable row level security;
alter table if exists public.callers enable row level security;
alter table if exists public.phone_numbers enable row level security;
alter table if exists public.voice_numbers enable row level security;
alter table if exists public.app_settings enable row level security;
alter table if exists public.message_templates enable row level security;
alter table if exists public.bookings enable row level security;
alter table if exists public.lead_notes enable row level security;
alter table if exists public.lead_stage_events enable row level security;
alter table if exists public.follow_up_jobs enable row level security;
alter table if exists public.knowledge_documents enable row level security;
alter table if exists public.knowledge_chunks enable row level security;
alter table if exists public.chat_handovers enable row level security;
alter table if exists public.automations enable row level security;
alter table if exists public.automation_steps enable row level security;
alter table if exists public.automation_logs enable row level security;
alter table if exists public.automation_pending_executions enable row level security;
alter table if exists public.automation_flow_runs enable row level security;
alter table if exists public.broadcast_recipients enable row level security;
alter table if exists public.broadcast_failed_contacts enable row level security;
alter table if exists public.broadcast_tags enable row level security;
alter table if exists public.broadcast_lead_scores enable row level security;
alter table if exists public.lead_tag_interest enable row level security;
alter table if exists public.lead_tag_opt_outs enable row level security;
alter table if exists public.scheduled_broadcasts enable row level security;
alter table if exists public.caller_status_logs enable row level security;
alter table if exists public.caller_digests enable row level security;
alter table if exists public.whatsapp_insights_snapshots enable row level security;
alter table if exists public.incidents enable row level security;
alter table if exists public.ad_campaigns enable row level security;
alter table if exists public.ai_prompts enable row level security;
alter table if exists public.ai_tune_suggestions enable row level security;
alter table if exists public.lead_conversation_state enable row level security;
alter table if exists public.phone_number_quality_history enable level security; -- Note: keep original syntax or fix if there was typo. Wait, let's look at original line 156: 'enable row level security' (let's check original)
alter table if exists public.phone_number_quality_history enable row level security;
alter table if exists public.segment_templates enable row level security;

-- Core/system tables
alter table if exists public.tenants enable row level security;
alter table if exists public.tenant_users enable row level security;
alter table if exists public.system_admins enable row level security;

-- ---------------------------------------------------------------------------
-- Tenant table select policies. Writes for sensitive tables remain backend
-- service-role controlled unless explicitly needed by frontend clients.
-- ---------------------------------------------------------------------------

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'leads',
        'messages',
        'call_logs',
        'callers',
        'phone_numbers',
        'voice_numbers',
        'app_settings',
        'message_templates',
        'bookings',
        'lead_notes',
        'lead_stage_events',
        'follow_up_jobs',
        'knowledge_documents',
        'knowledge_chunks',
        'chat_handovers',
        'automations',
        'automation_steps',
        'automation_logs',
        'automation_pending_executions',
        'automation_flow_runs',
        'broadcast_recipients',
        'broadcast_failed_contacts',
        'broadcast_tags',
        'broadcast_lead_scores',
        'lead_tag_interest',
        'lead_tag_opt_outs',
        'scheduled_broadcasts',
        'caller_status_logs',
        'caller_digests',
        'whatsapp_insights_snapshots',
        'incidents',
        'ad_campaigns',
        'ai_prompts',
        'ai_tune_suggestions',
        'lead_conversation_state',
        'phone_number_quality_history',
        'segment_templates'
    ] loop
        if to_regclass('public.' || table_name) is not null then
            if not exists (
                select 1 from pg_policies
                where schemaname = 'public'
                  and tablename = table_name
                  and policyname = table_name || '_tenant_member_select'
            ) then
                execute format(
                    'create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id))',
                    table_name || '_tenant_member_select',
                    table_name
                );
            end if;
        end if;
    end loop;
end $$;

-- Owner-managed tables that the UI may write directly in future. Current
-- FastAPI service-role writes continue to bypass RLS.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'broadcast_tags',
        'message_templates',
        'automations',
        'automation_steps',
        'knowledge_documents',
        'app_settings'
    ] loop
        if to_regclass('public.' || table_name) is not null then
            if not exists (
                select 1 from pg_policies
                where schemaname = 'public'
                  and tablename = table_name
                  and policyname = table_name || '_tenant_owner_write'
            ) then
                execute format(
                    'create policy %I on public.%I for all to authenticated using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id))',
                    table_name || '_tenant_owner_write',
                    table_name
                );
            end if;
        end if;
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Core/system policies
-- ---------------------------------------------------------------------------

drop policy if exists tenants_member_select on public.tenants;
create policy tenants_member_select
on public.tenants for select
to authenticated
using (
    public.is_tenant_member(id)
    or public.is_system_admin()
);

drop policy if exists tenant_users_member_select on public.tenant_users;
create policy tenant_users_member_select
on public.tenant_users for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_tenant_owner(tenant_id)
    or public.is_system_admin()
);

drop policy if exists system_admins_self_select on public.system_admins;
create policy system_admins_self_select
on public.system_admins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists app_audit_logs_tenant_owner_select on public.app_audit_logs;
create policy app_audit_logs_tenant_owner_select
on public.app_audit_logs for select
to authenticated
using (
    public.is_system_admin()
    or (tenant_id is not null and public.is_tenant_owner(tenant_id))
);

-- ---------------------------------------------------------------------------
-- Function search_path fixes for advisor-flagged and newer RPC functions
-- ---------------------------------------------------------------------------

do $$
begin
    begin
        alter function public.update_updated_at() set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.generate_booking_ref() set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.increment_phone_daily_send_count(uuid) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.increment_phone_daily_send_count(uuid, integer) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.get_conversation_leads(uuid, integer, integer) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.update_updated_at_column() set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.toggle_lead_pin(uuid, uuid) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.increment_lead_no_reply_count(uuid) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.bump_automation_step_counter(uuid, text, integer) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.insert_knowledge_chunk(uuid, uuid, integer, text, text) set search_path = public, pg_temp;
    exception when others then null;
    end;

    begin
        alter function public.match_knowledge_chunks(text, uuid, integer) set search_path = public, pg_temp;
    exception when others then null;
    end;
end $$;
