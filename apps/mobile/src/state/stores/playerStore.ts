import { create } from "zustand";
import { Track } from "@/domain/models";

interface PlayerState {
  queue: Track[];
  queueIndex: number;
  bookmarksByTrack: Record<string, number[]>;
  activeTrack: Track | null;
  isPlaying: boolean;
  positionSec: number;
  rate: 1 | 1.25 | 1.5 | 2;
  setTrack: (track: Track, startPositionSec?: number) => void;
  setQueue: (tracks: Track[], startIndex?: number, startPositionSec?: number) => void;
  play: () => void;
  pause: () => void;
  playPrevious: () => void;
  playNext: () => void;
  addBookmarkAtCurrent: () => number | null;
  removeBookmark: (trackId: string, second: number) => void;
  seekTo: (seconds: number) => void;
  setPosition: (seconds: number) => void;
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

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  queueIndex: 0,
  bookmarksByTrack: {},
  activeTrack: null,
  isPlaying: false,
  positionSec: 0,
  rate: 1,
  setTrack: (track, startPositionSec) =>
    set({
      queue: [track],
      queueIndex: 0,
      activeTrack: track,
      isPlaying: false,
      positionSec: defaultStartPosition(track, startPositionSec)
    }),
  setQueue: (tracks, startIndex = 0, startPositionSec) => {
    if (tracks.length === 0) {
      set({
        queue: [],
        queueIndex: 0,
        activeTrack: null,
        isPlaying: false,
        positionSec: 0
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
      positionSec: defaultStartPosition(track, startPositionSec)
    });
  },
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
        positionSec: defaultStartPosition(track)
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
        positionSec: defaultStartPosition(track)
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
      positionSec: clampPosition(state.activeTrack, seconds)
    })),
  setPosition: (seconds) =>
    set((state) => ({
      positionSec: clampPosition(state.activeTrack, seconds)
    })),
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
  stop: () => set({ isPlaying: false, positionSec: 0 })
}));
