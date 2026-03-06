from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import (
    FeedbackModel,
    GenerationJobModel,
    PodcastModel,
    PodcastPartModel,
    QuizQuestionModel,
    UploadAssetModel,
    UsageModel,
    UserLegalConsentModel,
    UserProfileModel,
    utcnow,
)
from app.main import app

client = TestClient(app)


def test_auth_enabled_requires_bearer(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_auth", True)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")

    response = client.get("/api/v1/usage")
    assert response.status_code == 401


def test_auth_enabled_accepts_valid_token(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_auth", True)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")

    token = jwt.encode(
        {"sub": "auth-user-1", "aud": "authenticated"},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    response = client.get("/api/v1/usage", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_premium"] is False


def test_auth_profile_patch_creates_missing_profile(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_auth", True)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")

    token = jwt.encode(
        {"sub": "auth-user-profile", "aud": "authenticated", "email": "profile@example.com"},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    response = client.patch(
        "/api/v1/auth/profile",
        json={"display_name": "Profil Kullanıcısı"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "auth-user-profile"
    assert payload["email"] == "profile@example.com"
    assert payload["display_name"] == "Profil Kullanıcısı"


def test_auth_profile_post_updates_existing_profile(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_auth", True)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")

    token = jwt.encode(
        {"sub": "auth-user-sync", "aud": "authenticated", "email": "sync@example.com"},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    created = client.post(
        "/api/v1/auth/profile",
        json={"display_name": "İlk Ad"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert created.status_code == 200
    assert created.json()["display_name"] == "İlk Ad"

    updated = client.post(
        "/api/v1/auth/profile",
        json={"display_name": "Yeni Ad"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["id"] == "auth-user-sync"
    assert payload["email"] == "sync@example.com"
    assert payload["display_name"] == "Yeni Ad"


def test_legal_documents_are_listed_publicly() -> None:
    response = client.get("/api/v1/legal/documents")
    assert response.status_code == 200
    payload = response.json()
    slugs = {item["slug"] for item in payload}
    assert "privacy-policy" in slugs
    assert "terms-of-use" in slugs
    assert "kvkk-notice" in slugs


def test_auth_legal_consent_upsert(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_auth", True)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")

    token = jwt.encode(
        {"sub": "auth-user-consent", "aud": "authenticated", "email": "consent@example.com"},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    response = client.put(
        "/api/v1/auth/legal-consent",
        json={"required_consents_accepted": True, "marketing_opt_in": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["required_consents_complete"] is True
    assert payload["marketing_opt_in"] is True
    assert payload["privacy_policy_version"] == "2026-03-06"

    fetched = client.get("/api/v1/auth/legal-consent", headers={"Authorization": f"Bearer {token}"})
    assert fetched.status_code == 200
    assert fetched.json()["required_consents_complete"] is True


def test_auth_account_delete_removes_user_rows(monkeypatch) -> None:
    monkeypatch.setattr(settings, "enable_auth", True)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")
    monkeypatch.setattr("app.api.routes.auth._delete_supabase_auth_user", lambda user_id: user_id == "auth-user-delete")

    token = jwt.encode(
        {"sub": "auth-user-delete", "aud": "authenticated", "email": "delete@example.com"},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    with SessionLocal() as db:
        db.merge(
            UserProfileModel(
                id="auth-user-delete",
                email="delete@example.com",
                display_name="Delete Me",
                created_at=utcnow(),
            )
        )
        db.merge(
            UserLegalConsentModel(
                user_id="auth-user-delete",
                privacy_policy_version="2026-03-06",
                terms_of_use_version="2026-03-06",
                kvkk_notice_version="2026-03-06",
                required_consents_accepted_at=utcnow(),
                marketing_opt_in=True,
                marketing_consent_version="2026-03-06",
                marketing_consent_updated_at=utcnow(),
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
        db.merge(
            UsageModel(
                user_id="auth-user-delete",
                monthly_listen_quota_sec=3600,
                monthly_used_sec=120,
                is_premium=False,
                updated_at=utcnow(),
            )
        )
        db.merge(
            UploadAssetModel(
                id="upload-delete-1",
                user_id="auth-user-delete",
                filename="test.pdf",
                content_type="application/pdf",
                size_bytes=12,
                storage_key="uploads/delete/test.pdf",
                public_url="/static/uploads/uploads/delete/test.pdf",
                created_at=utcnow(),
            )
        )
        db.merge(
            PodcastModel(
                id="podcast-delete-1",
                user_id="auth-user-delete",
                title="Delete Podcast",
                source_type="ai",
                voice="Elif",
                format="summary",
                total_duration_sec=120,
                created_at=utcnow(),
            )
        )
        db.merge(
            PodcastPartModel(
                id="podcast-part-delete-1",
                podcast_id="podcast-delete-1",
                title="Part 1",
                duration_sec=120,
                page_range="1-2",
                status="ready",
                sort_order=1,
                queue_priority=0,
                source_slice_index=1,
                source_slice_total=1,
                audio_url="/static/uploads/audio/delete.wav",
                updated_at=utcnow(),
            )
        )
        db.merge(
            QuizQuestionModel(
                id="quiz-delete-1",
                podcast_id="podcast-delete-1",
                user_id="auth-user-delete",
                category="Test",
                question="Soru?",
                options=["A", "B", "C", "D"],
                correct_index=0,
                explanation="Açıklama",
                created_at=utcnow(),
            )
        )
        db.merge(
            GenerationJobModel(
                id="job-delete-1",
                user_id="auth-user-delete",
                status="completed",
                progress_pct=100,
                payload_json={"title": "Delete Podcast"},
                result_podcast_id="podcast-delete-1",
                error=None,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
        db.merge(
            FeedbackModel(
                id="feedback-delete-1",
                user_id="auth-user-delete",
                rating=5,
                tags_json=["clear"],
                text="good",
                content_id="podcast-delete-1",
                created_at=utcnow(),
            )
        )
        db.commit()

    response = client.delete("/api/v1/auth/account", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["auth_account_deleted"] is True
    assert payload["deleted_podcasts"] == 1
    assert payload["deleted_upload_assets"] == 1
    assert payload["deleted_feedback"] == 1
    assert payload["deleted_generation_jobs"] == 1
    assert payload["deleted_quiz_questions"] == 1

    with SessionLocal() as db:
        assert db.get(UserProfileModel, "auth-user-delete") is None
        assert db.get(UserLegalConsentModel, "auth-user-delete") is None
        assert db.get(UsageModel, "auth-user-delete") is None
        assert db.get(PodcastModel, "podcast-delete-1") is None
