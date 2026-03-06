import { Podcast } from "@/domain/models";

export function stripDownloadState(podcast: Podcast): Podcast {
  const remoteCoverImageUrl =
    podcast.remoteCoverImageUrl ?? (isLocalFileUri(podcast.coverImageUrl) ? undefined : podcast.coverImageUrl);

  return {
    ...podcast,
    isDownloaded: false,
    downloadedAt: undefined,
    coverImageUrl: remoteCoverImageUrl,
    remoteCoverImageUrl,
    parts: podcast.parts.map((part) => ({
      ...part,
      audioUrl: part.remoteAudioUrl ?? (isLocalFileUri(part.audioUrl) ? undefined : part.audioUrl),
      localAudioUrl: undefined,
    })),
  };
}

function isLocalFileUri(value: string | undefined): boolean {
  return Boolean(value?.startsWith("file://"));
}
