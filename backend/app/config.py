from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_number: str = "whatsapp:+14155238886"
    telecmi_user_id: str | None = None
    telecmi_secret: str | None = None
    telecmi_callerid: str | None = None
    telecmi_recording_base_url: str | None = None
    exotel_sid: str | None = None
    exotel_api_key: str | None = None
    exotel_api_token: str | None = None
    exotel_virtual_number: str | None = None
    exotel_subdomain: str = "api.exotel.com"
    public_base_url: str | None = None
    meta_page_token: str | None = None
    meta_verify_token: str | None = None
    meta_ig_user_id: str | None = None
    meta_access_token: str | None = None
    meta_phone_number_id: str | None = None
    redis_url: str = "redis://localhost:6379/0"

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
