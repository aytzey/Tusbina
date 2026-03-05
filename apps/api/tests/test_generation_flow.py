from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import UploadAssetModel
from app.main import app
from app.services.generation import _build_auto_part_plan, _resolve_auto_chars_per_part, process_next_generation_job
from app.services.storage import get_storage_client

client = TestClient(app)
DUMMY_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def test_upload_generate_and_complete_job() -> None:
    user_id = f"test-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("test.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    upload_payload = upload_response.json()
    file_ids = upload_payload["file_ids"]
    assert len(file_ids) == 1

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Test Podcast",
            "voice": "Dr. Selin",
            "format": "narrative",
            "file_ids": file_ids,
            "sections": [
                {"id": "s1", "title": "Giriş", "enabled": True},
                {"id": "s2", "title": "Klinik Akış", "enabled": True},
                {"id": "s3", "title": "Ek Not", "enabled": False},
            ],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    status_payload = None
    for _ in range(20):
        with SessionLocal() as db:
            process_next_generation_job(db, storage=get_storage_client())

        status_response = client.get(
            f"/api/v1/generatePodcast/{job_id}/status",
            headers=user_headers,
        )
        assert status_response.status_code == 200
        status_payload = status_response.json()
        if status_payload["status"] == "completed":
            break

    assert status_payload is not None
    assert status_payload["status"] == "completed"
    assert status_payload["result_podcast_id"] is not None

    podcasts_response = client.get("/api/v1/podcasts", headers=user_headers)
    assert podcasts_response.status_code == 200
    podcasts = podcasts_response.json()
    podcast = next((item for item in podcasts if item["id"] == status_payload["result_podcast_id"]), None)
    assert podcast is not None
    assert len(podcast["parts"]) == 2
    assert podcast["parts"][0]["title"].endswith("Giriş")
    assert podcast["parts"][1]["title"].endswith("Klinik Akış")
    assert podcast["parts"][0]["audio_url"].endswith(".wav")

    audio_key = podcast["parts"][0]["audio_url"].split("/static/uploads/")[-1]
    audio_path = Path(settings.local_upload_dir) / audio_key
    assert audio_path.exists()
    assert audio_path.stat().st_size > 128


def test_generate_accepts_uploaded_file_ids_alias() -> None:
    user_id = f"alias-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("alias.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Alias Payload",
            "voice": "Dr. Selin",
            "format": "summary",
            "uploaded_file_ids": file_ids,
            "sections": [{"id": "s1", "title": "Ozet", "enabled": True}],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    assert generation_response.json()["status"] == "queued"


def test_generate_fails_when_some_file_ids_are_missing() -> None:
    user_id = f"missing-ids-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("existing.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    existing_file_id = upload_response.json()["file_ids"][0]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Missing IDs",
            "voice": "Dr. Selin",
            "format": "narrative",
            "file_ids": [existing_file_id, "does-not-exist"],
            "sections": [
                {"id": "s1", "title": "Birinci", "enabled": True},
                {"id": "s2", "title": "Ikinci", "enabled": True},
            ],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    status_payload = None
    for _ in range(20):
        with SessionLocal() as db:
            process_next_generation_job(db, storage=get_storage_client())
        status_response = client.get(f"/api/v1/generatePodcast/{job_id}/status", headers=user_headers)
        assert status_response.status_code == 200
        status_payload = status_response.json()
        if status_payload["status"] == "failed":
            break

    assert status_payload is not None
    assert status_payload["status"] == "failed"
    assert "not found" in (status_payload.get("error") or "").lower()


def test_generate_rejects_too_many_parts(monkeypatch) -> None:
    user_id = f"parts-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}
    monkeypatch.setattr(settings, "generation_max_parts", 1)

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("many.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Too many sections",
            "voice": "Dr. Selin",
            "format": "summary",
            "file_ids": file_ids,
            "sections": [
                {"id": "s1", "title": "A", "enabled": True},
                {"id": "s2", "title": "B", "enabled": True},
            ],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 400


def test_generate_auto_splits_long_pdf_when_using_default_single_section(monkeypatch) -> None:
    user_id = f"auto-split-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "script_auto_chars_per_part", 800)
    monkeypatch.setattr(settings, "generation_max_parts", 20)
    monkeypatch.setattr(settings, "upload_allowed_extensions", "pdf,txt")
    monkeypatch.setattr(settings, "upload_validate_pdf_signature", False)

    long_plain_text = (
        "Anemi algoritmasinda ilk adim hemoglobin ve eritrosit indekslerini birlikte yorumlamaktir. "
        "Demir eksikligi, kronik hastalik anemisi ve megaloblastik surecler ayirici tanida temel eksendir. "
    ) * 120

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("uzun-kaynak.txt", long_plain_text.encode("utf-8"), "text/plain"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Uzun Kaynak Test",
            "voice": "Dr. Selin",
            "format": "summary",
            "file_ids": file_ids,
            "sections": [],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    status_payload = None
    for _ in range(40):
        with SessionLocal() as db:
            process_next_generation_job(db, storage=get_storage_client())

        status_response = client.get(
            f"/api/v1/generatePodcast/{job_id}/status",
            headers=user_headers,
        )
        assert status_response.status_code == 200
        status_payload = status_response.json()
        if status_payload["status"] == "completed":
            break

    assert status_payload is not None
    assert status_payload["status"] == "completed"
    assert status_payload["result_podcast_id"] is not None

    podcasts_response = client.get("/api/v1/podcasts", headers=user_headers)
    assert podcasts_response.status_code == 200
    podcasts = podcasts_response.json()
    podcast = next((item for item in podcasts if item["id"] == status_payload["result_podcast_id"]), None)
    assert podcast is not None
    assert len(podcast["parts"]) >= 2


def test_generate_respects_explicit_single_section_without_auto_split(monkeypatch) -> None:
    user_id = f"explicit-single-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "script_auto_chars_per_part", 800)
    monkeypatch.setattr(settings, "generation_max_parts", 20)
    monkeypatch.setattr(settings, "upload_allowed_extensions", "pdf,txt")
    monkeypatch.setattr(settings, "upload_validate_pdf_signature", False)

    long_plain_text = (
        "Anemi algoritmasinda ilk adim hemoglobin ve eritrosit indekslerini birlikte yorumlamaktir. "
        "Demir eksikligi, kronik hastalik anemisi ve megaloblastik surecler ayirici tanida temel eksendir. "
    ) * 120

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("tek-bolum-kaynak.txt", long_plain_text.encode("utf-8"), "text/plain"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Tek Bolum Koruma Test",
            "voice": "Dr. Selin",
            "format": "summary",
            "file_ids": file_ids,
            "sections": [{"id": "s1", "title": "Tek Bolum", "enabled": True}],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    status_payload = None
    for _ in range(40):
        with SessionLocal() as db:
            process_next_generation_job(db, storage=get_storage_client())
        status_response = client.get(
            f"/api/v1/generatePodcast/{job_id}/status",
            headers=user_headers,
        )
        assert status_response.status_code == 200
        status_payload = status_response.json()
        if status_payload["status"] == "completed":
            break

    assert status_payload is not None
    assert status_payload["status"] == "completed"
    assert status_payload["result_podcast_id"] is not None

    podcasts_response = client.get("/api/v1/podcasts", headers=user_headers)
    assert podcasts_response.status_code == 200
    podcasts = podcasts_response.json()
    podcast = next((item for item in podcasts if item["id"] == status_payload["result_podcast_id"]), None)
    assert podcast is not None
    assert len(podcast["parts"]) == 1


def test_resolve_auto_chars_per_part_changes_by_format(monkeypatch) -> None:
    monkeypatch.setattr(settings, "script_auto_chars_per_part", 4000)
    monkeypatch.setattr(settings, "script_auto_chars_per_part_narrative", 3200)
    monkeypatch.setattr(settings, "script_auto_chars_per_part_summary", 1800)
    monkeypatch.setattr(settings, "script_auto_chars_per_part_qa", 2300)

    assert _resolve_auto_chars_per_part(format_name="narrative") == 3200
    assert _resolve_auto_chars_per_part(format_name="summary") == 1800
    assert _resolve_auto_chars_per_part(format_name="qa") == 2300


def test_resolve_auto_chars_per_part_scales_for_very_long_assets(monkeypatch) -> None:
    monkeypatch.setattr(settings, "script_auto_chars_per_part", 4000)
    monkeypatch.setattr(settings, "script_auto_chars_per_part_narrative", 3200)
    monkeypatch.setattr(settings, "generation_target_max_parts", 100)
    monkeypatch.setattr(settings, "script_source_max_chars", 12000)

    scaled = _resolve_auto_chars_per_part(format_name="narrative", text_len=900_000)
    assert scaled == 9000


def test_build_auto_part_plan_keeps_asset_mapping_for_multi_file(monkeypatch) -> None:
    monkeypatch.setattr(settings, "generation_max_parts", 50)
    monkeypatch.setattr(settings, "generation_target_max_parts", 4)
    monkeypatch.setattr(settings, "script_auto_chars_per_part", 3000)
    monkeypatch.setattr(settings, "script_auto_chars_per_part_narrative", 3000)
    monkeypatch.setattr(settings, "script_source_max_chars", 12000)

    assets = [
        UploadAssetModel(
            id="asset-a",
            user_id="u-map",
            filename="kardiyoloji.pdf",
            content_type="application/pdf",
            size_bytes=1,
            storage_key="asset-a.pdf",
            public_url="/a.pdf",
        ),
        UploadAssetModel(
            id="asset-b",
            user_id="u-map",
            filename="nefroloji.pdf",
            content_type="application/pdf",
            size_bytes=1,
            storage_key="asset-b.pdf",
            public_url="/b.pdf",
        ),
    ]
    text_cache = {
        "asset-a": "A" * 24000,
        "asset-b": "B" * 12000,
    }

    plan = _build_auto_part_plan(assets=assets, asset_text_cache=text_cache, format_name="narrative")

    first_asset_parts = [entry for entry in plan if entry.asset_id == "asset-a"]
    second_asset_parts = [entry for entry in plan if entry.asset_id == "asset-b"]

    assert len(first_asset_parts) >= 2
    assert len(second_asset_parts) >= 1
    assert [entry.asset_part_index for entry in first_asset_parts] == list(
        range(1, first_asset_parts[0].asset_part_total + 1)
    )
    assert [entry.asset_part_index for entry in second_asset_parts] == list(
        range(1, second_asset_parts[0].asset_part_total + 1)
    )
