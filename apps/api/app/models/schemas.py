from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CoursePartStatus = Literal["completed", "inProgress", "locked", "new"]
PodcastPartStatus = Literal["ready", "queued", "processing", "failed"]
PodcastFormat = Literal["narrative", "summary", "qa"]
SourceType = Literal["course", "ai"]


# --- Course schemas ---


class CoursePart(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    duration_sec: int
    status: CoursePartStatus
    last_position_sec: int = 0
    audio_url: str | None = None


class Course(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    category: str
    total_parts: int
    total_duration_sec: int
    progress_pct: int
    parts: list[CoursePart] = []


class CoursePartPositionIn(BaseModel):
    last_position_sec: int = Field(ge=0)


class PodcastPart(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    podcast_id: str
    title: str
    duration_sec: int
    page_range: str
    status: PodcastPartStatus
    audio_url: str | None = None


class Podcast(BaseModel):
    id: str
    title: str
    source_type: SourceType
    voice: str
    format: PodcastFormat
    total_duration_sec: int
    cover_image_url: str | None = None
    cover_image_source: str | None = None
    parts: list[PodcastPart] = []
    is_favorite: bool = False
    is_downloaded: bool = False
    progress_sec: int = 0


class PodcastStateUpdateIn(BaseModel):
    is_favorite: bool | None = None
    is_downloaded: bool | None = None
    progress_sec: int | None = Field(default=None, ge=0)
    increment_progress_sec: int | None = Field(default=None, ge=0)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    tags: list[str] = []
    text: str = ""
    content_id: str


class FeedbackOut(BaseModel):
    ok: bool
    created_at: datetime


class UsageOut(BaseModel):
    monthly_listen_quota_sec: int
    monthly_used_sec: int
    remaining_sec: int
    is_premium: bool
    consumed_sec: int = 0
    limit_reached: bool = False


class UsageConsumeIn(BaseModel):
    seconds: int = Field(ge=1, le=3600)


class UsagePackageAddIn(BaseModel):
    extra_seconds: int = Field(default=5 * 60 * 60, ge=1, le=24 * 60 * 60)


class UploadAssetOut(BaseModel):
    id: str
    filename: str
    public_url: str


class UploadOut(BaseModel):
    ok: bool
    files: list[str]
    file_ids: list[str]
    assets: list[UploadAssetOut]


class GeneratePodcastSectionIn(BaseModel):
    id: str
    title: str
    enabled: bool = True
    source_file_id: str | None = None


class GeneratePodcastIn(BaseModel):
    title: str
    voice: str
    format: PodcastFormat
    file_ids: list[str] = []
    uploaded_file_ids: list[str] = []
    sections: list[GeneratePodcastSectionIn] = []
    cover_file_id: str | None = None

    @model_validator(mode="after")
    def normalize_file_ids(self) -> "GeneratePodcastIn":
        if not self.file_ids and self.uploaded_file_ids:
            self.file_ids = list(self.uploaded_file_ids)
        if not self.file_ids:
            raise ValueError("file_ids or uploaded_file_ids must be provided")
        return self


class GeneratePodcastOut(BaseModel):
    job_id: str
    status: Literal["queued"]


class GeneratePodcastStatusOut(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "completed", "failed"]
    progress_pct: int
    plan_ready: bool = False
    audio_ready_parts: int = 0
    audio_total_parts: int = 0
    result_podcast_id: str | None = None
    error: str | None = None


class PodcastPartOrderIn(BaseModel):
    part_ids: list[str] = Field(min_length=1)


# --- Quiz schemas ---


class QuizGenerateIn(BaseModel):
    podcast_id: str
    part_id: str | None = None
    question_count: int = Field(default=5, ge=3, le=10)


class QuizQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    podcast_id: str
    category: str
    question: str
    options: list[str]
    correct_index: int
    explanation: str
    created_at: datetime


class QuizGenerateOut(BaseModel):
    ok: bool
    podcast_id: str
    questions: list[QuizQuestionOut]
