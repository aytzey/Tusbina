from collections import defaultdict, deque
from time import time

from fastapi import APIRouter, HTTPException, Request, Response

from app.services.tts import get_tts_service

router = APIRouter(prefix="/voices", tags=["voices"])
_PREVIEW_LIMIT = 20
_PREVIEW_WINDOW_SEC = 5 * 60
_preview_requests: dict[str, deque[float]] = defaultdict(deque)


@router.get("/{voice_name}/preview")
def preview_voice(voice_name: str, request: Request) -> Response:
    _enforce_preview_rate_limit(_resolve_preview_client_key(request))
    preview_text = _preview_text_for_voice(voice_name)

    try:
        audio = get_tts_service().synthesize(preview_text, voice=voice_name)
    except Exception as exc:  # pragma: no cover - depends on runtime TTS backend
        raise HTTPException(status_code=503, detail=f"Ses önizlemesi hazırlanamadı: {exc}") from exc

    return Response(
        content=audio.content,
        media_type=audio.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _resolve_preview_client_key(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    forwarded_ip = forwarded_for.split(",")[0].strip()
    if forwarded_ip:
        return forwarded_ip
    return request.client.host if request.client else "unknown"


def _enforce_preview_rate_limit(client_key: str) -> None:
    now = time()
    window = _preview_requests[client_key]
    while window and now - window[0] > _PREVIEW_WINDOW_SEC:
        window.popleft()

    if len(window) >= _PREVIEW_LIMIT:
        raise HTTPException(status_code=429, detail="Ses önizleme limiti aşıldı. Lütfen biraz sonra tekrar dene.")

    window.append(now)


def _preview_text_for_voice(voice_name: str) -> str:
    normalized = (voice_name or "").strip().lower()
    if "diyalog" in normalized:
        return (
            "Elif: TUSBINA ile bugün kardiyoloji tekrarını dinliyoruz. "
            "Ahmet: Kritik noktaları akıcı ve sınav odaklı biçimde özetleyeceğim."
        )
    if "ahmet" in normalized:
        return "Merhaba, ben Ahmet. Bu ses daha tok, net ve akademik bir anlatım için hazırlandı."
    if "zeynep" in normalized:
        return "Merhaba, ben Zeynep. Bu ses canlı, motive eden ve enerjik bir dinleme deneyimi sunar."
    if "emel" in normalized:
        return "Merhaba, ben Emel. Bu neural ses daha doğal vurgu ve akıcı bir anlatım için seçildi."
    return "Merhaba, ben Elif. Bu ses sıcak, anlaşılır ve öğretici bir dinleme deneyimi sunar."
