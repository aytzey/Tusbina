from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.services.generation import process_next_generation_job
from app.services.storage import get_storage_client

client = TestClient(app)
DUMMY_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def test_podcast_state_and_usage_actions() -> None:
    user_headers = {"x-user-id": "state-user"}

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("state.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "State Podcast",
            "voice": "Dr. Selin",
            "format": "narrative",
            "file_ids": file_ids,
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200

    with SessionLocal() as db:
        processed = process_next_generation_job(db, storage=get_storage_client())
    assert processed is True

    podcasts_response = client.get("/api/v1/podcasts", headers=user_headers)
    assert podcasts_response.status_code == 200
    podcasts = podcasts_response.json()
    assert len(podcasts) >= 1
    podcast = next((item for item in podcasts if item["title"] == "State Podcast"), podcasts[0])
    podcast_id = podcast["id"]

    update_state_response = client.put(
        f"/api/v1/podcasts/{podcast_id}/state",
        json={"is_favorite": True, "is_downloaded": True, "progress_sec": 123},
        headers=user_headers,
    )
    assert update_state_response.status_code == 200
    updated = update_state_response.json()
    assert updated["is_favorite"] is True
    assert updated["is_downloaded"] is True
    assert updated["progress_sec"] == min(123, podcast["total_duration_sec"])

    usage_initial = client.get("/api/v1/usage", headers=user_headers)
    assert usage_initial.status_code == 200

    usage_after_consume = client.post("/api/v1/usage/consume", json={"seconds": 180}, headers=user_headers)
    assert usage_after_consume.status_code == 200
    consume_payload = usage_after_consume.json()
    assert consume_payload["monthly_used_sec"] >= 180
    assert consume_payload["consumed_sec"] > 0
    assert consume_payload["limit_reached"] is False

    usage_after_premium = client.post("/api/v1/usage/premium/activate", headers=user_headers)
    assert usage_after_premium.status_code == 200
    assert usage_after_premium.json()["is_premium"] is True

    usage_after_package = client.post(
        "/api/v1/usage/package/add", json={"extra_seconds": 600}, headers=user_headers
    )
    assert usage_after_package.status_code == 200
    assert usage_after_package.json()["monthly_listen_quota_sec"] >= 36000
