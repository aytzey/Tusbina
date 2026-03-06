from fastapi import APIRouter, HTTPException, Response

from app.services.tts import get_tts_service

router = APIRouter(prefix="/voices", tags=["voices"])


@router.get("/{voice_name}/preview")
def preview_voice(voice_name: str) -> Response:
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
