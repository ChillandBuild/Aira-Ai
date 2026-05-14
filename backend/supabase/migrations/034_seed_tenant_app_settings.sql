-- Ensure every tenant has the settings keys exposed by the Settings page.

WITH expected_settings(key, value, is_secret) AS (
  VALUES
    ('meta_access_token', NULL, true),
    ('meta_phone_number_id', NULL, false),
    ('meta_waba_id', NULL, false),
    ('meta_webhook_verify_token', NULL, true),
    ('twilio_account_sid', NULL, false),
    ('twilio_auth_token', NULL, true),
    ('telecmi_user_id', NULL, false),
    ('telecmi_secret', NULL, true),
    ('telecmi_callerid', NULL, false),
    ('telecmi_recording_base_url', NULL, false),
    ('gemini_api_key', NULL, true),
    ('razorpay_key_id', NULL, false),
    ('razorpay_key_secret', NULL, true),
    ('razorpay_webhook_secret', NULL, true),
    ('ai_auto_reply_enabled', 'true', false),
    ('faq_match_threshold', '0.85', false),
    ('round_robin_enabled', 'true', false)
)
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT tenants.id, expected_settings.key, expected_settings.value, expected_settings.is_secret
FROM tenants
CROSS JOIN expected_settings
ON CONFLICT (tenant_id, key) DO NOTHING;
