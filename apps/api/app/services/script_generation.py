import json
import logging
import math
import re
from io import BytesIO
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pypdf import PdfReader

from app.core.config import settings
from app.db.models import UploadAssetModel
from app.services.storage import StorageClient

logger = logging.getLogger("tusbina-script")


def build_part_script(
    *,
    part_title: str,
    format_name: str,
    index: int,
    total: int,
    assets: list[UploadAssetModel],
    storage: StorageClient,
    asset_text_cache: dict[str, str] | None = None,
) -> str:
    source_text = _load_source_text(
        index=index,
        total=total,
        assets=assets,
        storage=storage,
        asset_text_cache=asset_text_cache,
    )
    target_limit = min(settings.script_target_max_chars, settings.tts_max_chars_per_part)

    llm_script = _generate_with_openrouter(
        source_text=source_text,
        part_title=part_title,
        format_name=format_name,
        index=index,
        total=total,
        target_limit=target_limit,
    )
    if llm_script:
        return llm_script[:target_limit].strip()

    return _generate_fallback_script(
        source_text=source_text,
        part_title=part_title,
        format_name=format_name,
        index=index,
        total=total,
        target_limit=target_limit,
    )


def build_asset_text_cache(*, assets: list[UploadAssetModel], storage: StorageClient) -> dict[str, str]:
    cache: dict[str, str] = {}
    for asset in assets:
        cache[asset.id] = _extract_text_from_asset(asset, storage)
    return cache


def _load_source_text(
    *,
    index: int,
    total: int,
    assets: list[UploadAssetModel],
    storage: StorageClient,
    asset_text_cache: dict[str, str] | None,
) -> str:
    if not assets:
        return ""

    # Prefer matching source asset when sections map one-to-one with uploaded files.
    preferred_asset = assets[index - 1] if index <= len(assets) else assets[0]
    texts: list[str] = []

    preferred_text = _resolve_asset_text(
        asset=preferred_asset,
        storage=storage,
        asset_text_cache=asset_text_cache,
    )
    if preferred_text:
        texts.append(
            _slice_text_for_part(
                preferred_text,
                index=index,
                total=total,
                max_chars=settings.script_source_max_chars,
            )
        )

    # Add short context from remaining assets so sections still keep global coherence.
    for asset in assets:
        if asset.id == preferred_asset.id:
            continue
        extra = _resolve_asset_text(asset=asset, storage=storage, asset_text_cache=asset_text_cache)
        if extra:
            texts.append(extra[: max(2000, settings.script_source_max_chars // 4)])

    merged = "\n\n".join(texts).strip()
    return merged[: settings.script_source_max_chars]


def _resolve_asset_text(
    *,
    asset: UploadAssetModel,
    storage: StorageClient,
    asset_text_cache: dict[str, str] | None,
) -> str:
    if asset_text_cache is None:
        return _extract_text_from_asset(asset, storage)
    if asset.id not in asset_text_cache:
        asset_text_cache[asset.id] = _extract_text_from_asset(asset, storage)
    return asset_text_cache[asset.id]


def _extract_text_from_asset(asset: UploadAssetModel, storage: StorageClient) -> str:
    try:
        raw = storage.read_bytes(asset.storage_key)
    except Exception as exc:
        logger.warning("Kaynak dosya okunamadi (%s): %s", asset.storage_key, exc)
        return ""

    filename_lower = (asset.filename or "").lower()
    content_type = (asset.content_type or "").lower()
    is_pdf = filename_lower.endswith(".pdf") or "pdf" in content_type

    text = ""
    if is_pdf:
        text = _extract_text_from_pdf(raw)

    if not text:
        text = raw.decode("utf-8", errors="ignore")

    return _normalize_text(text)


def _extract_text_from_pdf(raw: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(raw))
        pages: list[str] = []
        for page in reader.pages[: settings.script_pdf_max_pages]:
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text)
        return "\n".join(pages)
    except Exception as exc:
        logger.warning("PDF metin cikarimi basarisiz: %s", exc)
        return ""


def _normalize_text(text: str) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact


def _slice_text_for_part(text: str, *, index: int, total: int, max_chars: int) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return ""
    if total <= 1:
        return compact[:max_chars]

    chunk_size = max(1, math.ceil(len(compact) / total))
    start = max(0, (index - 1) * chunk_size)
    end = min(len(compact), start + chunk_size)
    chunk = compact[start:end]
    if not chunk:
        chunk = compact[max(0, len(compact) - chunk_size) :]

    return chunk[:max_chars]


def _generate_with_openrouter(
    *,
    source_text: str,
    part_title: str,
    format_name: str,
    index: int,
    total: int,
    target_limit: int,
) -> str | None:
    if not settings.openrouter_api_key:
        return None

    excerpt = source_text[: settings.script_source_max_chars] or (
        "Kaynak metin cikartilamadi. Baslik ve format bilgisinden tutarli bir bolum metni olustur."
    )
    style_hint = _format_style_hint(format_name)

    payload = {
        "model": settings.openrouter_model,
        "temperature": 0.3,
        "max_tokens": max(320, min(1800, int(target_limit * 0.7))),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are writing Turkish educational audio scripts for medical students. "
                    "Output plain text only, no markdown, no lists, no emojis."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Bolum: {index}/{total}\n"
                    f"Baslik: {part_title}\n"
                    f"Format: {format_name}\n"
                    f"Stil: {style_hint}\n"
                    f"Hedef: en fazla {target_limit} karakter.\n"
                    "Kaynak metne sadik kal, halusinasyon yapma, TUS odakli acik ve akici bir metin yaz.\n\n"
                    f"Kaynak:\n{excerpt}"
                ),
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

    try:
        with urlopen(req, timeout=settings.openrouter_timeout_sec) as response:
            raw = response.read().decode("utf-8", errors="ignore")
            body = json.loads(raw)
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("OpenRouter script üretimi basarisiz, fallback kullaniliyor: %s", exc)
        return None

    choices = body.get("choices") or []
    if not choices:
        return None

    content = choices[0].get("message", {}).get("content")
    if isinstance(content, list):
        content = " ".join(
            item.get("text", "") for item in content if isinstance(item, dict) and item.get("text")
        )
    if not isinstance(content, str):
        return None

    text = _normalize_text(content)
    return text or None


def _generate_fallback_script(
    *,
    source_text: str,
    part_title: str,
    format_name: str,
    index: int,
    total: int,
    target_limit: int,
) -> str:
    intro = f"Bolum {index}. {part_title}. "
    if format_name == "summary":
        bridge = "Hizli tekrar icin kritik noktalar: "
    elif format_name == "qa":
        bridge = "Soru cevap odaginda temel klinik mantik: "
    else:
        bridge = "Bu bolumde temel kavramlari sistematik sekilde ele aliyoruz: "

    outro = f" Bu icerik {total} bolumluk serinin {index}. bolumudur."
    static_len = len(intro) + len(bridge) + len(outro)
    snippet_budget = max(180, target_limit - static_len)

    snippet = _extractive_summary(source_text, max_chars=snippet_budget)
    if not snippet:
        snippet = "Kaynak metin sinirli oldugu icin bu bolum baslik odakli bir ozet olarak hazirlandi."

    text = f"{intro}{bridge}{snippet}{outro}"
    return text[:target_limit].strip()


def _extractive_summary(text: str, *, max_chars: int) -> str:
    if not text.strip():
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    selected: list[str] = []
    current_len = 0

    for sentence in sentences:
        cleaned = sentence.strip()
        if len(cleaned) < 30:
            continue

        projected = current_len + len(cleaned) + (1 if selected else 0)
        if selected and projected > max_chars:
            break

        selected.append(cleaned)
        current_len = projected
        if current_len >= max_chars:
            break

    summary = " ".join(selected).strip()
    if summary:
        return summary

    # Sentence extraction can fail on noisy OCR text; still return a bounded snippet.
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:max_chars]


def _format_style_hint(format_name: str) -> str:
    if format_name == "summary":
        return "Kisa, sinav odakli, tekrari kolay. Gereksiz detay verme."
    if format_name == "qa":
        return "Soru sorup yanitlayan aciklayici akista, net klinik gerekcelerle ilerle."
    return "Anlatimsel, akici, temel kavramdan klinik yoruma dogru ilerleyen dogal bir ton kullan."
