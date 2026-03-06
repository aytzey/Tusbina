import { podcastsRepository } from "@/data/repositories";
import { Podcast } from "@/domain/models";
import { create } from "zustand";

interface PodcastsState {
  podcasts: Podcast[];
  loading: boolean;
  error: string | null;
  loadPodcasts: () => Promise<void>;
  refreshPodcast: (podcastId: string) => Promise<Podcast | null>;
  deletePodcast: (podcastId: string) => Promise<boolean>;
  addPodcast: (podcast: Podcast) => void;
  replacePodcast: (podcast: Podcast) => void;
  patchPodcastLocalState: (
    podcastId: string,
    patch: Partial<Pick<Podcast, "isFavorite" | "isDownloaded" | "progressSec">>
  ) => void;
}

export const usePodcastsStore = create<PodcastsState>((set, get) => ({
  podcasts: [],
  loading: false,
  error: null,
  loadPodcasts: async () => {
    set({ loading: true, error: null });
    try {
      const podcasts = await podcastsRepository.listPodcasts();
      set({ podcasts, loading: false });
    } catch {
      set({ error: "Podcastlar yüklenemedi.", loading: false });
    }
  },
  refreshPodcast: async (podcastId) => {
    try {
      const podcast = await podcastsRepository.getPodcastById(podcastId);
      if (!podcast) {
        return null;
      }
      get().replacePodcast(podcast);
      return podcast;
    } catch {
      set({ error: "Podcast güncellenemedi." });
      return null;
    }
  },
  deletePodcast: async (podcastId) => {
    const snapshot = get().podcasts;
    set((state) => ({
      podcasts: state.podcasts.filter((item) => item.id !== podcastId),
      error: null
    }));

    try {
      await podcastsRepository.deletePodcastById(podcastId);
      return true;
    } catch {
      set({ podcasts: snapshot, error: "Podcast silinemedi." });
      return false;
    }
  },
  addPodcast: (podcast) =>
    set((state) => ({
      podcasts: [podcast, ...state.podcasts]
    })),
  replacePodcast: (podcast) =>
    set((state) => ({
      podcasts: state.podcasts.some((item) => item.id === podcast.id)
        ? state.podcasts.map((item) => (item.id === podcast.id ? podcast : item))
        : [podcast, ...state.podcasts]
    })),
  patchPodcastLocalState: (podcastId, patch) =>
    set((state) => ({
      podcasts: state.podcasts.map((item) => (item.id === podcastId ? { ...item, ...patch } : item))
    }))
}));
