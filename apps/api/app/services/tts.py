from __future__ import annotations

import asyncio
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

import numpy as np

from app.core.config import settings

logger = logging.getLogger("tusbina-tts")

try:
    import edge_tts
except Exception:  # pragma: no cover - import availability is environment-dependent
    edge_tts = None


class TTSService(Protocol):
    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult: ...


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
    pitch_semitones: float = 0.0


@dataclass(frozen=True)
class _ResolvedModelSpec:
    cache_key: str
    model_path: Path
    config_path: Path
    model_url: str
    config_url: str
    speaker_id: int | None = None


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


def _is_edge_voice(voice: str | None) -> bool:
    normalized = (voice or "").strip().lower()
    if not normalized:
        return False
    return "neural" in normalized or "emel" in normalized


def _resolve_edge_voice_short_name(voice: str | None) -> str:
    normalized = (voice or "").strip().lower()
    if "ahmet" in normalized:
        return settings.edge_voice_tr_ahmet
    if "emel" in normalized or "elif" in normalized:
        return settings.edge_voice_tr_emel
    if "diyalog" in normalized:
        return settings.edge_voice_tr_emel
    return settings.edge_voice_tr_emel


class EdgeTTSService:
    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
        if edge_tts is None:
            raise RuntimeError("edge-tts kutuphanesi yuklu degil")

        safe_text = text.strip() or "Ses uretilmesi icin metin bulunamadi."
        short_voice = _resolve_edge_voice_short_name(voice)
        timeout_sec = max(5, int(settings.edge_synthesize_timeout_sec))
        logger.info(
            "TTS_EDGE_SYNTH_START voice=%s chars=%d timeout_sec=%d edge_voice=%s",
            voice or "default",
            len(safe_text),
            timeout_sec,
            short_voice,
        )

        async def _synth() -> bytes:
            communicate = edge_tts.Communicate(
                safe_text,
                short_voice,
                rate=settings.edge_rate,
                pitch=settings.edge_pitch,
                volume=settings.edge_volume,
            )
            chunks: list[bytes] = []
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio":
                    data = chunk.get("data", b"")
                    if isinstance(data, bytes):
                        chunks.append(data)
            return b"".join(chunks)

        try:
            content = asyncio.run(asyncio.wait_for(_synth(), timeout=timeout_sec))
        except TimeoutError as exc:
            raise RuntimeError(f"Edge TTS timeout ({timeout_sec}s)") from exc

        if len(content) < 128:
            raise RuntimeError("Edge TTS cikti dosyasi beklenenden kisa")

        logger.info(
            "TTS_EDGE_SYNTH_DONE voice=%s chars=%d bytes=%d edge_voice=%s",
            voice or "default",
            len(safe_text),
            len(content),
            short_voice,
        )
        return TTSResult(content=content, extension="mp3", content_type="audio/mpeg")

    def warmup_voices(self, voices: list[str]) -> None:
        logger.info("Edge TTS prewarm atlandi (servis ag uzerinden cagri bazli)")


class HybridTTSService:
    def __init__(self, *, piper: PiperTTSService | None, edge: EdgeTTSService | None) -> None:
        self.piper = piper
        self.edge = edge

    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
        wants_edge = _is_edge_voice(voice)
        if wants_edge and self.edge is not None:
            return self.edge.synthesize(text, voice=voice)
        if wants_edge and self.piper is not None:
            logger.warning("Edge ses istendi ancak Edge servis hazir degil, Piper kullaniliyor: %s", voice)
            return self.piper.synthesize(text, voice=voice)
        if self.piper is not None:
            return self.piper.synthesize(text, voice=voice)
        if self.edge is not None:
            return self.edge.synthesize(text, voice=voice)
        raise RuntimeError("Hybrid TTS icin uygun backend bulunamadi")

    def warmup_voices(self, voices: list[str]) -> None:
        if self.piper is not None:
            self.piper.warmup_voices(voices)
        if self.edge is not None:
            self.edge.warmup_voices(voices)


class PiperTTSService:
    def __init__(self) -> None:
        self.binary_path = settings.piper_binary_path
        self.model_path, self.config_path = self._resolve_default_model_paths()
        self._default_model_spec = _ResolvedModelSpec(
            cache_key="default",
            model_path=self.model_path,
            config_path=self.config_path,
            model_url=settings.piper_model_url,
            config_url=settings.piper_model_config_url,
        )
        self._ready = False
        self._ready_model_keys: set[str] = set()

    def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
        piper_binary = self.ensure_ready()
        safe_text = text.strip() or "Ses uretilmesi icin metin bulunamadi."
        timeout_sec = max(5, int(settings.piper_synthesize_timeout_sec))
        model_spec = self._resolve_model_spec(voice)
        self._ensure_model_files_for_spec(model_spec)
        voice_profile = self._resolve_voice_profile(voice)
        logger.info(
            "TTS_PIPER_SYNTH_START voice=%s chars=%d timeout_sec=%d model=%s speaker=%s",
            voice or "default",
            len(safe_text),
            timeout_sec,
            model_spec.model_path.name,
            model_spec.speaker_id if model_spec.speaker_id is not None else "default",
        )

        with NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            base_cmd = [
                piper_binary,
                "--model",
                str(model_spec.model_path),
                "--output_file",
                tmp.name,
                "--length_scale",
                f"{voice_profile.length_scale:.3f}",
                "--noise_scale",
                f"{voice_profile.noise_scale:.3f}",
                "--noise_w_scale",
                f"{voice_profile.noise_w_scale:.3f}",
            ]
            if model_spec.config_path.exists():
                base_cmd.extend(["--config", str(model_spec.config_path)])
            if model_spec.speaker_id is not None:
                base_cmd.extend(["--speaker", str(model_spec.speaker_id)])
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
            if settings.piper_enable_postprocess_pitch_shift:
                content = _apply_voice_signature(content, voice=voice, semitones=voice_profile.pitch_semitones)
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
            self._ensure_model_files_for_spec(self._default_model_spec)
            self._ready = True

        return piper_binary

    def warmup_voices(self, voices: list[str]) -> None:
        """Preload configured models for listed voices to reduce first-request latency."""
        self.ensure_ready()
        for voice in voices:
            spec = self._resolve_model_spec(voice)
            self._ensure_model_files_for_spec(spec)

    def _resolve_default_model_paths(self) -> tuple[Path, Path]:
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

    def _resolve_model_spec(self, voice: str | None) -> _ResolvedModelSpec:
        voice_key = self._resolve_voice_key(voice)
        if not voice_key:
            return self._default_model_spec

        model_path_override = getattr(settings, f"piper_model_path_{voice_key}", "").strip()
        config_path_override = getattr(settings, f"piper_model_config_path_{voice_key}", "").strip()
        model_url_override = getattr(settings, f"piper_model_url_{voice_key}", "").strip()
        config_url_override = getattr(settings, f"piper_model_config_url_{voice_key}", "").strip()
        speaker_id_raw = int(getattr(settings, f"piper_speaker_id_{voice_key}", -1))

        has_model_override = bool(model_path_override or config_path_override or model_url_override or config_url_override)
        has_speaker_override = speaker_id_raw >= 0
        if not has_model_override and not has_speaker_override:
            return self._default_model_spec

        if model_path_override:
            model_path = Path(model_path_override)
        elif model_url_override:
            model_name = Path(model_url_override).name or self.model_path.name
            model_path = Path(settings.tts_models_dir) / "piper" / model_name
        else:
            model_path = self.model_path

        if config_path_override:
            config_path = Path(config_path_override)
        elif config_url_override:
            config_name = Path(config_url_override).name or f"{model_path.name}.json"
            config_path = Path(settings.tts_models_dir) / "piper" / config_name
        elif model_path_override or model_url_override:
            config_path = Path(f"{model_path}.json")
        else:
            config_path = self.config_path

        model_url = model_url_override or settings.piper_model_url
        config_url = config_url_override or settings.piper_model_config_url
        speaker_id = speaker_id_raw if speaker_id_raw >= 0 else None
        cache_key = f"{voice_key}:{model_path}:{config_path}:{speaker_id or 'none'}"
        return _ResolvedModelSpec(
            cache_key=cache_key,
            model_path=model_path,
            config_path=config_path,
            model_url=model_url,
            config_url=config_url,
            speaker_id=speaker_id,
        )

    @staticmethod
    def _resolve_voice_key(voice: str | None) -> str:
        voice_name = (voice or "").strip().lower()
        if "ahmet" in voice_name or "arda" in voice_name:
            return "ahmet"
        if "zeynep" in voice_name:
            return "zeynep"
        if "elif" in voice_name or "selin" in voice_name or "diyalog" in voice_name:
            return "elif"
        return ""

    def _ensure_model_files_for_spec(self, spec: _ResolvedModelSpec) -> None:
        if spec.cache_key in self._ready_model_keys:
            return

        spec.model_path.parent.mkdir(parents=True, exist_ok=True)
        if not spec.model_path.exists():
            if not spec.model_url:
                raise RuntimeError(f"Piper model bulunamadi: {spec.model_path}")
            logger.info("Piper model indiriliyor: %s", spec.model_path)
            urlretrieve(spec.model_url, spec.model_path)

        if not spec.config_path.exists() and spec.config_url:
            logger.info("Piper model config indiriliyor: %s", spec.config_path)
            urlretrieve(spec.config_url, spec.config_path)

        self._ready_model_keys.add(spec.cache_key)
        logger.info(
            "Piper model hazir: key=%s model=%s config=%s speaker=%s",
            spec.cache_key,
            spec.model_path.name,
            spec.config_path.name,
            spec.speaker_id if spec.speaker_id is not None else "default",
        )

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
            pitch_semitones = float(settings.piper_voice_pitch_semitones_ahmet)
        elif "zeynep" in voice_name:
            noise_scale = PiperTTSService._clamp(noise_scale * 1.08, min_value=0.0, max_value=2.0)
            noise_w_scale = PiperTTSService._clamp(noise_w_scale * 0.95, min_value=0.0, max_value=2.0)
            sentence_silence = PiperTTSService._clamp(sentence_silence * 0.72, min_value=0.0, max_value=2.0)
            volume = PiperTTSService._clamp(volume * 1.05, min_value=0.1, max_value=3.0)
            sine_frequency = 520
            pitch_semitones = float(settings.piper_voice_pitch_semitones_zeynep)
        elif "diyalog" in voice_name:
            sentence_silence = PiperTTSService._clamp(sentence_silence + 0.05, min_value=0.0, max_value=2.0)
            sine_frequency = 480
            pitch_semitones = 0.0
        elif "elif" in voice_name or "selin" in voice_name:
            noise_w_scale = PiperTTSService._clamp(noise_w_scale * 1.03, min_value=0.0, max_value=2.0)
            sine_frequency = 460
            pitch_semitones = float(settings.piper_voice_pitch_semitones_elif)
        else:
            pitch_semitones = 0.0

        return _VoiceProfile(
            length_scale=length_scale,
            noise_scale=noise_scale,
            noise_w_scale=noise_w_scale,
            sentence_silence=sentence_silence,
            volume=volume,
            sine_frequency=sine_frequency,
            pitch_semitones=PiperTTSService._clamp(pitch_semitones, min_value=-6.0, max_value=6.0),
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


def _build_piper_service() -> PiperTTSService:
    service = PiperTTSService()
    service.ensure_ready()
    return service


def _build_edge_service() -> EdgeTTSService:
    if edge_tts is None:
        raise RuntimeError("edge-tts kutuphanesi yuklu degil")
    return EdgeTTSService()


def get_tts_service() -> TTSService:
    provider = settings.tts_provider.lower()
    logger.info(
        "TTS_PROVIDER_REQUESTED provider=%s fallback_to_dummy=%s",
        provider,
        settings.tts_fallback_to_dummy,
    )
    if provider == "piper":
        try:
            service = _build_piper_service()
            logger.info("TTS_PROVIDER_ACTIVE provider=piper service=PiperTTSService")
            return service
        except Exception as exc:
            if not settings.tts_fallback_to_dummy:
                logger.exception("TTS_PROVIDER_FAILED provider=piper fallback_disabled=true")
                raise
            logger.warning("TTS_PROVIDER_FALLBACK provider=piper -> dummy reason=%s", exc)
            return DummyTTSService()
    if provider == "edge":
        try:
            service = _build_edge_service()
            logger.info("TTS_PROVIDER_ACTIVE provider=edge service=EdgeTTSService")
            return service
        except Exception as exc:
            if not settings.tts_fallback_to_dummy:
                logger.exception("TTS_PROVIDER_FAILED provider=edge fallback_disabled=true")
                raise
            logger.warning("TTS_PROVIDER_FALLBACK provider=edge -> dummy reason=%s", exc)
            return DummyTTSService()
    if provider == "hybrid":
        piper_service: PiperTTSService | None = None
        edge_service: EdgeTTSService | None = None
        piper_error: Exception | None = None
        edge_error: Exception | None = None
        try:
            piper_service = _build_piper_service()
        except Exception as exc:
            piper_error = exc
            logger.exception("TTS_PROVIDER_HYBRID_PIPER_UNAVAILABLE")
        try:
            edge_service = _build_edge_service()
        except Exception as exc:
            edge_error = exc
            logger.exception("TTS_PROVIDER_HYBRID_EDGE_UNAVAILABLE")

        if piper_service is None and edge_service is None:
            if not settings.tts_fallback_to_dummy:
                raise RuntimeError(
                    f"Hybrid TTS backend yok (piper={piper_error}, edge={edge_error})"
                )
            logger.warning("TTS_PROVIDER_FALLBACK provider=hybrid -> dummy")
            return DummyTTSService()

        logger.info(
            "TTS_PROVIDER_ACTIVE provider=hybrid service=HybridTTSService piper_ready=%s edge_ready=%s",
            piper_service is not None,
            edge_service is not None,
        )
        return HybridTTSService(piper=piper_service, edge=edge_service)

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


def _apply_voice_signature(content: bytes, *, voice: str | None, semitones: float) -> bytes:
    if abs(semitones) < 0.05:
        return content

    try:
        with wave.open(BytesIO(content), "rb") as reader:
            channels = reader.getnchannels()
            sample_width = reader.getsampwidth()
            sample_rate = reader.getframerate()
            frames = reader.getnframes()
            pcm = reader.readframes(frames)
    except Exception:
        return content

    if sample_width != 2 or frames <= 4 or channels <= 0:
        return content

    try:
        samples = np.frombuffer(pcm, dtype=np.int16)
        if samples.size == 0:
            return content
        if channels > 1:
            samples = samples.reshape(-1, channels)
        else:
            samples = samples.reshape(-1, 1)

        pitched_channels: list[np.ndarray] = []
        for channel_idx in range(samples.shape[1]):
            channel = samples[:, channel_idx].astype(np.float32)
            pitched_channels.append(_pitch_shift_keep_duration(channel, semitones=semitones))

        processed = np.stack(pitched_channels, axis=1)
        clipped = np.clip(np.round(processed), -32768, 32767).astype(np.int16)
        if channels == 1:
            pcm_out = clipped[:, 0].tobytes()
        else:
            pcm_out = clipped.reshape(-1).tobytes()

        stream = BytesIO()
        with wave.open(stream, "wb") as writer:
            writer.setnchannels(channels)
            writer.setsampwidth(sample_width)
            writer.setframerate(sample_rate)
            writer.writeframes(pcm_out)
        logger.debug("TTS_VOICE_SIGNATURE_APPLIED voice=%s semitones=%.2f frames=%d", voice or "default", semitones, frames)
        return stream.getvalue()
    except Exception:
        return content


def _pitch_shift_keep_duration(channel: np.ndarray, *, semitones: float) -> np.ndarray:
    if channel.size < 8 or abs(semitones) < 0.05:
        return channel

    pitch_factor = float(2 ** (semitones / 12.0))
    if pitch_factor <= 0:
        return channel

    # Step 1: pitch move via resampling.
    target_len = max(8, int(round(channel.size / pitch_factor)))
    idx_in = np.linspace(0, channel.size - 1, num=channel.size, dtype=np.float32)
    idx_mid = np.linspace(0, channel.size - 1, num=target_len, dtype=np.float32)
    pitched = np.interp(idx_mid, idx_in, channel).astype(np.float32)

    # Step 2: stretch back to original length to preserve duration.
    idx_pitched = np.linspace(0, pitched.size - 1, num=pitched.size, dtype=np.float32)
    idx_out = np.linspace(0, pitched.size - 1, num=channel.size, dtype=np.float32)
    restored = np.interp(idx_out, idx_pitched, pitched).astype(np.float32)
    return restored
