# App Store ve Google Play Gizlilik / Veri Güvenliği Checklist

Son güncelleme: `2026-03-06`

Bu dosya, mağaza tarafındaki zorunlu alanları tek tek doldurmak için başlangıç taslağıdır.

## Ortak Zorunlu Linkler

- Privacy Policy URL: `https://tusbina.machinity.ai/legal/privacy-policy`
- Terms of Use URL: `https://tusbina.machinity.ai/legal/terms-of-use`
- KVKK Notice URL: `https://tusbina.machinity.ai/legal/kvkk-notice`
- Account Deletion URL: `https://tusbina.machinity.ai/legal/account-deletion`
- In-app legal hub: `Profil > Hukuk & Gizlilik`
- In-app account deletion: `Profil > Hesap Ayarları > Hesabı Sil`

## Apple App Store Connect

Privacy Nutrition Label için gözden geçirilecek veri kategorileri:

- Contact Info
  Muhtemel alanlar: e-posta adresi, görünen ad
  Amaç: account management, app functionality

- User Content
  Muhtemel alanlar: yüklenen PDF/metin/görseller, üretilen podcast/quiz içerikleri, feedback metinleri
  Amaç: app functionality

- Identifiers
  Muhtemel alanlar: auth user id, Supabase session ilişkili kimlik kayıtları
  Amaç: account management, security

- Usage Data
  Muhtemel alanlar: dinleme süresi, ilerleme, favoriler, indirmeler, günlük hedef ve çalışma araçları tercihleri
  Amaç: app functionality, analytics benzeri ürün iyileştirme

Apple için karar verilmesi gereken alanlar:

- Veri üçüncü taraf reklamcılığı için kullanılıyor mu?
  Taslak cevap: `Hayır`

- Veri kullanıcıyla ilişkilendiriliyor mu?
  Taslak cevap: `Evet`, çünkü hesap bazlı deneyim var

- Tracking yapılıyor mu?
  Taslak cevap: `Hayır`, mevcut üründe reklam/çapraz uygulama tracking yok

## Google Play Console

Data Safety formu için gözden geçirilecek başlıklar:

- Personal info
  E-posta, görünen ad

- App activity
  Dinleme geçmişi, favori, indirme ve kullanım sayaçları

- Files and docs
  Kullanıcı yüklemeleri ve türetilen içerikler

- Messages / support data
  Feedback ve destek mesajları

Google Play için karar verilmesi gereken alanlar:

- Veri transit sırasında şifreleniyor mu?
  Taslak cevap: `Evet`, HTTPS/TLS

- Kullanıcı veri silme talep edebilir mi?
  Taslak cevap: `Evet`, uygulama içi hesap silme akışı mevcut

- Zorunlu privacy policy linki hem Play Console'da hem uygulama içinde var mı?
  Taslak cevap: `Evet`, URL ve in-app hukuk merkezi hazır

## Manifest / Permission Kontrolü

Gözden geçirilecek izinler:

- Dosya seçici / belge erişimi
  Amaç: kullanıcı tarafından seçilen ders dosyalarını yüklemek

- Ağ erişimi
  Amaç: auth, upload, içerik üretimi ve streaming

- Çevrimdışı dosya saklama
  Amaç: indirilen podcastleri cihazda tutmak

İleride eklenirse yeniden beyan gerektirecek alanlar:

- push notification
- analytics SDK
- crash reporting SDK
- ödeme / abonelik SDK
- reklam SDK

## Son Kontrol Soruları

- Veri envanteri hukuki metinlerle birebir tutarlı mı?
- Store formundaki tüm veri kategorileri backend gerçeğiyle eşleşiyor mu?
- Account deletion akışı gerçekten Supabase auth + local backend verilerini siliyor mu?
- Public linkler anonim kullanıcıya açık mı?
- Gizlilik politikası URL'i mağaza formlarına eklendi mi?
