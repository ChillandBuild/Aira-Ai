-- Align route-level multi-tenancy with database constraints.

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source in ('whatsapp', 'instagram', 'upload', 'manual'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_phone_key;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_tenant_phone_key;
ALTER TABLE leads ADD CONSTRAINT leads_tenant_phone_key UNIQUE (tenant_id, phone);

ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_name_key;
ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_tenant_name_key;
ALTER TABLE message_templates ADD CONSTRAINT message_templates_tenant_name_key UNIQUE (tenant_id, name);

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE app_settings ADD PRIMARY KEY (tenant_id, key);
