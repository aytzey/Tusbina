import { Course, Podcast } from "@/domain/models";
import { resolveApiAssetUrl } from "./httpClient";
import { ApiCourse, ApiPodcast } from "./types";

export function mapApiCourse(course: ApiCourse): Course {
  return {
    id: course.id,
    title: course.title,
    category: course.category,
    totalParts: course.total_parts,
    totalDurationSec: course.total_duration_sec,
    progressPct: course.progress_pct,
    parts: course.parts.map((part) => ({
      id: part.id,
      courseId: part.course_id,
      title: part.title,
      durationSec: part.duration_sec,
      status: part.status,
      lastPositionSec: part.last_position_sec,
      audioUrl: resolveApiAssetUrl(part.audio_url)
    }))
  };
}

export function mapApiPodcast(podcast: ApiPodcast): Podcast {
  return {
    id: podcast.id,
    title: podcast.title,
    sourceType: podcast.source_type,
    voice: podcast.voice,
    format: podcast.format,
    totalDurationSec: podcast.total_duration_sec,
    coverImageUrl: resolveApiAssetUrl(podcast.cover_image_url),
    remoteCoverImageUrl: resolveApiAssetUrl(podcast.cover_image_url),
    coverImageSource: podcast.cover_image_source ?? undefined,
    isFavorite: podcast.is_favorite ?? false,
    isDownloaded: false,
    progressSec: podcast.progress_sec ?? 0,
    parts: podcast.parts.map((part) => ({
      id: part.id,
      podcastId: part.podcast_id,
      title: part.title,
      durationSec: part.duration_sec,
      pageRange: part.page_range,
      status: part.status,
      audioUrl: resolveApiAssetUrl(part.audio_url),
      remoteAudioUrl: resolveApiAssetUrl(part.audio_url)
    }))
  };
}
