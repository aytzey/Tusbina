from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)
DUMMY_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def test_upload_rejects_unsupported_extension() -> None:
    response = client.post(
        "/api/v1/upload",
        files=[("files", ("note.exe", b"hello", "application/octet-stream"))],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 400
    assert "Desteklenmeyen dosya uzantısı" in response.json()["detail"]


def test_upload_accepts_plain_text() -> None:
    response = client.post(
        "/api/v1/upload",
        files=[("files", ("note.txt", b"hello", "text/plain"))],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert len(payload["file_ids"]) == 1


def test_upload_rejects_too_many_files(monkeypatch) -> None:
    monkeypatch.setattr(settings, "upload_max_files", 1)
    response = client.post(
        "/api/v1/upload",
        files=[
            ("files", ("a.pdf", DUMMY_PDF, "application/pdf")),
            ("files", ("b.pdf", DUMMY_PDF, "application/pdf")),
        ],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 400
    assert "En fazla" in response.json()["detail"]


def test_upload_rejects_too_large_file(monkeypatch) -> None:
    monkeypatch.setattr(settings, "upload_max_file_size_mb", 1)
    large = b"%PDF-1.4\n" + (b"x" * (1024 * 1024 + 1))
    response = client.post(
        "/api/v1/upload",
        files=[("files", ("big.pdf", large, "application/pdf"))],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 413
    assert "Dosya boyutu limiti aşıldı" in response.json()["detail"]


def test_upload_rejects_invalid_pdf_signature() -> None:
    response = client.post(
        "/api/v1/upload",
        files=[("files", ("fake.pdf", b"not-a-pdf", "application/pdf"))],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Geçersiz PDF dosyası"


def test_upload_applies_premium_file_size_limit(monkeypatch) -> None:
    monkeypatch.setattr(settings, "upload_max_file_size_mb", 1)
    monkeypatch.setattr(settings, "premium_upload_max_file_size_mb", 2)
    medium = b"%PDF-1.4\n" + (b"x" * int(1.5 * 1024 * 1024))

    demo_response = client.post(
        "/api/v1/upload",
        files=[("files", ("medium.pdf", medium, "application/pdf"))],
        headers={"x-user-id": "upload-demo-tier"},
    )
    assert demo_response.status_code == 413
    assert "max 1 MB" in demo_response.json()["detail"]

    premium_activation = client.post(
        "/api/v1/usage/premium/activate",
        headers={"x-user-id": "upload-premium-tier"},
    )
    assert premium_activation.status_code == 200
    assert premium_activation.json()["is_premium"] is True

    premium_response = client.post(
        "/api/v1/upload",
        files=[("files", ("medium.pdf", medium, "application/pdf"))],
        headers={"x-user-id": "upload-premium-tier"},
    )
    assert premium_response.status_code == 200
    assert premium_response.json()["ok"] is True
