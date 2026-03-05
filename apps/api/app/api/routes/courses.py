from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.podcasts import _resolve_audio_url
from app.core.database import get_db
from app.db.models import CourseModel, CoursePartModel
from app.models.schemas import Course, CoursePart, CoursePartPositionIn

router = APIRouter(prefix="/courses", tags=["courses"])


def _serialize_course(course: CourseModel) -> Course:
    return Course(
        id=course.id,
        title=course.title,
        category=course.category,
        total_parts=course.total_parts,
        total_duration_sec=course.total_duration_sec,
        progress_pct=course.progress_pct,
        parts=[
            CoursePart(
                id=part.id,
                course_id=part.course_id,
                title=part.title,
                duration_sec=part.duration_sec,
                status=part.status,
                last_position_sec=part.last_position_sec,
                audio_url=_resolve_audio_url(part.audio_url),
            )
            for part in course.parts
        ],
    )


@router.get("", response_model=list[Course])
def list_courses(db: Session = Depends(get_db)) -> list[Course]:
    stmt = select(CourseModel).options(selectinload(CourseModel.parts)).order_by(CourseModel.title.asc())
    return [_serialize_course(c) for c in db.execute(stmt).scalars().all()]


@router.get("/{course_id}", response_model=Course)
def get_course(course_id: str, db: Session = Depends(get_db)) -> Course:
    stmt = select(CourseModel).where(CourseModel.id == course_id).options(selectinload(CourseModel.parts))
    course = db.execute(stmt).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return _serialize_course(course)


@router.put("/{course_id}/parts/{part_id}/position", response_model=Course)
def update_course_part_position(
    course_id: str,
    part_id: str,
    payload: CoursePartPositionIn,
    db: Session = Depends(get_db),
) -> Course:
    part = db.get(CoursePartModel, part_id)
    if not part or part.course_id != course_id:
        raise HTTPException(status_code=404, detail="Course part not found")

    clamped_position = min(payload.last_position_sec, part.duration_sec)
    part.last_position_sec = clamped_position
    if part.status != "locked":
        if clamped_position >= part.duration_sec:
            part.status = "completed"
        elif clamped_position > 0:
            part.status = "inProgress"
        else:
            part.status = "new"

    course_stmt = select(CourseModel).where(CourseModel.id == course_id).options(selectinload(CourseModel.parts))
    course = db.execute(course_stmt).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    completed_parts = sum(1 for course_part in course.parts if course_part.last_position_sec >= course_part.duration_sec)
    course.progress_pct = round((completed_parts / course.total_parts) * 100) if course.total_parts > 0 else 0

    db.commit()
    db.refresh(course)
    return _serialize_course(course)
