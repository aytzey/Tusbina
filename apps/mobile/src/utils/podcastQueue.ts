import { Podcast, PodcastPartStatus, Track } from "@/domain/models";

export function buildPodcastQueue(podcast: Podcast): Track[] {
  return podcast.parts.map((part) => ({
    id: part.id,
    title: part.title,
    subtitle: podcast.title,
    durationSec: part.durationSec,
    sourceType: "ai",
    audioUrl: part.localAudioUrl ?? part.audioUrl,
    remoteAudioUrl: part.remoteAudioUrl ?? part.audioUrl,
    localAudioUrl: part.localAudioUrl,
    parentId: podcast.id,
    voice: podcast.voice,
    partStatus: part.status,
    coverImageUrl: podcast.coverImageUrl
  }));
}

export function resolvePodcastQueueStart(podcast: Podcast): {
  startIndex: number;
  startPositionSec: number;
} {
  const absoluteProgress = Math.max(podcast.progressSec ?? 0, 0);
  let remaining = absoluteProgress;
  let startIndex = 0;
  let startPositionSec = 0;

  for (let index = 0; index < podcast.parts.length; index += 1) {
    const part = podcast.parts[index];
    if (remaining < part.durationSec) {
      startIndex = index;
      startPositionSec = remaining;
      return { startIndex, startPositionSec };
    }

    remaining -= part.durationSec;
    if (index === podcast.parts.length - 1) {
      startIndex = index;
      startPositionSec = Math.min(part.durationSec, remaining);
    }
  }

  return { startIndex, startPositionSec };
}

export function getPodcastPartStatusLabel(
  status: PodcastPartStatus | undefined,
  options?: { isActive?: boolean; isPlaying?: boolean }
): string {
  if (options?.isActive && options.isPlaying) {
    return "Dinleniyor";
  }
  if (status === "processing") {
    return "Oluşturuluyor";
  }
  if (status === "ready") {
    return "Hazır";
  }
  if (status === "failed") {
    return "Hata";
  }
  return "Sırada";
}

export function getPodcastPartSummary(podcast: Podcast): {
  readyCount: number;
  processingCount: number;
  queuedCount: number;
  failedCount: number;
} {
  return podcast.parts.reduce(
    (acc, part) => {
      if (part.status === "ready") {
        acc.readyCount += 1;
      } else if (part.status === "processing") {
        acc.processingCount += 1;
      } else if (part.status === "failed") {
        acc.failedCount += 1;
      } else {
        acc.queuedCount += 1;
      }
      return acc;
    },
    { readyCount: 0, processingCount: 0, queuedCount: 0, failedCount: 0 }
  );
}
