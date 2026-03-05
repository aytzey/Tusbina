from app.core.config import settings
from app.db.models import UploadAssetModel
from app.services.script_generation import build_part_script
from app.services.storage import LocalStorageClient


def _make_asset(*, filename: str, content_type: str, content: bytes, user_id: str) -> UploadAssetModel:
    storage = LocalStorageClient()
    stored = storage.save_bytes(filename=filename, content=content, content_type=content_type, user_id=user_id)
    return UploadAssetModel(
        id=stored.asset_id,
        user_id=user_id,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content),
        storage_key=stored.storage_key,
        public_url=stored.public_url,
    )


def test_build_part_script_fallback_with_text_source(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "script_target_max_chars", 480)
    monkeypatch.setattr(settings, "tts_max_chars_per_part", 500)

    asset = _make_asset(
        filename="hematoloji.txt",
        content_type="text/plain",
        content=(
            b"Anemi degerlendirmesinde Hb ve MCV birlikte yorumlanir. "
            b"Demir eksikliginde ferritin genellikle dusuktur. "
            b"Megaloblastik anemide MCV yukselir ve periferik yaymada makrositoz gorulur. "
            b"Klinik semptomlarin siddeti hemoglobin duzeyi ve altta yatan hastaliga gore degisir. "
            b"Tedavi planinda nedene yonelik yaklasim ve takip parametreleri birlikte degerlendirilir. "
            b"Hemoliz suphelenilen olgularda LDH, indirekt bilirubin ve haptoglobin kombinasyonu yol gosterir."
        ),
        user_id="script-user-1",
    )
    script = build_part_script(
        part_title="Anemi Yaklasimi",
        format_name="summary",
        index=1,
        total=1,
        assets=[asset],
        storage=LocalStorageClient(),
    )

    assert "Anemi Yaklasimi" in script
    assert "ferritin" in script.lower()
    assert 280 <= len(script) <= settings.tts_max_chars_per_part


def test_build_part_script_handles_invalid_pdf(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openrouter_api_key", "")

    asset = _make_asset(
        filename="broken.pdf",
        content_type="application/pdf",
        content=b"not-a-valid-pdf-content",
        user_id="script-user-2",
    )
    script = build_part_script(
        part_title="Kardiyoloji Giris",
        format_name="narrative",
        index=1,
        total=2,
        assets=[asset],
        storage=LocalStorageClient(),
    )

    assert "Kardiyoloji Giris" in script
    assert len(script) >= 40


def test_build_part_script_uses_format_specific_limits(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "script_target_max_chars_narrative", 620)
    monkeypatch.setattr(settings, "script_target_max_chars_summary", 260)
    monkeypatch.setattr(settings, "tts_max_chars_per_part_narrative", 640)
    monkeypatch.setattr(settings, "tts_max_chars_per_part_summary", 280)

    asset = _make_asset(
        filename="uzun-icerik.txt",
        content_type="text/plain",
        content=(
            b"Anemi siniflamasi eritrosit indeksleri, retikulosit yaniti ve periferik yayma bulgulari ile birlikte "
            b"yorumlanir. Ferritin, transferin satrasyonu ve CRP kombinasyonu demir eksikligi ile inflamatuar "
            b"durumlarin ayiriminda kullanilir. Megaloblastik surecte B12/folat degerlendirmesi, hemolizde LDH ve "
            b"haptoglobin, kanama suphelerinde klinik baglam birlikte ele alinmalidir. "
        )
        * 6,
        user_id="script-user-format-limits",
    )

    narrative_script = build_part_script(
        part_title="Anemi Yaklasimi",
        format_name="narrative",
        index=1,
        total=1,
        assets=[asset],
        storage=LocalStorageClient(),
    )
    summary_script = build_part_script(
        part_title="Anemi Ozet",
        format_name="summary",
        index=1,
        total=1,
        assets=[asset],
        storage=LocalStorageClient(),
    )

    assert len(narrative_script) <= 620
    assert len(summary_script) <= 260
    assert len(narrative_script) > len(summary_script)
