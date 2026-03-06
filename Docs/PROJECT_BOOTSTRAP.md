# TUSBINA Project Bootstrap (MVP)

Bu doküman, `Design` ve `Docs` raporlarının teknik karşılığıdır.

## 1) Ürün Akışları

- Flow A: `Dersler -> Ders Detay -> Player`
- Flow B: `Yükle Step1 -> Step2 -> Step3 -> Uploading -> Dinle`
- Flow C: `Player (quota 0) -> Limit Modal -> Premium -> Player`
- Flow D: `Quiz`
- Flow E: `AI Podcast Player -> Değerlendir (feedback modal) -> Gönder`

## 2) Mobil Ekran Haritası

- `CoursesCatalogScreen`
- `CourseDetailScreen`
- `PlayerScreen`
- `UploadStep1Screen`
- `UploadStep2Screen`
- `UploadStep3Screen`
- `UploadingScreen`
- `PodcastLibraryScreen`
- `ProfileScreen`
- `DownloadsScreen`
- `StudyToolsScreen`
- `AccountSettingsScreen`
- `LegalCenterScreen`
- `LegalDocumentScreen`
- `ConsentPreferencesScreen`
- `DeleteAccountScreen`
- `SupportScreen`
- `PremiumScreen`
- `QuizScreen`
- `NoInternetScreen`
- `GeneralErrorScreen`

## 3) State Store'ları

- `userStore`: kota, premium, limit modal, `/usage` senkronu
- `authStore`: Supabase session, email/OAuth login, profile sync, zorunlu yasal onay durumu ve açık rıza tercihi
- `playerStore`: track/queue, play/pause, seek, prev/next, rate, bookmark
- `coursesStore`: ders listesi + detay
- `podcastsStore`: podcast listesi + favorite/download/progress local patch
- `uploadWizardStore`: belge/kapak dosyaları, ses, format, podcast adı
- `downloadsStore`: çevrimdışı indirilen podcastler, yerel audio/cover eşlemesi ve kullanıcı bazlı sahiplik temizliği
- `learningToolsStore`: günlük hedef, ders planı, kronometre ve kullanıcı bazlı sahiplik temizliği

## 4) API Kontratları

- `GET /health` (db status/revision + storage + tts provider bilgisi)
- `GET /api/v1/courses`
- `GET /api/v1/courses/{id}`
- `PUT /api/v1/courses/{id}/parts/{part_id}/position`
- `GET /api/v1/podcasts`
- `GET /api/v1/podcasts/{id}`
- `PUT /api/v1/podcasts/{id}/state`
- `POST /api/v1/podcasts/{id}/parts/{part_id}/prioritize`
- `PUT /api/v1/podcasts/{id}/parts/order`
- `POST /api/v1/upload`
- `POST /api/v1/generatePodcast`
- `GET /api/v1/generatePodcast/{job_id}/status`
  `status=completed` planın çıkarıldığını gösterir; hazır ses sayaçları `plan_ready`, `audio_ready_parts`, `audio_total_parts` alanlarıyla izlenir.
- `GET /api/v1/voices/{voice_name}/preview` (rate-limited)
- `POST /api/v1/feedback`
- `GET /api/v1/usage`
- `POST /api/v1/usage/consume`
- `POST /api/v1/usage/premium/activate`
- `POST /api/v1/usage/package/add`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/profile`
- `PATCH /api/v1/auth/profile` (profil yoksa auto-create edip günceller)
- `GET /api/v1/legal/documents`
- `GET /api/v1/legal/documents/{slug}`
- `GET /api/v1/auth/legal-consent`
- `PUT /api/v1/auth/legal-consent`
- `DELETE /api/v1/auth/account`
- `GET /legal` + `GET /legal/{slug}` public legal pages

## 5) Altyapı

- API: FastAPI
- Veri katmanı: SQLAlchemy (`DATABASE_URL`) + Alembic migration
  Geçiş komutu: `python scripts/migrate_or_stamp.py` (eski schema varsa otomatik `stamp`, boşsa `upgrade`)
  Runtime modu: `DB_SCHEMA_MODE=alembic` (önerilen), test/local hızlı mod: `DB_SCHEMA_MODE=create_all`
- Job pipeline: `generation_jobs` tablosu + ayrı worker (`python -m app.worker`)
- Storage: `local` veya `Cloudflare R2` (`STORAGE_BACKEND`)
- Reverse proxy + web shell: Nginx, `/api` ve `/static` proxy'lerken Expo web export çıktısını kökten servis eder
- Yasal metinler aynı domain altında public `/legal/*` sayfaları olarak da yayınlanır; mağaza policy linkleri buradan verilebilir
- Local orchestration: Docker Compose (Postgres + Redis + API + Worker + Nginx + `apps/mobile/dist`)

## 6) Mock -> Real Durum

- `courses/podcasts`: mobile’da API öncelikli, hata halinde offline/download fallback
- `upload/generation`: mobile doğrudan API ile çalışır; Step3 manuel bölüm editörü içermez, worker belgeyi otomatik bölümlendirir ve başlıkları içerikten üretir
  Voice seçimi öncesi `/voices/{voice}/preview` ile kısa ses örneği dinlenebilir.
  Kapak görseli `cover_file_id` ile ayrı taşınabilir; kapak yoksa backend otomatik cover üretir.
  Worker katmanı PDF/TXT içeriğini okuyup bölüm scripti üretir; `OPENROUTER_API_KEY` varsa LLM destekli script, yoksa extractive fallback kullanılır.
  Upload tarafında uzantı, dosya sayısı ve dosya boyutu validasyonu backend'de enforce edilir; mobile tarafı da 25 MB sınırı ve destekli kapak formatlarıyla hizalanır.
- `profile usage`: `/usage` ve usage action endpointleri ile backend senkronu
  `/usage/consume` endpointi `consumed_sec` ve `limit_reached` döner; limit modal tetikleme buna göre yapılır.
- `legal/compliance`: login/register ekranlarında doküman linkleri görünür; email register zorunlu kabul checkbox'ı ister, sosyal giriş eksikse `LegalConsentScreen` ile bloklanır. Açık rıza backend + auth metadata tarafında persist edilir; hesap silme akışı uygulama içinden tetiklenir.
- `player feedback`: `/feedback` endpointine gönderilir
- `library flags`: favori ve progress `PUT /podcasts/{id}/state` ile kalıcı; indirilen/offline durumu cihaz-lokal store üzerinden yönetilir

## 7) Sonraki Adımlar

1. `ENABLE_AUTH=true` + Supabase JWT secret ile auth zorunlu hale getir.
2. Player bölüm bazlı queue ve next/prev atlama davranışını backend progress'e yaz.
3. Premium satın alma state'ini ödeme provider webhook'larıyla senkronla.
4. Supabase geçişinde DB migration komutlarını CI/CD pipeline'ına ekle (`alembic upgrade head`).

Not: Worker artık `TTS_PROVIDER=piper` ile model indirip gerçek ses üretir; `PIPER_USE_CUDA=true` denendiğinde hata olursa CPU fallback yapılır. `TTS_FALLBACK_TO_DUMMY=true` ise piper tamamen unavailable olduğunda dummy WAV ile devam eder.
