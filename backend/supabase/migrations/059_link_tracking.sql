-- 059_link_tracking.sql
-- Click tracking for outbound WhatsApp links.
-- link_shortener stores the short code + destination; link_clicks logs each redirect.

CREATE TABLE IF NOT EXISTS link_shortener (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    short_code TEXT NOT NULL UNIQUE,
    long_url TEXT NOT NULL,
    campaign TEXT,
    template_name TEXT,
    broadcast_id UUID,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    total_clicks INT NOT NULL DEFAULT 0,
    unique_leads INT NOT NULL DEFAULT 0,
    last_click_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_shortener_short_code_idx ON link_shortener(short_code);
CREATE INDEX IF NOT EXISTS link_shortener_tenant_idx ON link_shortener(tenant_id);
CREATE INDEX IF NOT EXISTS link_shortener_broadcast_idx ON link_shortener(broadcast_id);
CREATE INDEX IF NOT EXISTS link_shortener_lead_idx ON link_shortener(lead_id);

CREATE TABLE IF NOT EXISTS link_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES link_shortener(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash TEXT,
    user_agent TEXT,
    referer TEXT
);
CREATE INDEX IF NOT EXISTS link_clicks_link_idx ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS link_clicks_tenant_idx ON link_clicks(tenant_id);
CREATE INDEX IF NOT EXISTS link_clicks_lead_idx ON link_clicks(lead_id);
CREATE INDEX IF NOT EXISTS link_clicks_clicked_at_idx ON link_clicks(clicked_at DESC);
