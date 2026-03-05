import subprocess
import wave
from io import BytesIO
from pathlib import Path

import numpy as np
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


def test_voice_signature_tonal_profiles_are_distinct() -> None:
    base = tts_module._build_sine_wav(duration_sec=2, frequency=440)
    elif_audio = tts_module._apply_voice_signature(base, voice="Elif", semitones=1.5)
    ahmet_audio = tts_module._apply_voice_signature(base, voice="Ahmet", semitones=-4.0)
    zeynep_audio = tts_module._apply_voice_signature(base, voice="Zeynep", semitones=5.0)

    def _centroid(content: bytes) -> float:
        with wave.open(BytesIO(content), "rb") as reader:
            raw = reader.readframes(reader.getnframes())
            sample_rate = reader.getframerate()
        x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
        if x.size < 32:
            return 0.0
        x = x - np.mean(x)
        fft = np.fft.rfft(x)
        freqs = np.fft.rfftfreq(x.size, d=1.0 / sample_rate)
        mag = np.abs(fft) + 1e-9
        return float((freqs * mag).sum() / mag.sum())

    c_elif = _centroid(elif_audio)
    c_ahmet = _centroid(ahmet_audio)
    c_zeynep = _centroid(zeynep_audio)

    assert abs(c_elif - c_ahmet) > 80.0
    assert abs(c_zeynep - c_elif) > 80.0
