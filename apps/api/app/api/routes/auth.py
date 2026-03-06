"""Authentication-adjacent routes: profile, legal consent, and account deletion."""

import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends
from fastapi import Request as FastAPIRequest
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.db.models import (
    FeedbackModel,
    GenerationJobModel,
    PodcastModel,
    PodcastUserStateModel,
    QuizQuestionModel,
    UploadAssetModel,
    UsageModel,
    UserLegalConsentModel,
    UserProfileModel,
    utcnow,
)
from app.legal_content import (
    ACCOUNT_DELETION_SLUG,
    KVKK_NOTICE_SLUG,
    MARKETING_CONSENT_SLUG,
    PRIVACY_POLICY_SLUG,
    TERMS_OF_USE_SLUG,
    build_public_legal_url,
    get_legal_document,
)
from app.legal_content import (
    KVKK_NOTICE_SLUG as KVKK_SLUG,
)
from app.services.storage import get_storage_client

logger = logging.getLogger("tusbina-auth-routes")

router = APIRouter(prefix="/auth", tags=["auth"])


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


class LegalConsentUpdateRequest(BaseModel):
    required_consents_accepted: bool | None = None
    marketing_opt_in: bool = False


class LegalConsentResponse(BaseModel):
    privacy_policy_version: str | None
    terms_of_use_version: str | None
    kvkk_notice_version: str | None
    required_consents_complete: bool
    required_consents_accepted_at: str | None
    marketing_opt_in: bool
    marketing_consent_version: str | None
    marketing_consent_updated_at: str | None
    updated_at: str | None
    privacy_policy_url: str
    terms_of_use_url: str
    kvkk_notice_url: str
    permissions_notice_url: str
    marketing_consent_url: str
    account_deletion_url: str


class DeleteAccountResponse(BaseModel):
    ok: bool
    auth_account_deleted: bool
    deleted_podcasts: int
    deleted_upload_assets: int
    deleted_feedback: int
    deleted_generation_jobs: int
    deleted_quiz_questions: int
    deleted_storage_files: int
    message: str


def _profile_to_response(profile: UserProfileModel) -> ProfileResponse:
    return ProfileResponse(
        id=profile.id,
        email=profile.email,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        created_at=profile.created_at.isoformat() if profile.created_at else "",
    )


def _public_base_url(request: FastAPIRequest) -> str:
    return str(request.base_url).rstrip("/")


def _document_version(slug: str) -> str:
    document = get_legal_document(slug)
    if not document:
        raise RuntimeError(f"Missing legal document: {slug}")
    return document.version


def _is_required_consent_complete(consent: UserLegalConsentModel | None) -> bool:
    if consent is None or consent.required_consents_accepted_at is None:
        return False
    return (
        consent.privacy_policy_version == _document_version(PRIVACY_POLICY_SLUG)
        and consent.terms_of_use_version == _document_version(TERMS_OF_USE_SLUG)
        and consent.kvkk_notice_version == _document_version(KVKK_SLUG)
    )


def _consent_to_response(
    request: FastAPIRequest,
    consent: UserLegalConsentModel | None,
) -> LegalConsentResponse:
    base_url = _public_base_url(request)
    return LegalConsentResponse(
        privacy_policy_version=consent.privacy_policy_version if consent else None,
        terms_of_use_version=consent.terms_of_use_version if consent else None,
        kvkk_notice_version=consent.kvkk_notice_version if consent else None,
        required_consents_complete=_is_required_consent_complete(consent),
        required_consents_accepted_at=(
            consent.required_consents_accepted_at.isoformat()
            if consent and consent.required_consents_accepted_at
            else None
        ),
        marketing_opt_in=consent.marketing_opt_in if consent else False,
        marketing_consent_version=consent.marketing_consent_version if consent else None,
        marketing_consent_updated_at=(
            consent.marketing_consent_updated_at.isoformat()
            if consent and consent.marketing_consent_updated_at
            else None
        ),
        updated_at=consent.updated_at.isoformat() if consent and consent.updated_at else None,
        privacy_policy_url=build_public_legal_url(base_url, PRIVACY_POLICY_SLUG),
        terms_of_use_url=build_public_legal_url(base_url, TERMS_OF_USE_SLUG),
        kvkk_notice_url=build_public_legal_url(base_url, KVKK_NOTICE_SLUG),
        permissions_notice_url=build_public_legal_url(base_url, "data-processing-and-permissions"),
        marketing_consent_url=build_public_legal_url(base_url, MARKETING_CONSENT_SLUG),
        account_deletion_url=build_public_legal_url(base_url, ACCOUNT_DELETION_SLUG),
    )


def _storage_key_from_public_url(public_url: str | None) -> str | None:
    if not public_url:
        return None

    if public_url.startswith("/static/uploads/"):
        return public_url.removeprefix("/static/uploads/")

    if public_url.startswith("http://") or public_url.startswith("https://"):
        parsed = urlsplit(public_url)
        path = parsed.path or ""

        static_prefix = "/static/uploads/"
        if static_prefix in path:
            _, tail = path.split(static_prefix, 1)
            return tail or None

        if settings.r2_public_base_url:
            public_base = settings.r2_public_base_url.rstrip("/")
            if public_url.startswith(public_base + "/"):
                return public_url.removeprefix(public_base + "/") or None
        elif settings.r2_bucket:
            bucket_prefix = f"/{settings.r2_bucket}/"
            if bucket_prefix in path:
                _, tail = path.split(bucket_prefix, 1)
                return tail or None
        return None

    if "/" in public_url and not public_url.startswith("file://"):
        return public_url.lstrip("/")

    return None


def _delete_supabase_auth_user(user_id: str) -> bool:
    if not settings.enable_auth:
        return True
    if not settings.supabase_url or not settings.supabase_service_key:
        logger.warning("Skipping Supabase auth deletion; service key is missing")
        return False

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/user/{user_id}"
    request = Request(url, method="DELETE")
    request.add_header("apikey", settings.supabase_service_key)
    request.add_header("Authorization", f"Bearer {settings.supabase_service_key}")

    try:
        with urlopen(request, timeout=20) as response:
            status_code = getattr(response, "status", 200)
            return 200 <= status_code < 300
    except HTTPError as exc:
        if exc.code == 404:
            return True
        logger.warning("Supabase auth deletion failed with HTTP %s", exc.code)
        return False
    except (URLError, TimeoutError) as exc:
        logger.warning("Supabase auth deletion failed: %s", exc)
        return False


@router.post("/profile", response_model=ProfileResponse)
def upsert_profile(
    body: ProfileUpsertRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    profile = db.get(UserProfileModel, current_user.user_id)
    if profile is None:
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


@router.get("/legal-consent", response_model=LegalConsentResponse)
def get_legal_consent(
    request: FastAPIRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    consent = db.get(UserLegalConsentModel, current_user.user_id)
    return _consent_to_response(request, consent)


@router.put("/legal-consent", response_model=LegalConsentResponse)
def update_legal_consent(
    body: LegalConsentUpdateRequest,
    request: FastAPIRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    consent = db.get(UserLegalConsentModel, current_user.user_id)
    if consent is None:
        consent = UserLegalConsentModel(
            user_id=current_user.user_id,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(consent)

    now = utcnow()
    if body.required_consents_accepted:
        consent.privacy_policy_version = _document_version(PRIVACY_POLICY_SLUG)
        consent.terms_of_use_version = _document_version(TERMS_OF_USE_SLUG)
        consent.kvkk_notice_version = _document_version(KVKK_NOTICE_SLUG)
        consent.required_consents_accepted_at = now

    consent.marketing_opt_in = body.marketing_opt_in
    consent.marketing_consent_version = (
        _document_version(MARKETING_CONSENT_SLUG) if body.marketing_opt_in else None
    )
    consent.marketing_consent_updated_at = now
    consent.updated_at = now

    db.commit()
    db.refresh(consent)
    return _consent_to_response(request, consent)


@router.delete("/account", response_model=DeleteAccountResponse)
def delete_account(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage = get_storage_client()

    podcasts = list(
        db.execute(
            select(PodcastModel)
            .where(PodcastModel.user_id == current_user.user_id)
            .options(selectinload(PodcastModel.parts))
        ).scalars()
    )
    upload_assets = list(
        db.execute(select(UploadAssetModel).where(UploadAssetModel.user_id == current_user.user_id)).scalars()
    )
    deleted_feedback = len(
        list(db.execute(select(FeedbackModel.id).where(FeedbackModel.user_id == current_user.user_id)).scalars())
    )
    deleted_generation_jobs = len(
        list(
            db.execute(
                select(GenerationJobModel.id).where(GenerationJobModel.user_id == current_user.user_id)
            ).scalars()
        )
    )
    deleted_quiz_questions = len(
        list(db.execute(select(QuizQuestionModel.id).where(QuizQuestionModel.user_id == current_user.user_id)).scalars())
    )

    deleted_storage_files = 0
    for podcast in podcasts:
        for part in podcast.parts:
            storage_key = _storage_key_from_public_url(part.audio_url)
            if not storage_key:
                continue
            try:
                storage.delete(storage_key)
                deleted_storage_files += 1
            except Exception:
                logger.info("Skipping orphan audio delete for %s", storage_key)

        cover_storage_key = _storage_key_from_public_url(podcast.cover_image_url)
        if cover_storage_key:
            try:
                storage.delete(cover_storage_key)
                deleted_storage_files += 1
            except Exception:
                logger.info("Skipping orphan cover delete for %s", cover_storage_key)

    for asset in upload_assets:
        try:
            storage.delete(asset.storage_key)
            deleted_storage_files += 1
        except Exception:
            logger.info("Skipping orphan upload delete for %s", asset.storage_key)

    for podcast in podcasts:
        db.delete(podcast)

    db.execute(delete(PodcastUserStateModel).where(PodcastUserStateModel.user_id == current_user.user_id))
    db.execute(delete(QuizQuestionModel).where(QuizQuestionModel.user_id == current_user.user_id))
    db.execute(delete(GenerationJobModel).where(GenerationJobModel.user_id == current_user.user_id))
    db.execute(delete(FeedbackModel).where(FeedbackModel.user_id == current_user.user_id))
    db.execute(delete(UploadAssetModel).where(UploadAssetModel.user_id == current_user.user_id))
    db.execute(delete(UsageModel).where(UsageModel.user_id == current_user.user_id))
    db.execute(delete(UserLegalConsentModel).where(UserLegalConsentModel.user_id == current_user.user_id))
    db.execute(delete(UserProfileModel).where(UserProfileModel.id == current_user.user_id))
    db.commit()

    auth_account_deleted = _delete_supabase_auth_user(current_user.user_id)
    return DeleteAccountResponse(
        ok=True,
        auth_account_deleted=auth_account_deleted,
        deleted_podcasts=len(podcasts),
        deleted_upload_assets=len(upload_assets),
        deleted_feedback=deleted_feedback,
        deleted_generation_jobs=deleted_generation_jobs,
        deleted_quiz_questions=deleted_quiz_questions,
        deleted_storage_files=deleted_storage_files,
        message=(
            "Hesap ve ilişkili veriler silindi."
            if auth_account_deleted
            else "Yerel veriler silindi ancak kimlik hesabı tam kaldırılamadı; destek ile teyit edin."
        ),
    )
