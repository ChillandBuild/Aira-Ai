CREATE TABLE IF NOT EXISTS tenants (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    plan        text NOT NULL DEFAULT 'trial',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    role        text NOT NULL DEFAULT 'caller' CHECK (role IN ('owner', 'caller')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_users_user_id_idx ON tenant_users (user_id);
CREATE INDEX IF NOT EXISTS tenant_users_tenant_id_idx ON tenant_users (tenant_id);
