import { podcastsRepository } from "@/data/repositories";
import { Podcast } from "@/domain/models";
import { create } from "zustand";

interface PodcastsState {
  podcasts: Podcast[];
  loading: boolean;
  error: string | null;
  loadPodcasts: () => Promise<void>;
  addPodcast: (podcast: Podcast) => void;
  replacePodcast: (podcast: Podcast) => void;
  patchPodcastLocalState: (
    podcastId: string,
    patch: Partial<Pick<Podcast, "isFavorite" | "isDownloaded" | "progressSec">>
  ) => void;
}

export const usePodcastsStore = create<PodcastsState>((set) => ({
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
  addPodcast: (podcast) =>
    set((state) => ({
      podcasts: [podcast, ...state.podcasts]
    })),
  replacePodcast: (podcast) =>
    set((state) => ({
      podcasts: state.podcasts.map((item) => (item.id === podcast.id ? podcast : item))
    })),
  patchPodcastLocalState: (podcastId, patch) =>
    set((state) => ({
      podcasts: state.podcasts.map((item) => (item.id === podcastId ? { ...item, ...patch } : item))
    }))
}));
