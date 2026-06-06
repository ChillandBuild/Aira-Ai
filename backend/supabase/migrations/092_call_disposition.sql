-- 092_call_disposition.sql
-- Telecaller post-call disposition (connection state), separate from the business
-- `outcome` axis (converted/not_interested/callback/no_answer). Additive — does not
-- touch the existing outcome CHECK or call scoring.
alter table call_logs
    add column if not exists disposition text
    check (disposition in ('answered', 'no_answer', 'busy', 'switched_off', 'followup_required'));
