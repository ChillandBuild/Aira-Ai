-- hot_lead_alerts table is no longer used.
-- Hot lead escalation now goes through chat_handovers, gated by inbox_cfg (segments + channels).
DROP TABLE IF EXISTS hot_lead_alerts CASCADE;
