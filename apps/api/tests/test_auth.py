from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
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
