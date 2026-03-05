from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.db.models import CourseModel, CoursePartModel
from app.models.schemas import Course, CoursePartPositionIn

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[Course])
def list_courses(db: Session = Depends(get_db)) -> list[CourseModel]:
    stmt = select(CourseModel).options(selectinload(CourseModel.parts)).order_by(CourseModel.title.asc())
    return list(db.execute(stmt).scalars().all())


@router.get("/{course_id}", response_model=Course)
def get_course(course_id: str, db: Session = Depends(get_db)) -> CourseModel:
    stmt = select(CourseModel).where(CourseModel.id == course_id).options(selectinload(CourseModel.parts))
    course = db.execute(stmt).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.put("/{course_id}/parts/{part_id}/position", response_model=Course)
def update_course_part_position(
    course_id: str,
    part_id: str,
    payload: CoursePartPositionIn,
    db: Session = Depends(get_db),
) -> CourseModel:
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
    return course
