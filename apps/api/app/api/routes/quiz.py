from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.schemas import QuizGenerateIn, QuizGenerateOut, QuizQuestionOut
from app.services.quiz_generation import generate_quiz_for_podcast, get_quiz_questions

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizGenerateOut)
def generate_quiz(
    payload: QuizGenerateIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> QuizGenerateOut:
    try:
        questions = generate_quiz_for_podcast(
            db,
            podcast_id=payload.podcast_id,
            part_id=payload.part_id,
            user_id=current_user.user_id,
            question_count=payload.question_count,
        )
    except ValueError as exc:
        msg = str(exc)
        code = 400 if "yetersiz" in msg or "bulunamadi" in msg else 404
        raise HTTPException(status_code=code, detail=msg) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return QuizGenerateOut(
        ok=True,
        podcast_id=payload.podcast_id,
        questions=[QuizQuestionOut.model_validate(q) for q in questions],
    )


@router.get("/{podcast_id}", response_model=list[QuizQuestionOut])
def list_quiz_questions(
    podcast_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[QuizQuestionOut]:
    questions = get_quiz_questions(db, podcast_id=podcast_id, user_id=current_user.user_id)
    return [QuizQuestionOut.model_validate(q) for q in questions]
