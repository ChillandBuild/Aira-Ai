# Supabase Schema Reconciliation

Date: 2026-06-06

Project checked through the Supabase connector:

- Project id/ref: `ayftynkgmfkaqmmnlmoc`
- Name: `Aira AI`
- Region: `ap-south-1`
- Status: `ACTIVE_HEALTHY`
- Postgres: `17.6.1.121`

## Live Migration Snapshot

Live migrations returned by Supabase include the original batched migrations through `051_to_056_batch`, then later individual migrations including:

- `057_scheduled_broadcasts`
- `058_incidents_token_health`
- `message_delivery_error`
- `061_number_health_engagement`
- `065_caller_digests`
- `066_whatsapp_insights_snapshots`
- `070_score_engine_v2`
- `068_toggle_lead_pin_rpc`
- `064_leads_pinned_at`
- `071_lead_stage_events_score_updated`
- `065_leads_collected_data`
- `bot_flow_builder`
- `bot_flow_step_counter_rpc`
- `bot_flow_runs`
- `bot_flow_phase2_steps`
- `076_broadcast_lead_scores`
- `077_broadcast_negative_reply`
- `078_broadcast_reply_sentiment`
- `079_fix_conversation_leads_outbound`
- `080_conversation_leads_filter_failed_broadcasts`
- `086_broadcast_lead_scores_finalized`
- `knowledge_rag`

## Local Migration Snapshot

Local migration files currently run through:

- `087_knowledge_rag.sql`

There are several local filenames that do not appear in the live migration list with the same name, including:

- `072_ad_campaigns_whatsapp_platform.sql`
- `072_broadcast_tags.sql`
- `073_bot_flow_builder.sql`
- `074_bot_flow_runs.sql`
- `075_bot_flow_phase2_steps.sql`
- `076_botbiz_blocks.sql`
- `081_drop_wati_provider.sql`
- `082_booking_generic.sql`
- `083_drop_hot_lead_alerts.sql`
- `084_drop_twilio_message_sid.sql`
- `085_opt_out_per_broadcast_and_tag.sql`
- `086_lead_tag_opt_outs_lead_fk.sql`

Some of these may have been applied under different live migration names or not deployed yet. The security migration uses `ALTER TABLE IF EXISTS` for newer optional tables to avoid failing if a local-only table is absent in production.

## Extension Snapshot

The live project has `vector` installed in the `public` schema. Supabase advisors previously flagged public-schema extensions as a warning. Moving the extension is not included in this compatibility slice because `knowledge_chunks.embedding vector(512)` depends on it and needs a separate migration/test cycle.

## Local RLS Snapshot

Local migration scan found table RLS policies only for storage in `036_broadcast_csvs_bucket.sql`; no app table RLS migrations are present before `089_security_hardening.sql`.

## Rollout Rule

Do not apply `089_security_hardening.sql` directly to production until it has been applied to a Supabase dev branch or staging project and the smoke test checklist in the implementation plan passes.
