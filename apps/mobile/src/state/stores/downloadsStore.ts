import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Podcast } from "@/domain/models";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type DownloadablePodcast = Podcast;
const DOWNLOAD_CONCURRENCY = 3;

interface DownloadProgress {
  downloadedParts: number;
  totalParts: number;
}

interface DownloadsState {
  ownerUserId: string | null;
  downloads: DownloadablePodcast[];
  downloadingIds: string[];
  downloadProgress: Record<string, DownloadProgress>;
  error: string | null;
  bindToUser: (userId: string | null) => Promise<void>;
  isPodcastDownloaded: (podcastId: string) => boolean;
  getDownloadedPodcast: (podcastId: string) => DownloadablePodcast | undefined;
  getOfflinePartsCount: (podcastId: string) => number;
  getDownloadProgress: (podcastId: string) => DownloadProgress | null;
  applyDownloadsToPodcast: (podcast: Podcast) => Podcast;
  syncPodcastsWithDownloads: (podcasts: Podcast[]) => Podcast[];
  updateDownloadedPodcastProgress: (podcastId: string, progressSec: number) => void;
  downloadPodcast: (podcast: Podcast) => Promise<Podcast>;
  removePodcastDownload: (podcastId: string) => Promise<void>;
  clearError: () => void;
}

const DOWNLOAD_ROOT = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}tusbina-downloads`;

export const useDownloadsStore = create<DownloadsState>()(
  persist(
    (set, get) => ({
      ownerUserId: null,
      downloads: [],
      downloadingIds: [],
      downloadProgress: {},
      error: null,
      bindToUser: async (userId) => {
        if (!userId) {
          return;
        }

        const currentOwner = get().ownerUserId;
        if (currentOwner === userId) {
          return;
        }

        if (currentOwner === null) {
          set({ ownerUserId: userId, error: null, downloadingIds: [] });
          return;
        }

        set({
          ownerUserId: userId,
          downloads: [],
          downloadingIds: [],
          error: null,
        });
        await FileSystem.deleteAsync(DOWNLOAD_ROOT, { idempotent: true });
      },
      isPodcastDownloaded: (podcastId) => Boolean(get().downloads.find((item) => item.id === podcastId)),
      getDownloadedPodcast: (podcastId) => get().downloads.find((item) => item.id === podcastId),
      getOfflinePartsCount: (podcastId) => {
        const podcast = get().downloads.find((item) => item.id === podcastId);
        if (!podcast) {
          return 0;
        }
        return podcast.parts.filter((part) => Boolean(part.localAudioUrl)).length;
      },
      getDownloadProgress: (podcastId) => get().downloadProgress[podcastId] ?? null,
      applyDownloadsToPodcast: (podcast) => applyDownloadState(podcast, get().downloads),
      syncPodcastsWithDownloads: (podcasts) => podcasts.map((podcast) => applyDownloadState(podcast, get().downloads)),
      updateDownloadedPodcastProgress: (podcastId, progressSec) =>
        set((state) => ({
          downloads: state.downloads.map((item) =>
            item.id === podcastId ? { ...item, progressSec } : item
          ),
        })),
      downloadPodcast: async (podcast) => {
        if (get().downloadingIds.includes(podcast.id)) {
          return get().applyDownloadsToPodcast(podcast);
        }

        const playableParts = podcast.parts.filter((part) => Boolean(part.remoteAudioUrl ?? part.audioUrl));
        if (playableParts.length === 0) {
          throw new Error("Henüz indirilebilir bir bölüm hazır değil.");
        }

        set((state) => ({
          downloadingIds: [...state.downloadingIds, podcast.id],
          downloadProgress: {
            ...state.downloadProgress,
            [podcast.id]: { downloadedParts: 0, totalParts: podcast.parts.length },
          },
          error: null,
        }));

        try {
          await ensureDirectory(DOWNLOAD_ROOT);
          const podcastDir = `${DOWNLOAD_ROOT}/${sanitizePathSegment(podcast.id)}`;
          await ensureDirectory(podcastDir);

          const existing = get().getDownloadedPodcast(podcast.id);
          const existingParts = new Map((existing?.parts ?? []).map((part) => [part.id, part]));
          let completedParts = 0;

          const nextParts = await mapWithConcurrency(
            podcast.parts,
            DOWNLOAD_CONCURRENCY,
            async (part) => {
              const remoteAudioUrl = part.remoteAudioUrl ?? part.audioUrl;
              const previous = existingParts.get(part.id);

              if (!remoteAudioUrl) {
                completedParts += 1;
                set((state) => ({
                  downloadProgress: {
                    ...state.downloadProgress,
                    [podcast.id]: { downloadedParts: completedParts, totalParts: podcast.parts.length },
                  },
                }));
                return {
                  ...part,
                  audioUrl: previous?.localAudioUrl ?? part.audioUrl,
                  remoteAudioUrl: part.remoteAudioUrl ?? part.audioUrl,
                  localAudioUrl: previous?.localAudioUrl,
                };
              }

              const extension = inferFileExtension(remoteAudioUrl, "audio");
              const targetPath = `${podcastDir}/${buildVersionedFileName(part.id, remoteAudioUrl, extension)}`;
              const localAudioUrl = await downloadIfNeeded(remoteAudioUrl, targetPath);

              completedParts += 1;
              set((state) => ({
                downloadProgress: {
                  ...state.downloadProgress,
                  [podcast.id]: { downloadedParts: completedParts, totalParts: podcast.parts.length },
                },
              }));

              return {
                ...part,
                audioUrl: localAudioUrl,
                remoteAudioUrl,
                localAudioUrl,
              };
            }
          );

          const remoteCoverImageUrl = podcast.remoteCoverImageUrl ?? podcast.coverImageUrl;
          let coverImageUrl = remoteCoverImageUrl;
          if (remoteCoverImageUrl) {
            try {
              const coverExtension = inferFileExtension(remoteCoverImageUrl, "image");
              const coverTargetPath = `${podcastDir}/${buildVersionedFileName("cover", remoteCoverImageUrl, coverExtension)}`;
              coverImageUrl = await downloadIfNeeded(remoteCoverImageUrl, coverTargetPath);
            } catch {
              coverImageUrl = remoteCoverImageUrl;
            }
          }

          const downloadedPodcast: DownloadablePodcast = {
            ...podcast,
            coverImageUrl,
            remoteCoverImageUrl,
            isDownloaded: true,
            downloadedAt: new Date().toISOString(),
            parts: nextParts,
          };

          set((state) => {
            const { [podcast.id]: _removed, ...restProgress } = state.downloadProgress;
            return {
              downloads: replacePodcastEntry(state.downloads, downloadedPodcast),
              downloadingIds: state.downloadingIds.filter((id) => id !== podcast.id),
              downloadProgress: restProgress,
            };
          });

          return applyDownloadState(downloadedPodcast, get().downloads);
        } catch (error) {
          set((state) => {
            const { [podcast.id]: _removed, ...restProgress } = state.downloadProgress;
            return {
              downloadingIds: state.downloadingIds.filter((id) => id !== podcast.id),
              downloadProgress: restProgress,
              error: error instanceof Error ? error.message : "İndirilenler güncellenemedi.",
            };
          });
          throw error;
        }
      },
      removePodcastDownload: async (podcastId) => {
        const podcastDir = `${DOWNLOAD_ROOT}/${sanitizePathSegment(podcastId)}`;
        await FileSystem.deleteAsync(podcastDir, { idempotent: true });
        set((state) => ({
          downloads: state.downloads.filter((item) => item.id !== podcastId),
          downloadingIds: state.downloadingIds.filter((id) => id !== podcastId),
          error: null,
        }));
      },
      clearError: () => set({ error: null }),
    }),
    {
      name: "tusbina-downloads-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ ownerUserId: state.ownerUserId, downloads: state.downloads }),
    }
  )
);

function applyDownloadState(podcast: Podcast, downloads: DownloadablePodcast[]): Podcast {
  const downloaded = downloads.find((item) => item.id === podcast.id);
  if (!downloaded) {
    return podcast;
  }

  const downloadedParts = new Map(downloaded.parts.map((part) => [part.id, part]));
  const remoteCoverImageUrl =
    downloaded.remoteCoverImageUrl ??
    podcast.remoteCoverImageUrl ??
    (isLocalFileUri(podcast.coverImageUrl) ? undefined : podcast.coverImageUrl);

  return {
    ...podcast,
    isDownloaded: true,
    downloadedAt: downloaded.downloadedAt,
    coverImageUrl: downloaded.coverImageUrl ?? podcast.coverImageUrl,
    remoteCoverImageUrl,
    coverImageSource: downloaded.coverImageSource ?? podcast.coverImageSource,
    parts: podcast.parts.map((part) => {
      const offlinePart = downloadedParts.get(part.id);
      if (!offlinePart) {
        return part;
      }
      return {
        ...part,
        audioUrl: offlinePart.localAudioUrl ?? part.audioUrl,
        remoteAudioUrl: part.remoteAudioUrl ?? part.audioUrl,
        localAudioUrl: offlinePart.localAudioUrl ?? part.localAudioUrl,
      };
    }),
  };
}

function replacePodcastEntry(list: DownloadablePodcast[], nextPodcast: DownloadablePodcast): DownloadablePodcast[] {
  const existing = list.some((item) => item.id === nextPodcast.id);
  if (!existing) {
    return [nextPodcast, ...list];
  }
  return list.map((item) => (item.id === nextPodcast.id ? nextPodcast : item));
}

async function ensureDirectory(path: string): Promise<void> {
  if (!path) {
    throw new Error("İndirilenler dizini hazırlanamadı.");
  }
  await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function downloadIfNeeded(remoteUrl: string, targetPath: string): Promise<string> {
  if (remoteUrl.startsWith("file://")) {
    return remoteUrl;
  }
  const info = await FileSystem.getInfoAsync(targetPath);
  if (info.exists) {
    return info.uri;
  }

  const result = await FileSystem.downloadAsync(remoteUrl, targetPath);
  return result.uri;
}

function inferFileExtension(url: string, fallbackType: "audio" | "image"): string {
  const clean = url.split("?")[0] ?? url;
  const extension = clean.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{2,5}$/.test(extension)) {
    return extension;
  }
  return fallbackType === "audio" ? "wav" : "png";
}

function sanitizePathSegment(value: string): string {
  return (value || "item").replace(/[^a-zA-Z0-9-_]/g, "_");
}

function buildVersionedFileName(baseName: string, remoteUrl: string, extension: string): string {
  return `${sanitizePathSegment(baseName)}-${hashString(remoteUrl)}.${extension}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function isLocalFileUri(value: string | undefined): boolean {
  return Boolean(value?.startsWith("file://"));
}
