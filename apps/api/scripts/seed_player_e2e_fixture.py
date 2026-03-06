import argparse
import math
import struct
import sys
import wave
from pathlib import Path

from sqlalchemy import delete, select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.database import SessionLocal, init_db
from app.db.models import PodcastModel, PodcastPartModel, PodcastUserStateModel, UserLegalConsentModel, UserProfileModel
from app.db.models import utcnow

PODCAST_ID = "pod-e2e-player"
PART_IDS = (
    "pod-e2e-player-part-1",
    "pod-e2e-player-part-2",
    "pod-e2e-player-part-3",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or update a deterministic podcast fixture for browser player E2E."
    )
    parser.add_argument("--user-id", default="demo-user")
    parser.add_argument("--email", default="demo-user@local.tusbina.test")
    parser.add_argument("--display-name", default="Demo Öğrenci")
    parser.add_argument(
        "--third-part-status",
        choices=("queued", "processing", "ready"),
        default="queued",
    )
    parser.add_argument("--voice", default="Elif")
    parser.add_argument("--format", default="narrative")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    init_db()
    audio_url = ensure_fixture_audio_file()

    with SessionLocal() as db:
        now = utcnow()

        profile = db.get(UserProfileModel, args.user_id)
        if profile is None:
            profile = UserProfileModel(
                id=args.user_id,
                email=args.email,
                display_name=args.display_name,
                created_at=now,
            )
            db.add(profile)
        else:
            profile.email = args.email
            profile.display_name = args.display_name

        consent = db.get(UserLegalConsentModel, args.user_id)
        if consent is None:
            consent = UserLegalConsentModel(user_id=args.user_id)
            db.add(consent)

        consent.privacy_policy_version = "2026-03-06"
        consent.terms_of_use_version = "2026-03-06"
        consent.kvkk_notice_version = "2026-03-06"
        consent.required_consents_accepted_at = now
        consent.marketing_opt_in = False
        consent.marketing_consent_version = None
        consent.marketing_consent_updated_at = now
        consent.updated_at = now

        podcast = db.execute(select(PodcastModel).where(PodcastModel.id == PODCAST_ID)).scalar_one_or_none()
        if podcast is None:
            podcast = PodcastModel(
                id=PODCAST_ID,
                user_id=args.user_id,
                title="Player E2E Fixture",
                source_type="ai",
                voice=args.voice,
                format=args.format,
                total_duration_sec=72,
                cover_image_url=None,
                cover_image_source=None,
                created_at=now,
            )
            db.add(podcast)
        else:
            podcast.user_id = args.user_id
            podcast.title = "Player E2E Fixture"
            podcast.voice = args.voice
            podcast.format = args.format
            podcast.total_duration_sec = 72
            podcast.cover_image_url = None
            podcast.cover_image_source = None

        db.execute(delete(PodcastPartModel).where(PodcastPartModel.podcast_id == PODCAST_ID))
        db.execute(
            delete(PodcastUserStateModel).where(
                PodcastUserStateModel.podcast_id == PODCAST_ID,
                PodcastUserStateModel.user_id == args.user_id,
            )
        )

        third_part_ready = args.third_part_status == "ready"
        part_rows = [
            PodcastPartModel(
                id=PART_IDS[0],
                podcast_id=PODCAST_ID,
                title="Hazır Bölüm 1",
                duration_sec=24,
                page_range="s1-2",
                status="ready",
                sort_order=0,
                queue_priority=0,
                source_asset_id="fixture-a",
                source_slice_index=1,
                source_slice_total=3,
                audio_url=audio_url,
                updated_at=now,
            ),
            PodcastPartModel(
                id=PART_IDS[1],
                podcast_id=PODCAST_ID,
                title="Hazır Bölüm 2",
                duration_sec=24,
                page_range="s3-4",
                status="ready",
                sort_order=1,
                queue_priority=0,
                source_asset_id="fixture-a",
                source_slice_index=2,
                source_slice_total=3,
                audio_url=audio_url,
                updated_at=now,
            ),
            PodcastPartModel(
                id=PART_IDS[2],
                podcast_id=PODCAST_ID,
                title="Sıradaki Bölüm",
                duration_sec=24,
                page_range="s5-6",
                status=args.third_part_status,
                sort_order=2,
                queue_priority=0,
                source_asset_id="fixture-a",
                source_slice_index=3,
                source_slice_total=3,
                audio_url=audio_url if third_part_ready else None,
                updated_at=now,
            ),
        ]
        db.add_all(part_rows)
        db.commit()

    print(
        f"Seeded {PODCAST_ID} for {args.user_id} with third part status={args.third_part_status} "
        f"and voice={args.voice}."
    )


def ensure_fixture_audio_file() -> str:
    base_dir = Path(settings.local_upload_dir)
    target = base_dir / "e2e" / "player-e2e-24s.wav"
    target.parent.mkdir(parents=True, exist_ok=True)

    sample_rate = 16_000
    duration_sec = 24
    frequency_hz = 220
    amplitude = 1200
    frame_count = sample_rate * duration_sec

    with wave.open(str(target), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        frames = bytearray()
        for frame_index in range(frame_count):
            sample = int(amplitude * math.sin(2 * math.pi * frequency_hz * (frame_index / sample_rate)))
            frames.extend(struct.pack("<h", sample))
        wav_file.writeframes(bytes(frames))

    return "/static/uploads/e2e/player-e2e-24s.wav"


if __name__ == "__main__":
    main()
