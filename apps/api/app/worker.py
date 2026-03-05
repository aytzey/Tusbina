import logging
import time

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.bootstrap import bootstrap_application
from app.services.generation import process_next_generation_job
from app.services.storage import get_storage_client
from app.services.tts import get_tts_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", force=True)
logger = logging.getLogger("tusbina-worker")


def run_worker() -> None:
    bootstrap_application()
    logger.info("Generation worker started (poll=%ss)", settings.worker_poll_interval_sec)
    storage = get_storage_client()
    tts = get_tts_service()

    while True:
        with SessionLocal() as db:
            processed = process_next_generation_job(db, storage=storage, tts=tts)
        if not processed:
            time.sleep(settings.worker_poll_interval_sec)


if __name__ == "__main__":
    run_worker()
