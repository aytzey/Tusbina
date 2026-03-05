import logging
import re
import wave
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from sqlalchemy import Select, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import GenerationJobModel, PodcastModel, PodcastPartModel, UploadAssetModel
from app.models.schemas import GeneratePodcastIn, GeneratePodcastStatusOut
from app.services.script_generation import build_asset_text_cache, build_part_script
from app.services.storage import StorageClient
from app.services.tts import TTSService, get_tts_service

logger = logging.getLogger("tusbina-generation")

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
    stored_keys: list[str] = []

    try:
        payload = job.payload_json
        file_ids = payload.get("file_ids", [])
        if not file_ids:
            raise ValueError("No file_ids provided for generation")

        assets_unordered = list(
            db.execute(
                select(UploadAssetModel).where(
                    UploadAssetModel.id.in_(file_ids),
                    UploadAssetModel.user_id == job.user_id,
                )
            ).scalars().all()
        )

        if not assets_unordered:
            raise ValueError("No uploaded assets found")

        # Preserve original file_ids order so index-based section/asset mapping is correct
        id_order = {fid: idx for idx, fid in enumerate(file_ids)}
        assets = sorted(assets_unordered, key=lambda a: id_order.get(a.id, len(file_ids)))
        found_ids = {asset.id for asset in assets}
        missing_ids = [file_id for file_id in file_ids if file_id not in found_ids]
        if missing_ids:
            raise ValueError(f"Some uploaded assets were not found: {', '.join(missing_ids[:3])}")

        asset_text_cache = build_asset_text_cache(assets=assets, storage=storage)
        sections = payload.get("sections", [])
        enabled_sections = [section for section in sections if section.get("enabled", True)]
        if sections and not enabled_sections:
            raise ValueError("All sections are disabled")
        section_titles = [section.get("title", "").strip() for section in enabled_sections if section.get("title")]

        if section_titles and not _matches_default_file_sections(section_titles=section_titles, assets=assets):
            part_titles = section_titles
        else:
            part_titles = _build_auto_part_titles(
                assets=assets,
                asset_text_cache=asset_text_cache,
                format_name=str(payload.get("format", "narrative")),
            )
        if len(part_titles) > settings.generation_max_parts:
            raise ValueError(
                f"Part limiti asildi: {len(part_titles)} > {settings.generation_max_parts}"
            )

        format_name = str(payload.get("format", "narrative"))
        default_duration_sec = FORMAT_PART_DURATION_SEC.get(format_name, 420)
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
        for index, part_title in enumerate(part_titles, start=1):
            script = build_part_script(
                part_title=part_title,
                format_name=format_name,
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
            stored_keys.append(generated_audio.storage_key)
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

            # Update progress in a separate connection so the poll endpoint sees it
            # without breaking the main atomic transaction
            new_pct = min(95, 20 + int((index / max(total_parts, 1)) * 70))
            _update_job_progress(job.id, new_pct)

        podcast.total_duration_sec = total_duration_sec
        job.status = "completed"
        job.progress_pct = 100
        job.result_podcast_id = podcast_id
        job.updated_at = datetime.now(UTC)
        db.commit()
        return True

    except Exception as exc:
        db.rollback()
        # Clean up any audio files already written to storage
        for key in stored_keys:
            try:
                storage.delete(key)
            except Exception:
                logger.warning("Cleanup basarisiz, storage key: %s", key)
        failed = db.get(GenerationJobModel, job.id)
        if failed is not None:
            failed.status = "failed"
            failed.progress_pct = 100
            failed.error = str(exc)
            failed.updated_at = datetime.now(UTC)
            db.commit()
        return True


def _build_auto_part_titles(
    *,
    assets: list[UploadAssetModel],
    asset_text_cache: dict[str, str],
    format_name: str,
) -> list[str]:
    titles: list[str] = []
    remaining = settings.generation_max_parts
    chars_per_part = max(600, _resolve_auto_chars_per_part(format_name=format_name))

    for asset in assets:
        if remaining <= 0:
            break

        text_len = len(asset_text_cache.get(asset.id, ""))
        estimated_parts = max(1, (text_len + chars_per_part - 1) // chars_per_part)
        part_count = min(estimated_parts, remaining)
        base_title = _asset_base_title(asset.filename)

        if part_count == 1:
            titles.append(base_title)
        else:
            for index in range(1, part_count + 1):
                titles.append(f"{base_title} - Bolum {index}")

        remaining -= part_count

    if not titles:
        return [asset.filename for asset in assets[: settings.generation_max_parts]]

    return titles


def _matches_default_file_sections(*, section_titles: list[str], assets: list[UploadAssetModel]) -> bool:
    if len(section_titles) != len(assets):
        return False

    normalized_sections = [_normalize_title(title) for title in section_titles]
    normalized_assets = [_normalize_title(_asset_base_title(asset.filename)) for asset in assets]
    return normalized_sections == normalized_assets


def _asset_base_title(filename: str) -> str:
    stem = Path(filename or "").stem.strip()
    return stem or "Yeni Bolum"


def _normalize_title(value: str) -> str:
    return re.sub(r"\W+", "", value.lower())


def _resolve_auto_chars_per_part(*, format_name: str) -> int:
    normalized = (format_name or "").lower()
    if normalized == "summary":
        preferred = settings.script_auto_chars_per_part_summary
    elif normalized == "qa":
        preferred = settings.script_auto_chars_per_part_qa
    else:
        preferred = settings.script_auto_chars_per_part_narrative
    if preferred <= 0:
        return settings.script_auto_chars_per_part
    return min(preferred, settings.script_auto_chars_per_part)


def reap_stale_processing_jobs(db: Session, *, max_age_minutes: int | None = None) -> int:
    """Reset jobs stuck in 'processing' for longer than max_age_minutes back to 'failed'.

    Returns the number of reaped jobs.
    """
    if max_age_minutes is None:
        max_age_minutes = settings.worker_stale_job_max_age_minutes
    cutoff = datetime.now(UTC) - timedelta(minutes=max_age_minutes)
    result = db.execute(
        update(GenerationJobModel)
        .where(
            GenerationJobModel.status == "processing",
            GenerationJobModel.updated_at < cutoff,
        )
        .values(
            status="failed",
            progress_pct=100,
            error=f"Worker zaman asimi — {max_age_minutes} dakika icerisinde tamamlanamadi",
            updated_at=datetime.now(UTC),
        )
    )
    reaped = result.rowcount
    if reaped:
        db.commit()
        logger.warning("Stale processing job'lar failed'a cekildi: %d adet", reaped)
    return reaped


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


def _update_job_progress(job_id: str, progress_pct: int) -> None:
    """Update job progress in a separate short-lived session so poll endpoint sees it."""
    try:
        with SessionLocal() as progress_db:
            progress_db.execute(
                update(GenerationJobModel)
                .where(GenerationJobModel.id == job_id)
                .values(progress_pct=progress_pct, updated_at=datetime.now(UTC))
            )
            progress_db.commit()
    except Exception:
        pass  # Non-critical — progress display only


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
