import json
import logging
import math
import re
import time as _time
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
    voice_name: str | None = None,
    index: int,
    total: int,
    assets: list[UploadAssetModel],
    storage: StorageClient,
    asset_text_cache: dict[str, str] | None = None,
    asset_context_cache: dict[str, str] | None = None,
    preferred_asset_id: str | None = None,
    source_slice_index: int | None = None,
    source_slice_total: int | None = None,
    dialogue_mode: bool = False,
) -> str:
    source_text = _load_source_text(
        index=index,
        total=total,
        assets=assets,
        storage=storage,
        asset_text_cache=asset_text_cache,
        asset_context_cache=asset_context_cache,
        preferred_asset_id=preferred_asset_id,
        source_slice_index=source_slice_index,
        source_slice_total=source_slice_total,
    )
    target_limit = _resolve_target_limit(format_name=format_name)

    llm_script = _generate_with_openrouter(
        source_text=source_text,
        part_title=part_title,
        format_name=format_name,
        voice_name=voice_name,
        index=index,
        total=total,
        target_limit=target_limit,
        dialogue_mode=dialogue_mode,
    )
    if llm_script:
        return llm_script[:target_limit].strip()

    return _generate_fallback_script(
        source_text=source_text,
        part_title=part_title,
        format_name=format_name,
        voice_name=voice_name,
        index=index,
        total=total,
        target_limit=target_limit,
        dialogue_mode=dialogue_mode,
    )


def build_asset_text_cache(*, assets: list[UploadAssetModel], storage: StorageClient) -> dict[str, str]:
    cache: dict[str, str] = {}
    for asset in assets:
        t0 = _time.monotonic()
        cache[asset.id] = _extract_text_from_asset(asset, storage)
        logger.info(
            "Asset text extracted: %s (%d chars, %.1fs)",
            asset.filename,
            len(cache[asset.id]),
            _time.monotonic() - t0,
        )
    return cache


def build_asset_context_cache(
    *,
    assets: list[UploadAssetModel],
    asset_text_cache: dict[str, str],
) -> dict[str, str]:
    context_limit = max(2000, settings.script_source_max_chars // 4)
    return {
        asset.id: (asset_text_cache.get(asset.id, "")[:context_limit])
        for asset in assets
    }


def _load_source_text(
    *,
    index: int,
    total: int,
    assets: list[UploadAssetModel],
    storage: StorageClient,
    asset_text_cache: dict[str, str] | None,
    asset_context_cache: dict[str, str] | None,
    preferred_asset_id: str | None,
    source_slice_index: int | None,
    source_slice_total: int | None,
) -> str:
    if not assets:
        return ""

    # Prefer matching source asset when sections map one-to-one with uploaded files.
    by_id = {asset.id: asset for asset in assets}
    preferred_asset = by_id.get(preferred_asset_id) if preferred_asset_id else None
    if preferred_asset is None:
        preferred_asset = assets[index - 1] if index <= len(assets) else assets[0]

    effective_index = source_slice_index if source_slice_index and source_slice_index > 0 else index
    effective_total = source_slice_total if source_slice_total and source_slice_total > 0 else total
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
                index=effective_index,
                total=effective_total,
                max_chars=settings.script_source_max_chars,
            )
        )

    # Add short context from remaining assets so sections still keep global coherence.
    context_limit = max(2000, settings.script_source_max_chars // 4)
    for asset in assets:
        if asset.id == preferred_asset.id:
            continue
        if asset_context_cache is not None:
            extra = asset_context_cache.get(asset.id, "")
        else:
            extra = _resolve_asset_text(asset=asset, storage=storage, asset_text_cache=asset_text_cache)
            if extra:
                extra = extra[:context_limit]
        if extra:
            texts.append(extra)

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
            logger.warning(
                "PDF metin katmani bulunamadi (taranmis olabilir): %s",
                asset.filename,
            )
            return ""
    else:
        text = raw.decode("utf-8", errors="ignore")

    return _normalize_text(text)


def _extract_text_from_pdf(raw: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(raw))
        pages: list[str] = []
        total_chars = 0
        page_limit = min(len(reader.pages), max(1, settings.script_pdf_max_pages))
        char_budget = max(settings.script_pdf_max_chars_per_asset, settings.script_source_max_chars)
        log_every = max(0, settings.script_pdf_extraction_log_every_pages)

        for page_index, page in enumerate(reader.pages[:page_limit], start=1):
            try:
                page_text = page.extract_text() or ""
            except Exception as exc:
                logger.warning("PDF sayfa metin cikarimi basarisiz (sayfa=%d): %s", page_index, exc)
                continue

            cleaned = page_text.strip()
            if cleaned:
                remaining = char_budget - total_chars
                if remaining <= 0:
                    break
                if len(cleaned) > remaining:
                    cleaned = cleaned[:remaining]
                pages.append(cleaned)
                total_chars += len(cleaned)

            if log_every and page_index % log_every == 0:
                logger.info(
                    "PDF extraction progress: %d/%d pages, %d chars",
                    page_index,
                    page_limit,
                    total_chars,
                )

            if total_chars >= char_budget:
                logger.info(
                    "PDF extraction early stop: char budget reached (%d chars)",
                    char_budget,
                )
                break

        return "\n".join(pages)
    except Exception as exc:
        logger.warning("PDF metin cikarimi basarisiz: %s", exc)
        return ""


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    normalized_lines: list[str] = []
    for raw_line in text.replace("\r", "\n").split("\n"):
        compact_line = re.sub(r"\s+", " ", raw_line).strip()
        if compact_line:
            normalized_lines.append(compact_line)
    return "\n".join(normalized_lines)


def _slice_text_for_part(text: str, *, index: int, total: int, max_chars: int) -> str:
    compact = text.strip()
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
    voice_name: str | None,
    index: int,
    total: int,
    target_limit: int,
    dialogue_mode: bool,
) -> str | None:
    if not settings.openrouter_api_key:
        return None

    excerpt = source_text[: settings.script_source_max_chars] or (
        "Kaynak metin cikartilamadi. Baslik ve format bilgisinden tutarli bir bolum metni olustur."
    )
    style_hint = _format_style_hint(
        format_name=format_name,
        voice_name=voice_name,
        dialogue_mode=dialogue_mode,
    )
    mode_instructions = (
        "Yalnizca diyalog satirlari uret. Her satir 'Elif:' veya 'Ahmet:' ile baslasin. "
        "Maksimum 18-24 satir kullan. Sahne notu, madde imi veya markdown kullanma."
        if dialogue_mode
        else "Tek parca, akici bir anlatim metni uret."
    )

    payload = {
        "model": settings.openrouter_model,
        "temperature": 0.3,
        "max_tokens": max(320, min(1800, int(target_limit * 0.7))),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are writing Turkish educational audio scripts for medical students. "
                    "Output plain text only, no markdown, no lists, no emojis. "
                    "Keep medical accuracy tied to provided source."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Bolum: {index}/{total}\n"
                    f"Baslik: {part_title}\n"
                    f"Format: {format_name}\n"
                    f"Ses Profili: {voice_name or 'varsayilan'}\n"
                    f"Stil: {style_hint}\n"
                    f"Hedef: en fazla {target_limit} karakter.\n"
                    f"Mod: {mode_instructions}\n"
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
    voice_name: str | None,
    index: int,
    total: int,
    target_limit: int,
    dialogue_mode: bool,
) -> str:
    if dialogue_mode:
        return _generate_dialogue_fallback_script(
            source_text=source_text,
            part_title=part_title,
            index=index,
            total=total,
            target_limit=target_limit,
        )

    intro = f"Bolum {index}. {part_title}. "
    if format_name == "summary":
        bridge = "Hizli tekrar icin kritik noktalar: "
    elif format_name == "qa":
        bridge = "Soru cevap odaginda temel klinik mantik: "
    else:
        bridge = "Bu bolumde temel kavramlari sistematik sekilde ele aliyoruz: "
    voice_hint = _voice_fallback_hint(voice_name)
    if voice_hint:
        bridge = f"{voice_hint} {bridge}"

    outro = f" Bu icerik {total} bolumluk serinin {index}. bolumudur."
    static_len = len(intro) + len(bridge) + len(outro)
    snippet_budget = max(180, target_limit - static_len)

    snippet = _extractive_summary(source_text, max_chars=snippet_budget)
    if not snippet:
        snippet = "Kaynak metin sinirli oldugu icin bu bolum baslik odakli bir ozet olarak hazirlandi."

    text = f"{intro}{bridge}{snippet}{outro}"
    return text[:target_limit].strip()


def _generate_dialogue_fallback_script(
    *,
    source_text: str,
    part_title: str,
    index: int,
    total: int,
    target_limit: int,
) -> str:
    summary = _extractive_summary(source_text, max_chars=max(420, target_limit - 220))
    sentences = [line.strip() for line in re.split(r"(?<=[.!?])\s+", summary) if line.strip()]
    if not sentences:
        sentences = [
            "Bu bolumde temel klinik kavramlari soru-cevap akisiyla netlestiriyoruz.",
            "Odak noktamiz ayirici tani ve sinavda cikabilecek kritik ipuclari olacak.",
            "Her adimi once pratik bir soruyla acip sonra kisa bir aciklama ile baglayacagiz.",
        ]

    turns = [f"Elif: Bolum {index}/{total} - {part_title} icin hizli tekrar basliyor."]
    for turn_index, sentence in enumerate(sentences[:14], start=1):
        speaker = "Ahmet" if turn_index % 2 == 0 else "Elif"
        turns.append(f"{speaker}: {sentence}")
    turns.append("Ahmet: Bu bolumun sonunda kilit noktalarin tekrarini tamamladik.")

    text = "\n".join(turns)
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


def _format_style_hint(*, format_name: str, voice_name: str | None, dialogue_mode: bool) -> str:
    voice_hint = _voice_fallback_hint(voice_name)
    if dialogue_mode:
        return (
            "Iki kisi arasinda dogal soru-cevap akisi kur. Kisa satirlar, net mantik zinciri ve "
            "sinavda sorulabilecek puf noktalara odaklan."
        )
    if format_name == "summary":
        return f"{voice_hint} Kisa, sinav odakli, tekrari kolay. Gereksiz detay verme.".strip()
    if format_name == "qa":
        return (
            f"{voice_hint} Soru sorup yanitlayan aciklayici akista, net klinik gerekcelerle ilerle."
        ).strip()
    return (
        f"{voice_hint} Anlatimsel, akici, temel kavramdan klinik yoruma dogru ilerleyen dogal bir ton kullan."
    ).strip()


def _voice_fallback_hint(voice_name: str | None) -> str:
    normalized = (voice_name or "").strip().lower()
    if "zeynep" in normalized:
        return "Enerjik ama anlasilir bir tempoda ilerle."
    if "ahmet" in normalized or "arda" in normalized:
        return "Net, sakin ve akademik bir tonda konus."
    if "elif" in normalized or "selin" in normalized:
        return "Samimi ve ogretici bir anlatim kullan."
    if "diyalog" in normalized:
        return "Iki kisilik anlatim ritmiyle ilerle."
    return ""


def _resolve_target_limit(*, format_name: str) -> int:
    normalized = (format_name or "").lower()
    if normalized == "summary":
        preferred_script_limit = settings.script_target_max_chars_summary
        preferred_tts_limit = settings.tts_max_chars_per_part_summary
    elif normalized == "qa":
        preferred_script_limit = settings.script_target_max_chars_qa
        preferred_tts_limit = settings.tts_max_chars_per_part_qa
    else:
        preferred_script_limit = settings.script_target_max_chars_narrative
        preferred_tts_limit = settings.tts_max_chars_per_part_narrative

    script_limit = preferred_script_limit if preferred_script_limit > 0 else settings.script_target_max_chars
    tts_limit = preferred_tts_limit if preferred_tts_limit > 0 else settings.tts_max_chars_per_part
    script_limit = min(script_limit, settings.script_target_max_chars)
    tts_limit = min(tts_limit, settings.tts_max_chars_per_part)
    return max(180, min(script_limit, tts_limit))
