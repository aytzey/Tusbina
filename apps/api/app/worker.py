import logging
import time

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.bootstrap import bootstrap_application
from app.services.generation import process_next_generation_job, reap_stale_processing_jobs
from app.services.storage import get_storage_client
from app.services.tts import get_tts_service


def run_worker() -> None:
    bootstrap_application()

    # Reset ALL handlers on root logger (alembic adds its own) and set up fresh console output
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    logger = logging.getLogger("tusbina-worker")
    logger.info("Generation worker started (poll=%ss)", settings.worker_poll_interval_sec)
    storage = get_storage_client()
    tts = get_tts_service()

    reap_counter = 0
    while True:
        # Every 6 poll cycles (~30s), reap stuck processing jobs
        reap_counter += 1
        if reap_counter >= 6:
            reap_counter = 0
            with SessionLocal() as db:
                reap_stale_processing_jobs(db, max_age_minutes=settings.worker_stale_job_max_age_minutes)

        with SessionLocal() as db:
            processed = process_next_generation_job(db, storage=storage, tts=tts)
        if not processed:
            time.sleep(settings.worker_poll_interval_sec)


if __name__ == "__main__":
    run_worker()
