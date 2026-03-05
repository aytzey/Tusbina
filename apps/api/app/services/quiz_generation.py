import json
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import GenerationJobModel, PodcastModel, PodcastPartModel, QuizQuestionModel, UploadAssetModel
from app.services.script_generation import build_asset_text_cache
from app.services.storage import StorageClient, get_storage_client

logger = logging.getLogger("tusbina-quiz")

_QUIZ_SYSTEM_PROMPT = (
    "Sen Turkiye'deki TUS (Tipta Uzmanlik Sinavi) icin soru hazirlayan uzman bir tip egitmenisin. "
    "Verilen icerikten coktan secmeli sorular ureteceksin. "
    "Her soru 5 secenek (A-E) icermeli. "
    "Ciktini yalnizca gecerli bir JSON dizisi olarak ver, baska hicbir sey ekleme. "
    "Markdown kullanma, kod blogu kullanma, yalnizca ham JSON yaz."
)

_QUIZ_USER_PROMPT_TEMPLATE = (
    "Asagidaki tip egitim iceriginden {count} adet TUS tarzinda coktan secmeli soru uret.\n\n"
    "Kurallar:\n"
    "- Her soruda 5 secenek (A-E) olmali\n"
    "- Dogru cevap indeksi 0-4 arasi olmali (0=A, 1=B, 2=C, 3=D, 4=E)\n"
    "- Her soru icin kisa bir aciklama yaz\n"
    "- Icerikten kategori cikar (ornegin Kardiyoloji, Noroloji, Dahiliye vb.)\n"
    "- Sorular klinik odakli, TUS seviyesinde ve Turkce olmali\n"
    "- Halusinasyon yapma, yalnizca verilen icerikteki bilgilere dayan\n\n"
    "Ciktini asagidaki JSON formatinda ver:\n"
    '[{{"category": "...", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."], '
    '"correct_index": 0, "explanation": "..."}}]\n\n'
    "Icerik:\n{source_text}"
)


def generate_quiz_for_podcast(
    db: Session,
    *,
    podcast_id: str,
    user_id: str,
    question_count: int = 5,
) -> list[QuizQuestionModel]:
    """Generate TUS-style quiz questions from a podcast's content and persist them."""

    podcast = db.execute(
        select(PodcastModel).where(
            PodcastModel.id == podcast_id,
            PodcastModel.user_id == user_id,
        )
    ).scalar_one_or_none()

    if podcast is None:
        raise ValueError("Podcast bulunamadi")

    source_text = _collect_source_text(db, podcast_id=podcast_id, podcast_title=podcast.title)

    question_count = max(3, min(question_count, 10))

    raw_questions = _generate_with_openrouter(
        source_text=source_text,
        question_count=question_count,
    )

    if not raw_questions:
        raise RuntimeError("Quiz sorulari uretilemedi — LLM yanit vermedi veya ayristirilamadi")

    models: list[QuizQuestionModel] = []
    for item in raw_questions:
        options = item.get("options")
        if not isinstance(options, list) or len(options) != 5:
            continue

        correct_index = item.get("correct_index")
        if not isinstance(correct_index, int) or correct_index < 0 or correct_index > 4:
            continue

        question_text = (item.get("question") or "").strip()
        if not question_text:
            continue

        model = QuizQuestionModel(
            id=uuid4().hex,
            podcast_id=podcast_id,
            user_id=user_id,
            category=(item.get("category") or "Genel").strip(),
            question=question_text,
            options=options,
            correct_index=correct_index,
            explanation=(item.get("explanation") or "").strip(),
        )
        models.append(model)

    if not models:
        raise RuntimeError("LLM yanitindan gecerli soru ayristirilamadi")

    for model in models:
        db.add(model)
    db.commit()

    for model in models:
        db.refresh(model)

    return models


def get_quiz_questions(
    db: Session,
    *,
    podcast_id: str,
    user_id: str,
) -> list[QuizQuestionModel]:
    """Retrieve existing quiz questions for a podcast."""
    stmt = (
        select(QuizQuestionModel)
        .where(
            QuizQuestionModel.podcast_id == podcast_id,
            QuizQuestionModel.user_id == user_id,
        )
        .order_by(QuizQuestionModel.created_at)
    )
    return list(db.execute(stmt).scalars().all())


def _collect_source_text(db: Session, *, podcast_id: str, podcast_title: str) -> str:
    """Load original PDF content from upload assets linked to this podcast's generation job."""

    # Find the generation job that produced this podcast
    job = db.execute(
        select(GenerationJobModel).where(GenerationJobModel.result_podcast_id == podcast_id)
    ).scalar_one_or_none()

    if job is not None:
        file_ids = (job.payload_json or {}).get("file_ids", [])
        if file_ids:
            assets = list(
                db.execute(
                    select(UploadAssetModel).where(UploadAssetModel.id.in_(file_ids))
                ).scalars().all()
            )
            if assets:
                storage = get_storage_client()
                text_cache = build_asset_text_cache(assets=assets, storage=storage)
                merged = "\n\n".join(t for t in text_cache.values() if t).strip()
                if merged:
                    header = f"Podcast basligi: {podcast_title}\n\n"
                    return (header + merged)[: settings.script_source_max_chars]

    # Fallback: use part titles if no source assets found
    parts = db.execute(
        select(PodcastPartModel)
        .where(PodcastPartModel.podcast_id == podcast_id)
        .order_by(PodcastPartModel.id)
    ).scalars().all()

    segments: list[str] = [f"Podcast basligi: {podcast_title}"]
    for part in parts:
        segments.append(f"Bolum: {part.title}")

    merged = "\n\n".join(segments).strip()
    return merged[: settings.script_source_max_chars] if merged else podcast_title


def _generate_with_openrouter(
    *,
    source_text: str,
    question_count: int,
) -> list[dict] | None:
    """Call OpenRouter to generate quiz questions and parse the JSON response."""
    if not settings.openrouter_api_key:
        return None

    excerpt = source_text[: settings.script_source_max_chars] or (
        "Kaynak metin cikartilamadi. Genel tip bilgisi sorulari uret."
    )

    user_content = _QUIZ_USER_PROMPT_TEMPLATE.format(
        count=question_count,
        source_text=excerpt,
    )

    payload = {
        "model": settings.openrouter_model,
        "temperature": 0.4,
        "max_tokens": 4000,
        "messages": [
            {
                "role": "system",
                "content": _QUIZ_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": user_content,
            },
        ],
    }

    req = Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://tusbina.local",
            "X-Title": "TUSBINA",
        },
        method="POST",
    )

    # Quiz generation needs more time than single-part scripts
    timeout = max(settings.openrouter_timeout_sec, 90)

    try:
        with urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="ignore")
            body = json.loads(raw)
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("OpenRouter quiz uretimi basarisiz: %s", exc)
        if isinstance(exc, HTTPError):
            try:
                err_body = exc.read().decode("utf-8", errors="ignore")
                logger.warning("OpenRouter hata detayi: %s", err_body[:500])
            except Exception:
                pass
        return None

    choices = body.get("choices") or []
    if not choices:
        logger.warning("OpenRouter bos choices dondu: %s", json.dumps(body)[:500])
        return None

    content = choices[0].get("message", {}).get("content")
    if isinstance(content, list):
        content = " ".join(
            item.get("text", "") for item in content if isinstance(item, dict) and item.get("text")
        )
    if not isinstance(content, str):
        logger.warning("OpenRouter content tipi beklenmiyor: %s", type(content))
        return None

    parsed = _parse_quiz_json(content)
    if parsed is None:
        logger.warning("Quiz JSON ayristirilamadi, content: %s", content[:500])
    return parsed


def _parse_quiz_json(text: str) -> list[dict] | None:
    """Extract a JSON array of quiz questions from potentially noisy LLM output."""
    # Try direct parse first
    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    # Try to extract JSON array from markdown code block or surrounding text
    match = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    logger.warning("Quiz JSON ayristirilamadi: %s", text[:500])
    return None
