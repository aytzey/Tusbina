import { create } from "zustand";
import type { Podcast, Track } from "@/domain/models";

interface PlaybackSnapshot {
  durationSec?: number;
  isBuffering?: boolean;
  isLoaded?: boolean;
  isPlaying?: boolean;
  positionSec?: number;
}

interface PlayerState {
  queue: Track[];
  queueIndex: number;
  bookmarksByTrack: Record<string, number[]>;
  activeTrack: Track | null;
  isPlaying: boolean;
  isPlaybackActive: boolean;
  positionSec: number;
  pendingSeekSec: number | null;
  playbackDurationSec: number;
  isBuffering: boolean;
  isLoaded: boolean;
  rate: 1 | 1.25 | 1.5 | 2;
  setTrack: (track: Track, startPositionSec?: number) => void;
  setQueue: (tracks: Track[], startIndex?: number, startPositionSec?: number) => void;
  selectQueueIndex: (index: number, startPositionSec?: number) => void;
  syncPodcastQueue: (podcast: Podcast) => void;
  play: () => void;
  pause: () => void;
  playPrevious: () => void;
  playNext: () => void;
  addBookmarkAtCurrent: () => number | null;
  removeBookmark: (trackId: string, second: number) => void;
  seekTo: (seconds: number) => void;
  setPosition: (seconds: number) => void;
  setPlaybackSnapshot: (snapshot: PlaybackSnapshot) => void;
  clearPendingSeek: () => void;
  tick: () => void;
  cycleRate: () => void;
  stop: () => void;
}

const RATES: PlayerState["rate"][] = [1, 1.25, 1.5, 2];

function clampPosition(track: Track | null, positionSec: number): number {
  if (!track) {
    return 0;
  }
  return Math.min(Math.max(positionSec, 0), track.durationSec);
}

function defaultStartPosition(track: Track, startPositionSec?: number): number {
  return clampPosition(track, startPositionSec ?? track.resumePositionSec ?? 0);
}

function buildPodcastQueueForPlayer(podcast: Podcast): Track[] {
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
      coverImageUrl: podcast.coverImageUrl,
    };
    absoluteOffsetSec += part.durationSec;
    return track;
  });
}

function playbackStateForTrack(track: Track | null, startPositionSec = 0) {
  return {
    positionSec: clampPosition(track, startPositionSec),
    pendingSeekSec: null,
    playbackDurationSec: track?.durationSec ?? 0,
    isPlaybackActive: false,
    isBuffering: false,
    isLoaded: false,
  };
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  queueIndex: 0,
  bookmarksByTrack: {},
  activeTrack: null,
  isPlaying: false,
  isPlaybackActive: false,
  positionSec: 0,
  pendingSeekSec: null,
  playbackDurationSec: 0,
  isBuffering: false,
  isLoaded: false,
  rate: 1,
  setTrack: (track, startPositionSec) =>
    set({
      queue: [track],
      queueIndex: 0,
      activeTrack: track,
      isPlaying: false,
      ...playbackStateForTrack(track, defaultStartPosition(track, startPositionSec))
    }),
  setQueue: (tracks, startIndex = 0, startPositionSec) => {
    if (tracks.length === 0) {
      set({
        queue: [],
        queueIndex: 0,
        activeTrack: null,
        isPlaying: false,
        ...playbackStateForTrack(null)
      });
      return;
    }

    const safeIndex = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    const track = tracks[safeIndex];
    set({
      queue: tracks,
      queueIndex: safeIndex,
      activeTrack: track,
      isPlaying: false,
      ...playbackStateForTrack(track, defaultStartPosition(track, startPositionSec))
    });
  },
  selectQueueIndex: (index, startPositionSec) =>
    set((state) => {
      if (index < 0 || index >= state.queue.length) {
        return state;
      }
      const track = state.queue[index];
      return {
        queueIndex: index,
        activeTrack: track,
        isPlaying: state.isPlaying,
        ...playbackStateForTrack(track, defaultStartPosition(track, startPositionSec))
      };
    }),
  syncPodcastQueue: (podcast) =>
    set((state) => {
      const queueTargetsPodcast = state.queue.some((item) => item.sourceType === "ai" && item.parentId === podcast.id);
      if (!queueTargetsPodcast) {
        return state;
      }

      const nextQueue = buildPodcastQueueForPlayer(podcast);
      const activeTrackId =
        state.activeTrack?.sourceType === "ai" && state.activeTrack.parentId === podcast.id
          ? state.activeTrack.id
          : nextQueue[state.queueIndex]?.id;
      const resolvedQueueIndex = activeTrackId ? nextQueue.findIndex((item) => item.id === activeTrackId) : -1;
      const nextQueueIndex = resolvedQueueIndex >= 0 ? resolvedQueueIndex : 0;
      const nextActiveTrack = nextQueue[nextQueueIndex] ?? null;
      const fallbackPositionSec = nextActiveTrack ? defaultStartPosition(nextActiveTrack) : 0;
      const positionSec = clampPosition(
        nextActiveTrack,
        nextActiveTrack?.id === state.activeTrack?.id ? state.positionSec : fallbackPositionSec
      );
      const pendingSeekSec =
        state.pendingSeekSec === null ? null : clampPosition(nextActiveTrack, state.pendingSeekSec);

      return {
        queue: nextQueue,
        queueIndex: nextQueueIndex,
        activeTrack: nextActiveTrack,
        positionSec,
        pendingSeekSec,
        playbackDurationSec:
          nextActiveTrack && nextActiveTrack.id === state.activeTrack?.id
            ? nextActiveTrack.durationSec
            : nextActiveTrack?.durationSec ?? state.playbackDurationSec
      };
    }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  playPrevious: () =>
    set((state) => {
      if (state.queueIndex <= 0) {
        return state;
      }

      const nextIndex = state.queueIndex - 1;
      const track = state.queue[nextIndex];
      return {
        queueIndex: nextIndex,
        activeTrack: track,
        isPlaying: state.isPlaying,
        ...playbackStateForTrack(track, defaultStartPosition(track))
      };
    }),
  playNext: () =>
    set((state) => {
      if (state.queueIndex >= state.queue.length - 1) {
        return state;
      }

      const nextIndex = state.queueIndex + 1;
      const track = state.queue[nextIndex];
      return {
        queueIndex: nextIndex,
        activeTrack: track,
        isPlaying: state.isPlaying,
        ...playbackStateForTrack(track, defaultStartPosition(track))
      };
    }),
  addBookmarkAtCurrent: () => {
    const { activeTrack, positionSec } = get();
    if (!activeTrack) {
      return null;
    }

    const second = Math.floor(clampPosition(activeTrack, positionSec));
    set((state) => {
      const current = state.bookmarksByTrack[activeTrack.id] ?? [];
      const exists = current.some((value) => Math.abs(value - second) <= 2);
      if (exists) {
        return state;
      }

      return {
        bookmarksByTrack: {
          ...state.bookmarksByTrack,
          [activeTrack.id]: [...current, second].sort((a, b) => a - b)
        }
      };
    });
    return second;
  },
  removeBookmark: (trackId, second) =>
    set((state) => {
      const current = state.bookmarksByTrack[trackId] ?? [];
      const filtered = current.filter((value) => value !== second);
      return {
        bookmarksByTrack: {
          ...state.bookmarksByTrack,
          [trackId]: filtered
        }
      };
    }),
  seekTo: (seconds) =>
    set((state) => ({
      positionSec: clampPosition(state.activeTrack, seconds),
      pendingSeekSec: clampPosition(state.activeTrack, seconds)
    })),
  setPosition: (seconds) =>
    set((state) => ({
      positionSec: clampPosition(state.activeTrack, seconds)
    })),
  setPlaybackSnapshot: (snapshot) =>
    set((state) => {
      const nextPosition =
        snapshot.positionSec === undefined
          ? state.positionSec
          : clampPosition(state.activeTrack, snapshot.positionSec);
      const durationSec = snapshot.durationSec;
      return {
        positionSec: nextPosition,
        playbackDurationSec:
          durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0
            ? durationSec
            : state.playbackDurationSec,
        isPlaybackActive: snapshot.isPlaying ?? state.isPlaybackActive,
        isBuffering: snapshot.isBuffering ?? state.isBuffering,
        isLoaded: snapshot.isLoaded ?? state.isLoaded
      };
    }),
  clearPendingSeek: () => set({ pendingSeekSec: null }),
  tick: () => {
    const { isPlaying, activeTrack, positionSec, rate } = get();
    if (!isPlaying || !activeTrack) {
      return;
    }

    const nextPosition = positionSec + rate;
    if (nextPosition >= activeTrack.durationSec) {
      set({ positionSec: activeTrack.durationSec, isPlaying: false });
      return;
    }

    set({ positionSec: nextPosition });
  },
  cycleRate: () => {
    const currentIndex = RATES.indexOf(get().rate);
    const nextIndex = currentIndex === RATES.length - 1 ? 0 : currentIndex + 1;
    set({ rate: RATES[nextIndex] });
  },
  stop: () =>
    set({
      isPlaying: false,
      ...playbackStateForTrack(get().activeTrack, 0)
    })
}));
