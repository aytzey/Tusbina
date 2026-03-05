import argparse
import statistics
import subprocess
import sys
import time
import wave
from io import BytesIO
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services.tts import PiperTTSService, get_tts_service

DEFAULT_TEXT = (
    "Bu deneme metni, TUSBINA TTS altyapisinin hiz ve kalite kontrolu icin uretilmistir. "
    "Amacimiz bolum bazli uretilen seslerin gercek surelerini ve uretilme performansini "
    "olcmek ve sistemin hem CPU hem de GPU ortaminda istikrarini dogrulamaktir."
)


def _audio_duration_seconds(content: bytes) -> float:
    with wave.open(BytesIO(content), "rb") as wav_reader:
        frame_rate = wav_reader.getframerate()
        frame_count = wav_reader.getnframes()
        return frame_count / frame_rate if frame_rate > 0 else 0.0


def _gpu_info() -> str:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return "nvidia-smi bulundu ama GPU listelenemedi"
        names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return ", ".join(names) if names else "GPU bulunamadi"
    except FileNotFoundError:
        return "nvidia-smi yok (GPU dogrulanamadi)"


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark TUSBINA TTS pipeline")
    parser.add_argument("--runs", type=int, default=3, help="Benchmark tekrar sayisi")
    parser.add_argument("--voice", default="Dr. Selin", help="Ses adi")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="Sentez metni")
    args = parser.parse_args()

    tts = get_tts_service()
    provider = tts.__class__.__name__
    gpu = _gpu_info()

    print(f"Provider: {provider}")
    print(f"GPU: {gpu}")
    print(f"PIPER_USE_CUDA={settings.piper_use_cuda}")

    timings: list[float] = []
    durations: list[float] = []
    rtfs: list[float] = []

    for i in range(1, args.runs + 1):
        start = time.perf_counter()
        result = tts.synthesize(args.text, voice=args.voice)
        elapsed = time.perf_counter() - start
        duration = _audio_duration_seconds(result.content)
        rtf = elapsed / duration if duration > 0 else 0.0

        timings.append(elapsed)
        durations.append(duration)
        rtfs.append(rtf)
        print(
            f"Run {i}: elapsed={elapsed:.3f}s audio={duration:.3f}s "
            f"rtf={rtf:.3f} size={len(result.content)}B"
        )

    print(
        "Summary: "
        f"elapsed_avg={statistics.mean(timings):.3f}s "
        f"audio_avg={statistics.mean(durations):.3f}s "
        f"rtf_avg={statistics.mean(rtfs):.3f}"
    )

    if isinstance(tts, PiperTTSService):
        print(f"Piper model: {tts.model_path}")


if __name__ == "__main__":
    main()
