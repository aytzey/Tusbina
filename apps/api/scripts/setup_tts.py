import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.tts import PiperTTSService, get_tts_service


def main() -> None:
    service = get_tts_service()
    print(f"TTS provider: {service.__class__.__name__}")

    if isinstance(service, PiperTTSService):
        service.ensure_ready()
        print(f"Piper model ready: {Path(service.model_path).resolve()}")
        print(f"Piper config ready: {Path(service.config_path).resolve()}")

    sample = service.synthesize("TUSBINA test sesi hazir.")
    print(f"Sample audio bytes: {len(sample.content)} ({sample.content_type})")


if __name__ == "__main__":
    main()
