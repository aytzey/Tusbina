from uuid import uuid4

from app.core.database import SessionLocal
from app.db.models import GenerationJobModel, PodcastModel, PodcastPartModel, UploadAssetModel
from app.services.quiz_generation import generate_quiz_for_podcast
from app.services.storage import get_storage_client


def _make_asset(*, user_id: str, filename: str, content: bytes, content_type: str = "text/plain") -> UploadAssetModel:
    storage = get_storage_client()
    stored = storage.save_bytes(
        filename=filename,
        content=content,
        content_type=content_type,
        user_id=user_id,
    )
    return UploadAssetModel(
        id=stored.asset_id,
        user_id=user_id,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content),
        storage_key=stored.storage_key,
        public_url=stored.public_url,
    )


def test_generate_quiz_uses_selected_part_source(monkeypatch) -> None:
    user_id = f"quiz-user-{uuid4().hex[:8]}"
    podcast_id = f"pod-{uuid4().hex[:10]}"
    part1_id = f"{podcast_id}-part-1"
    part2_id = f"{podcast_id}-part-2"

    long_text = ("ALFA " * 1400) + ("OMEGA " * 1400)
    asset = _make_asset(
        user_id=user_id,
        filename="kaynak.txt",
        content=long_text.encode("utf-8"),
        content_type="text/plain",
    )

    captured: dict[str, str] = {}

    def _fake_openrouter(*, source_text: str, question_count: int) -> list[dict]:
        captured["source_text"] = source_text
        return [
            {
                "category": "Dahiliye",
                "question": f"Soru {question_count}",
                "options": ["A) A", "B) B", "C) C", "D) D", "E) E"],
                "correct_index": 0,
                "explanation": "Aciklama",
            }
        ]

    monkeypatch.setattr("app.services.quiz_generation._generate_with_openrouter", _fake_openrouter)

    with SessionLocal() as db:
        db.add(asset)
        db.add(
            PodcastModel(
                id=podcast_id,
                user_id=user_id,
                title="Bobrek Notlari",
                source_type="ai",
                voice="Dr. Selin",
                format="summary",
                total_duration_sec=1200,
            )
        )
        db.add(
            PodcastPartModel(
                id=part1_id,
                podcast_id=podcast_id,
                title="Bolum 1: Giris",
                duration_sec=600,
                page_range="s1",
                status="ready",
                audio_url=None,
            )
        )
        db.add(
            PodcastPartModel(
                id=part2_id,
                podcast_id=podcast_id,
                title="Bolum 2: Klinik Yaklasim",
                duration_sec=600,
                page_range="s2",
                status="ready",
                audio_url=None,
            )
        )
        db.add(
            GenerationJobModel(
                id=f"job-{uuid4().hex[:8]}",
                user_id=user_id,
                status="completed",
                progress_pct=100,
                payload_json={"file_ids": [asset.id]},
                result_podcast_id=podcast_id,
                error=None,
            )
        )
        db.commit()

        questions = generate_quiz_for_podcast(
            db,
            podcast_id=podcast_id,
            part_id=part2_id,
            user_id=user_id,
            question_count=3,
        )

    assert len(questions) == 1
    assert "Odak bolum basligi: Bolum 2: Klinik Yaklasim" in captured["source_text"]
    assert "Bolum indeks: 2/2" in captured["source_text"]
    assert "OMEGA" in captured["source_text"]


def test_generate_quiz_rejects_unknown_part_id(monkeypatch) -> None:
    user_id = f"quiz-user-{uuid4().hex[:8]}"
    podcast_id = f"pod-{uuid4().hex[:10]}"

    monkeypatch.setattr("app.services.quiz_generation._generate_with_openrouter", lambda **_: [])
    with SessionLocal() as db:
        db.add(
            PodcastModel(
                id=podcast_id,
                user_id=user_id,
                title="Nefroloji",
                source_type="ai",
                voice="Dr. Selin",
                format="summary",
                total_duration_sec=400,
            )
        )
        db.commit()

        try:
            generate_quiz_for_podcast(
                db,
                podcast_id=podcast_id,
                part_id="missing-part-id",
                user_id=user_id,
                question_count=3,
            )
        except ValueError as exc:
            assert "Podcast bolumu bulunamadi" in str(exc)
        else:
            raise AssertionError("Expected ValueError for unknown part_id")
