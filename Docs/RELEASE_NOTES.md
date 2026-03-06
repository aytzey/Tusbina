# Sürüm Notları

## 2026-03-06

### Bu Turda Yapılanlar

#### Ses kalitesi tarafı

- Backend TTS akışında Piper çıktısına uygulanan agresif post-process pitch kaydırma varsayılan olarak kapatıldı.
- Diyalog modunda oluşan sert geçişleri azaltmak için WAV birleştirme akışına sessizlik kırpma, kısa fade ve daha düşük parça aralığı eklendi.
- Etiketlenmemiş çok satırlı QA metinlerinin gereksiz yere parçalara bölünüp kesik kesik okunmasının önüne geçildi.
- Script üretiminde metnin cümle ortasında kesilmesini azaltmak için sınırlandırma cümle/kelime sınırına çekildi.

#### Mobil oynatma tarafı

- Oynatıcı mantığı ekran içinden çıkarılıp uygulama seviyesinde kalıcı bir oynatma denetleyicisine taşındı.
- `expo-audio` oturumu uygulama seviyesinde yönetilecek şekilde düzenlendi.
- Arka planda çalma isteği, sessiz modda çalma ve lock-screen metadata güncelleme akışı eklendi.
- Seek, yüklenme durumu, buffer durumu ve gerçek süre bilgisi store seviyesinde tutulmaya başlandı.
- Bölüm değişiminde ve uygulama arka plana giderken ilerleme kaydetme ve kullanım flush akışı güçlendirildi.
- Player ekranı native oynatma durumunu store üzerinden okuyacak şekilde sadeleştirildi.

#### Ses akışı ve bölüm planlama tarafı

- AI podcast üretimi toplu TTS yerine önce bölüm planı çıkaracak, ardından sadece önceliklendirilen parçaları seslendirecek şekilde iki aşamalı akışa taşındı.
- Plan hazır olur olmaz podcast ve parça kayıtları anında oluşturulmaya başlandı; böylece kullanıcı tüm içeriğin bitmesini beklemeden bölüm listesini görebiliyor.
- Podcast parçalarına kalıcı sıra, öncelik ve kaynak eşleme alanları eklendi; worker bu sırayı kullanarak parça bazlı ses üretimi yapıyor.
- Podcast API tarafına parça önceliklendirme ve sıra güncelleme endpoint'leri eklendi.
- Quiz tarafında AI podcast bölüm sırası artık parça `sort_order` alanından okunuyor.

#### Bekleme ve bölüm listesi deneyimi

- Yükleme ekranı, ses üretimi sırasında ne olduğunu açıklayan daha yönlendirici metinler ve alternatif aksiyonlarla güncellendi.
- Plan çıkarıldıktan sonra bölüm listesi aynı ekranda anında görünür hale geldi; hazır, oluşturuluyor, sırada ve hata durumları görünür oldu.
- Hazır olan ilk bölüm çıktığında kullanıcı bekleme ekranından doğrudan dinlemeye başlayabiliyor.
- Bekleme ekranında kullanıcı istediği bölümü `Öne Al` ile seçip ses üretim sırasını değiştirebiliyor.
- Player kuyruğu artık sadece hazır parçaları değil, sıradaki ve oluşturulan parçaları da gösteriyor.
- Player bölüm listesinde durum bazlı etiketler eklendi; aktif çalan bölüm `Dinleniyor` olarak ayrışıyor.
- Web tarafında player bölüm listesi sürükle-bırak ile yeniden sıralanabiliyor; native tarafta taşıma kontrolleri ile aynı sıra backend'e yazılıyor.
- Podcast listesi ve player kuyruğu, hazır olmayan parçalar sonradan hazır olduğunda store üzerinden otomatik senkronize oluyor.

#### Kişiselleştirme, çevrimdışı kullanım ve profil alanı

- Ses seçimi adımına örnek dinleme eklendi; kullanıcı sesleri seçim öncesinde kısa preview ile karşılaştırabiliyor.
- Mobil uygulamaya `İndirilenler` alanı eklendi; podcastler cihaz hafızasına alınarak internet olmadan dinlenebiliyor.
- Oynatıcı ve podcast kütüphanesi, indirilen içerikler için çevrimdışı hazır durumunu gösterecek şekilde güncellendi.
- İndirilen içerik store'u oturum açan kullanıcıya bağlandı; hesap değişiminde eski kullanıcının offline içerikleri yeni hesaba sızmıyor.
- Kısmi çevrimdışı kuyruklarda oynatma başlangıcı ve ilerleme kaydı mutlak bölüm ofseti üzerinden düzeltilerek yanlış resume konumları giderildi.
- İndirilenler ekranındaki süre etiketi artık toplam podcast süresi yerine gerçekten çevrimdışı hazır olan bölüm sürelerini gösteriyor.
- Profil sekmesine `Çalışma Araçları` alanı eklendi; günlük dinleme hedefi, ders planı ve kronometre tek yerde yönetilebiliyor.
- Çalışma araçları store'u kullanıcı bazlı izole edildi; hesap değişiminde günlük hedef, plan ve kronometre durumu çapraz taşınmıyor.
- Günlük dinleme süresi artık oynatma sırasında otomatik toplanıyor ve profil özetinde daha okunabilir süre formatında gösteriliyor.
- `Hesap Ayarları` ekranı eklendi; görünen ad ve temel hesap bilgileri uygulama içinden düzenlenebiliyor.
- `Yardım & Destek` ekranı eklendi; e-posta, telefon ve doğrudan iletişim sayfası bağlantıları uygulama içine taşındı.
- Giriş ve kayıt ekranlarına TUSBINA logosu eklendi.

#### İçerik otomasyonu ve görsel katman

- `Bölüm ekle` mantığı upload akışından çıkarıldı; sistem yüklenen belgeyi otomatik bölümlendirip planı kendisi oluşturuyor.
- Bölüm adları yüklenen içeriğin başlık ve konu yapısından otomatik türetiliyor; kullanıcıya daha anlamlı bir dinleme listesi sunuluyor.
- Kullanıcı kapak görseli yüklediyse bu görsel podcast kapağı olarak kullanılıyor; yoksa sistem içerikten otomatik kapak üretiyor.
- Mobil tarafta gerçek kapak görseli varsa kütüphane ve oynatıcıda gösteriliyor; yoksa TUSBINA markalı dinamik fallback artwork üretiliyor.
- Backend'in ürettiği SVG kapaklar da artık mobil kütüphane ve oynatıcıda doğrudan render ediliyor.

#### Geliştirme altyapısı

- `expo-dev-client` eklendi.
- iOS development build için `eas.json` ve ilgili npm komutları eklendi.
- Expo web çıktısını `apps/mobile/dist` altında üreten export akışı ve Nginx root fallback servisi eklendi; böylece public domain kökünde uygulama shell'i yayınlanabiliyor.
- Expo web export sonrasında `index.html` script etiketi otomatik `type="module"` olarak düzeltiliyor; prod web shell blank screen vermiyor.
- Mobil lint uyarıları temizlendi.
- `create_all` ile açılmış eski SQLite veritabanlarında eksik podcast kapak ve `course_parts.audio_url` kolonlarını otomatik ekleyen uyumluluk katmanı eklendi.
- Alembic bootstrap akışı da eski şemalarda aynı uyumluluk katmanını çalıştıracak şekilde güçlendirildi; legacy DB'ler head'e stamp edilirken eksik kolonlar tamamlanıyor.
- Auth katmanına HS256 shared-secret fallback doğrulaması eklendi; test ve lokal Supabase senaryoları JWKS bağımlılığı olmadan çalışabiliyor.
- `PATCH /api/v1/auth/profile` çağrısı artık eksik backend profilini otomatik oluşturuyor; hesap ayarları ekranı ilk senkron gecikmesinde 404'e düşmüyor.
- Ayrı taşınan `cover_file_id` artık generation worker tarafından doğru resolve ediliyor; mobil upload kontratıyla kapak görseli gerçekten podcast kapağına yansıyor.
- `GET /api/v1/voices/{voice}/preview` endpoint'ine app-level rate limit eklendi; public preview yüzeyi kontrolsüz TTS maliyeti üretmiyor.

### Doğrulananlar

- `npm run mobile:export:web` geçti.
- `npm run mobile:lint` geçti.
- `npm run mobile:typecheck` geçti.
- `apps/api` içinde `ruff check .` geçti.
- `apps/api` içinde tam test seti geçti: `pytest -q` -> `59 passed`

### Bu Turda Göremeyeceğimiz / Tam Doğrulayamayacağımız Şeyler

#### Expo Go + iPhone sınırları

- Expo Go üzerinde iOS arka planda ses oynatma davranışı tam native koşullarda doğrulanamaz.
- Lock-screen / Now Playing ekranındaki gerçek sistem davranışı Expo Go üzerinde güvenilir şekilde doğrulanamaz.
- Kulaklık tuşları, Control Center medya kontrolleri ve uygulama arası geçişteki gerçek iOS medya oturumu davranışı bu turda tam görülemez.
- Uygulama kill edildikten sonraki davranış, gerçek interruption senaryoları ve sistem seviyesinde medya yeniden başlatma davranışı bu turda doğrulanamaz.

#### Mevcut teknik sınırlar

- `expo-audio` ile mevcut kurulumda sistem seviyesinde `next / previous track` kontrolü tam desteklenmiyor; play/pause ve seek tarafı güçlendirildi.
- Linux ortamında iOS simulator doğrulaması yapılamaz.
- Gerçek iOS native arka plan ses davranışı için development build veya standalone build gerekir.

### Bu Tur İçin Beklenen Kullanıcı Etkisi

- Üretilen seslerde metalik ton kayması ve kesik parça geçişleri daha az olmalıdır.
- Uygulama içi oynatma akışı daha stabil olmalıdır.
- Arka plana geçildiğinde ses oturumu daha doğru yönetilmelidir.
- Player ekranı ile gerçek oynatma durumu arasındaki senkron daha güvenilir olmalıdır.
- AI podcast üretiminde ilk bekleme süresi kısalmalı, kullanıcı plan hazır olur olmaz bölümleri görmelidir.
- Kullanıcılar hazır olan parçaları beklemeden dinleyebilmeli ve istedikleri bölümü öne alabilmelidir.
- Bölüm sırası kullanıcı tercihine göre değiştirildiğinde worker yeni önceliğe göre ses üretmelidir.

### Sonraki Doğrulama Adımı

- Mümkün olan ilk native iOS development build üzerinde şu senaryolar test edilmelidir:
  - Uygulama açıkken oynat / durdur / seek
  - Uygulama arka plandayken çalma devamı
  - Lock-screen / Control Center medya kontrolleri
  - Bölüm geçişlerinde ilerleme kaydı
  - Uzun AI podcast içeriklerinde ses bozulması
