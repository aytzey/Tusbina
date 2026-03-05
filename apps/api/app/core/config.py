from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_cors_origins: str = "http://localhost:19006,http://localhost:8081"

    database_url: str = "sqlite:///./data/tusbina.db"
    db_schema_mode: str = "create_all"  # create_all | alembic
    redis_url: str = "redis://localhost:6379/0"
    demo_monthly_quota_sec: int = 3600
    premium_monthly_quota_sec: int = 10 * 60 * 60

    # Supabase auth
    enable_auth: bool = False
    default_user_id: str = "demo-user"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"

    # Cloudflare R2 storage
    storage_backend: str = "local"  # local | r2
    local_upload_dir: str = "data/uploads"
    public_upload_base_url: str = "http://localhost:8000/static/uploads"
    upload_allowed_extensions: str = "pdf"
    upload_max_files: int = 5
    upload_max_file_size_mb: int = 25
    upload_validate_pdf_signature: bool = True
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket: str = ""
    r2_endpoint: str = ""
    r2_public_base_url: str = ""

    # Generation pipeline
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.0-flash-001"
    openrouter_timeout_sec: int = 45
    script_source_max_chars: int = 12000
    script_target_max_chars: int = 1200
    generation_max_parts: int = 50
    tts_provider: str = "piper"
    tts_fallback_to_dummy: bool = True
    tts_max_chars_per_part: int = 1000
    tts_models_dir: str = "data/models"

    # Piper TTS
    piper_binary_path: str = "piper"
    piper_use_cuda: bool = False
    piper_model_path: str = ""
    piper_model_config_path: str = ""
    piper_model_url: str = (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx"
    )
    piper_model_config_url: str = (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx.json"
    )
    piper_length_scale: float = 1.12
    piper_noise_scale: float = 0.60
    piper_noise_w_scale: float = 0.75
    piper_sentence_silence: float = 0.18
    piper_volume: float = 1.0
    piper_no_normalize: bool = False
    piper_voice_arda_length_scale: float = 1.08
    piper_voice_selin_length_scale: float = 1.16
    worker_poll_interval_sec: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _auto_enable_auth(self) -> "Settings":
        """Enable auth automatically when SUPABASE_URL is configured,
        unless ENABLE_AUTH was explicitly set to false in the environment."""
        # pydantic-settings populates enable_auth from env var ENABLE_AUTH.
        # If SUPABASE_URL is set but ENABLE_AUTH was not explicitly provided,
        # the field still has the class default (False).  We flip it to True
        # only when supabase_url is present and enable_auth is still the default.
        import os

        explicit_enable_auth = os.environ.get("ENABLE_AUTH", "").strip().lower()
        if self.supabase_url and not explicit_enable_auth:
            self.enable_auth = True
        return self


settings = Settings()
