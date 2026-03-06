from app.core.config import settings
from app.db.models import UploadAssetModel
from app.services import script_generation
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


def test_trim_script_to_boundary_avoids_mid_sentence_cut() -> None:
    script = "Ilk cumle. Ikinci cumle tamamlandi. Ucuncu cumle yarim kalacak"

    trimmed = script_generation._trim_script_to_boundary(script, target_limit=48)

    assert trimmed == "Ilk cumle. Ikinci cumle tamamlandi."


def test_extract_text_from_pdf_stops_at_char_budget(monkeypatch) -> None:
    class _FakePage:
        def __init__(self, text: str) -> None:
            self._text = text

        def extract_text(self) -> str:
            return self._text

    class _FakeReader:
        def __init__(self, _raw: object) -> None:
            self.pages = [
                _FakePage("A" * 500),
                _FakePage("B" * 500),
                _FakePage("C" * 500),
                _FakePage("D" * 500),
            ]

    monkeypatch.setattr(script_generation, "PdfReader", _FakeReader)
    monkeypatch.setattr(settings, "script_pdf_max_pages", 20)
    monkeypatch.setattr(settings, "script_pdf_max_chars_per_asset", 1200)
    monkeypatch.setattr(settings, "script_source_max_chars", 600)
    monkeypatch.setattr(settings, "script_pdf_extraction_log_every_pages", 0)

    extracted = script_generation._extract_text_from_pdf(b"%PDF-1.4\n")

    assert len(extracted) <= 1202
    assert extracted.count("A") == 500
    assert extracted.count("B") == 500
    assert extracted.count("C") == 200
    assert "D" not in extracted


def test_build_part_script_uses_explicit_asset_part_mapping(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "script_target_max_chars", 520)
    monkeypatch.setattr(settings, "tts_max_chars_per_part", 520)

    asset_one = _make_asset(
        filename="kardiyoloji.txt",
        content_type="text/plain",
        content=(
            b"Kardiyoloji metni: miyokard iskemisi, troponin ve EKG degisiklikleri birlikte yorumlanir. " * 20
        ),
        user_id="script-user-map",
    )
    asset_two = _make_asset(
        filename="nefroloji.txt",
        content_type="text/plain",
        content=(
            b"Nefroloji metni: glomeruler filtrasyon, kreatinin klirensi ve proteinuri algoritmasi birlikte degerlendirilir. "
            * 20
        ),
        user_id="script-user-map",
    )

    script = build_part_script(
        part_title="Nefroloji Bolumu",
        format_name="narrative",
        index=4,
        total=6,
        assets=[asset_one, asset_two],
        storage=LocalStorageClient(),
        asset_context_cache={asset_one.id: "", asset_two.id: ""},
        preferred_asset_id=asset_two.id,
        source_slice_index=2,
        source_slice_total=2,
    )

    lowered = script.lower()
    assert "nefroloji" in lowered
    assert "glomeruler" in lowered
    assert "miyokard" not in lowered


def test_build_part_script_dialogue_mode_emits_speaker_lines(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "script_target_max_chars_qa", 500)
    monkeypatch.setattr(settings, "tts_max_chars_per_part_qa", 500)

    asset = _make_asset(
        filename="diyalog.txt",
        content_type="text/plain",
        content=(
            b"Hiponatremi degerlendirmesinde serum osmolalite, idrar sodyumu ve volu"
            b"m durumu birlikte yorumlanir. SIADH ve hipovolemik nedenler ayirici ta"
            b"nida kritik oneme sahiptir."
        ),
        user_id="script-user-dialogue",
    )

    script = build_part_script(
        part_title="Hiponatremi Yaklasimi",
        format_name="qa",
        voice_name="Diyalog",
        index=1,
        total=1,
        assets=[asset],
        storage=LocalStorageClient(),
        dialogue_mode=True,
    )

    assert "Elif:" in script
    assert "Ahmet:" in script
