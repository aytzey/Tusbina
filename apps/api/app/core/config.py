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
    upload_allowed_extensions: str = "pdf,png,jpg,jpeg,webp,txt,docx,pptx,doc,ppt"
    upload_max_files: int = 8
    upload_max_file_size_mb: int = 100
    upload_validate_pdf_signature: bool = True
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket: str = ""
    r2_endpoint: str = ""
    r2_public_base_url: str = ""

    # Generation pipeline
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-3-flash-preview"
    openrouter_timeout_sec: int = 45
    script_openrouter_retries: int = 2
    script_openrouter_retry_backoff_sec: float = 1.2
    script_source_max_chars: int = 12000
    script_pdf_max_pages: int = 1200
    script_pdf_max_chars_per_asset: int = 1_800_000
    script_pdf_extraction_log_every_pages: int = 25
    script_target_max_chars: int = 4600
    script_target_max_chars_narrative: int = 4600
    script_target_max_chars_summary: int = 3000
    script_target_max_chars_qa: int = 3600
    script_dialogue_target_turns: int = 12
    script_auto_chars_per_part: int = 3200
    script_auto_chars_per_part_narrative: int = 3200
    script_auto_chars_per_part_summary: int = 2200
    script_auto_chars_per_part_qa: int = 2600
    generation_target_max_parts: int = 120
    generation_max_parts: int = 500
    generation_priority_window: int = 3
    tts_provider: str = "hybrid"  # hybrid | piper | edge | dummy
    tts_fallback_to_dummy: bool = False
    tts_max_chars_per_part: int = 5200
    tts_max_chars_per_part_narrative: int = 5200
    tts_max_chars_per_part_summary: int = 3400
    tts_max_chars_per_part_qa: int = 4200
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
    piper_speed_multiplier: float = 1.15
    piper_voice_arda_length_scale: float = 1.08
    piper_voice_selin_length_scale: float = 1.16
    piper_voice_pitch_semitones_elif: float = 0.0
    piper_voice_pitch_semitones_ahmet: float = 0.0
    piper_voice_pitch_semitones_zeynep: float = 0.0
    piper_enable_postprocess_pitch_shift: bool = False
    piper_synthesize_timeout_sec: int = 180
    piper_synthesize_retries: int = 2
    piper_synthesize_retry_backoff_sec: float = 0.6
    piper_dialogue_parallel_workers: int = 2
    piper_dialogue_gap_ms: int = 45
    piper_dialogue_edge_fade_ms: int = 18
    piper_prewarm_voices: str = "Elif,Ahmet,Zeynep"
    piper_model_path_elif: str = ""
    piper_model_config_path_elif: str = ""
    piper_model_url_elif: str = (
        "https://huggingface.co/Derur/piper-tts-models/resolve/main/tr/dfki/tr_TR-dfki-medium.onnx"
    )
    piper_model_config_url_elif: str = (
        "https://huggingface.co/Derur/piper-tts-models/resolve/main/tr/dfki/tr_TR-dfki-medium.onnx.json"
    )
    piper_speaker_id_elif: int = -1
    piper_model_path_ahmet: str = ""
    piper_model_config_path_ahmet: str = ""
    piper_model_url_ahmet: str = (
        "https://huggingface.co/Derur/piper-tts-models/resolve/main/tr/fahrettin/tr_TR-fahrettin-medium.onnx"
    )
    piper_model_config_url_ahmet: str = (
        "https://huggingface.co/Derur/piper-tts-models/resolve/main/tr/fahrettin/tr_TR-fahrettin-medium.onnx.json"
    )
    piper_speaker_id_ahmet: int = -1
    piper_model_path_zeynep: str = ""
    piper_model_config_path_zeynep: str = ""
    piper_model_url_zeynep: str = (
        "https://huggingface.co/Derur/piper-tts-models/resolve/main/tr/fettah/tr_TR-fettah-medium.onnx"
    )
    piper_model_config_url_zeynep: str = (
        "https://huggingface.co/Derur/piper-tts-models/resolve/main/tr/fettah/tr_TR-fettah-medium.onnx.json"
    )
    piper_speaker_id_zeynep: int = -1
    edge_voice_tr_emel: str = "tr-TR-EmelNeural"
    edge_voice_tr_ahmet: str = "tr-TR-AhmetNeural"
    edge_rate: str = "+0%"
    edge_pitch: str = "+0Hz"
    edge_volume: str = "+0%"
    edge_synthesize_timeout_sec: int = 60
    worker_poll_interval_sec: int = 5
    worker_reap_interval_sec: int = 30
    worker_stale_job_max_age_minutes: int = 30

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
