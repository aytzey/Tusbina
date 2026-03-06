from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(UTC)


class UserProfileModel(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Supabase auth user id
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CourseModel(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    total_parts: Mapped[int] = mapped_column(Integer, nullable=False)
    total_duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    parts: Mapped[list["CoursePartModel"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", lazy="selectin"
    )


class CoursePartModel(Base):
    __tablename__ = "course_parts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    last_position_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    audio_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    course: Mapped[CourseModel] = relationship(back_populates="parts")


class PodcastModel(Base):
    __tablename__ = "podcasts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    voice: Mapped[str] = mapped_column(String(64), nullable=False)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    total_duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    cover_image_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    parts: Mapped[list["PodcastPartModel"]] = relationship(
        back_populates="podcast",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PodcastPartModel.sort_order.asc()",
    )


class PodcastPartModel(Base):
    __tablename__ = "podcast_parts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    podcast_id: Mapped[str] = mapped_column(ForeignKey("podcasts.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    page_range: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    queue_priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_asset_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_slice_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_slice_total: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    audio_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    podcast: Mapped[PodcastModel] = relationship(back_populates="parts")


class PodcastUserStateModel(Base):
    __tablename__ = "podcast_user_state"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    podcast_id: Mapped[str] = mapped_column(
        ForeignKey("podcasts.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_downloaded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    progress_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_listened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UploadAssetModel(Base):
    __tablename__ = "upload_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    public_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GenerationJobModel(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    result_podcast_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class FeedbackModel(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    tags_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UsageModel(Base):
    __tablename__ = "usage"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    monthly_listen_quota_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=3600)
    monthly_used_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class QuizQuestionModel(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    podcast_id: Mapped[str] = mapped_column(ForeignKey("podcasts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    correct_index: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
