from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import UsageModel
from app.main import app

client = TestClient(app)


def test_usage_consume_reports_limit_reached() -> None:
    user_headers = {"x-user-id": f"limit-user-{uuid4().hex[:8]}"}

    first = client.post("/api/v1/usage/consume", json={"seconds": settings.demo_monthly_quota_sec}, headers=user_headers)
    assert first.status_code == 200
    assert first.json()["limit_reached"] is False
    assert first.json()["consumed_sec"] == settings.demo_monthly_quota_sec

    second = client.post("/api/v1/usage/consume", json={"seconds": 10}, headers=user_headers)
    assert second.status_code == 200
    payload = second.json()
    assert payload["consumed_sec"] == 0
    assert payload["limit_reached"] is True
    assert payload["remaining_sec"] == 0


def test_usage_rollover_resets_demo_quota_and_consumption() -> None:
    user_id = f"rollover-user-{uuid4().hex[:8]}"

    with SessionLocal() as db:
        db.add(
            UsageModel(
                user_id=user_id,
                monthly_listen_quota_sec=9999,
                monthly_used_sec=1234,
                is_premium=False,
                updated_at=datetime(2025, 1, 1, tzinfo=UTC),
            )
        )
        db.commit()

    response = client.get("/api/v1/usage", headers={"x-user-id": user_id})
    assert response.status_code == 200
    payload = response.json()
    assert payload["monthly_used_sec"] == 0
    assert payload["monthly_listen_quota_sec"] == settings.demo_monthly_quota_sec
