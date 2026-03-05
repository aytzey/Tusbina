from app.core.config import settings

# Tests run without Piper binary — always allow dummy TTS fallback
settings.tts_fallback_to_dummy = True
