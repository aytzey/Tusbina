import logging
import math
import shutil
import subprocess
import wave
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Protocol
from urllib.request import urlretrieve

from app.core.config import settings

logger = logging.getLogger("tusbina-tts")


class TTSService(Protocol):
    def synthesize(self, text: str, *, voice: str | None = None) -> "TTSResult": ...


@dataclass
class TTSResult:
    content: bytes
    extension: str
    content_type: str


class DummyTTSService:
    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
        payload = text if text.strip() else "Ses icin metin bulunamadi."
        base_duration_sec = min(max(len(payload) // 45, 2), 12)
        speed_multiplier = max(0.5, settings.piper_speed_multiplier)
        adjusted_duration = max(1, int(round(base_duration_sec / speed_multiplier)))
        audio = _build_sine_wav(duration_sec=adjusted_duration)
        return TTSResult(content=audio, extension="wav", content_type="audio/wav")


class PiperTTSService:
    def __init__(self) -> None:
        self.binary_path = settings.piper_binary_path
        self.model_path, self.config_path = self._resolve_model_paths()
        self._ready = False

    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
        piper_binary = self.ensure_ready()
        safe_text = text.strip() or "Ses uretilmesi icin metin bulunamadi."
        timeout_sec = max(5, int(settings.piper_synthesize_timeout_sec))

        with NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            base_cmd = [
                piper_binary,
                "--model",
                str(self.model_path),
                "--output_file",
                tmp.name,
                "--length_scale",
                f"{self._resolve_length_scale(voice):.3f}",
                "--noise_scale",
                f"{self._clamp(settings.piper_noise_scale, min_value=0.0, max_value=2.0):.3f}",
                "--noise_w_scale",
                f"{self._clamp(settings.piper_noise_w_scale, min_value=0.0, max_value=2.0):.3f}",
            ]
            if self.config_path.exists():
                base_cmd.extend(["--config", str(self.config_path)])
            sentence_silence = self._clamp(
                settings.piper_sentence_silence,
                min_value=0.0,
                max_value=2.0,
            )
            if sentence_silence > 0:
                base_cmd.extend(["--sentence_silence", f"{sentence_silence:.3f}"])

            if settings.piper_no_normalize:
                base_cmd.append("--no-normalize")

            volume = self._clamp(settings.piper_volume, min_value=0.1, max_value=3.0)
            if abs(volume - 1.0) > 1e-6:
                base_cmd.extend(["--volume", f"{volume:.3f}"])

            cmd = [*base_cmd]
            use_cuda = settings.piper_use_cuda
            if use_cuda:
                cmd.append("--cuda")

            completed = self._run_piper_command(cmd, safe_text=safe_text, timeout_sec=timeout_sec)
            if completed.returncode != 0:
                stderr = completed.stderr.decode("utf-8", errors="ignore")
                if use_cuda:
                    logger.warning(
                        "Piper CUDA sentez basarisiz, CPU fallback deneniyor: %s",
                        stderr.strip() or completed.returncode,
                    )
                    completed = self._run_piper_command(base_cmd, safe_text=safe_text, timeout_sec=timeout_sec)
                if completed.returncode != 0:
                    retry_stderr = completed.stderr.decode("utf-8", errors="ignore")
                    raise RuntimeError(
                        f"Piper sentez hatasi: {retry_stderr.strip() or completed.returncode}"
                    )

            content = Path(tmp.name).read_bytes()
            if len(content) < 64:
                raise RuntimeError("Piper cikti dosyasi beklenenden kisa")

        return TTSResult(content=content, extension="wav", content_type="audio/wav")

    @staticmethod
    def _run_piper_command(
        cmd: list[str],
        *,
        safe_text: str,
        timeout_sec: int,
    ) -> subprocess.CompletedProcess[bytes]:
        try:
            return subprocess.run(
                cmd,
                input=safe_text.encode("utf-8"),
                capture_output=True,
                check=False,
                timeout=timeout_sec,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Piper sentez timeout ({timeout_sec}s)") from exc

    def ensure_ready(self) -> str:
        piper_binary = shutil.which(self.binary_path) if self.binary_path else None
        if not piper_binary:
            raise RuntimeError(f"Piper binary bulunamadi: {self.binary_path}")

        if not self._ready:
            self._ensure_model_files()
            self._ready = True

        return piper_binary

    def _resolve_model_paths(self) -> tuple[Path, Path]:
        if settings.piper_model_path:
            model_path = Path(settings.piper_model_path)
        else:
            model_name = Path(settings.piper_model_url).name or "tr_TR-dfki-medium.onnx"
            model_path = Path(settings.tts_models_dir) / "piper" / model_name

        if settings.piper_model_config_path:
            config_path = Path(settings.piper_model_config_path)
        else:
            config_path = Path(f"{model_path}.json")

        return model_path, config_path

    def _ensure_model_files(self) -> None:
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.model_path.exists():
            logger.info("Piper model indiriliyor: %s", self.model_path)
            urlretrieve(settings.piper_model_url, self.model_path)

        if not self.config_path.exists():
            logger.info("Piper model config indiriliyor: %s", self.config_path)
            urlretrieve(settings.piper_model_config_url, self.config_path)

    @staticmethod
    def _clamp(value: float, *, min_value: float, max_value: float) -> float:
        return max(min_value, min(max_value, value))

    def _resolve_length_scale(self, voice: str | None) -> float:
        speed_multiplier = self._clamp(settings.piper_speed_multiplier, min_value=0.5, max_value=2.5)
        voice_name = (voice or "").lower()
        if "selin" in voice_name:
            base_scale = self._clamp(settings.piper_voice_selin_length_scale, min_value=0.6, max_value=2.0)
        elif "arda" in voice_name:
            base_scale = self._clamp(settings.piper_voice_arda_length_scale, min_value=0.6, max_value=2.0)
        else:
            base_scale = self._clamp(settings.piper_length_scale, min_value=0.6, max_value=2.0)

        # Piper length_scale grows speech duration; divide to increase playback speed.
        accelerated = base_scale / speed_multiplier
        return self._clamp(accelerated, min_value=0.6, max_value=2.0)


def get_tts_service() -> TTSService:
    provider = settings.tts_provider.lower()
    if provider == "piper":
        try:
            service = PiperTTSService()
            service.ensure_ready()
            return service
        except Exception as exc:
            if not settings.tts_fallback_to_dummy:
                raise
            logger.warning("Piper hazirlanamadi, dummy TTS kullaniliyor: %s", exc)
            return DummyTTSService()

    return DummyTTSService()


def _build_sine_wav(duration_sec: int = 2, sample_rate: int = 22050) -> bytes:
    total_samples = duration_sec * sample_rate
    frequency = 440
    amplitude = 16000

    stream = BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)

        for i in range(total_samples):
            phase = (i * frequency * 2 * 3.141592653589793) / sample_rate
            sample = int(amplitude * math.sin(phase))
            wav.writeframesraw(sample.to_bytes(2, byteorder="little", signed=True))

    return stream.getvalue()
