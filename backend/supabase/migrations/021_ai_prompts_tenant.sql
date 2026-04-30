-- Add tenant_id to ai_prompts
ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE ai_prompts SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE ai_prompts ALTER COLUMN tenant_id SET NOT NULL;

-- Drop old unique constraint on name alone, add composite unique on (tenant_id, name)
ALTER TABLE ai_prompts DROP CONSTRAINT IF EXISTS ai_prompts_name_key;
ALTER TABLE ai_prompts ADD CONSTRAINT ai_prompts_tenant_name_key UNIQUE (tenant_id, name);

CREATE INDEX IF NOT EXISTS ai_prompts_tenant_id_idx ON ai_prompts (tenant_id);

-- Add tenant_id to ai_tune_suggestions
ALTER TABLE ai_tune_suggestions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE ai_tune_suggestions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS ai_tune_suggestions_tenant_id_idx ON ai_tune_suggestions (tenant_id);
