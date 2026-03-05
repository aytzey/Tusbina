import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.schemas import GeneratePodcastIn, GeneratePodcastOut, GeneratePodcastStatusOut
from app.services.generation import enqueue_generation_job, get_generation_job, job_to_status_schema

router = APIRouter(tags=["generation"])
logger = logging.getLogger("tusbina-generation-api")


@router.post("/generatePodcast", response_model=GeneratePodcastOut)
def generate_podcast(
    payload: GeneratePodcastIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> GeneratePodcastOut:
    logger.info(
        "GEN_REQUEST user_id=%s title=%s format=%s file_count=%d section_count=%d planned_parts=%d",
        current_user.user_id,
        payload.title,
        payload.format,
        len(payload.file_ids),
        len(payload.sections),
        len([section for section in payload.sections if section.enabled]) if payload.sections else len(payload.file_ids),
    )
    if payload.sections:
        planned_parts = len([section for section in payload.sections if section.enabled])
    else:
        planned_parts = len(payload.file_ids)
    if planned_parts > settings.generation_max_parts:
        raise HTTPException(
            status_code=400,
            detail=f"Part limiti asildi: {planned_parts} > {settings.generation_max_parts}",
        )

    job = enqueue_generation_job(db, user_id=current_user.user_id, payload=payload)
    logger.info("GEN_ENQUEUED user_id=%s job_id=%s", current_user.user_id, job.id)
    return GeneratePodcastOut(job_id=job.id, status="queued")


@router.get("/generatePodcast/{job_id}/status", response_model=GeneratePodcastStatusOut)
def get_generation_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> GeneratePodcastStatusOut:
    job = get_generation_job(db, job_id=job_id, user_id=current_user.user_id)
    if job is None:
        logger.warning("GEN_STATUS_NOT_FOUND user_id=%s job_id=%s", current_user.user_id, job_id)
        raise HTTPException(status_code=404, detail="Generation job not found")

    return job_to_status_schema(job)
