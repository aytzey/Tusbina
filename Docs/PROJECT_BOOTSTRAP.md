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
- `PremiumScreen`
- `QuizScreen`
- `NoInternetScreen`
- `GeneralErrorScreen`

## 3) State Store'ları

- `userStore`: kota, premium, limit modal, `/usage` senkronu
- `playerStore`: track/queue, play/pause, seek, prev/next, rate, bookmark
- `coursesStore`: ders listesi + detay
- `podcastsStore`: podcast listesi + favorite/download/progress local patch
- `uploadWizardStore`: PDF dosyaları, step verileri, reorder

## 4) API Kontratları

- `GET /health` (db status/revision + storage + tts provider bilgisi)
- `GET /api/v1/courses`
- `GET /api/v1/courses/{id}`
- `PUT /api/v1/courses/{id}/parts/{part_id}/position`
- `GET /api/v1/podcasts`
- `GET /api/v1/podcasts/{id}`
- `PUT /api/v1/podcasts/{id}/state`
- `POST /api/v1/upload`
- `POST /api/v1/generatePodcast`
- `GET /api/v1/generatePodcast/{job_id}/status`
- `POST /api/v1/feedback`
- `GET /api/v1/usage`
- `POST /api/v1/usage/consume`
- `POST /api/v1/usage/premium/activate`
- `POST /api/v1/usage/package/add`

## 5) Altyapı

- API: FastAPI
- Veri katmanı: SQLAlchemy (`DATABASE_URL`) + Alembic migration
  Geçiş komutu: `python scripts/migrate_or_stamp.py` (eski schema varsa otomatik `stamp`, boşsa `upgrade`)
  Runtime modu: `DB_SCHEMA_MODE=alembic` (önerilen), test/local hızlı mod: `DB_SCHEMA_MODE=create_all`
- Job pipeline: `generation_jobs` tablosu + ayrı worker (`python -m app.worker`)
- Storage: `local` veya `Cloudflare R2` (`STORAGE_BACKEND`)
- Reverse proxy: Nginx
- Local orchestration: Docker Compose (Postgres + Redis + API + Worker + Nginx)

## 6) Mock -> Real Durum

- `courses/podcasts`: mobile’da API öncelikli, hata halinde mock fallback
- `upload/generation`: mobile doğrudan API ile çalışır, Step3 bölüm listesi yüklenen PDF'lerden türetilir; düzenleme/sıralama `sections` olarak worker'a aktarılır
  Worker katmanı PDF içeriğini okuyup bölüm scripti üretir; `OPENROUTER_API_KEY` varsa LLM destekli script, yoksa extractive fallback kullanılır.
  Upload tarafında PDF signature/uzantı, dosya sayısı ve dosya boyutu validasyonu backend'de enforce edilir.
- `profile usage`: `/usage` ve usage action endpointleri ile backend senkronu
  `/usage/consume` endpointi `consumed_sec` ve `limit_reached` döner; limit modal tetikleme buna göre yapılır.
- `player feedback`: `/feedback` endpointine gönderilir
- `library flags`: `PUT /podcasts/{id}/state` ile kalıcı

## 7) Sonraki Adımlar

1. `ENABLE_AUTH=true` + Supabase JWT secret ile auth zorunlu hale getir.
2. Player bölüm bazlı queue ve next/prev atlama davranışını backend progress'e yaz.
3. Premium satın alma state'ini ödeme provider webhook'larıyla senkronla.
4. Supabase geçişinde DB migration komutlarını CI/CD pipeline'ına ekle (`alembic upgrade head`).

Not: Worker artık `TTS_PROVIDER=piper` ile model indirip gerçek ses üretir; `PIPER_USE_CUDA=true` denendiğinde hata olursa CPU fallback yapılır. `TTS_FALLBACK_TO_DUMMY=true` ise piper tamamen unavailable olduğunda dummy WAV ile devam eder.
