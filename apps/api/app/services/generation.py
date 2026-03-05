import json
import logging
import math
import re
import time as _time
import wave
from concurrent.futures import ThreadPoolExecutor
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
from app.services.tts import TTSResult, TTSService, get_tts_service

logger = logging.getLogger("tusbina-generation")

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
        format_name = str(payload.get("format", "narrative"))
        selected_voice = str(payload.get("voice", "Elif"))
        dialogue_mode = _is_dialogue_mode(format_name=format_name, voice_name=selected_voice)

        sections = payload.get("sections", [])
        enabled_sections = [section for section in sections if section.get("enabled", True)]
        if sections and not enabled_sections:
            raise ValueError("All sections are disabled")
        section_titles = [section.get("title", "").strip() for section in enabled_sections if section.get("title")]
        use_auto_plan = not section_titles
        if section_titles and _sections_look_like_defaults(section_titles=section_titles, assets=assets):
            use_auto_plan = True
            _trace_generation(
                job.id,
                "part_plan_override_defaults",
                reason="sections_match_file_defaults",
                section_count=len(section_titles),
            )

        auto_part_plan: list[_AutoPartPlan] | None = None
        if not use_auto_plan:
            # If client explicitly sends sections, always honor that exact plan.
            part_titles = section_titles
            _trace_generation(job.id, "part_plan_manual_sections", part_count=len(part_titles))
        else:
            auto_part_plan = _build_auto_part_plan(
                assets=assets,
                asset_text_cache=asset_text_cache,
                format_name=format_name,
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

        default_duration_sec = FORMAT_PART_DURATION_SEC.get(format_name, 420)
        podcast_id = f"pod-{uuid4().hex[:12]}"
        podcast = PodcastModel(
            id=podcast_id,
            user_id=job.user_id,
            title=payload.get("title", "Yeni Podcast"),
            source_type="ai",
            voice=selected_voice,
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
                voice_name=selected_voice,
                index=index,
                total=total_parts,
                assets=assets,
                storage=storage,
                asset_text_cache=asset_text_cache,
                asset_context_cache=asset_context_cache,
                preferred_asset_id=plan_entry.asset_id if plan_entry else None,
                source_slice_index=plan_entry.asset_part_index if plan_entry else None,
                source_slice_total=plan_entry.asset_part_total if plan_entry else None,
                dialogue_mode=dialogue_mode,
            )
            t_script = _time.monotonic() - t0
            _trace_generation(
                job.id,
                "part_script_done",
                part=index,
                elapsed_sec=round(t_script, 2),
                script_chars=len(script),
                dialogue_mode=dialogue_mode,
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
            tts_audio = _synthesize_part_audio(
                tts_service=tts_service,
                script=script,
                selected_voice=selected_voice,
                dialogue_mode=dialogue_mode,
            )
            t_tts = _time.monotonic() - t1
            _trace_generation(
                job.id,
                "part_tts_done",
                part=index,
                elapsed_sec=round(t_tts, 2),
                audio_bytes=len(tts_audio.content),
                extension=tts_audio.extension,
                dialogue_mode=dialogue_mode,
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

        merged = _concat_wav_segments(audio_turns, gap_ms=130)
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
    for raw_line in script.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"^(Elif|Ahmet|Zeynep|Anlatici|Anlatıcı|Narrator)\s*[:\-]\s*(.+)$", line, flags=re.IGNORECASE)
        if match:
            speaker = match.group(1).strip().capitalize()
            text = match.group(2).strip()
            if text:
                turns.append((speaker, text))
        else:
            turns.append(("Elif", line))
    return turns


def _resolve_dialogue_voice(*, speaker: str, selected_voice: str) -> str:
    normalized = speaker.strip().lower()
    if "ahmet" in normalized:
        return "Ahmet"
    if "zeynep" in normalized:
        return "Zeynep"
    if "narrator" in normalized or "anlat" in normalized:
        return "Elif"
    # Fallback to the selected voice when script has unknown speaker labels.
    return selected_voice if selected_voice and selected_voice.lower() != "diyalog" else "Elif"


def _concat_wav_segments(segments: list[bytes], *, gap_ms: int) -> bytes:
    if not segments:
        return b""
    if len(segments) == 1:
        return segments[0]

    stream = BytesIO()
    with wave.open(BytesIO(segments[0]), "rb") as first_reader:
        params = first_reader.getparams()
        first_frames = first_reader.readframes(first_reader.getnframes())

    silence_frames = b""
    if gap_ms > 0:
        gap_frames = int((params.framerate * gap_ms) / 1000)
        silence_frames = b"\x00" * gap_frames * params.nchannels * params.sampwidth

    with wave.open(stream, "wb") as writer:
        writer.setparams(params)
        writer.writeframes(first_frames)
        for segment in segments[1:]:
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
