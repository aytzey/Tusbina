# TUSBINA Monorepo

TUSBINA, TUS öğrencileri için sesli eğitim asistanı. Bu repo, `Design` ve `Docs` kapsamına göre MVP altyapısını içerir.

## Kaynaklar

- Ürün raporu: `Design/TUSBINA_Urun_Detay_Raporu_V1-1.pdf`
- Altyapı raporu: `Docs/UrunDetayRaporu.pdf`
- Ekran referansları: `Design/*/code.html`

## Repo Yapısı

- `apps/mobile`: Expo + React Native + TypeScript
- `apps/api`: FastAPI + SQLAlchemy + upload/generation pipeline
- `packages/shared`: paylaşılan tip/kontratlar
- `infra`: Nginx reverse proxy

## Mobile

- Tablar: `Dersler`, `Yükle`, `Dinle`, `Profil`
- Akış ekranları: `Ders Detay`, `Player`, `Premium`, `Quiz`, `İndirilenler`, `Çalışma Araçları`, `Hesap Ayarları`, `Yardım & Destek`, `Hata durumları`
- State store'ları: `auth`, `user`, `player`, `courses`, `podcasts`, `uploadWizard`, `downloads`, `learningTools`, `quiz`
- Upload akışı: `expo-document-picker` ile PDF/TXT seçimi, opsiyonel kapak yükleme, ses preview, API upload, otomatik bölümleme, job polling
- Dinle kütüphanesi: favori durumu backend'de kalıcı; çevrimdışı hazır bölümler ise yerel store ile ve aktif kullanıcıya göre izole şekilde yönetiliyor
- Auth profile senkronu ve voice preview çağrıları API fallback adaylarını kullanır; web shell host/port kaydığında stale base URL'e takılmaz. App açılışı ve giriş akışları auth metadata'daki görünen adı backend profile'a yeniden taşır.
- Web export: `npm run mobile:export:web` çıktısı `apps/mobile/dist` altında üretilir, module-script post-process uygulanır ve Nginx kökten servis edilebilir

## API (v1)

- `GET /health`
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
  `status=completed` planın hazır olduğunu ifade eder; ses üretim ilerlemesi `plan_ready`, `audio_ready_parts` ve `audio_total_parts` alanlarından izlenir.
- `GET /api/v1/voices/{voice_name}/preview`
- `POST /api/v1/feedback`
- `GET /api/v1/usage`
- `POST /api/v1/usage/consume`
- `POST /api/v1/usage/premium/activate`
- `POST /api/v1/usage/package/add`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/profile`
- `PATCH /api/v1/auth/profile` (profil yoksa auto-create edip günceller)

## Upload + Generation Mimari Notu

- `upload` endpointi dosyaları `local` veya `R2` backend'ine yazar.
- `generatePodcast` endpointi DB'de job oluşturur (`queued`).
- Worker önce yüklenen belgeyi otomatik bölümlendirir, bölüm başlıklarını içerikten türetir ve kapak görselini resolve eder; kapak yoksa otomatik SVG cover üretir ve mobil istemci bu kapağı doğrudan render eder.
- `cover_file_id` belge `file_ids` listesinden ayrı taşınabilir; backend bu mobile kontratını doğrudan destekler.
- `app.worker` queued job'ı güvenli şekilde claim eder (`FOR UPDATE SKIP LOCKED`), PDF/TXT içeriğinden bölüm metni üretir, planı hazırlar ve job'ı `completed` yapar.
- Ses sentezi bölüm bazında ayrı worker döngüsüyle ilerler; job status yanıtındaki `audio_ready_parts` / `audio_total_parts` alanları bu aşamayı görünür kılar.
- `OPENROUTER_API_KEY` verilirse script üretimi LLM destekli olur; anahtar yoksa extractive fallback kullanılır.

## Hızlı Başlangıç

### 1) Mobile

```bash
npm install
npm run mobile:export:web
npm run mobile:start
```

### 2) API (lokal)

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

### 3) Worker (ayrı terminal)

```bash
cd apps/api
source .venv/bin/activate
python scripts/setup_tts.py
python -m app.worker
```

### 4) Docker Compose (API + Worker + Postgres + Redis + Nginx)

```bash
cp .env.example .env
API_PORT=8010 NGINX_PORT=8090 docker compose up -d --build
```

### 5) DB Migration (Supabase uyumlu)

```bash
cd apps/api
source .venv/bin/activate
python scripts/migrate_or_stamp.py
```

`DATABASE_URL` değerini Supabase Postgres connection string ile değiştirip aynı komutla migration uygulanabilir.
Not: Daha önce `create_all` ile oluşmuş bir veritabanında script otomatik `alembic stamp head` yapar.
Uygulama açılış davranışı `DB_SCHEMA_MODE` ile kontrol edilir:
- `create_all`: SQLAlchemy metadata ile tablo oluşturur (test/hızlı local)
- `alembic`: otomatik migration bootstrap (`upgrade`/`stamp`)

## Mobile API Env

`apps/mobile/.env` (veya shell env) içine:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_DEMO_USER_ID=demo-user
EXPO_PUBLIC_USE_MOCK=false
```

## Kalite Kontrol

```bash
npm run mobile:typecheck
npm run mobile:lint
source .venv/bin/activate && cd apps/api && ruff check . && pytest -q
```

TTS benchmark:

```bash
cd apps/api
source .venv/bin/activate
python scripts/benchmark_tts.py --runs 3
PIPER_USE_CUDA=true python scripts/benchmark_tts.py --runs 3
```

## Ortam Değişkenleri

Temel env'ler:

- `DATABASE_URL`
- `DB_SCHEMA_MODE` (`create_all` veya `alembic`)
- `DEMO_MONTHLY_QUOTA_SEC`, `PREMIUM_MONTHLY_QUOTA_SEC`
- `ENABLE_AUTH`, `SUPABASE_JWT_SECRET`
- `STORAGE_BACKEND` (`local` veya `r2`)
- `LOCAL_UPLOAD_DIR` / `R2_*`
- `UPLOAD_ALLOWED_EXTENSIONS`, `UPLOAD_MAX_FILES`, `UPLOAD_MAX_FILE_SIZE_MB`
- `UPLOAD_VALIDATE_PDF_SIGNATURE`
- `WORKER_POLL_INTERVAL_SEC`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `SCRIPT_SOURCE_MAX_CHARS`, `SCRIPT_TARGET_MAX_CHARS`
- `GENERATION_MAX_PARTS`
- `TTS_PROVIDER` (`piper` veya `dummy`)
- `PIPER_MODEL_URL` / `PIPER_MODEL_CONFIG_URL`
- `PIPER_USE_CUDA` (GPU destekli piper kurulumu varsa `true`)
- `PIPER_LENGTH_SCALE`, `PIPER_NOISE_SCALE`, `PIPER_NOISE_W_SCALE`, `PIPER_SENTENCE_SILENCE`
- `PIPER_VOICE_ARDA_LENGTH_SCALE`, `PIPER_VOICE_SELIN_LENGTH_SCALE` (ses bazlı hız profili)

Sağlık endpointi:
- `GET /health` -> `db_status`, `db_revision`, `tts_provider`, `storage_backend` bilgilerini döner.
- `POST /usage/consume` cevabı `consumed_sec` ve `limit_reached` alanlarıyla döner.
