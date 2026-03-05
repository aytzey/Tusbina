from app.core.config import settings
from app.services.tts import PiperTTSService


def test_piper_length_scale_is_accelerated_by_speed_multiplier(monkeypatch) -> None:
    monkeypatch.setattr(settings, "piper_voice_selin_length_scale", 1.15)
    monkeypatch.setattr(settings, "piper_speed_multiplier", 1.15)

    service = PiperTTSService()
    length_scale = service._resolve_length_scale("Dr. Selin")

    assert 0.95 <= length_scale <= 1.05
