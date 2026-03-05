from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)
DUMMY_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def test_upload_rejects_non_pdf() -> None:
    response = client.post(
        "/api/v1/upload",
        files=[("files", ("note.txt", b"hello", "text/plain"))],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 400
    assert "Desteklenmeyen dosya uzantisi" in response.json()["detail"]


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
    assert "Dosya boyutu limiti asildi" in response.json()["detail"]


def test_upload_rejects_invalid_pdf_signature() -> None:
    response = client.post(
        "/api/v1/upload",
        files=[("files", ("fake.pdf", b"not-a-pdf", "application/pdf"))],
        headers={"x-user-id": "upload-user"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Gecersiz PDF dosyasi"
