import json
import logging
import math
import re
import time as _time
import wave
from dataclasses import dataclass
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
from app.services.script_generation import (
    build_asset_context_cache,
    build_asset_text_cache,
    build_part_script,
)
from app.services.storage import StorageClient
from app.services.tts import TTSService, get_tts_service

logger = logging.getLogger("tusbina-generation")

FORMAT_PART_DURATION_SEC = {
    "narrative": 420,
    "summary": 300,
    "qa": 360,
}


@dataclass(frozen=True)
class _AutoPartPlan:
    title: str
    asset_id: str
    asset_part_index: int
    asset_part_total: int


def _trace_generation(job_id: str, stage: str, **fields: object) -> None:
    payload = {"job_id": job_id[:8], "stage": stage, **fields}
    logger.info("GEN_TRACE %s", json.dumps(payload, ensure_ascii=False, default=str))


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
    job_started_at = _time.monotonic()
    current_stage = "claimed"
    stored_keys: list[str] = []
    _trace_generation(
        job.id,
        "claimed",
        user_id=job.user_id,
        tts_service=tts_service.__class__.__name__,
    )

    try:
        current_stage = "payload_loaded"
        payload = job.payload_json
        file_ids = payload.get("file_ids", [])
        if not file_ids:
            raise ValueError("No file_ids provided for generation")
        _trace_generation(
            job.id,
            "payload_loaded",
            file_count=len(file_ids),
            format=payload.get("format"),
            section_count=len(payload.get("sections", [])),
        )

        current_stage = "assets_query"
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
        _trace_generation(
            job.id,
            "assets_resolved",
            asset_count=len(assets),
            missing_count=len(missing_ids),
            asset_ids=[asset.id[:8] for asset in assets],
        )

        current_stage = "asset_text_extract"
        t_asset = _time.monotonic()
        asset_text_cache = build_asset_text_cache(assets=assets, storage=storage)
        asset_context_cache = build_asset_context_cache(assets=assets, asset_text_cache=asset_text_cache)
        _trace_generation(
            job.id,
            "asset_text_ready",
            elapsed_sec=round(_time.monotonic() - t_asset, 2),
            text_lengths={a.id[:8]: len(asset_text_cache.get(a.id, "")) for a in assets},
        )
        logger.info(
            "Job %s: %d asset, text lengths: %s",
            job.id[:8],
            len(assets),
            {a.id[:8]: len(asset_text_cache.get(a.id, "")) for a in assets},
        )
        sections = payload.get("sections", [])
        enabled_sections = [section for section in sections if section.get("enabled", True)]
        if sections and not enabled_sections:
            raise ValueError("All sections are disabled")
        section_titles = [section.get("title", "").strip() for section in enabled_sections if section.get("title")]

        auto_part_plan: list[_AutoPartPlan] | None = None
        if section_titles and not _matches_default_file_sections(section_titles=section_titles, assets=assets):
            part_titles = section_titles
            _trace_generation(job.id, "part_plan_manual_sections", part_count=len(part_titles))
        else:
            auto_part_plan = _build_auto_part_plan(
                assets=assets,
                asset_text_cache=asset_text_cache,
                format_name=str(payload.get("format", "narrative")),
            )
            part_titles = [entry.title for entry in auto_part_plan]
            _trace_generation(
                job.id,
                "part_plan_auto",
                part_count=len(part_titles),
                sample_titles=part_titles[:6],
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
        logger.info("Job %s: %d parts, titles=%s", job.id[:8], total_parts, part_titles[:5])
        total_duration_sec = 0
        for index, part_title in enumerate(part_titles, start=1):
            plan_entry = auto_part_plan[index - 1] if auto_part_plan and index <= len(auto_part_plan) else None
            current_stage = f"part_{index}_script"
            _trace_generation(
                job.id,
                "part_start",
                part=index,
                total_parts=total_parts,
                title=part_title,
                tts_service=tts_service.__class__.__name__,
                source_asset=(plan_entry.asset_id[:8] if plan_entry else None),
                source_slice_index=(plan_entry.asset_part_index if plan_entry else index),
                source_slice_total=(plan_entry.asset_part_total if plan_entry else total_parts),
            )
            _heartbeat_processing_job(job.id, primary_db=db)
            t0 = _time.monotonic()
            script = build_part_script(
                part_title=part_title,
                format_name=format_name,
                index=index,
                total=total_parts,
                assets=assets,
                storage=storage,
                asset_text_cache=asset_text_cache,
                asset_context_cache=asset_context_cache,
                preferred_asset_id=plan_entry.asset_id if plan_entry else None,
                source_slice_index=plan_entry.asset_part_index if plan_entry else None,
                source_slice_total=plan_entry.asset_part_total if plan_entry else None,
            )
            t_script = _time.monotonic() - t0
            _trace_generation(
                job.id,
                "part_script_done",
                part=index,
                elapsed_sec=round(t_script, 2),
                script_chars=len(script),
            )
            logger.info(
                "Job %s part %d/%d: script done (%.1fs, %d chars)",
                job.id[:8],
                index,
                total_parts,
                t_script,
                len(script),
            )

            current_stage = f"part_{index}_tts"
            _heartbeat_processing_job(job.id, primary_db=db)
            t1 = _time.monotonic()
            tts_audio = tts_service.synthesize(script, voice=payload.get("voice"))
            t_tts = _time.monotonic() - t1
            _trace_generation(
                job.id,
                "part_tts_done",
                part=index,
                elapsed_sec=round(t_tts, 2),
                audio_bytes=len(tts_audio.content),
                extension=tts_audio.extension,
            )
            logger.info(
                "Job %s part %d/%d: TTS done (%.1fs, %d bytes)",
                job.id[:8],
                index,
                total_parts,
                t_tts,
                len(tts_audio.content),
            )
            part_duration_sec = _duration_from_wav_bytes(tts_audio.content) or default_duration_sec

            generated_audio = storage.save_bytes(
                filename=f"{podcast_id}-part-{index}.{tts_audio.extension}",
                content=tts_audio.content,
                content_type=tts_audio.content_type,
                user_id=job.user_id,
            )
            stored_keys.append(generated_audio.storage_key)
            current_stage = f"part_{index}_db_save"
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
            _trace_generation(
                job.id,
                "part_saved",
                part=index,
                duration_sec=part_duration_sec,
                storage_key=generated_audio.storage_key,
            )

            # Update progress in a separate connection so the poll endpoint sees it
            # without breaking the main atomic transaction
            new_pct = min(95, 20 + int((index / max(total_parts, 1)) * 70))
            _heartbeat_processing_job(job.id, progress_pct=new_pct, primary_db=db)

        podcast.total_duration_sec = total_duration_sec
        job.status = "completed"
        job.progress_pct = 100
        job.result_podcast_id = podcast_id
        job.updated_at = datetime.now(UTC)
        db.commit()
        _trace_generation(
            job.id,
            "completed",
            total_parts=total_parts,
            total_duration_sec=total_duration_sec,
            elapsed_sec=round(_time.monotonic() - job_started_at, 2),
            podcast_id=podcast_id,
        )
        return True

    except Exception as exc:
        db.rollback()
        _trace_generation(
            job.id,
            "failed",
            failed_stage=current_stage,
            elapsed_sec=round(_time.monotonic() - job_started_at, 2),
            error=str(exc),
        )
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


def _build_auto_part_plan(
    *,
    assets: list[UploadAssetModel],
    asset_text_cache: dict[str, str],
    format_name: str,
) -> list[_AutoPartPlan]:
    plans: list[_AutoPartPlan] = []
    remaining = settings.generation_max_parts

    for asset in assets:
        if remaining <= 0:
            break

        text_len = len(asset_text_cache.get(asset.id, ""))
        chars_per_part = _resolve_auto_chars_per_part(format_name=format_name, text_len=text_len)
        estimated_parts = max(1, (text_len + chars_per_part - 1) // chars_per_part)
        part_count = min(estimated_parts, remaining)
        base_title = _asset_base_title(asset.filename)

        if part_count == 1:
            plans.append(
                _AutoPartPlan(
                    title=base_title,
                    asset_id=asset.id,
                    asset_part_index=1,
                    asset_part_total=1,
                )
            )
        else:
            for part_index in range(1, part_count + 1):
                plans.append(
                    _AutoPartPlan(
                        title=f"{base_title} - Bolum {part_index}",
                        asset_id=asset.id,
                        asset_part_index=part_index,
                        asset_part_total=part_count,
                    )
                )

        remaining -= part_count

    if not plans:
        return [
            _AutoPartPlan(
                title=asset.filename or "Yeni Bolum",
                asset_id=asset.id,
                asset_part_index=1,
                asset_part_total=1,
            )
            for asset in assets[: settings.generation_max_parts]
        ]

    return plans


def _build_auto_part_titles(
    *,
    assets: list[UploadAssetModel],
    asset_text_cache: dict[str, str],
    format_name: str,
) -> list[str]:
    return [
        entry.title
        for entry in _build_auto_part_plan(
            assets=assets,
            asset_text_cache=asset_text_cache,
            format_name=format_name,
        )
    ]


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


def _resolve_auto_chars_per_part(*, format_name: str, text_len: int | None = None) -> int:
    normalized = (format_name or "").lower()
    if normalized == "summary":
        preferred = settings.script_auto_chars_per_part_summary
    elif normalized == "qa":
        preferred = settings.script_auto_chars_per_part_qa
    else:
        preferred = settings.script_auto_chars_per_part_narrative

    baseline = max(600, settings.script_auto_chars_per_part)
    if preferred > 0:
        baseline = max(600, min(preferred, baseline))

    target_parts = settings.generation_target_max_parts
    if text_len and text_len > 0 and target_parts > 0:
        baseline = max(baseline, math.ceil(text_len / target_parts))

    upper_bound = max(600, settings.script_source_max_chars)
    return min(baseline, upper_bound)


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


def _heartbeat_processing_job(
    job_id: str,
    progress_pct: int | None = None,
    *,
    primary_db: Session | None = None,
) -> None:
    """Keep processing job alive via short-lived updates that do not commit main work."""
    try:
        values: dict[str, object] = {"updated_at": datetime.now(UTC)}
        if progress_pct is not None:
            values["progress_pct"] = progress_pct
        stmt = (
            update(GenerationJobModel)
            .where(
                GenerationJobModel.id == job_id,
                GenerationJobModel.status == "processing",
            )
            .values(**values)
        )

        # SQLite test/local mode can deadlock if we open another writer session.
        if primary_db is not None and primary_db.get_bind().dialect.name == "sqlite":
            primary_db.execute(stmt)
            primary_db.flush()
            return

        with SessionLocal() as progress_db:
            progress_db.execute(stmt)
            progress_db.commit()
    except Exception:
        pass  # Non-critical — heartbeat/progress only


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
