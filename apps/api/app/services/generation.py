import json
import logging
import math
import re
import time as _time
import wave
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html import escape
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import numpy as np
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
from app.services.tts import TTSResult, TTSService, get_tts_service

logger = logging.getLogger("tusbina-generation")

try:
    from mutagen.mp3 import MP3
except Exception:  # pragma: no cover - dependency availability is environment-specific
    MP3 = None

FORMAT_PART_DURATION_SEC = {
    "narrative": 420,
    "summary": 300,
    "qa": 360,
}

_PLACEHOLDER_SECTION_TITLE_RE = re.compile(
    r"^(yeni bolum \d+|bolum \d+|bölüm \d+)$",
    flags=re.IGNORECASE,
)

_HEADING_KEYWORD_RE = re.compile(
    r"\b(bolum|bölüm|unit[eé]|unite|konu|baslik|başlık|chapter|section|adim|adım|olgu)\b",
    flags=re.IGNORECASE,
)


@dataclass(frozen=True)
class _AutoPartPlan:
    title: str
    asset_id: str | None
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


def job_to_status_schema(job: GenerationJobModel, db: Session) -> GeneratePodcastStatusOut:
    audio_ready_parts = 0
    audio_total_parts = 0
    plan_ready = bool(job.result_podcast_id)

    if job.result_podcast_id:
        parts = db.execute(
            select(PodcastPartModel.status).where(PodcastPartModel.podcast_id == job.result_podcast_id)
        ).scalars().all()
        audio_total_parts = len(parts)
        audio_ready_parts = sum(1 for status in parts if status == "ready")

    return GeneratePodcastStatusOut(
        job_id=job.id,
        status=job.status,
        progress_pct=job.progress_pct,
        plan_ready=plan_ready,
        audio_ready_parts=audio_ready_parts,
        audio_total_parts=audio_total_parts,
        result_podcast_id=job.result_podcast_id,
        error=job.error,
    )


def process_next_generation_job(db: Session, *, storage: StorageClient, tts: TTSService | None = None) -> bool:
    job = _claim_next_generation_job(db)
    if job is None:
        return False

    job_started_at = _time.monotonic()
    current_stage = "claimed"
    _trace_generation(
        job.id,
        "claimed",
        user_id=job.user_id,
        mode="plan_only",
    )

    try:
        current_stage = "payload_loaded"
        payload = job.payload_json
        file_ids = payload.get("file_ids", [])
        requested_cover_file_id = payload.get("cover_file_id")
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
        asset_ids = list(
            dict.fromkeys([*file_ids, *([requested_cover_file_id] if requested_cover_file_id else [])])
        )
        assets = _resolve_generation_assets(db, file_ids=asset_ids, user_id=job.user_id)
        content_assets = [asset for asset in assets if _asset_can_generate_parts(asset)]
        if not content_assets:
            raise ValueError("Metin içeriği bulunan en az bir PDF veya metin dosyası gerekli.")
        _trace_generation(
            job.id,
            "assets_resolved",
            asset_count=len(assets),
            asset_ids=[asset.id[:8] for asset in assets],
        )

        current_stage = "asset_text_extract"
        t_asset = _time.monotonic()
        asset_text_cache = build_asset_text_cache(assets=content_assets, storage=storage)
        _trace_generation(
            job.id,
            "asset_text_ready",
            elapsed_sec=round(_time.monotonic() - t_asset, 2),
            text_lengths={a.id[:8]: len(asset_text_cache.get(a.id, "")) for a in content_assets},
        )
        logger.info(
            "Job %s: %d asset, text lengths: %s",
            job.id[:8],
            len(content_assets),
            {a.id[:8]: len(asset_text_cache.get(a.id, "")) for a in content_assets},
        )
        format_name = str(payload.get("format", "narrative"))
        selected_voice = str(payload.get("voice", "Elif"))
        cover_asset = _resolve_cover_asset(
            assets=assets,
            requested_cover_file_id=requested_cover_file_id,
        )

        part_plan = _build_part_plan(
            job_id=job.id,
            payload=payload,
            assets=content_assets,
            asset_text_cache=asset_text_cache,
            format_name=format_name,
        )
        if len(part_plan) > settings.generation_max_parts:
            raise ValueError(
                f"Part limiti asildi: {len(part_plan)} > {settings.generation_max_parts}"
            )

        default_duration_sec = FORMAT_PART_DURATION_SEC.get(format_name, 420)
        podcast_id = f"pod-{uuid4().hex[:12]}"
        podcast = PodcastModel(
            id=podcast_id,
            user_id=job.user_id,
            title=payload.get("title", "Yeni Podcast"),
            source_type="ai",
            voice=selected_voice,
            format=payload.get("format", "narrative"),
            total_duration_sec=default_duration_sec * len(part_plan),
            cover_image_url=None,
            cover_image_source=None,
            course_id=payload.get("course_id"),
        )
        cover_image = _resolve_or_generate_cover_image(
            storage=storage,
            podcast=podcast,
            part_plan=part_plan,
            cover_asset=cover_asset,
            user_id=job.user_id,
        )
        podcast.cover_image_url = cover_image["url"]
        podcast.cover_image_source = cover_image["source"]
        db.add(podcast)
        db.flush()
        planned_parts: list[PodcastPartModel] = []
        for index, plan_entry in enumerate(part_plan, start=1):
            planned_parts.append(
                PodcastPartModel(
                    id=f"{podcast_id}-part-{index}",
                    podcast_id=podcast_id,
                    title=plan_entry.title,
                    duration_sec=default_duration_sec,
                    page_range=f"s{plan_entry.asset_part_index}/{max(plan_entry.asset_part_total, 1)}",
                    status="queued",
                    sort_order=index,
                    queue_priority=0,
                    source_asset_id=plan_entry.asset_id,
                    source_slice_index=max(plan_entry.asset_part_index, 1),
                    source_slice_total=max(plan_entry.asset_part_total, 1),
                    audio_url=None,
                )
            )
        db.add_all(planned_parts)
        if planned_parts:
            db.flush()
            prioritize_podcast_part_window(
                db,
                podcast_id=podcast_id,
                part_id=planned_parts[0].id,
                commit=False,
            )
        job.status = "completed"
        job.progress_pct = 100
        job.result_podcast_id = podcast_id
        job.updated_at = datetime.now(UTC)
        db.commit()
        _trace_generation(
            job.id,
            "completed",
            total_parts=len(part_plan),
            total_duration_sec=podcast.total_duration_sec,
            elapsed_sec=round(_time.monotonic() - job_started_at, 2),
            podcast_id=podcast_id,
            planned_only=True,
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
        failed = db.get(GenerationJobModel, job.id)
        if failed is not None:
            failed.status = "failed"
            failed.progress_pct = 100
            failed.error = str(exc)
            failed.updated_at = datetime.now(UTC)
            db.commit()
        return True


def process_next_podcast_part_generation(
    db: Session,
    *,
    storage: StorageClient,
    tts: TTSService | None = None,
) -> bool:
    part = _claim_next_podcast_part(db)
    if part is None:
        return False

    tts_service = tts or get_tts_service()
    started_at = _time.monotonic()
    current_stage = "claimed"
    stored_key: str | None = None
    try:
        podcast = db.get(PodcastModel, part.podcast_id)
        if podcast is None:
            raise ValueError("Podcast not found for queued part")

        generation_job = db.execute(
            select(GenerationJobModel)
            .where(
                GenerationJobModel.user_id == podcast.user_id,
                GenerationJobModel.result_podcast_id == podcast.id,
            )
            .order_by(GenerationJobModel.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if generation_job is None:
            raise ValueError("Generation payload not found for podcast")

        payload = generation_job.payload_json
        file_ids = payload.get("file_ids", [])
        assets = _resolve_generation_assets(db, file_ids=file_ids, user_id=podcast.user_id)
        content_assets = [asset for asset in assets if _asset_can_generate_parts(asset)]
        asset_text_cache = build_asset_text_cache(assets=content_assets, storage=storage)
        asset_context_cache = build_asset_context_cache(assets=content_assets, asset_text_cache=asset_text_cache)
        dialogue_mode = _is_dialogue_mode(format_name=podcast.format, voice_name=podcast.voice)
        total_parts = max(len(podcast.parts), 1)
        current_stage = "script"
        _trace_generation(
            part.id,
            "part_start",
            podcast_id=podcast.id,
            part_id=part.id,
            sort_order=part.sort_order,
            total_parts=total_parts,
            title=part.title,
        )
        script = build_part_script(
            part_title=part.title,
            format_name=podcast.format,
            voice_name=podcast.voice,
            index=max(part.sort_order, 1),
            total=total_parts,
            assets=content_assets,
            storage=storage,
            asset_text_cache=asset_text_cache,
            asset_context_cache=asset_context_cache,
            preferred_asset_id=part.source_asset_id,
            source_slice_index=part.source_slice_index,
            source_slice_total=part.source_slice_total,
            dialogue_mode=dialogue_mode,
        )
        current_stage = "tts"
        tts_audio = _synthesize_part_audio(
            tts_service=tts_service,
            script=script,
            selected_voice=podcast.voice,
            dialogue_mode=dialogue_mode,
        )
        default_duration_sec = FORMAT_PART_DURATION_SEC.get(podcast.format, 420)
        part_duration_sec = _duration_from_audio_bytes(tts_audio.content, extension=tts_audio.extension) or default_duration_sec
        generated_audio = storage.save_bytes(
            filename=f"{podcast.id}-part-{part.sort_order}.{tts_audio.extension}",
            content=tts_audio.content,
            content_type=tts_audio.content_type,
            user_id=podcast.user_id,
        )
        stored_key = generated_audio.storage_key
        previous_duration_sec = part.duration_sec
        part.duration_sec = part_duration_sec
        part.audio_url = generated_audio.public_url
        part.status = "ready"
        part.queue_priority = 0
        part.updated_at = datetime.now(UTC)
        podcast.total_duration_sec = max(0, podcast.total_duration_sec - previous_duration_sec + part_duration_sec)
        db.commit()
        _trace_generation(
            part.id,
            "part_completed",
            podcast_id=podcast.id,
            part_id=part.id,
            duration_sec=part_duration_sec,
            elapsed_sec=round(_time.monotonic() - started_at, 2),
        )
        return True
    except Exception as exc:
        db.rollback()
        if stored_key is not None:
            try:
                storage.delete(stored_key)
            except Exception:
                logger.warning("Cleanup basarisiz, storage key: %s", stored_key)
        failed_part = db.get(PodcastPartModel, part.id)
        if failed_part is not None:
            failed_part.status = "failed"
            failed_part.queue_priority = 0
            failed_part.updated_at = datetime.now(UTC)
            db.commit()
        _trace_generation(
            part.id,
            "part_failed",
            failed_stage=current_stage,
            elapsed_sec=round(_time.monotonic() - started_at, 2),
            error=str(exc),
        )
        return True


def prioritize_podcast_part_window(
    db: Session,
    *,
    podcast_id: str,
    part_id: str,
    commit: bool = True,
) -> None:
    parts = _load_podcast_parts(db, podcast_id=podcast_id)
    if not parts:
        raise ValueError("Podcast has no parts")

    anchor_index = next((index for index, part in enumerate(parts) if part.id == part_id), None)
    if anchor_index is None:
        raise ValueError("Podcast part not found")

    for part in parts:
        if part.status in {"queued", "failed"}:
            part.queue_priority = 0

    window_size = max(1, int(settings.generation_priority_window))
    priority_value = 1000
    ordered_candidates = parts[anchor_index:] + parts[:anchor_index]
    for part in ordered_candidates:
        if part.status == "ready":
            continue
        if part.status == "failed":
            part.status = "queued"
            part.audio_url = None
        if part.status in {"queued", "processing"}:
            part.queue_priority = priority_value
            priority_value -= 1
            if 1000 - priority_value >= window_size:
                break

    if commit:
        db.commit()


def reorder_podcast_parts(
    db: Session,
    *,
    podcast_id: str,
    part_ids: list[str],
    commit: bool = True,
) -> None:
    parts = _load_podcast_parts(db, podcast_id=podcast_id)
    if not parts:
        raise ValueError("Podcast has no parts")

    current_ids = [part.id for part in parts]
    if len(current_ids) != len(part_ids) or set(current_ids) != set(part_ids):
        raise ValueError("Part order payload is invalid")

    parts_by_id = {part.id: part for part in parts}
    for index, current_id in enumerate(part_ids, start=1):
        parts_by_id[current_id].sort_order = index

    anchor_part_id = next((part_id for part_id in part_ids if parts_by_id[part_id].status != "ready"), part_ids[0])
    prioritize_podcast_part_window(db, podcast_id=podcast_id, part_id=anchor_part_id, commit=False)
    if commit:
        db.commit()


def _resolve_generation_assets(db: Session, *, file_ids: list[str], user_id: str) -> list[UploadAssetModel]:
    assets_unordered = list(
        db.execute(
            select(UploadAssetModel).where(
                UploadAssetModel.id.in_(file_ids),
                UploadAssetModel.user_id == user_id,
            )
        ).scalars().all()
    )
    if not assets_unordered:
        raise ValueError("No uploaded assets found")

    id_order = {fid: idx for idx, fid in enumerate(file_ids)}
    assets = sorted(assets_unordered, key=lambda asset: id_order.get(asset.id, len(file_ids)))
    found_ids = {asset.id for asset in assets}
    missing_ids = [file_id for file_id in file_ids if file_id not in found_ids]
    if missing_ids:
        raise ValueError(f"Some uploaded assets were not found: {', '.join(missing_ids[:3])}")
    return assets


def _asset_extension(asset: UploadAssetModel) -> str:
    return Path(asset.filename or "").suffix.lower().lstrip(".")


def _asset_can_generate_parts(asset: UploadAssetModel) -> bool:
    extension = _asset_extension(asset)
    content_type = (asset.content_type or "").lower()
    return extension in {"pdf", "txt", "md"} or "pdf" in content_type or content_type.startswith("text/")


def _asset_is_image(asset: UploadAssetModel) -> bool:
    extension = _asset_extension(asset)
    content_type = (asset.content_type or "").lower()
    return extension in {"png", "jpg", "jpeg", "webp", "gif"} or content_type.startswith("image/")


def _resolve_cover_asset(
    *,
    assets: list[UploadAssetModel],
    requested_cover_file_id: str | None,
) -> UploadAssetModel | None:
    if requested_cover_file_id:
        requested = next((asset for asset in assets if asset.id == requested_cover_file_id), None)
        if requested is not None and _asset_is_image(requested):
            return requested

    return next((asset for asset in assets if _asset_is_image(asset)), None)


def _build_part_plan(
    *,
    job_id: str,
    payload: dict,
    assets: list[UploadAssetModel],
    asset_text_cache: dict[str, str],
    format_name: str,
) -> list[_AutoPartPlan]:
    sections = payload.get("sections", [])
    enabled_sections = [section for section in sections if section.get("enabled", True)]
    if sections and not enabled_sections:
        raise ValueError("All sections are disabled")

    section_titles = [section.get("title", "").strip() for section in enabled_sections if section.get("title")]
    use_auto_plan = not section_titles
    if section_titles and _sections_look_like_defaults(section_titles=section_titles, assets=assets):
        use_auto_plan = True
        _trace_generation(
            job_id,
            "part_plan_override_defaults",
            reason="sections_match_file_defaults",
            section_count=len(section_titles),
        )

    if use_auto_plan:
        auto_part_plan = _build_auto_part_plan(
            assets=assets,
            asset_text_cache=asset_text_cache,
            format_name=format_name,
        )
        _trace_generation(
            job_id,
            "part_plan_auto",
            part_count=len(auto_part_plan),
            sample_titles=[entry.title for entry in auto_part_plan[:6]],
        )
        return auto_part_plan

    manual_plan = _build_manual_part_plan(enabled_sections=enabled_sections, assets=assets)
    _trace_generation(job_id, "part_plan_manual_sections", part_count=len(manual_plan))
    return manual_plan


def _build_manual_part_plan(
    *,
    enabled_sections: list[dict],
    assets: list[UploadAssetModel],
) -> list[_AutoPartPlan]:
    if not enabled_sections:
        return []

    valid_asset_ids = {asset.id for asset in assets}
    assigned_asset_ids: list[str | None] = []
    for index, section in enumerate(enabled_sections):
        source_file_id = section.get("source_file_id")
        if source_file_id in valid_asset_ids:
            assigned_asset_ids.append(str(source_file_id))
            continue
        fallback_asset = assets[min(index, len(assets) - 1)] if assets else None
        assigned_asset_ids.append(fallback_asset.id if fallback_asset else None)

    total_by_asset: dict[str, int] = {}
    for asset_id in assigned_asset_ids:
        if asset_id is None:
            continue
        total_by_asset[asset_id] = total_by_asset.get(asset_id, 0) + 1

    seen_by_asset: dict[str, int] = {}
    total_parts = len(enabled_sections)
    plan: list[_AutoPartPlan] = []
    for index, section in enumerate(enabled_sections, start=1):
        asset_id = assigned_asset_ids[index - 1]
        if asset_id is None:
            plan.append(
                _AutoPartPlan(
                    title=section.get("title", "").strip(),
                    asset_id=None,
                    asset_part_index=index,
                    asset_part_total=total_parts,
                )
            )
            continue

        seen_by_asset[asset_id] = seen_by_asset.get(asset_id, 0) + 1
        plan.append(
            _AutoPartPlan(
                title=section.get("title", "").strip(),
                asset_id=asset_id,
                asset_part_index=seen_by_asset[asset_id],
                asset_part_total=total_by_asset.get(asset_id, 1),
            )
        )
    return plan


def _load_podcast_parts(db: Session, *, podcast_id: str) -> list[PodcastPartModel]:
    return list(
        db.execute(
            select(PodcastPartModel)
            .where(PodcastPartModel.podcast_id == podcast_id)
            .order_by(PodcastPartModel.sort_order.asc(), PodcastPartModel.id.asc())
        ).scalars().all()
    )


def _claim_next_podcast_part(db: Session) -> PodcastPartModel | None:
    stmt: Select[tuple[PodcastPartModel]] = (
        select(PodcastPartModel)
        .where(
            PodcastPartModel.status == "queued",
            PodcastPartModel.queue_priority > 0,
        )
        .order_by(
            PodcastPartModel.queue_priority.desc(),
            PodcastPartModel.sort_order.asc(),
            PodcastPartModel.updated_at.asc(),
        )
        .limit(1)
    )
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)

    part = db.execute(stmt).scalar_one_or_none()
    if part is None:
        return None

    part.status = "processing"
    part.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(part)
    return part


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

        source_text = asset_text_cache.get(asset.id, "")
        text_len = len(source_text)
        chars_per_part = _resolve_auto_chars_per_part(format_name=format_name, text_len=text_len)
        estimated_parts = max(1, (text_len + chars_per_part - 1) // chars_per_part)
        base_title = _asset_base_title(asset.filename)
        heading_titles = _extract_heading_titles(source_text, max_count=min(remaining, max(estimated_parts * 2, 1)))
        if heading_titles:
            part_count = min(len(heading_titles), remaining)
        else:
            part_count = min(estimated_parts, remaining)

        if part_count == 1:
            title = heading_titles[0] if heading_titles else base_title
            plans.append(
                _AutoPartPlan(
                    title=title,
                    asset_id=asset.id,
                    asset_part_index=1,
                    asset_part_total=1,
                )
            )
        else:
            for part_index in range(1, part_count + 1):
                if part_index <= len(heading_titles):
                    part_title = heading_titles[part_index - 1]
                else:
                    part_title = f"{base_title} - Bolum {part_index}"
                plans.append(
                    _AutoPartPlan(
                        title=part_title,
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


def _resolve_or_generate_cover_image(
    *,
    storage: StorageClient,
    podcast: PodcastModel,
    part_plan: list[_AutoPartPlan],
    cover_asset: UploadAssetModel | None,
    user_id: str,
) -> dict[str, str | None]:
    if cover_asset is not None:
        return {"url": cover_asset.public_url, "source": "uploaded"}

    cover_bytes = _build_generated_cover_svg(
        title=podcast.title,
        voice=podcast.voice,
        format_name=podcast.format,
        lead_part_title=part_plan[0].title if part_plan else None,
    )
    stored = storage.save_bytes(
        filename=f"{podcast.id}-cover.svg",
        content=cover_bytes,
        content_type="image/svg+xml",
        user_id=user_id,
    )
    return {"url": stored.public_url, "source": "generated"}


def _build_generated_cover_svg(
    *,
    title: str,
    voice: str,
    format_name: str,
    lead_part_title: str | None,
) -> bytes:
    safe_title = _truncate_cover_text(title or "Yeni Podcast", limit=38)
    safe_voice = _truncate_cover_text(voice or "Elif", limit=22)
    safe_format = _truncate_cover_text(_format_label(format_name), limit=18)
    safe_lead = _truncate_cover_text(lead_part_title or "Akıllı bölümleme", limit=34)
    initials = _cover_initials(title)

    svg = f"""
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="120" y1="80" x2="1080" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0D1123"/>
      <stop offset="0.55" stop-color="#1D2B4A"/>
      <stop offset="1" stop-color="#3C536D"/>
    </linearGradient>
    <linearGradient id="accent" x1="190" y1="170" x2="1010" y2="1040" gradientUnits="userSpaceOnUse">
      <stop stop-color="#BF5F3E"/>
      <stop offset="1" stop-color="#BD9465"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" rx="92" fill="url(#bg)"/>
  <circle cx="962" cy="254" r="164" fill="url(#accent)" opacity="0.18"/>
  <circle cx="222" cy="958" r="220" fill="#BF5F3E" opacity="0.11"/>
  <rect x="116" y="118" width="968" height="964" rx="68" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
  <text x="160" y="220" fill="#BD9465" font-family="Arial, sans-serif" font-size="40" font-weight="700" letter-spacing="10">TUSBINA</text>
  <rect x="160" y="280" width="244" height="244" rx="56" fill="url(#accent)"/>
  <text x="282" y="436" text-anchor="middle" fill="#0D1123" font-family="Arial, sans-serif" font-size="110" font-weight="700">{escape(initials)}</text>
  <text x="160" y="640" fill="#F7F5F2" font-family="Arial, sans-serif" font-size="84" font-weight="700">{escape(safe_title)}</text>
  <text x="160" y="724" fill="rgba(247,245,242,0.72)" font-family="Arial, sans-serif" font-size="42">{escape(safe_lead)}</text>
  <rect x="160" y="822" width="230" height="72" rx="36" fill="rgba(191,95,62,0.16)" stroke="rgba(191,95,62,0.36)" stroke-width="2"/>
  <text x="276" y="867" text-anchor="middle" fill="#F7F5F2" font-family="Arial, sans-serif" font-size="32" font-weight="700">{escape(safe_format)}</text>
  <text x="160" y="972" fill="#F7F5F2" font-family="Arial, sans-serif" font-size="40" font-weight="600">Ses: {escape(safe_voice)}</text>
  <text x="160" y="1034" fill="rgba(247,245,242,0.68)" font-family="Arial, sans-serif" font-size="28">Belge içeriğinden otomatik kapak</text>
</svg>
""".strip()
    return svg.encode("utf-8")


def _truncate_cover_text(value: str, *, limit: int) -> str:
    compact = re.sub(r"\s+", " ", (value or "").strip())
    if len(compact) <= limit:
        return compact
    return compact[: max(1, limit - 1)].rstrip() + "…"


def _cover_initials(title: str) -> str:
    tokens = [token[:1].upper() for token in re.split(r"[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+", title or "") if token]
    joined = "".join(tokens[:2]).strip()
    return joined or "TS"


def _format_label(format_name: str) -> str:
    normalized = (format_name or "").strip().lower()
    if normalized == "summary":
        return "Özet"
    if normalized == "qa":
        return "Soru-Cevap"
    return "Anlatım"


def _asset_base_title(filename: str) -> str:
    stem = Path(filename or "").stem.strip()
    return stem or "Yeni Bolum"


def _sections_look_like_defaults(*, section_titles: list[str], assets: list[UploadAssetModel]) -> bool:
    if len(section_titles) != len(assets) or not section_titles:
        return False

    default_titles = [_normalize_title_for_compare(_asset_base_title(asset.filename)) for asset in assets]
    normalized_sections = [_normalize_title_for_compare(title) for title in section_titles]
    all_match_file_names = normalized_sections == default_titles
    all_placeholder = all(_PLACEHOLDER_SECTION_TITLE_RE.fullmatch(title or "") for title in normalized_sections)
    return all_match_file_names or all_placeholder


def _normalize_title_for_compare(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[._-]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value


def _extract_heading_titles(text: str, *, max_count: int) -> list[str]:
    if not text.strip() or max_count <= 0:
        return []

    candidates: list[tuple[int, str]] = []
    for raw_line in text.splitlines():
        cleaned = _clean_heading_title(raw_line)
        if not cleaned:
            continue
        score = _score_heading_candidate(cleaned)
        if score <= 0:
            continue
        candidates.append((score, cleaned))

    if not candidates:
        return []

    # Prefer the strongest candidates but keep the source order for listening flow.
    scored = sorted(enumerate(candidates), key=lambda item: (-item[1][0], item[0]))
    selected_indexes = sorted(index for index, _ in scored[: max_count * 3])

    selected: list[str] = []
    seen: set[str] = set()
    for idx in selected_indexes:
        title = candidates[idx][1]
        key = _normalize_title_for_compare(title)
        if not key or key in seen:
            continue
        seen.add(key)
        selected.append(title)
        if len(selected) >= max_count:
            break

    return selected


def _clean_heading_title(raw_line: str) -> str:
    value = (raw_line or "").strip()
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"^[\-•·\s]+", "", value)
    value = re.sub(r"[\s\-:;,]+$", "", value)
    return value.strip()


def _score_heading_candidate(line: str) -> int:
    length = len(line)
    word_count = len(line.split())
    starts_with_index = bool(re.match(r"^(\d+(\.\d+){0,2}|[IVXLCM]{1,6}|[A-Z])[\)\.\-:\s]+", line))
    has_keyword = bool(_HEADING_KEYWORD_RE.search(line))
    if length < 4 or length > 120:
        return 0
    if word_count > 16 and not starts_with_index:
        return 0
    if line.endswith(".") and word_count > 6 and not starts_with_index:
        return 0
    if sum(ch.isdigit() for ch in line) > max(8, length // 3):
        return 0
    if line.count(".") >= 3 and line.count(" ") > 8:
        return 0

    score = 0
    if has_keyword:
        score += 5
    if starts_with_index:
        score += 4
    if re.match(r"^[A-ZÇĞİÖŞÜ0-9\s\-:]{4,120}$", line):
        score += 2
    if line.endswith(":"):
        score += 1
    if 12 <= length <= 72:
        score += 1
    if not starts_with_index and not has_keyword and any(ch in line for ch in ".?!"):
        score -= 2
    return score


def _is_dialogue_mode(*, format_name: str, voice_name: str) -> bool:
    normalized_voice = (voice_name or "").strip().lower()
    return "diyalog" in normalized_voice or format_name == "qa"


def _synthesize_part_audio(
    *,
    tts_service: TTSService,
    script: str,
    selected_voice: str,
    dialogue_mode: bool,
) -> TTSResult:
    if not dialogue_mode:
        return _synthesize_with_retry(tts_service=tts_service, text=script, voice=selected_voice)

    turns = _split_dialogue_turns(script)
    if not _is_forced_dual_voice(selected_voice=selected_voice) and _count_explicit_dialogue_turns(script) < 2:
        return _synthesize_with_retry(tts_service=tts_service, text=script, voice=selected_voice)
    if _is_forced_dual_voice(selected_voice=selected_voice):
        turns = _ensure_dual_voice_turns(turns=turns, script=script)
    if not turns:
        return _synthesize_with_retry(tts_service=tts_service, text=script, voice=selected_voice)

    audio_turns: list[bytes] = []
    try:
        worker_count = max(1, int(settings.piper_dialogue_parallel_workers))
        if worker_count == 1 or len(turns) <= 1:
            for speaker, text in turns:
                voice_for_turn = _resolve_dialogue_voice(speaker=speaker, selected_voice=selected_voice)
                result = _synthesize_with_retry(tts_service=tts_service, text=text, voice=voice_for_turn)
                audio_turns.append(result.content)
        else:
            with ThreadPoolExecutor(max_workers=min(worker_count, len(turns))) as executor:
                futures = [
                    executor.submit(
                        _synthesize_dialogue_turn,
                        tts_service=tts_service,
                        index=index,
                        speaker=speaker,
                        text=text,
                        selected_voice=selected_voice,
                    )
                    for index, (speaker, text) in enumerate(turns)
                ]
                ordered: list[bytes] = [b"" for _ in turns]
                for future in futures:
                    index, content = future.result()
                    ordered[index] = content
                audio_turns = ordered

        merged = _concat_wav_segments(
            audio_turns,
            gap_ms=max(0, int(settings.piper_dialogue_gap_ms)),
            fade_ms=max(0, int(settings.piper_dialogue_edge_fade_ms)),
        )
        return TTSResult(content=merged, extension="wav", content_type="audio/wav")
    except Exception as exc:
        logger.warning("Dialog TTS birlestirme fallback tek sese dondu: %s", exc)
        return _synthesize_with_retry(tts_service=tts_service, text=script, voice=selected_voice)


def _synthesize_dialogue_turn(
    *,
    tts_service: TTSService,
    index: int,
    speaker: str,
    text: str,
    selected_voice: str,
) -> tuple[int, bytes]:
    voice_for_turn = _resolve_dialogue_voice(speaker=speaker, selected_voice=selected_voice)
    result = _synthesize_with_retry(tts_service=tts_service, text=text, voice=voice_for_turn)
    return index, result.content


def _synthesize_with_retry(*, tts_service: TTSService, text: str, voice: str) -> TTSResult:
    max_attempts = max(1, int(settings.piper_synthesize_retries))
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return tts_service.synthesize(text, voice=voice)
        except Exception as exc:  # pragma: no cover - covered by generation flow tests via retries
            last_error = exc
            if attempt >= max_attempts:
                break
            backoff = max(0.0, float(settings.piper_synthesize_retry_backoff_sec)) * attempt
            logger.warning(
                "TTS retry denemesi (%d/%d) %.1fs sonra (voice=%s): %s",
                attempt,
                max_attempts,
                backoff,
                voice,
                exc,
            )
            if backoff > 0:
                _time.sleep(backoff)
    if last_error is not None:
        raise last_error
    raise RuntimeError("TTS sentez beklenmedik sekilde tamamlanamadi")


def _split_dialogue_turns(script: str) -> list[tuple[str, str]]:
    turns: list[tuple[str, str]] = []
    dialogue_line_re = re.compile(
        r"^(?:\d+[\).:\-]\s*)?(Elif|Ahmet|Zeynep|Anlatici|Anlatıcı|Narrator|Ogrenci|Öğrenci|Hoca|Doktor)\s*[:\-–—]\s*(.+)$",
        flags=re.IGNORECASE,
    )
    for raw_line in script.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = dialogue_line_re.match(line)
        if match:
            speaker = match.group(1).strip().capitalize()
            text = match.group(2).strip()
            if text:
                turns.append((speaker, text))
        else:
            turns.append(("Elif", line))
    return turns


def _count_explicit_dialogue_turns(script: str) -> int:
    dialogue_line_re = re.compile(
        r"^(?:\d+[\).:\-]\s*)?(Elif|Ahmet|Zeynep|Anlatici|Anlatıcı|Narrator|Ogrenci|Öğrenci|Hoca|Doktor)\s*[:\-–—]\s*(.+)$",
        flags=re.IGNORECASE,
    )
    return sum(1 for raw_line in script.splitlines() if dialogue_line_re.match(raw_line.strip()))


def _is_forced_dual_voice(*, selected_voice: str) -> bool:
    return "diyalog" in (selected_voice or "").strip().lower()


def _ensure_dual_voice_turns(*, turns: list[tuple[str, str]], script: str) -> list[tuple[str, str]]:
    """Guarantee Elif/Ahmet alternation when dialogue voice is explicitly selected.

    LLM output can occasionally ignore speaker tags and return plain paragraphs.
    In that case we split text into short sentence turns and alternate speakers.
    """
    if not turns:
        return []

    resolved_speakers = {
        _resolve_dialogue_voice(speaker=speaker, selected_voice="Diyalog").strip().lower()
        for speaker, text in turns
        if text.strip()
    }
    if "elif" in resolved_speakers and "ahmet" in resolved_speakers:
        return turns

    merged_text = " ".join(text.strip() for _, text in turns if text.strip())
    if not merged_text:
        merged_text = re.sub(r"\s+", " ", script).strip()
    if not merged_text:
        return turns

    sentence_turns = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", merged_text)
        if sentence.strip()
    ]
    if len(sentence_turns) < 2:
        words = merged_text.split()
        if len(words) >= 10:
            pivot = max(1, len(words) // 2)
            sentence_turns = [" ".join(words[:pivot]), " ".join(words[pivot:])]
        else:
            sentence_turns = [merged_text]

    rebalanced: list[tuple[str, str]] = []
    for idx, sentence in enumerate(sentence_turns):
        speaker = "Elif" if idx % 2 == 0 else "Ahmet"
        rebalanced.append((speaker, sentence))

    logger.info(
        "Dialog satirlari yeniden dengelendi: onceki=%d yeni=%d",
        len(turns),
        len(rebalanced),
    )
    return rebalanced


def _resolve_dialogue_voice(*, speaker: str, selected_voice: str) -> str:
    selected_normalized = (selected_voice or "").strip().lower()
    neural_dialogue = "diyalog neural" in selected_normalized
    female_voice = "Emel Neural" if neural_dialogue else "Elif"
    male_voice = "Ahmet Neural" if neural_dialogue else "Ahmet"

    normalized = speaker.strip().lower()
    if "ahmet" in normalized:
        return male_voice
    if "hoca" in normalized or "doktor" in normalized:
        return male_voice
    if "zeynep" in normalized:
        return "Zeynep" if not neural_dialogue else female_voice
    if "ogrenci" in normalized or "öğrenci" in normalized:
        return female_voice
    if "narrator" in normalized or "anlat" in normalized:
        return female_voice
    # Fallback to the selected voice when script has unknown speaker labels.
    if selected_normalized not in {"diyalog", "diyalog neural"} and selected_voice:
        return selected_voice
    return female_voice


def _concat_wav_segments(segments: list[bytes], *, gap_ms: int, fade_ms: int) -> bytes:
    if not segments:
        return b""
    if len(segments) == 1:
        return _normalize_wav_segment(segments[0], fade_ms=fade_ms)

    normalized_segments = [_normalize_wav_segment(segment, fade_ms=fade_ms) for segment in segments]

    stream = BytesIO()
    with wave.open(BytesIO(normalized_segments[0]), "rb") as first_reader:
        params = first_reader.getparams()
        first_frames = first_reader.readframes(first_reader.getnframes())

    silence_frames = b""
    if gap_ms > 0:
        gap_frames = int((params.framerate * gap_ms) / 1000)
        silence_frames = b"\x00" * gap_frames * params.nchannels * params.sampwidth

    with wave.open(stream, "wb") as writer:
        writer.setparams(params)
        writer.writeframes(first_frames)
        for segment in normalized_segments[1:]:
            with wave.open(BytesIO(segment), "rb") as reader:
                if (
                    reader.getnchannels() != params.nchannels
                    or reader.getsampwidth() != params.sampwidth
                    or reader.getframerate() != params.framerate
                ):
                    raise RuntimeError("Dialog TTS birlestirme hatasi: uyumsuz WAV parametreleri")
                if silence_frames:
                    writer.writeframes(silence_frames)
                writer.writeframes(reader.readframes(reader.getnframes()))

    return stream.getvalue()


def _normalize_wav_segment(segment: bytes, *, fade_ms: int) -> bytes:
    try:
        with wave.open(BytesIO(segment), "rb") as reader:
            channels = reader.getnchannels()
            sample_width = reader.getsampwidth()
            sample_rate = reader.getframerate()
            frame_count = reader.getnframes()
            pcm = reader.readframes(frame_count)
    except wave.Error:
        return segment

    if sample_width != 2 or channels <= 0 or frame_count <= 0:
        return segment

    samples = np.frombuffer(pcm, dtype=np.int16)
    if samples.size == 0 or samples.size % channels != 0:
        return segment

    framed = samples.reshape(-1, channels)
    trimmed = _trim_wav_silence(framed, sample_rate=sample_rate)
    softened = _apply_wav_edge_fade(trimmed, sample_rate=sample_rate, fade_ms=fade_ms)
    clipped = np.clip(np.round(softened), -32768, 32767).astype(np.int16)
    pcm_out = clipped.reshape(-1).tobytes()

    output = BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(sample_width)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm_out)
    return output.getvalue()


def _trim_wav_silence(samples: np.ndarray, *, sample_rate: int) -> np.ndarray:
    if samples.size == 0 or sample_rate <= 0:
        return samples

    envelope = np.max(np.abs(samples.astype(np.int32)), axis=1)
    peak = int(envelope.max(initial=0))
    if peak <= 0:
        return samples

    threshold = max(180, int(peak * 0.015))
    non_silent = np.flatnonzero(envelope > threshold)
    if non_silent.size == 0:
        return samples

    padding_frames = min(samples.shape[0] // 8, max(1, int(sample_rate * 0.015)))
    start = max(0, int(non_silent[0]) - padding_frames)
    end = min(samples.shape[0], int(non_silent[-1]) + padding_frames + 1)
    trimmed = samples[start:end]
    return trimmed if trimmed.shape[0] >= 8 else samples


def _apply_wav_edge_fade(samples: np.ndarray, *, sample_rate: int, fade_ms: int) -> np.ndarray:
    if fade_ms <= 0 or sample_rate <= 0 or samples.shape[0] < 8:
        return samples

    fade_frames = min(samples.shape[0] // 4, max(1, int((sample_rate * fade_ms) / 1000)))
    if fade_frames < 2:
        return samples

    faded = samples.astype(np.float32).copy()
    ramp = np.linspace(0.0, 1.0, num=fade_frames, dtype=np.float32)[:, np.newaxis]
    faded[:fade_frames] *= ramp
    faded[-fade_frames:] *= ramp[::-1]
    return faded


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


def reap_stale_processing_parts(db: Session, *, max_age_minutes: int | None = None) -> int:
    if max_age_minutes is None:
        max_age_minutes = settings.worker_stale_job_max_age_minutes
    cutoff = datetime.now(UTC) - timedelta(minutes=max_age_minutes)
    result = db.execute(
        update(PodcastPartModel)
        .where(
            PodcastPartModel.status == "processing",
            PodcastPartModel.updated_at < cutoff,
        )
        .values(
            status="queued",
            queue_priority=1,
            updated_at=datetime.now(UTC),
        )
    )
    reaped = result.rowcount
    if reaped:
        db.commit()
        logger.warning("Stale processing part'lar queued durumuna cekildi: %d adet", reaped)
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


def _duration_from_audio_bytes(content: bytes, *, extension: str | None = None) -> int | None:
    normalized_ext = (extension or "").strip().lower().lstrip(".")
    if normalized_ext == "mp3":
        return _duration_from_mp3_bytes(content)
    return _duration_from_wav_bytes(content)


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


def _duration_from_mp3_bytes(content: bytes) -> int | None:
    if MP3 is None:
        return None
    try:
        duration = float(MP3(BytesIO(content)).info.length)
    except Exception:
        return None
    if duration <= 0:
        return None
    return max(1, int(round(duration)))
