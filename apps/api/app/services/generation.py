import wave
from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import GenerationJobModel, PodcastModel, PodcastPartModel, UploadAssetModel
from app.models.schemas import GeneratePodcastIn, GeneratePodcastStatusOut
from app.services.script_generation import build_asset_text_cache, build_part_script
from app.services.storage import StorageClient
from app.services.tts import TTSService, get_tts_service

FORMAT_PART_DURATION_SEC = {
    "narrative": 420,
    "summary": 300,
    "qa": 360,
}


def enqueue_generation_job(db: Session, *, user_id: str, payload: GeneratePodcastIn) -> GenerationJobModel:
    job = GenerationJobModel(
        id=uuid4().hex,
        user_id=user_id,
        status="queued",
        progress_pct=0,
        payload_json=payload.model_dump(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_generation_job(db: Session, *, job_id: str, user_id: str) -> GenerationJobModel | None:
    stmt: Select[tuple[GenerationJobModel]] = select(GenerationJobModel).where(
        GenerationJobModel.id == job_id,
        GenerationJobModel.user_id == user_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def job_to_status_schema(job: GenerationJobModel) -> GeneratePodcastStatusOut:
    return GeneratePodcastStatusOut(
        job_id=job.id,
        status=job.status,
        progress_pct=job.progress_pct,
        result_podcast_id=job.result_podcast_id,
        error=job.error,
    )


def process_next_generation_job(db: Session, *, storage: StorageClient, tts: TTSService | None = None) -> bool:
    job = _claim_next_generation_job(db)
    if job is None:
        return False

    tts_service = tts or get_tts_service()

    try:
        payload = job.payload_json
        file_ids = payload.get("file_ids", [])
        if not file_ids:
            raise ValueError("No file_ids provided for generation")

        assets = db.execute(
            select(UploadAssetModel).where(
                UploadAssetModel.id.in_(file_ids),
                UploadAssetModel.user_id == job.user_id,
            )
        ).scalars().all()

        if not assets:
            raise ValueError("No uploaded assets found")

        sections = payload.get("sections", [])
        enabled_sections = [section for section in sections if section.get("enabled", True)]
        if sections and not enabled_sections:
            raise ValueError("All sections are disabled")
        section_titles = [section.get("title", "").strip() for section in enabled_sections if section.get("title")]

        if section_titles:
            part_titles = section_titles
        else:
            part_titles = [asset.filename for asset in assets]
        if len(part_titles) > settings.generation_max_parts:
            raise ValueError(
                f"Part limiti asildi: {len(part_titles)} > {settings.generation_max_parts}"
            )

        default_duration_sec = FORMAT_PART_DURATION_SEC.get(payload.get("format", "narrative"), 420)
        podcast_id = f"pod-{uuid4().hex[:12]}"
        podcast = PodcastModel(
            id=podcast_id,
            user_id=job.user_id,
            title=payload.get("title", "Yeni Podcast"),
            source_type="ai",
            voice=payload.get("voice", "Dr. Arda"),
            format=payload.get("format", "narrative"),
            total_duration_sec=0,
        )
        db.add(podcast)

        db.flush()

        total_parts = len(part_titles)
        total_duration_sec = 0
        asset_text_cache = build_asset_text_cache(assets=assets, storage=storage)
        for index, part_title in enumerate(part_titles, start=1):
            script = build_part_script(
                part_title=part_title,
                format_name=str(payload.get("format", "narrative")),
                index=index,
                total=total_parts,
                assets=assets,
                storage=storage,
                asset_text_cache=asset_text_cache,
            )
            tts_audio = tts_service.synthesize(script, voice=payload.get("voice"))
            part_duration_sec = _duration_from_wav_bytes(tts_audio.content) or default_duration_sec

            generated_audio = storage.save_bytes(
                filename=f"{podcast_id}-part-{index}.{tts_audio.extension}",
                content=tts_audio.content,
                content_type=tts_audio.content_type,
                user_id=job.user_id,
            )
            part = PodcastPartModel(
                id=f"{podcast_id}-part-{index}",
                podcast_id=podcast_id,
                title=f"Bölüm {index}: {part_title}",
                duration_sec=part_duration_sec,
                page_range=f"s{index}",
                status="ready",
                audio_url=generated_audio.public_url,
            )
            db.add(part)
            total_duration_sec += part_duration_sec

            job.progress_pct = min(95, 20 + int((index / max(total_parts, 1)) * 70))
            job.updated_at = datetime.now(UTC)
            db.commit()

        podcast.total_duration_sec = total_duration_sec
        job.status = "completed"
        job.progress_pct = 100
        job.result_podcast_id = podcast_id
        job.updated_at = datetime.now(UTC)
        db.commit()
        return True

    except Exception as exc:
        db.rollback()
        failed = db.get(GenerationJobModel, job.id)
        if failed is not None:
            failed.status = "failed"
            failed.progress_pct = 100
            failed.error = str(exc)
            failed.updated_at = datetime.now(UTC)
            db.commit()
        return True


def _claim_next_generation_job(db: Session) -> GenerationJobModel | None:
    stmt: Select[tuple[GenerationJobModel]] = (
        select(GenerationJobModel)
        .where(GenerationJobModel.status == "queued")
        .order_by(GenerationJobModel.created_at.asc())
        .limit(1)
    )
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)

    job = db.execute(stmt).scalar_one_or_none()
    if job is None:
        return None

    job.status = "processing"
    job.progress_pct = 15
    job.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(job)
    return job


def _duration_from_wav_bytes(content: bytes) -> int | None:
    try:
        with wave.open(BytesIO(content), "rb") as wav_reader:
            frame_rate = wav_reader.getframerate()
            frame_count = wav_reader.getnframes()
            if frame_rate <= 0:
                return None
            return max(1, int(round(frame_count / frame_rate)))
    except wave.Error:
        return None
