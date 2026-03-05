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
