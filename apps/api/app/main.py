import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.auth import router as auth_router
from app.api.routes.courses import router as courses_router
from app.api.routes.feedback import router as feedback_router
from app.api.routes.generation import router as generation_router
from app.api.routes.health import router as health_router
from app.api.routes.legal import api_router as legal_api_router
from app.api.routes.legal import router as legal_router
from app.api.routes.podcasts import router as podcasts_router
from app.api.routes.quiz import router as quiz_router
from app.api.routes.upload import router as upload_router
from app.api.routes.usage import router as usage_router
from app.api.routes.voices import router as voices_router
from app.core.config import settings
from app.services.bootstrap import bootstrap_application

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(
    title="TUSBINA API",
    version="0.2.0",
    description="MVP API with DB-backed upload and generation job pipeline",
)

bootstrap_application()
# Alembic's fileConfig can disable app loggers; restore them for request/debug visibility.
root = logging.getLogger()
if not root.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    root.addHandler(handler)
root.setLevel(logging.INFO)
for logger_name in list(logging.Logger.manager.loggerDict):
    logging.getLogger(logger_name).disabled = False

origins = [origin.strip() for origin in settings.app_cors_origins.split(",") if origin.strip()]
allow_all_origins = not origins or "*" in origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.storage_backend.lower() == "local":
    local_upload_dir = Path(settings.local_upload_dir)
    local_upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static/uploads", StaticFiles(directory=local_upload_dir), name="uploads")

app.include_router(health_router)
app.include_router(legal_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(courses_router, prefix="/api/v1")
app.include_router(podcasts_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(generation_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(usage_router, prefix="/api/v1")
app.include_router(quiz_router, prefix="/api/v1")
app.include_router(voices_router, prefix="/api/v1")
app.include_router(legal_api_router, prefix="/api/v1")
