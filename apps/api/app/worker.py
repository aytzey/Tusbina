import logging
import threading
import time

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.bootstrap import bootstrap_application
from app.services.generation import process_next_generation_job, reap_stale_processing_jobs
from app.services.storage import get_storage_client
from app.services.tts import get_tts_service


def _run_reaper_loop(stop_event: threading.Event) -> None:
    logger = logging.getLogger("tusbina-reaper")
    logger.info(
        "Generation reaper started (interval=%ss, stale=%sm)",
        settings.worker_reap_interval_sec,
        settings.worker_stale_job_max_age_minutes,
    )
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                reap_stale_processing_jobs(db, max_age_minutes=settings.worker_stale_job_max_age_minutes)
        except Exception:
            logger.exception("Generation reaper failed")
        stop_event.wait(settings.worker_reap_interval_sec)


def run_worker() -> None:
    bootstrap_application()

    # Alembic's fileConfig sets root to WARN and disables existing loggers.
    # Reset everything so tusbina-* loggers actually produce output.
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    # Re-enable any loggers that fileConfig(disable_existing_loggers=True) silenced
    for name in list(logging.Logger.manager.loggerDict):
        logging.getLogger(name).disabled = False

    logger = logging.getLogger("tusbina-worker")
    logger.info("Generation worker started (poll=%ss)", settings.worker_poll_interval_sec)
    storage = get_storage_client()
    tts = get_tts_service()
    prewarm_voices = [voice.strip() for voice in settings.piper_prewarm_voices.split(",") if voice.strip()]
    if prewarm_voices and hasattr(tts, "warmup_voices"):
        try:
            tts.warmup_voices(prewarm_voices)  # type: ignore[attr-defined]
            logger.info("TTS voice prewarm tamamlandi: %s", prewarm_voices)
        except Exception:
            logger.exception("TTS voice prewarm basarisiz")
    logger.info(
        "Worker runtime services: storage=%s tts=%s configured_tts_provider=%s fallback_to_dummy=%s",
        storage.__class__.__name__,
        tts.__class__.__name__,
        settings.tts_provider,
        settings.tts_fallback_to_dummy,
    )

    stop_event = threading.Event()
    reaper_thread = threading.Thread(target=_run_reaper_loop, args=(stop_event,), daemon=True)
    reaper_thread.start()

    while True:
        with SessionLocal() as db:
            processed = process_next_generation_job(db, storage=storage, tts=tts)
        if not processed:
            time.sleep(settings.worker_poll_interval_sec)


if __name__ == "__main__":
    run_worker()
