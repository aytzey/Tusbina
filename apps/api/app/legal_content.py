from dataclasses import dataclass
from html import escape

LEGAL_EFFECTIVE_DATE = "2026-03-06"
LEGAL_CONTACT_EMAIL = "info@machinity.ai"
LEGAL_COMPANY_NAME = "TUSBINA / Machinity"

PRIVACY_POLICY_SLUG = "privacy-policy"
TERMS_OF_USE_SLUG = "terms-of-use"
KVKK_NOTICE_SLUG = "kvkk-notice"
PERMISSIONS_NOTICE_SLUG = "data-processing-and-permissions"
MARKETING_CONSENT_SLUG = "marketing-consent"
ACCOUNT_DELETION_SLUG = "account-deletion"

REQUIRED_CONSENT_SLUGS = (
    PRIVACY_POLICY_SLUG,
    TERMS_OF_USE_SLUG,
    KVKK_NOTICE_SLUG,
)


@dataclass(frozen=True)
class LegalSection:
    heading: str
    paragraphs: tuple[str, ...]
    bullets: tuple[str, ...] = ()


@dataclass(frozen=True)
class LegalDocument:
    slug: str
    title: str
    summary: str
    version: str
    requires_acceptance: bool
    sections: tuple[LegalSection, ...]


LEGAL_DOCUMENTS: dict[str, LegalDocument] = {
    PRIVACY_POLICY_SLUG: LegalDocument(
        slug=PRIVACY_POLICY_SLUG,
        title="Gizlilik Politikası",
        summary="TUSBINA'nın hangi verileri topladığını, neden işlediğini, ne kadar süre sakladığını ve silme taleplerini nasıl yönettiğini açıklar.",
        version=LEGAL_EFFECTIVE_DATE,
        requires_acceptance=True,
        sections=(
            LegalSection(
                heading="Kapsam",
                paragraphs=(
                    "Bu politika, TUSBINA mobil uygulaması ve ilişkili web yüzeylerinde işlenen kişisel verilere uygulanır.",
                    "TUSBINA; yüklediğiniz içerikleri sesli öğrenme deneyimi üretmek, hesabınızı yönetmek ve kullanım haklarınızı takip etmek amacıyla işler.",
                ),
            ),
            LegalSection(
                heading="Toplanan Veriler",
                paragraphs=("Aşağıdaki veri kategorileri ürün akışının çalışması için işlenebilir:",),
                bullets=(
                    "Hesap verileri: e-posta adresi, görünen ad, kimlik sağlayıcı bilgisi.",
                    "İçerik verileri: yüklediğiniz PDF, görsel, metin ve bunlardan türetilen bölüm, özet, quiz ve ses dosyaları.",
                    "Kullanım verileri: dinleme süresi, oynatma ilerlemesi, favoriler, indirme durumu, günlük hedef ve çalışma planı tercihleri.",
                    "Destek verileri: geri bildirim metinleri, puanlamalar ve destek talebi sırasında paylaştığınız iletişim bilgileri.",
                ),
            ),
            LegalSection(
                heading="İşleme Amaçları",
                paragraphs=("Kişisel veriler aşağıdaki amaçlarla işlenir:",),
                bullets=(
                    "Hesap oluşturma, oturum açma ve güvenli kimlik doğrulama sağlamak.",
                    "Yüklenen ders materyallerinden podcast, bölüm planı ve quiz üretmek.",
                    "Çevrimdışı dinleme, cihazlar arası senkron ve kullanım kotası yönetimini sağlamak.",
                    "Destek taleplerini yanıtlamak, hizmet kalitesini izlemek ve hataları gidermek.",
                ),
            ),
            LegalSection(
                heading="Saklama ve Silme",
                paragraphs=(
                    "Hesap verileri, hesabınız aktif olduğu sürece ve yasal yükümlülüklerin gerektirdiği makul süre boyunca saklanır.",
                    "Uygulama içindeki hesap silme akışı çalıştırıldığında, kullanıcıya ait içerikler ve profil kayıtları silinmek üzere işleme alınır.",
                    "Güvenlik, dolandırıcılık önleme veya zorunlu kayıt tutma gibi meşru nedenlerle tutulması gereken sınırlı kayıtlar varsa bu durum ilgili talep sırasında ayrıca açıklanır.",
                ),
            ),
            LegalSection(
                heading="Paylaşım ve Hizmet Sağlayıcılar",
                paragraphs=(
                    "Kimlik doğrulama için Supabase, ses üretimi ve içerik işleme için uygulama altyapısında kullanılan üçüncü taraf servisler devreye girebilir.",
                    "Bu servisler yalnızca hizmetin sunulması için gerekli kapsamda erişim alır; pazarlama amacıyla yetkisiz veri paylaşımı yapılmaz.",
                ),
            ),
            LegalSection(
                heading="Haklarınız",
                paragraphs=(
                    "Kullanıcılar erişim, düzeltme, silme, işlemeyi sınırlandırma ve rızayı geri çekme gibi taleplerini uygulama içinden veya destek kanalları üzerinden iletebilir.",
                    f"İletişim için: {LEGAL_CONTACT_EMAIL}",
                ),
            ),
        ),
    ),
    TERMS_OF_USE_SLUG: LegalDocument(
        slug=TERMS_OF_USE_SLUG,
        title="Kullanım Koşulları",
        summary="TUSBINA kullanımına ilişkin temel kullanım kuralları, kullanıcı sorumlulukları ve hizmet sınırlarını açıklar.",
        version=LEGAL_EFFECTIVE_DATE,
        requires_acceptance=True,
        sections=(
            LegalSection(
                heading="Hizmetin Konusu",
                paragraphs=(
                    "TUSBINA, kullanıcıların yüklediği eğitim içeriklerini sesli öğrenme deneyimine dönüştüren bir dijital öğrenme aracıdır.",
                    "Hizmet, eğitim amaçlıdır; tıbbi teşhis, tedavi veya profesyonel danışmanlık yerine geçmez.",
                ),
            ),
            LegalSection(
                heading="Kullanıcı Yükümlülükleri",
                paragraphs=("Uygulamayı kullanırken aşağıdaki kurallara uyulması gerekir:",),
                bullets=(
                    "Yalnızca kullanma hakkına sahip olduğunuz içerikleri yüklemek.",
                    "Telif hakkı, kişisel veri ve üçüncü kişi haklarını ihlal eden materyal paylaşmamak.",
                    "Hizmeti tersine mühendislik, yetkisiz erişim veya kötüye kullanım amacıyla kullanmamak.",
                ),
            ),
            LegalSection(
                heading="İçerik Sorumluluğu",
                paragraphs=(
                    "Yüklenen belge ve görsellerin hukuka uygunluğundan kullanıcı sorumludur.",
                    "TUSBINA tarafından otomatik üretilen bölüm, özet, görsel veya quiz çıktıları yardımcı öğrenme materyalidir; mutlak doğruluk garantisi verilmez.",
                ),
            ),
            LegalSection(
                heading="Abonelik ve Kullanım Kotaları",
                paragraphs=(
                    "Ücretsiz ve premium kullanım hakları ürün içinde belirtilen süre ve kota sınırlarına tabidir.",
                    "Kullanım haklarının kötüye kullanımı veya güvenlik risklerinde hizmetin sınırlandırılması mümkündür.",
                ),
            ),
            LegalSection(
                heading="Hesabın Sonlandırılması",
                paragraphs=(
                    "Kullanıcı hesabını uygulama içinden silme talebi başlatabilir.",
                    "Ağır ihlal, güvenlik riski veya hukuki zorunluluk durumunda hizmet erişimi askıya alınabilir veya sonlandırılabilir.",
                ),
            ),
        ),
    ),
    KVKK_NOTICE_SLUG: LegalDocument(
        slug=KVKK_NOTICE_SLUG,
        title="KVKK Aydınlatma Metni",
        summary="6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu, işleme amaçları, hukuki sebepler ve başvuru haklarını özetler.",
        version=LEGAL_EFFECTIVE_DATE,
        requires_acceptance=True,
        sections=(
            LegalSection(
                heading="Veri Sorumlusu ve Kapsam",
                paragraphs=(
                    f"Bu metin, {LEGAL_COMPANY_NAME} tarafından veri sorumlusu sıfatıyla sunulur.",
                    "Uygulama kapsamında işlenen kişisel veriler; hesap yönetimi, hizmetin sunulması, güvenlik ve destek süreçleri için kullanılabilir.",
                ),
            ),
            LegalSection(
                heading="İşlenen Veri Türleri",
                paragraphs=("KVKK kapsamında aşağıdaki kişisel veri kategorileri işlenebilir:",),
                bullets=(
                    "Kimlik ve iletişim verileri: e-posta adresi, görünen ad, kullanıcı kimliği.",
                    "İşlem güvenliği verileri: oturum bilgisi, cihaz bazlı erişim kayıtları, hata kayıtları.",
                    "İçerik verileri: yüklenen eğitim belgeleri, bunlardan üretilen ses, bölüm ve quiz içerikleri.",
                    "Kullanım verileri: oynatma ilerlemesi, favoriler, indirmeler, kullanım kotası ve geri bildirimler.",
                ),
            ),
            LegalSection(
                heading="İşleme Amaçları ve Hukuki Sebepler",
                paragraphs=(
                    "Veriler; sözleşmenin kurulması ve ifası, meşru menfaat, yasal yükümlülüklerin yerine getirilmesi ve açık rıza gerektiren hallerde açık rıza hukuki sebeplerine dayanılarak işlenebilir.",
                    "Tanıtım/iletişim amaçlı tercihlerin yönetimi ayrı bir tercih alanı üzerinden yürütülür ve istenildiğinde geri alınabilir.",
                ),
            ),
            LegalSection(
                heading="Aktarım ve Saklama",
                paragraphs=(
                    "Teknik altyapı sağlayıcılarına yapılan aktarımlar, hizmetin sunumu için gerekli olan asgari veriyle sınırlıdır.",
                    "Veriler, işleme amacı ortadan kalktığında veya silme talebi sonuçlandığında mevzuata uygun yöntemlerle silinir, yok edilir ya da anonim hale getirilir.",
                ),
            ),
            LegalSection(
                heading="Başvuru Hakları",
                paragraphs=(
                    "KVKK'nın 11. maddesi kapsamındaki taleplerinizi uygulama içindeki hesap ayarları, hesap silme alanı veya destek iletişim kanalları üzerinden iletebilirsiniz.",
                    f"Başvuru irtibatı: {LEGAL_CONTACT_EMAIL}",
                ),
            ),
        ),
    ),
    PERMISSIONS_NOTICE_SLUG: LegalDocument(
        slug=PERMISSIONS_NOTICE_SLUG,
        title="Veri İşleme ve İzin Bilgilendirmesi",
        summary="Dosya seçici, oturum açma ve cihaz üzerinde saklanan çevrimdışı dosyalar gibi uygulama izinlerinin hangi amaçla kullanıldığını açıklar.",
        version=LEGAL_EFFECTIVE_DATE,
        requires_acceptance=False,
        sections=(
            LegalSection(
                heading="Dosya Erişimi",
                paragraphs=(
                    "Uygulama, yalnızca sizin seçtiğiniz belge veya görselleri yükleyebilmek için sistem dosya seçicisini kullanır.",
                    "TUSBINA, cihazınızdaki tüm dosyalara sürekli erişim istemez; seçim akışı yalnızca sizin başlattığınız eylemle çalışır.",
                ),
            ),
            LegalSection(
                heading="Çevrimdışı Dinleme",
                paragraphs=(
                    "İndirilen podcast bölümleri cihaz hafızasında saklanır ve internet bağlantısı olmadan oynatılabilir.",
                    "Bu dosyalar kullanıcı oturumu değiştiğinde veya siz kaldırdığınızda uygulama tarafından silinir.",
                ),
            ),
            LegalSection(
                heading="Oturum ve Kimlik Doğrulama",
                paragraphs=(
                    "Google veya Apple ile oturum açma seçenekleri, ilgili sağlayıcının kimlik doğrulama akışlarını görünür biçimde kullanır.",
                    "Oturum belirteçleri yalnızca hesabınızın korunması ve API erişimi için kullanılır.",
                ),
            ),
            LegalSection(
                heading="İzinlerin Geri Alınması",
                paragraphs=(
                    "Sistem izinlerini cihaz ayarlarından her zaman yönetebilirsiniz.",
                    "Veri işleme tercihlerinizi uygulamadaki açık rıza ve gizlilik alanından güncelleyebilirsiniz.",
                ),
            ),
        ),
    ),
    MARKETING_CONSENT_SLUG: LegalDocument(
        slug=MARKETING_CONSENT_SLUG,
        title="Açık Rıza ve İletişim Tercihi",
        summary="Ürün güncellemeleri, kampanyalar ve eğitim içerikli bilgilendirmeler için opsiyonel iletişim izninin kapsamını açıklar.",
        version=LEGAL_EFFECTIVE_DATE,
        requires_acceptance=False,
        sections=(
            LegalSection(
                heading="İznin Kapsamı",
                paragraphs=(
                    "Bu tercih alanı, ürün duyuruları, yeni özellik bilgilendirmeleri, kampanya ve hatırlatma iletişimleri için kullanılabilecek açık rızayı yönetir.",
                    "Bu izin verilmeden de uygulamanın temel işlevleri kullanılabilir.",
                ),
            ),
            LegalSection(
                heading="Geri Alma Hakkı",
                paragraphs=(
                    "Açık rızanızı uygulama içindeki tercihler ekranından dilediğiniz zaman geri çekebilirsiniz.",
                    "Geri çekme işlemi, daha önce hukuka uygun şekilde yapılmış işlemleri geriye dönük olarak geçersiz kılmaz.",
                ),
            ),
            LegalSection(
                heading="İletişim Kanalları",
                paragraphs=(
                    "Onay verilmesi halinde e-posta veya uygulama içi bilgilendirme kanalları kullanılabilir.",
                    "İzin durumu hesabınızla ilişkilendirilir ve son güncelleme zamanı kayıt altına alınır.",
                ),
            ),
        ),
    ),
    ACCOUNT_DELETION_SLUG: LegalDocument(
        slug=ACCOUNT_DELETION_SLUG,
        title="Hesap Silme ve Veri Talepleri",
        summary="Uygulama içindeki hesap silme mekanizmasını, hangi verilerin silineceğini ve zorunlu saklama istisnalarını açıklar.",
        version=LEGAL_EFFECTIVE_DATE,
        requires_acceptance=False,
        sections=(
            LegalSection(
                heading="Silme Talebi",
                paragraphs=(
                    "Hesap silme talebi, uygulama içindeki hesap ayarları alanından başlatılabilir.",
                    "İşlem tamamlandığında kullanıcı profili, yüklenen içerikler ve bunlardan türeyen çalışma kayıtları silinmek üzere işlenir.",
                ),
            ),
            LegalSection(
                heading="Silinebilecek Veri Kategorileri",
                paragraphs=("Silme talebi kapsamında aşağıdaki kullanıcıya bağlı kayıtlar kaldırılabilir:",),
                bullets=(
                    "Kullanıcı profili ve tercih kayıtları.",
                    "Yüklenen dosyalar, üretilen podcast ve quiz içerikleri.",
                    "İlerleme, favori, indirme ve kullanım sayaç kayıtları.",
                    "Geri bildirim kayıtları ve uygulama içi açık rıza tercihleri.",
                ),
            ),
            LegalSection(
                heading="Saklama İstisnaları",
                paragraphs=(
                    "Dolandırıcılık önleme, güvenlik, uyuşmazlık çözümü veya mevzuattan doğan yükümlülükler için tutulması zorunlu sınırlı kayıtlar varsa bunlar ilgili hukuki sebebe dayanılarak saklanabilir.",
                    "Bu gibi istisnalar gizlilik politikası ve destek yanıtları içinde ayrıca belirtilir.",
                ),
            ),
            LegalSection(
                heading="Harici Talep Kanalı",
                paragraphs=(
                    "Google Play gereklilikleri doğrultusunda uygulama dışında erişilebilir bir hesap silme bilgi kaynağı da tutulmalıdır.",
                    f"Yardım için: {LEGAL_CONTACT_EMAIL}",
                ),
            ),
        ),
    ),
}


def ordered_legal_documents() -> list[LegalDocument]:
    return list(LEGAL_DOCUMENTS.values())


def get_legal_document(slug: str) -> LegalDocument | None:
    return LEGAL_DOCUMENTS.get(slug)


def build_public_legal_url(base_url: str, slug: str) -> str:
    return f"{base_url.rstrip('/')}/legal/{slug}"


def render_legal_index_html(base_url: str) -> str:
    items = "\n".join(
        f'<li><a href="{escape(build_public_legal_url(base_url, doc.slug))}">{escape(doc.title)}</a> - {escape(doc.summary)}</li>'
        for doc in ordered_legal_documents()
    )
    return f"""<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TUSBINA Yasal Metinler</title>
    <style>
      body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #0D1123; color: #F8F8F6; }}
      main {{ max-width: 960px; margin: 0 auto; padding: 32px 20px 56px; }}
      h1 {{ margin-bottom: 8px; }}
      p, li {{ line-height: 1.6; color: #D7DCE5; }}
      a {{ color: #F4A26C; }}
      .card {{ background: #1D2B4A; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; }}
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>TUSBINA Yasal Metinler</h1>
        <p>Son güncelleme: {escape(LEGAL_EFFECTIVE_DATE)}</p>
        <ul>{items}</ul>
      </div>
    </main>
  </body>
</html>"""


def render_legal_document_html(document: LegalDocument, base_url: str) -> str:
    sections_html = []
    for section in document.sections:
        paragraphs = "".join(f"<p>{escape(paragraph)}</p>" for paragraph in section.paragraphs)
        bullets = ""
        if section.bullets:
            items = "".join(f"<li>{escape(item)}</li>" for item in section.bullets)
            bullets = f"<ul>{items}</ul>"
        sections_html.append(
            f"<section><h2>{escape(section.heading)}</h2>{paragraphs}{bullets}</section>"
        )
    joined_sections = "".join(sections_html)
    return f"""<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{escape(document.title)} | TUSBINA</title>
    <style>
      body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #0D1123; color: #F8F8F6; }}
      main {{ max-width: 960px; margin: 0 auto; padding: 32px 20px 72px; }}
      a {{ color: #F4A26C; }}
      p, li {{ line-height: 1.7; color: #D7DCE5; }}
      h1, h2 {{ color: #FFFFFF; }}
      section {{ background: #1D2B4A; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; margin-top: 16px; }}
      .meta {{ color: #9AA3B2; }}
    </style>
  </head>
  <body>
    <main>
      <a href="{escape(base_url.rstrip('/') + '/legal')}">Tüm yasal metinlere dön</a>
      <h1>{escape(document.title)}</h1>
      <p class="meta">Sürüm: {escape(document.version)} | Son güncelleme: {escape(LEGAL_EFFECTIVE_DATE)}</p>
      <p>{escape(document.summary)}</p>
      {joined_sections}
    </main>
  </body>
</html>"""
