-- Migration: 029_meta_templates_schema

CREATE TABLE IF NOT EXISTS public.meta_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    meta_template_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    language TEXT NOT NULL,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.meta_templates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Tenants can view their own templates"
    ON public.meta_templates
    FOR SELECT
    USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can insert their own templates"
    ON public.meta_templates
    FOR INSERT
    WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants can update their own templates"
    ON public.meta_templates
    FOR UPDATE
    USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can delete their own templates"
    ON public.meta_templates
    FOR DELETE
    USING (tenant_id = auth.uid());

-- Triggers
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.meta_templates
    FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
