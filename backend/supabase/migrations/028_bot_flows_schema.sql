-- Migration: 028_bot_flows_schema

CREATE TABLE IF NOT EXISTS public.bot_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
    match_type TEXT DEFAULT 'exact',
    is_active BOOLEAN DEFAULT true,
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    edges JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.bot_flows ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Tenants can view their own bot flows"
    ON public.bot_flows
    FOR SELECT
    USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can insert their own bot flows"
    ON public.bot_flows
    FOR INSERT
    WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants can update their own bot flows"
    ON public.bot_flows
    FOR UPDATE
    USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can delete their own bot flows"
    ON public.bot_flows
    FOR DELETE
    USING (tenant_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.bot_flows
    FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- Update leads table to track flow state
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS current_flow_id UUID REFERENCES public.bot_flows(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS current_node_id TEXT;
