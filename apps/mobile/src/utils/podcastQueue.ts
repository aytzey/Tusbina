import { Podcast, PodcastPartStatus, Track } from "@/domain/models";

export function buildPodcastQueue(podcast: Podcast): Track[] {
  let absoluteOffsetSec = 0;

  return podcast.parts.map((part) => {
    const track: Track = {
      id: part.id,
      title: part.title,
      subtitle: podcast.title,
      durationSec: part.durationSec,
      absoluteOffsetSec,
      sourceType: "ai",
      audioUrl: part.localAudioUrl ?? part.audioUrl,
      remoteAudioUrl: part.remoteAudioUrl ?? part.audioUrl,
      localAudioUrl: part.localAudioUrl,
      parentId: podcast.id,
      voice: podcast.voice,
      partStatus: part.status,
      coverImageUrl: podcast.coverImageUrl
    };
    absoluteOffsetSec += part.durationSec;
    return track;
  });
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

export function resolveTrackQueueStart(queue: Track[], absoluteProgressSec: number): {
  startIndex: number;
  startPositionSec: number;
} {
  if (queue.length === 0) {
    return { startIndex: 0, startPositionSec: 0 };
  }

  const normalizedProgress = Math.max(absoluteProgressSec, 0);

  for (let index = 0; index < queue.length; index += 1) {
    const track = queue[index];
    const absoluteOffsetSec = track.absoluteOffsetSec ?? 0;
    const absoluteEndSec = absoluteOffsetSec + track.durationSec;

    if (normalizedProgress < absoluteEndSec) {
      return {
        startIndex: index,
        startPositionSec: Math.max(0, normalizedProgress - absoluteOffsetSec),
      };
    }
  }

  const lastTrack = queue[queue.length - 1];
  const absoluteOffsetSec = lastTrack.absoluteOffsetSec ?? 0;
  return {
    startIndex: queue.length - 1,
    startPositionSec: Math.min(lastTrack.durationSec, Math.max(0, normalizedProgress - absoluteOffsetSec)),
  };
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
