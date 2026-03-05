import subprocess
from pathlib import Path

import pytest

from app.core.config import settings
from app.services import tts as tts_module
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


def test_piper_adds_speaker_flag_when_voice_override_has_speaker_id(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "piper_model_path_ahmet", str(tmp_path / "ahmet.onnx"))
    monkeypatch.setattr(settings, "piper_model_config_path_ahmet", str(tmp_path / "ahmet.onnx.json"))
    monkeypatch.setattr(settings, "piper_speaker_id_ahmet", 2)
    monkeypatch.setattr(settings, "piper_model_url_ahmet", "")
    monkeypatch.setattr(settings, "piper_model_config_url_ahmet", "")

    service = PiperTTSService()
    monkeypatch.setattr(service, "ensure_ready", lambda: "/usr/bin/piper")
    monkeypatch.setattr(service, "_ensure_model_files_for_spec", lambda _spec: None)

    captured_cmd: list[str] = []

    def _fake_run(cmd, *, safe_text, timeout_sec):  # noqa: ANN001
        nonlocal captured_cmd
        captured_cmd = list(cmd)
        output_path = Path(cmd[cmd.index("--output_file") + 1])
        output_path.write_bytes(tts_module._build_sine_wav(duration_sec=1))
        return subprocess.CompletedProcess(cmd, 0, b"", b"")

    monkeypatch.setattr(service, "_run_piper_command", _fake_run)
    service.synthesize("Test metni", voice="Ahmet")

    assert "--speaker" in captured_cmd
    speaker_index = captured_cmd.index("--speaker")
    assert captured_cmd[speaker_index + 1] == "2"


def test_voice_signature_pitch_shift_changes_waveform() -> None:
    base = tts_module._build_sine_wav(duration_sec=1, frequency=440)
    elif_shifted = tts_module._apply_voice_signature(base, voice="Elif", semitones=2.0)
    ahmet_shifted = tts_module._apply_voice_signature(base, voice="Ahmet", semitones=-3.0)

    assert elif_shifted != base
    assert ahmet_shifted != base
    assert elif_shifted != ahmet_shifted


def test_voice_specific_model_urls_are_resolved_by_voice() -> None:
    service = PiperTTSService()
    ahmet_spec = service._resolve_model_spec("Ahmet")
    zeynep_spec = service._resolve_model_spec("Zeynep")
    elif_spec = service._resolve_model_spec("Elif")

    assert "fahrettin" in ahmet_spec.model_url
    assert "fettah" in zeynep_spec.model_url
    assert "dfki" in elif_spec.model_url


def test_edge_voice_mapping_prefers_turkish_neural_voices() -> None:
    assert tts_module._resolve_edge_voice_short_name("Emel Neural") == settings.edge_voice_tr_emel
    assert tts_module._resolve_edge_voice_short_name("Ahmet Neural") == settings.edge_voice_tr_ahmet
    assert tts_module._resolve_edge_voice_short_name("Diyalog Neural") == settings.edge_voice_tr_emel


def test_hybrid_tts_routes_neural_voice_to_edge_backend() -> None:
    calls: list[str] = []

    class _FakePiper:
        def synthesize(self, text: str, *, voice: str | None = None):  # noqa: ANN001
            calls.append(f"piper:{voice}")
            return tts_module.TTSResult(content=b"piper", extension="wav", content_type="audio/wav")

    class _FakeEdge:
        def synthesize(self, text: str, *, voice: str | None = None):  # noqa: ANN001
            calls.append(f"edge:{voice}")
            return tts_module.TTSResult(content=b"edge", extension="mp3", content_type="audio/mpeg")

    service = tts_module.HybridTTSService(piper=_FakePiper(), edge=_FakeEdge())
    neural = service.synthesize("Merhaba", voice="Emel Neural")
    classic = service.synthesize("Merhaba", voice="Elif")

    assert neural.extension == "mp3"
    assert classic.extension == "wav"
    assert calls == ["edge:Emel Neural", "piper:Elif"]
