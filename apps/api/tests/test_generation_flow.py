from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import (
    GenerationJobModel,
    PodcastModel,
    PodcastPartModel,
    PodcastUserStateModel,
    UploadAssetModel,
)
from app.main import app
from app.services import tts as tts_module
from app.services.generation import (
    _build_auto_part_plan,
    _duration_from_audio_bytes,
    _extract_heading_titles,
    _is_dialogue_mode,
    _resolve_auto_chars_per_part,
    _resolve_dialogue_voice,
    _sections_look_like_defaults,
    _synthesize_part_audio,
    _synthesize_with_retry,
    process_next_generation_job,
    process_next_podcast_part_generation,
)
from app.services.storage import get_storage_client
from app.services.tts import TTSResult

client = TestClient(app)
DUMMY_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfeA\x0f\x9b\x98\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(autouse=True)
def clean_generation_tables() -> None:
    with SessionLocal() as db:
        db.query(PodcastUserStateModel).delete()
        db.query(PodcastPartModel).delete()
        db.query(PodcastModel).delete()
        db.query(GenerationJobModel).delete()
        db.query(UploadAssetModel).delete()
        db.commit()


def test_upload_generate_plans_immediately_and_generates_prioritized_parts() -> None:
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

    with SessionLocal() as db:
        assert process_next_generation_job(db, storage=get_storage_client()) is True

    status_response = client.get(
        f"/api/v1/generatePodcast/{job_id}/status",
        headers=user_headers,
    )
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "completed"
    assert status_payload["result_podcast_id"] is not None

    podcasts_response = client.get("/api/v1/podcasts", headers=user_headers)
    assert podcasts_response.status_code == 200
    podcasts = podcasts_response.json()
    podcast = next((item for item in podcasts if item["id"] == status_payload["result_podcast_id"]), None)
    assert podcast is not None
    assert len(podcast["parts"]) == 2
    assert podcast["parts"][0]["title"] == "Giriş"
    assert podcast["parts"][1]["title"] == "Klinik Akış"
    assert all(part["status"] == "queued" for part in podcast["parts"])

    refreshed_podcast = None
    for _ in range(6):
        with SessionLocal() as db:
            assert process_next_podcast_part_generation(db, storage=get_storage_client()) is True

        refreshed_response = client.get("/api/v1/podcasts", headers=user_headers)
        assert refreshed_response.status_code == 200
        refreshed_podcast = next(
            (item for item in refreshed_response.json() if item["id"] == status_payload["result_podcast_id"]),
            None,
        )
        assert refreshed_podcast is not None
        if all(part["status"] == "ready" for part in refreshed_podcast["parts"]):
            break

    assert refreshed_podcast is not None
    assert refreshed_podcast["parts"][0]["audio_url"].endswith(".wav")
    assert refreshed_podcast["parts"][1]["audio_url"].endswith(".wav")
    assert refreshed_podcast["parts"][0]["status"] == "ready"
    assert refreshed_podcast["parts"][1]["status"] == "ready"

    audio_key = refreshed_podcast["parts"][0]["audio_url"].split("/static/uploads/")[-1]
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


def test_generate_uses_uploaded_cover_image_when_provided(monkeypatch) -> None:
    user_id = f"cover-upload-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    monkeypatch.setattr(settings, "upload_allowed_extensions", "pdf,png")

    upload_response = client.post(
        "/api/v1/upload",
        files=[
            ("files", ("cover-source.pdf", DUMMY_PDF, "application/pdf")),
            ("files", ("cover-image.png", TINY_PNG, "image/png")),
        ],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    uploaded_file_ids = upload_response.json()["file_ids"]
    file_ids = [uploaded_file_ids[0]]
    cover_file_id = uploaded_file_ids[1]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Kapaklı Podcast",
            "voice": "Elif",
            "format": "summary",
            "file_ids": file_ids,
            "cover_file_id": cover_file_id,
            "sections": [],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    with SessionLocal() as db:
        assert process_next_generation_job(db, storage=get_storage_client()) is True

    status_response = client.get(f"/api/v1/generatePodcast/{job_id}/status", headers=user_headers)
    assert status_response.status_code == 200
    podcast_id = status_response.json()["result_podcast_id"]
    assert podcast_id

    podcast_response = client.get(f"/api/v1/podcasts/{podcast_id}", headers=user_headers)
    assert podcast_response.status_code == 200
    podcast = podcast_response.json()
    assert podcast["cover_image_source"] == "uploaded"
    assert podcast["cover_image_url"].endswith(".png")


def test_generate_supports_legacy_cover_payload_when_cover_is_in_file_ids(monkeypatch) -> None:
    user_id = f"legacy-cover-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    monkeypatch.setattr(settings, "upload_allowed_extensions", "pdf,png")

    upload_response = client.post(
        "/api/v1/upload",
        files=[
            ("files", ("legacy-source.pdf", DUMMY_PDF, "application/pdf")),
            ("files", ("legacy-cover.png", TINY_PNG, "image/png")),
        ],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Legacy Cover Payload",
            "voice": "Elif",
            "format": "summary",
            "file_ids": file_ids,
            "cover_file_id": file_ids[1],
            "sections": [],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    with SessionLocal() as db:
        assert process_next_generation_job(db, storage=get_storage_client()) is True

    status_response = client.get(f"/api/v1/generatePodcast/{job_id}/status", headers=user_headers)
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "completed"


def test_generate_builds_generated_cover_when_no_cover_asset_exists() -> None:
    user_id = f"cover-generated-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("generated-cover.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Generated Cover Podcast",
            "voice": "Ahmet",
            "format": "narrative",
            "file_ids": file_ids,
            "sections": [],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    with SessionLocal() as db:
        assert process_next_generation_job(db, storage=get_storage_client()) is True

    status_response = client.get(f"/api/v1/generatePodcast/{job_id}/status", headers=user_headers)
    assert status_response.status_code == 200
    podcast_id = status_response.json()["result_podcast_id"]
    assert podcast_id

    podcast_response = client.get(f"/api/v1/podcasts/{podcast_id}", headers=user_headers)
    assert podcast_response.status_code == 200
    podcast = podcast_response.json()
    assert podcast["cover_image_source"] == "generated"
    assert podcast["cover_image_url"].endswith(".svg")


def test_reorder_endpoint_changes_priority_window_for_lazy_tts() -> None:
    user_id = f"reorder-user-{uuid4().hex[:8]}"
    user_headers = {"x-user-id": user_id}

    upload_response = client.post(
        "/api/v1/upload",
        files=[("files", ("reorder.pdf", DUMMY_PDF, "application/pdf"))],
        headers=user_headers,
    )
    assert upload_response.status_code == 200
    file_ids = upload_response.json()["file_ids"]

    generation_response = client.post(
        "/api/v1/generatePodcast",
        json={
            "title": "Reorder Test",
            "voice": "Dr. Selin",
            "format": "summary",
            "file_ids": file_ids,
            "sections": [
                {"id": "s1", "title": "Bir", "enabled": True},
                {"id": "s2", "title": "Iki", "enabled": True},
                {"id": "s3", "title": "Uc", "enabled": True},
            ],
        },
        headers=user_headers,
    )
    assert generation_response.status_code == 200
    job_id = generation_response.json()["job_id"]

    with SessionLocal() as db:
        assert process_next_generation_job(db, storage=get_storage_client()) is True

    status_response = client.get(f"/api/v1/generatePodcast/{job_id}/status", headers=user_headers)
    assert status_response.status_code == 200
    podcast_id = status_response.json()["result_podcast_id"]
    assert podcast_id

    podcast_response = client.get(f"/api/v1/podcasts/{podcast_id}", headers=user_headers)
    assert podcast_response.status_code == 200
    parts = podcast_response.json()["parts"]
    reordered_ids = [parts[2]["id"], parts[0]["id"], parts[1]["id"]]

    reorder_response = client.put(
        f"/api/v1/podcasts/{podcast_id}/parts/order",
        json={"part_ids": reordered_ids},
        headers=user_headers,
    )
    assert reorder_response.status_code == 200
    reordered_titles = [part["title"] for part in reorder_response.json()["parts"]]
    assert reordered_titles == ["Uc", "Bir", "Iki"]

    refreshed_parts = []
    for _ in range(6):
        with SessionLocal() as db:
            assert process_next_podcast_part_generation(db, storage=get_storage_client()) is True

        refreshed_response = client.get(f"/api/v1/podcasts/{podcast_id}", headers=user_headers)
        assert refreshed_response.status_code == 200
        refreshed_parts = refreshed_response.json()["parts"]
        if refreshed_parts[0]["status"] == "ready":
            break

    assert refreshed_parts[0]["title"] == "Uc"
    assert refreshed_parts[0]["status"] == "ready"
    assert refreshed_parts[1]["status"] == "queued"


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


def test_sections_look_like_defaults_detects_filename_seeded_sections() -> None:
    assets = [
        UploadAssetModel(
            id="asset-a",
            user_id="u-defaults",
            filename="Kardiyoloji Giriş.pdf",
            content_type="application/pdf",
            size_bytes=1,
            storage_key="asset-a.pdf",
            public_url="/a.pdf",
        ),
        UploadAssetModel(
            id="asset-b",
            user_id="u-defaults",
            filename="Nefroloji Notları.pdf",
            content_type="application/pdf",
            size_bytes=1,
            storage_key="asset-b.pdf",
            public_url="/b.pdf",
        ),
    ]
    section_titles = ["Kardiyoloji Giriş", "Nefroloji Notları"]
    assert _sections_look_like_defaults(section_titles=section_titles, assets=assets) is True


def test_extract_heading_titles_prefers_structured_lines() -> None:
    source_text = "\n".join(
        [
            "Giriş metni uzun bir açıklama olarak geçer ve başlık değildir.",
            "1. KARDIYOVASKULER FIZYOLOJI",
            "Kan basıncı regülasyonu bu satırda detaylıca anlatılır.",
            "2. HEMODINAMIK PARAMETRELER",
            "3. VAKA ODAKLI YORUM",
        ]
    )
    headings = _extract_heading_titles(source_text, max_count=3)
    assert headings == [
        "1. KARDIYOVASKULER FIZYOLOJI",
        "2. HEMODINAMIK PARAMETRELER",
        "3. VAKA ODAKLI YORUM",
    ]


def test_is_dialogue_mode_by_voice_or_format() -> None:
    assert _is_dialogue_mode(format_name="narrative", voice_name="Diyalog") is True
    assert _is_dialogue_mode(format_name="qa", voice_name="Elif") is True
    assert _is_dialogue_mode(format_name="summary", voice_name="Elif") is False


def test_dialogue_neural_voice_routes_to_emel_and_ahmet_neural() -> None:
    assert _resolve_dialogue_voice(speaker="Anlatıcı", selected_voice="Diyalog Neural") == "Emel Neural"
    assert _resolve_dialogue_voice(speaker="Hoca", selected_voice="Diyalog Neural") == "Ahmet Neural"
    assert _resolve_dialogue_voice(speaker="Ahmet", selected_voice="Diyalog Neural") == "Ahmet Neural"


def test_duration_from_audio_bytes_supports_mp3() -> None:
    # A tiny fake mp3 payload should be rejected gracefully (None), not crash.
    assert _duration_from_audio_bytes(b"not-a-real-mp3", extension="mp3") is None


def test_synthesize_with_retry_recovers_after_transient_failure(monkeypatch) -> None:
    class _FlakyTTS:
        def __init__(self) -> None:
            self.calls = 0

        def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("gecici hata")
            return TTSResult(content=b"wav-data", extension="wav", content_type="audio/wav")

    monkeypatch.setattr(settings, "piper_synthesize_retries", 2)
    monkeypatch.setattr(settings, "piper_synthesize_retry_backoff_sec", 0.0)
    flaky = _FlakyTTS()

    result = _synthesize_with_retry(tts_service=flaky, text="deneme", voice="Elif")

    assert result.content == b"wav-data"
    assert flaky.calls == 2


def test_diyalog_voice_forces_dual_speakers_on_unlabeled_text(monkeypatch) -> None:
    class _CaptureTTS:
        def __init__(self) -> None:
            self.voices: list[str] = []

        def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
            self.voices.append(voice or "default")
            tone = 520 if (voice or "").lower() == "ahmet" else 460
            return TTSResult(
                content=tts_module._build_sine_wav(duration_sec=1, frequency=tone),
                extension="wav",
                content_type="audio/wav",
            )

    monkeypatch.setattr(settings, "piper_dialogue_parallel_workers", 1)
    tts = _CaptureTTS()
    script = (
        "Hiponatremi degerlendirmesinde serum osmolalite, idrar sodyumu ve volu"
        "m durumu birlikte yorumlanir. SIADH ile hipovolemik nedenler ayirici "
        "tanida kritik rol oynar."
    )

    _synthesize_part_audio(
        tts_service=tts,
        script=script,
        selected_voice="Diyalog",
        dialogue_mode=True,
    )

    assert "Elif" in tts.voices
    assert "Ahmet" in tts.voices


def test_non_dialogue_voice_does_not_force_dual_speakers(monkeypatch) -> None:
    class _CaptureTTS:
        def __init__(self) -> None:
            self.voices: list[str] = []

        def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
            self.voices.append(voice or "default")
            return TTSResult(
                content=tts_module._build_sine_wav(duration_sec=1, frequency=460),
                extension="wav",
                content_type="audio/wav",
            )

    monkeypatch.setattr(settings, "piper_dialogue_parallel_workers", 1)
    tts = _CaptureTTS()
    script = "Bu metin speaker etiketi olmadan tek parca uretilmis bir soru-cevap ozetidir."

    _synthesize_part_audio(
        tts_service=tts,
        script=script,
        selected_voice="Elif",
        dialogue_mode=True,
    )

    assert tts.voices
    assert all(voice == "Elif" for voice in tts.voices)


def test_unlabeled_multiline_qa_falls_back_to_single_voice(monkeypatch) -> None:
    class _CaptureTTS:
        def __init__(self) -> None:
            self.voices: list[str] = []

        def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
            self.voices.append(voice or "default")
            return TTSResult(
                content=tts_module._build_sine_wav(duration_sec=1, frequency=460),
                extension="wav",
                content_type="audio/wav",
            )

    monkeypatch.setattr(settings, "piper_dialogue_parallel_workers", 1)
    tts = _CaptureTTS()
    script = (
        "Hiponatremi degerlendirmesinde serum osmolalite birlikte yorumlanir.\n"
        "SIADH ile hipovolemik nedenler ayirici tanida kritik rol oynar.\n"
        "Tedavi planinda altta yatan neden ve semptom siddeti birlikte ele alinir."
    )

    _synthesize_part_audio(
        tts_service=tts,
        script=script,
        selected_voice="Elif",
        dialogue_mode=True,
    )

    assert tts.voices == ["Elif"]
