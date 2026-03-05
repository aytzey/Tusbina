from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.db.models import FeedbackModel
from app.models.schemas import FeedbackIn, FeedbackOut

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackOut)
def submit_feedback(
    payload: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> FeedbackOut:
    created_at = datetime.now(UTC)
    db.add(
        FeedbackModel(
            id=uuid4().hex,
            user_id=current_user.user_id,
            rating=payload.rating,
            tags_json=payload.tags,
            text=payload.text,
            content_id=payload.content_id,
            created_at=created_at,
        )
    )
    db.commit()
    return FeedbackOut(ok=True, created_at=created_at)
