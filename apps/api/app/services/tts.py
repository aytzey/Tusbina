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


@dataclass
class _VoiceProfile:
    length_scale: float
    noise_scale: float
    noise_w_scale: float
    sentence_silence: float
    volume: float
    sine_frequency: int = 440


class DummyTTSService:
    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
        payload = text if text.strip() else "Ses icin metin bulunamadi."
        base_duration_sec = min(max(len(payload) // 45, 2), 12)
        profile = PiperTTSService._resolve_voice_profile_static(voice)
        adjusted_duration = max(1, int(round(base_duration_sec * profile.length_scale)))
        logger.warning(
            "TTS_DUMMY_USED voice=%s chars=%d duration_sec=%d",
            voice or "default",
            len(payload),
            adjusted_duration,
        )
        audio = _build_sine_wav(duration_sec=adjusted_duration, frequency=profile.sine_frequency)
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
        voice_profile = self._resolve_voice_profile(voice)
        logger.info(
            "TTS_PIPER_SYNTH_START voice=%s chars=%d timeout_sec=%d",
            voice or "default",
            len(safe_text),
            timeout_sec,
        )

        with NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            base_cmd = [
                piper_binary,
                "--model",
                str(self.model_path),
                "--output_file",
                tmp.name,
                "--length_scale",
                f"{voice_profile.length_scale:.3f}",
                "--noise_scale",
                f"{voice_profile.noise_scale:.3f}",
                "--noise_w_scale",
                f"{voice_profile.noise_w_scale:.3f}",
            ]
            if self.config_path.exists():
                base_cmd.extend(["--config", str(self.config_path)])
            sentence_silence = voice_profile.sentence_silence
            if sentence_silence > 0:
                base_cmd.extend(["--sentence_silence", f"{sentence_silence:.3f}"])

            if settings.piper_no_normalize:
                base_cmd.append("--no-normalize")

            volume = voice_profile.volume
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
        logger.info(
            "TTS_PIPER_SYNTH_DONE voice=%s chars=%d bytes=%d",
            voice or "default",
            len(safe_text),
            len(content),
        )

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
        base_scale = self._base_length_scale_for_voice(voice)
        return self._accelerate_length_scale(base_scale)

    def _resolve_voice_profile(self, voice: str | None) -> _VoiceProfile:
        return self._resolve_voice_profile_static(voice)

    @staticmethod
    def _resolve_voice_profile_static(voice: str | None) -> _VoiceProfile:
        base_length = PiperTTSService._base_length_scale_for_voice(voice)
        length_scale = PiperTTSService._accelerate_length_scale(base_length)
        noise_scale = PiperTTSService._clamp(settings.piper_noise_scale, min_value=0.0, max_value=2.0)
        noise_w_scale = PiperTTSService._clamp(settings.piper_noise_w_scale, min_value=0.0, max_value=2.0)
        sentence_silence = PiperTTSService._clamp(settings.piper_sentence_silence, min_value=0.0, max_value=2.0)
        volume = PiperTTSService._clamp(settings.piper_volume, min_value=0.1, max_value=3.0)
        sine_frequency = 440

        voice_name = (voice or "").strip().lower()
        if "ahmet" in voice_name or "arda" in voice_name:
            noise_scale = PiperTTSService._clamp(noise_scale * 0.88, min_value=0.0, max_value=2.0)
            sentence_silence = PiperTTSService._clamp(sentence_silence + 0.04, min_value=0.0, max_value=2.0)
            sine_frequency = 360
        elif "zeynep" in voice_name:
            noise_scale = PiperTTSService._clamp(noise_scale * 1.08, min_value=0.0, max_value=2.0)
            noise_w_scale = PiperTTSService._clamp(noise_w_scale * 0.95, min_value=0.0, max_value=2.0)
            sentence_silence = PiperTTSService._clamp(sentence_silence * 0.72, min_value=0.0, max_value=2.0)
            volume = PiperTTSService._clamp(volume * 1.05, min_value=0.1, max_value=3.0)
            sine_frequency = 520
        elif "diyalog" in voice_name:
            sentence_silence = PiperTTSService._clamp(sentence_silence + 0.05, min_value=0.0, max_value=2.0)
            sine_frequency = 480
        elif "elif" in voice_name or "selin" in voice_name:
            noise_w_scale = PiperTTSService._clamp(noise_w_scale * 1.03, min_value=0.0, max_value=2.0)
            sine_frequency = 460

        return _VoiceProfile(
            length_scale=length_scale,
            noise_scale=noise_scale,
            noise_w_scale=noise_w_scale,
            sentence_silence=sentence_silence,
            volume=volume,
            sine_frequency=sine_frequency,
        )

    @staticmethod
    def _base_length_scale_for_voice(voice: str | None) -> float:
        voice_name = (voice or "").lower()
        if "selin" in voice_name or "elif" in voice_name:
            return PiperTTSService._clamp(settings.piper_voice_selin_length_scale, min_value=0.6, max_value=2.0)
        if "arda" in voice_name or "ahmet" in voice_name:
            return PiperTTSService._clamp(settings.piper_voice_arda_length_scale, min_value=0.6, max_value=2.0)
        if "zeynep" in voice_name:
            default_scale = PiperTTSService._clamp(settings.piper_length_scale, min_value=0.6, max_value=2.0)
            return PiperTTSService._clamp(default_scale * 0.92, min_value=0.6, max_value=2.0)
        return PiperTTSService._clamp(settings.piper_length_scale, min_value=0.6, max_value=2.0)

    @staticmethod
    def _accelerate_length_scale(base_scale: float) -> float:
        speed_multiplier = PiperTTSService._clamp(settings.piper_speed_multiplier, min_value=0.5, max_value=2.5)
        # Piper length_scale grows speech duration; divide to increase playback speed.
        accelerated = base_scale / speed_multiplier
        return PiperTTSService._clamp(accelerated, min_value=0.6, max_value=2.0)


def get_tts_service() -> TTSService:
    provider = settings.tts_provider.lower()
    logger.info(
        "TTS_PROVIDER_REQUESTED provider=%s fallback_to_dummy=%s",
        provider,
        settings.tts_fallback_to_dummy,
    )
    if provider == "piper":
        try:
            service = PiperTTSService()
            service.ensure_ready()
            logger.info("TTS_PROVIDER_ACTIVE provider=piper service=PiperTTSService")
            return service
        except Exception as exc:
            if not settings.tts_fallback_to_dummy:
                logger.exception("TTS_PROVIDER_FAILED provider=piper fallback_disabled=true")
                raise
            logger.warning("TTS_PROVIDER_FALLBACK provider=piper -> dummy reason=%s", exc)
            return DummyTTSService()

    logger.warning("TTS_PROVIDER_ACTIVE provider=dummy service=DummyTTSService")
    return DummyTTSService()


def _build_sine_wav(duration_sec: int = 2, sample_rate: int = 22050, frequency: int = 440) -> bytes:
    total_samples = duration_sec * sample_rate
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
