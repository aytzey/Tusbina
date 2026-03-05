from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    CourseModel,
    CoursePartModel,
    PodcastModel,
    PodcastPartModel,
    UsageModel,
)


def seed_reference_content(db: Session) -> None:
    existing = db.execute(select(CourseModel.id).limit(1)).first()
    if existing:
        return

    course = CourseModel(
        id="course-kardiyoloji",
        title="Kardiyoloji: Kapak Hastalıkları",
        category="Dahiliye",
        total_parts=5,
        total_duration_sec=5400,
        progress_pct=45,
    )
    db.add(course)

    parts = [
        CoursePartModel(
            id="part-1",
            course_id=course.id,
            title="Mitral Stenoz - Etyoloji",
            duration_sec=920,
            status="completed",
            last_position_sec=920,
        ),
        CoursePartModel(
            id="part-2",
            course_id=course.id,
            title="Mitral Stenoz - Fizik Muayene",
            duration_sec=1220,
            status="inProgress",
            last_position_sec=730,
        ),
        CoursePartModel(
            id="part-3",
            course_id=course.id,
            title="Mitral Stenoz - Tedavi",
            duration_sec=1365,
            status="completed",
            last_position_sec=1365,
        ),
        CoursePartModel(
            id="part-4",
            course_id=course.id,
            title="Aort Yetersizliği - Giriş",
            duration_sec=1090,
            status="locked",
            last_position_sec=0,
        ),
        CoursePartModel(
            id="part-5",
            course_id=course.id,
            title="Aort Stenozu Cerrahisi",
            duration_sec=805,
            status="locked",
            last_position_sec=0,
        ),
    ]

    db.add_all(parts)

    podcast = PodcastModel(
        id="pod-seed-1",
        user_id=settings.default_user_id,
        title="Dahiliye: Endokrin Vaka Analizi",
        source_type="ai",
        voice="Dr. Selin",
        format="narrative",
        total_duration_sec=1800,
    )
    db.add(podcast)
    db.add_all(
        [
            PodcastPartModel(
                id="pod-seed-1-part-1",
                podcast_id=podcast.id,
                title="Giriş ve Hedefler",
                duration_sec=480,
                page_range="s1-3",
                status="ready",
                audio_url=None,
            ),
            PodcastPartModel(
                id="pod-seed-1-part-2",
                podcast_id=podcast.id,
                title="Klinik Vaka Akışı",
                duration_sec=780,
                page_range="s4-8",
                status="ready",
                audio_url=None,
            ),
        ]
    )

    db.commit()


def ensure_usage_row(db: Session, user_id: str) -> UsageModel:
    usage = db.get(UsageModel, user_id)
    if usage:
        if _rollover_if_needed(usage):
            db.commit()
            db.refresh(usage)
        return usage

    usage = UsageModel(
        user_id=user_id,
        monthly_listen_quota_sec=settings.demo_monthly_quota_sec,
        monthly_used_sec=0,
        is_premium=False,
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return usage


def _rollover_if_needed(usage: UsageModel) -> bool:
    now = datetime.now(UTC)
    updated = usage.updated_at or now
    if (updated.year, updated.month) == (now.year, now.month):
        return False

    usage.monthly_used_sec = 0
    if usage.is_premium:
        usage.monthly_listen_quota_sec = settings.premium_monthly_quota_sec
    else:
        usage.monthly_listen_quota_sec = settings.demo_monthly_quota_sec
    usage.updated_at = now
    return True
