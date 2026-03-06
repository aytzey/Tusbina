"""Authentication routes -- user profile management.

Auth (signup/login/logout) is handled directly by Supabase on the client.
These routes manage the backend user profile, verified via JWKS JWT tokens.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.db.models import UserProfileModel, utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ProfileUpsertRequest(BaseModel):
    display_name: str | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None


class ProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: str | None
    created_at: str

    model_config = {"from_attributes": True}


def _profile_to_response(profile: UserProfileModel) -> ProfileResponse:
    return ProfileResponse(
        id=profile.id,
        email=profile.email,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        created_at=profile.created_at.isoformat() if profile.created_at else "",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/profile", response_model=ProfileResponse)
def upsert_profile(
    body: ProfileUpsertRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create profile on first login, or update the existing one."""
    profile = db.get(UserProfileModel, current_user.user_id)
    if profile:
        profile.email = current_user.email
        if body.display_name is not None:
            profile.display_name = body.display_name
        db.commit()
        db.refresh(profile)
        return _profile_to_response(profile)

    display_name = body.display_name or current_user.email.split("@")[0] or "User"
    profile = UserProfileModel(
        id=current_user.user_id,
        email=current_user.email,
        display_name=display_name,
        created_at=utcnow(),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _profile_to_response(profile)


@router.get("/me", response_model=ProfileResponse)
def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's profile."""
    profile = db.get(UserProfileModel, current_user.user_id)
    if profile is None:
        # Auto-create profile on first authenticated request
        profile = UserProfileModel(
            id=current_user.user_id,
            email=current_user.email,
            display_name=current_user.email.split("@")[0] if current_user.email else "User",
            created_at=utcnow(),
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return _profile_to_response(profile)


@router.patch("/profile", response_model=ProfileResponse)
def update_profile(
    body: ProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's display name or avatar."""
    profile = db.get(UserProfileModel, current_user.user_id)
    if not profile:
        profile = UserProfileModel(
            id=current_user.user_id,
            email=current_user.email,
            display_name=current_user.email.split("@")[0] if current_user.email else "User",
            created_at=utcnow(),
        )
        db.add(profile)
        db.flush()

    if body.display_name is not None:
        profile.display_name = body.display_name
    if body.avatar_url is not None:
        profile.avatar_url = body.avatar_url

    db.commit()
    db.refresh(profile)
    return _profile_to_response(profile)
