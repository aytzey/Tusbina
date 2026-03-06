from datetime import UTC, datetime
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.db.models import GenerationJobModel, PodcastModel, PodcastUserStateModel, QuizQuestionModel
from app.models.schemas import Podcast, PodcastPart, PodcastPartOrderIn, PodcastStateUpdateIn
from app.services.generation import prioritize_podcast_part_window, reorder_podcast_parts
from app.services.storage import get_storage_client

router = APIRouter(prefix="/podcasts", tags=["podcasts"])


def _resolve_audio_url(audio_url: str | None) -> str | None:
    if not audio_url:
        return None

    if audio_url.startswith("/"):
        return audio_url

    try:
        parsed = urlsplit(audio_url)
    except ValueError:
        return audio_url

    if not parsed.scheme or not parsed.netloc:
        return audio_url if audio_url.startswith("/") else f"/{audio_url}"

    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0"}:
        rebuilt = parsed.path or "/"
        if parsed.query:
            rebuilt = f"{rebuilt}?{parsed.query}"
        if parsed.fragment:
            rebuilt = f"{rebuilt}#{parsed.fragment}"
        return rebuilt

    return audio_url


def _serialize_podcast(podcast: PodcastModel, state: PodcastUserStateModel | None) -> Podcast:
    ordered_parts = sorted(podcast.parts, key=lambda part: (part.sort_order, part.id))
    return Podcast(
        id=podcast.id,
        title=podcast.title,
        source_type=podcast.source_type,
        voice=podcast.voice,
        format=podcast.format,
        total_duration_sec=podcast.total_duration_sec,
        parts=[
            PodcastPart(
                id=part.id,
                podcast_id=part.podcast_id,
                title=part.title,
                duration_sec=part.duration_sec,
                page_range=part.page_range,
                status=part.status,
                audio_url=_resolve_audio_url(part.audio_url),
            )
            for part in ordered_parts
        ],
        is_favorite=state.is_favorite if state else False,
        is_downloaded=state.is_downloaded if state else False,
        progress_sec=state.progress_sec if state else 0,
    )


def _storage_key_from_audio_url(audio_url: str | None) -> str | None:
    if not audio_url:
        return None

    if audio_url.startswith("/static/uploads/"):
        return audio_url.removeprefix("/static/uploads/")

    if audio_url.startswith("http://") or audio_url.startswith("https://"):
        parsed = urlsplit(audio_url)
        path = parsed.path or ""

        static_prefix = "/static/uploads/"
        if static_prefix in path:
            _, tail = path.split(static_prefix, 1)
            return tail or None

        if settings.r2_public_base_url:
            public_base = settings.r2_public_base_url.rstrip("/")
            if audio_url.startswith(public_base + "/"):
                return audio_url.removeprefix(public_base + "/") or None
        elif settings.r2_bucket:
            bucket_prefix = f"/{settings.r2_bucket}/"
            if bucket_prefix in path:
                _, tail = path.split(bucket_prefix, 1)
                return tail or None
        return None

    if "/" in audio_url and not audio_url.startswith("file://"):
        return audio_url.lstrip("/")

    return None


@router.get("", response_model=list[Podcast])
def list_podcasts(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[Podcast]:
    stmt = (
        select(PodcastModel)
        .where(PodcastModel.user_id == current_user.user_id)
        .options(selectinload(PodcastModel.parts))
        .order_by(PodcastModel.created_at.desc())
    )
    podcasts = list(db.execute(stmt).scalars().all())

    if not podcasts:
        return []

    podcast_ids = [podcast.id for podcast in podcasts]
    state_rows = db.execute(
        select(PodcastUserStateModel).where(
            PodcastUserStateModel.user_id == current_user.user_id,
            PodcastUserStateModel.podcast_id.in_(podcast_ids),
        )
    ).scalars()

    state_map = {row.podcast_id: row for row in state_rows}
    return [_serialize_podcast(podcast, state_map.get(podcast.id)) for podcast in podcasts]


@router.get("/{podcast_id}", response_model=Podcast)
def get_podcast(
    podcast_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Podcast:
    stmt = (
        select(PodcastModel)
        .where(PodcastModel.id == podcast_id, PodcastModel.user_id == current_user.user_id)
        .options(selectinload(PodcastModel.parts))
    )
    podcast = db.execute(stmt).scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    state = db.get(PodcastUserStateModel, (current_user.user_id, podcast_id))
    return _serialize_podcast(podcast, state)


@router.put("/{podcast_id}/parts/order", response_model=Podcast)
def update_podcast_part_order(
    podcast_id: str,
    payload: PodcastPartOrderIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Podcast:
    stmt = (
        select(PodcastModel)
        .where(PodcastModel.id == podcast_id, PodcastModel.user_id == current_user.user_id)
        .options(selectinload(PodcastModel.parts))
    )
    podcast = db.execute(stmt).scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    try:
        reorder_podcast_parts(db, podcast_id=podcast_id, part_ids=payload.part_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    refreshed = db.execute(stmt).scalar_one()
    state = db.get(PodcastUserStateModel, (current_user.user_id, podcast_id))
    return _serialize_podcast(refreshed, state)


@router.post("/{podcast_id}/parts/{part_id}/prioritize", response_model=Podcast)
def prioritize_podcast_part(
    podcast_id: str,
    part_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Podcast:
    stmt = (
        select(PodcastModel)
        .where(PodcastModel.id == podcast_id, PodcastModel.user_id == current_user.user_id)
        .options(selectinload(PodcastModel.parts))
    )
    podcast = db.execute(stmt).scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")
    if not any(part.id == part_id for part in podcast.parts):
        raise HTTPException(status_code=404, detail="Podcast part not found")

    prioritize_podcast_part_window(db, podcast_id=podcast_id, part_id=part_id)
    refreshed = db.execute(stmt).scalar_one()
    state = db.get(PodcastUserStateModel, (current_user.user_id, podcast_id))
    return _serialize_podcast(refreshed, state)


@router.put("/{podcast_id}/state", response_model=Podcast)
def update_podcast_state(
    podcast_id: str,
    payload: PodcastStateUpdateIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> Podcast:
    stmt = (
        select(PodcastModel)
        .where(PodcastModel.id == podcast_id, PodcastModel.user_id == current_user.user_id)
        .options(selectinload(PodcastModel.parts))
    )
    podcast = db.execute(stmt).scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    state = db.get(PodcastUserStateModel, (current_user.user_id, podcast_id))
    if state is None:
        state = PodcastUserStateModel(user_id=current_user.user_id, podcast_id=podcast_id)

    if payload.is_favorite is not None:
        state.is_favorite = payload.is_favorite
    if payload.is_downloaded is not None:
        state.is_downloaded = payload.is_downloaded

    current_progress = state.progress_sec or 0
    if payload.progress_sec is not None:
        current_progress = payload.progress_sec
    if payload.increment_progress_sec is not None:
        current_progress += payload.increment_progress_sec

    state.progress_sec = min(max(current_progress, 0), podcast.total_duration_sec)
    if state.progress_sec > 0:
        state.last_listened_at = datetime.now(UTC)

    db.add(state)
    db.commit()
    db.refresh(state)

    return _serialize_podcast(podcast, state)


@router.delete("/{podcast_id}")
def delete_podcast(
    podcast_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str | int | bool]:
    stmt = (
        select(PodcastModel)
        .where(PodcastModel.id == podcast_id, PodcastModel.user_id == current_user.user_id)
        .options(selectinload(PodcastModel.parts))
    )
    podcast = db.execute(stmt).scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    storage = get_storage_client()
    deleted_files = 0
    for part in podcast.parts:
        storage_key = _storage_key_from_audio_url(part.audio_url)
        if not storage_key:
            continue
        try:
            storage.delete(storage_key)
            deleted_files += 1
        except Exception:
            # Deleting DB records is more important; orphan files can be reaped later.
            pass

    db.execute(
        delete(PodcastUserStateModel).where(
            PodcastUserStateModel.user_id == current_user.user_id,
            PodcastUserStateModel.podcast_id == podcast_id,
        )
    )
    db.execute(
        delete(QuizQuestionModel).where(
            QuizQuestionModel.user_id == current_user.user_id,
            QuizQuestionModel.podcast_id == podcast_id,
        )
    )
    db.execute(
        update(GenerationJobModel)
        .where(
            GenerationJobModel.user_id == current_user.user_id,
            GenerationJobModel.result_podcast_id == podcast_id,
        )
        .values(result_podcast_id=None)
    )
    deleted_parts = len(podcast.parts)
    db.delete(podcast)
    db.commit()

    return {
        "ok": True,
        "podcast_id": podcast_id,
        "deleted_parts": deleted_parts,
        "deleted_files": deleted_files,
    }
