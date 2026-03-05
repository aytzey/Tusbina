"""Generate TTS audio for course parts that don't have audio yet.

Usage (from apps/api directory):
    python -m app.scripts.generate_course_audio

Requires Piper TTS to be installed and configured.
"""

import logging
import sys
import wave
from io import BytesIO
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

# Ensure the project root is in the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import CourseModel, CoursePartModel
from app.services.storage import get_storage_client
from app.services.tts import get_tts_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Turkish medical lecture scripts for each course part.
# These are realistic TUS exam preparation content.
COURSE_PART_SCRIPTS: dict[str, str] = {
    "part-1": (
        "Mitral stenoz, en sık romatizmal ateş sonrasında gelişen bir kapak hastalığıdır. "
        "Etyolojisinde en önemli neden akut romatizmal ateştir. Romatizmal ateş, A grubu beta hemolitik "
        "streptokoklara bağlı üst solunum yolu enfeksiyonundan iki ile dört hafta sonra ortaya çıkar. "
        "Otoimmün bir reaksiyon sonucu mitral kapak yaprakçıkları kalınlaşır, komisürler birbirine yapışır "
        "ve kapak açıklığı daralır. Normal mitral kapak alanı dört ile altı santimetre karedir. "
        "Semptomlar genellikle kapak alanı iki santimetre karenin altına düştüğünde başlar. "
        "Kritik darlık ise bir santimetre karenin altında tanımlanır. "
        "Hastaların büyük çoğunluğu kadınlardır ve semptomlar genellikle yirmi ile kırk yaş arasında ortaya çıkar. "
        "Dispne en sık başvuru semptomudur. Egzersiz, gebelik veya atriyal fibrilasyon dispneyi artırır. "
        "Sol atriyal basınç artışı pulmoner venöz konjesyona yol açar. "
        "İleri evrelerde pulmoner hipertansiyon ve sağ kalp yetersizliği gelişebilir. "
        "Hemoptizi, pulmoner venöz basınç artışına bağlı ortaya çıkabilir. "
        "Atriyal fibrilasyon en sık görülen aritmdir ve sol atriyum dilatasyonuna bağlıdır. "
        "Sistemik embolizasyon riski yüksektir, özellikle atriyal fibrilasyonlu hastalarda."
    ),
    "part-2": (
        "Mitral stenozda fizik muayene bulguları oldukça karakteristiktir. "
        "Oskültasyonda birinci kalp sesi şiddetlenmiştir çünkü kapak yaprakçıkları sert ve "
        "geniş bir ekskürsiyondan hızla kapanır. İkinci kalp sesinden sonra opening snap duyulur. "
        "Opening snap, mitral kapağın açılması sırasında oluşan kısa ve yüksek frekanslı bir sestir. "
        "Opening snap ile ikinci kalp sesi arasındaki mesafe darlığın şiddetini gösterir. "
        "Bu aralık kısaldıkça darlık daha şiddetlidir. "
        "Diastolik rulman, mitral stenozun en karakteristik oskültasyon bulgusudur. "
        "Düşük frekanslı, gürültülü bir sestir ve en iyi sol lateral dekübit pozisyonunda, "
        "stetoskobun çan kısmıyla apekste duyulur. "
        "Presistolik şiddetlenme, sinüs ritmindeki hastalarda atriyal kontraksiyon sırasında duyulur. "
        "Atriyal fibrilasyonda presistolik şiddetlenme kaybolur. "
        "Pulmoner hipertansiyon geliştiğinde pulmoner kapağın ikinci bileşeni şiddetlenir. "
        "İleri evrelerde triküspit yetersizliği üfürümü, hepatomegali ve periferik ödem görülebilir. "
        "Mitral yüzü denilen pembe-mor yanak rengi, düşük kardiyak debiye bağlı periferik siyanozun bir bulgusudur."
    ),
    "part-3": (
        "Mitral stenoz tedavisinde medikal ve cerrahi seçenekler mevcuttur. "
        "Medikal tedavide amaç semptomları kontrol altına almak ve komplikasyonları önlemektir. "
        "Diüretikler pulmoner konjesyonu azaltmak için kullanılır. "
        "Atriyal fibrilasyonda hız kontrolü için beta blokerler veya kalsiyum kanal blokerleri tercih edilir. "
        "Antikoagülasyon, atriyal fibrilasyon varlığında veya daha önce embolik olay geçirmiş hastalarda endikedir. "
        "Warfarin ile uluslararası normalleştirilmiş oran iki ile üç arasında tutulmalıdır. "
        "Perkütan mitral balon valvüloplasti, uygun kapak morfolojisine sahip semptomatik hastalarda "
        "ilk tercih edilen girişimsel tedavidir. Wilkins skoru sekizin altında olan hastalarda başarı oranı yüksektir. "
        "Wilkins skoru kapak kalınlaşması, kalsifikasyon, subvalvüler tutulum ve kapak hareketliliğini değerlendirir. "
        "Cerrahi mitral kapak replasmanı, balon valvüloplastiye uygun olmayan hastalarda uygulanır. "
        "Mekanik kapak kullanıldığında ömür boyu antikoagülasyon gerekir. "
        "Biyoprotez kapaklar daha az antikoagülasyon gerektirir ancak dayanıklılıkları sınırlıdır. "
        "Gebelikte mitral stenoz özellikle dikkatli yönetim gerektirir çünkü artan kan hacmi "
        "ve kalp hızı semptomları kötüleştirebilir."
    ),
    "part-4": (
        "Aort yetersizliği, aort kapağının diastolde tam kapanamaması sonucu kanın aortadan "
        "sol ventriküle geri kaçmasıdır. Etyolojide akut ve kronik nedenler ayrı değerlendirilmelidir. "
        "Kronik aort yetersizliğinin en sık nedeni romatizmal kalp hastalığıdır. "
        "Diğer nedenler arasında biküspit aort kapağı, Marfan sendromu, "
        "anüloaortik ektazi ve kollajen doku hastalıkları sayılabilir. "
        "Akut aort yetersizliği nedenleri arasında enfektif endokardit, aort diseksiyonu ve travma yer alır. "
        "Kronik aort yetersizliğinde sol ventrikül yavaş yavaş dilate olur ve eksentrik hipertrofi gelişir. "
        "Bu kompansasyon mekanizması sayesinde hastalar uzun süre asemptomatik kalabilir. "
        "Semptomlar başladığında dispne, çarpıntı ve anjina pektoris ortaya çıkabilir. "
        "Fizik muayenede nabız basıncı genişlemiştir. Sistolik basınç yüksek, diastolik basınç düşüktür. "
        "Çekiç nabız veya Corrigan nabzı olarak bilinen hızlı yükselen ve hızlı düşen nabız karakteristiktir. "
        "De Musset belirtisi, başın nabızla birlikte sallanmasıdır. "
        "Quincke nabzı, tırnak yatağında kapiller pulsasyonun görülmesidir."
    ),
    "part-5": (
        "Aort stenozu cerrahisi, semptomatik ciddi aort stenozunda hayat kurtarıcı bir tedavi yöntemidir. "
        "Cerrahi endikasyonlar arasında semptomatik ciddi aort stenozu ilk sıradadır. "
        "Senkop, anjina ve kalp yetersizliği klasik semptom üçlüsünü oluşturur. "
        "Asemptomatik ciddi aort stenozunda cerrahi, ejeksiyon fraksiyonu yüzde ellinin altına düştüğünde "
        "veya egzersiz testinde semptom ortaya çıktığında düşünülmelidir. "
        "Cerrahi aort kapak replasmanı altın standart tedavidir. "
        "Mekanik kapaklar genç hastalarda tercih edilir ve ömür boyu antikoagülasyon gerektirir. "
        "Biyoprotez kapaklar yaşlı hastalarda tercih edilir ve genellikle on beş yıl sonra dejenerasyona uğrar. "
        "Transkateter aort kapak implantasyonu, yüksek cerrahi riskli veya inoperabl hastalarda uygulanan "
        "minimal invaziv bir alternatiftir. Femoral arter yoluyla kapak yerleştirilir. "
        "Ross prosedürü genç hastalarda bir seçenektir. Hastanın kendi pulmoner kapağı aort pozisyonuna taşınır "
        "ve pulmoner pozisyona homogreft yerleştirilir. "
        "Postoperatif dönemde enfektif endokardit profilaksisi önemlidir. "
        "Mekanik kapak hastalarında uluslararası normalleştirilmiş oran düzenli takip edilmelidir."
    ),
}


def duration_from_wav_bytes(content: bytes) -> int | None:
    try:
        with wave.open(BytesIO(content), "rb") as wav_reader:
            frame_rate = wav_reader.getframerate()
            frame_count = wav_reader.getnframes()
            if frame_rate <= 0:
                return None
            return max(1, int(round(frame_count / frame_rate)))
    except wave.Error:
        return None


def generate_course_audio() -> None:
    storage = get_storage_client()
    tts = get_tts_service()
    db: Session = SessionLocal()

    try:
        stmt = (
            select(CourseModel)
            .options(selectinload(CourseModel.parts))
        )
        courses = list(db.execute(stmt).scalars().all())

        if not courses:
            logger.info("No courses found in database.")
            return

        for course in courses:
            logger.info("Processing course: %s", course.title)
            for part in course.parts:
                if part.audio_url:
                    logger.info("  Part '%s' already has audio, skipping.", part.title)
                    continue

                script = COURSE_PART_SCRIPTS.get(part.id)
                if not script:
                    logger.warning("  No script found for part '%s' (id=%s), skipping.", part.title, part.id)
                    continue

                logger.info("  Generating audio for: %s", part.title)
                tts_result = tts.synthesize(script)

                stored = storage.save_bytes(
                    filename=f"course-{course.id}-{part.id}.{tts_result.extension}",
                    content=tts_result.content,
                    content_type=tts_result.content_type,
                    user_id="system",
                )

                actual_duration = duration_from_wav_bytes(tts_result.content)
                part.audio_url = stored.public_url
                if actual_duration:
                    part.duration_sec = actual_duration
                    logger.info("    Audio duration: %ds, saved to: %s", actual_duration, stored.public_url)
                else:
                    logger.info("    Saved to: %s (kept original duration: %ds)", stored.public_url, part.duration_sec)

            # Recalculate total duration for course
            course.total_duration_sec = sum(p.duration_sec for p in course.parts)

        db.commit()
        logger.info("Done! All course audio generated successfully.")

    except Exception:
        db.rollback()
        logger.exception("Failed to generate course audio")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    generate_course_audio()
