import subprocess

import pytest

from app.core.config import settings
from app.services.tts import PiperTTSService


def test_piper_length_scale_is_accelerated_by_speed_multiplier(monkeypatch) -> None:
    monkeypatch.setattr(settings, "piper_voice_selin_length_scale", 1.15)
    monkeypatch.setattr(settings, "piper_speed_multiplier", 1.15)

    service = PiperTTSService()
    length_scale = service._resolve_length_scale("Dr. Selin")

    assert 0.95 <= length_scale <= 1.05


def test_piper_synthesize_raises_on_timeout(monkeypatch) -> None:
    monkeypatch.setattr(settings, "piper_synthesize_timeout_sec", 3)
    service = PiperTTSService()
    monkeypatch.setattr(service, "ensure_ready", lambda: "/usr/bin/piper")

    def _timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=kwargs.get("timeout", 0))

    monkeypatch.setattr("app.services.tts.subprocess.run", _timeout)

    with pytest.raises(RuntimeError, match="timeout"):
        service.synthesize("TUSBINA timeout testi")


def test_voice_profiles_differ_for_mobile_voice_options() -> None:
    base = PiperTTSService._resolve_voice_profile_static("Elif")
    ahmet = PiperTTSService._resolve_voice_profile_static("Ahmet")
    zeynep = PiperTTSService._resolve_voice_profile_static("Zeynep")

    assert ahmet.sentence_silence >= base.sentence_silence
    assert zeynep.sentence_silence <= base.sentence_silence
    assert zeynep.length_scale <= base.length_scale
