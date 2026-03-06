from fastapi.testclient import TestClient

from app.main import app
from app.services.tts import TTSResult

client = TestClient(app)


def test_voice_preview_endpoint_returns_audio(monkeypatch) -> None:
    class _PreviewTTS:
        def synthesize(self, text: str, *, voice: str | None = None) -> TTSResult:
            assert "TUSBINA" in text or "Merhaba" in text
            return TTSResult(content=b"preview-bytes", extension="wav", content_type="audio/wav")

    monkeypatch.setattr("app.api.routes.voices.get_tts_service", lambda: _PreviewTTS())

    response = client.get("/api/v1/voices/Elif/preview")

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"preview-bytes"
