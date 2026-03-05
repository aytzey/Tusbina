from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.db.models import UsageModel
from app.models.schemas import UsageConsumeIn, UsageOut, UsagePackageAddIn
from app.services.seed import ensure_usage_row

router = APIRouter(tags=["usage"])


def usage_to_schema(usage, *, consumed_sec: int = 0, limit_reached: bool = False) -> UsageOut:
    return UsageOut(
        monthly_listen_quota_sec=usage.monthly_listen_quota_sec,
        monthly_used_sec=usage.monthly_used_sec,
        remaining_sec=max(usage.monthly_listen_quota_sec - usage.monthly_used_sec, 0),
        is_premium=usage.is_premium,
        consumed_sec=consumed_sec,
        limit_reached=limit_reached,
    )


def lock_usage_for_write(db: Session, user_id: str) -> UsageModel:
    ensure_usage_row(db, user_id)

    stmt = select(UsageModel).where(UsageModel.user_id == user_id)
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    return db.execute(stmt).scalar_one()


@router.get("/usage", response_model=UsageOut)
def get_usage(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UsageOut:
    usage = ensure_usage_row(db, current_user.user_id)
    return usage_to_schema(usage)


@router.post("/usage/consume", response_model=UsageOut)
def consume_usage(
    payload: UsageConsumeIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UsageOut:
    usage = lock_usage_for_write(db, current_user.user_id)
    remaining = max(usage.monthly_listen_quota_sec - usage.monthly_used_sec, 0)
    consumed_sec = min(payload.seconds, remaining)
    usage.monthly_used_sec += consumed_sec
    limit_reached = consumed_sec < payload.seconds
    db.commit()
    db.refresh(usage)
    return usage_to_schema(usage, consumed_sec=consumed_sec, limit_reached=limit_reached)


@router.post("/usage/premium/activate", response_model=UsageOut)
def activate_premium(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UsageOut:
    usage = lock_usage_for_write(db, current_user.user_id)
    usage.is_premium = True
    usage.monthly_listen_quota_sec = max(usage.monthly_listen_quota_sec, settings.premium_monthly_quota_sec)
    db.commit()
    db.refresh(usage)
    return usage_to_schema(usage)


@router.post("/usage/package/add", response_model=UsageOut)
def add_usage_package(
    payload: UsagePackageAddIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> UsageOut:
    usage = lock_usage_for_write(db, current_user.user_id)
    usage.monthly_listen_quota_sec += payload.extra_seconds
    db.commit()
    db.refresh(usage)
    return usage_to_schema(usage)
