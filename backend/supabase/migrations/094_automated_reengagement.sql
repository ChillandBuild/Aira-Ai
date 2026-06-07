-- Migration 094: Automated Re-engagement Schema
-- Purpose: Store configurations and logs for broadcast-specific and inbound re-engagement checkpoints.

CREATE TABLE IF NOT EXISTS public.reengagement_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('broadcast', 'inbound')),
  broadcast_id uuid,
  delay_hours integer NOT NULL,
  target_segments jsonb NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('freeform', 'template')),
  message_content text,
  template_name text,
  template_variables jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reengagement_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.reengagement_steps(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped_window'))
);

CREATE INDEX IF NOT EXISTS idx_re_steps_tenant ON public.reengagement_steps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_steps_broadcast ON public.reengagement_steps(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_re_logs_lead ON public.reengagement_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_re_logs_step ON public.reengagement_logs(step_id);
