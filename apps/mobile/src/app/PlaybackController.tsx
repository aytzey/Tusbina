import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Track } from "@/domain/models";
import { patchCoursePartPosition as patchCoursePartPositionApi, patchPodcastState } from "@/services/api";
import { useCoursesStore, useDownloadsStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
import { safeAudioPlayerAsyncCall, safeAudioPlayerCall } from "@/utils/audioPlayer";

const LOCK_SCREEN_OPTIONS = {
  showSeekBackward: true,
  showSeekForward: true
} as const;

type LockScreenMetadata = {
  albumTitle?: string;
  artist?: string;
  artworkUrl?: string;
  title?: string;
};

type LockScreenCompatiblePlayer = {
  clearLockScreenControls?: () => void;
  setActiveForLockScreen?: (
    active: boolean,
    metadata?: LockScreenMetadata,
    options?: typeof LOCK_SCREEN_OPTIONS
  ) => void;
};

function buildLockScreenMetadata(track: Track): LockScreenMetadata {
  return {
    title: track.title,
    artist: track.voice ? `${track.subtitle} • ${track.voice}` : track.subtitle,
    albumTitle: track.sourceType === "ai" ? "TUSBINA Podcast" : "TUSBINA Ders",
    artworkUrl: track.coverImageUrl
  };
}

function clearLockScreenControls(player: LockScreenCompatiblePlayer) {
  safeAudioPlayerCall(() => {
    if (typeof player.clearLockScreenControls === "function") {
      player.clearLockScreenControls();
      return;
    }

    if (typeof player.setActiveForLockScreen === "function") {
      player.setActiveForLockScreen(false);
    }
  });
}

function setLockScreenControls(player: LockScreenCompatiblePlayer, track: Track) {
  if (typeof player.setActiveForLockScreen !== "function") {
    return;
  }

  safeAudioPlayerCall(() => {
    player.setActiveForLockScreen?.(true, buildLockScreenMetadata(track), LOCK_SCREEN_OPTIONS);
  });
}

export function PlaybackController() {
  const track = usePlayerStore((state) => state.activeTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const pendingSeekSec = usePlayerStore((state) => state.pendingSeekSec);
  const rate = usePlayerStore((state) => state.rate);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const playNext = usePlayerStore((state) => state.playNext);
  const setPlaybackSnapshot = usePlayerStore((state) => state.setPlaybackSnapshot);
  const clearPendingSeek = usePlayerStore((state) => state.clearPendingSeek);

  const patchPodcastLocalState = usePodcastsStore((state) => state.patchPodcastLocalState);
  const replacePodcast = usePodcastsStore((state) => state.replacePodcast);
  const updateDownloadedPodcastProgress = useDownloadsStore((state) => state.updateDownloadedPodcastProgress);
  const patchCoursePartPositionLocal = useCoursesStore((state) => state.patchCoursePartPosition);
  const replaceCourse = useCoursesStore((state) => state.replaceCourse);

  const flushUsageConsumption = useUserStore((state) => state.flushUsageConsumption);

  const remoteAudioSource = track?.audioUrl ?? null;
  const hasRemoteAudio = Boolean(track?.audioUrl);
  const hasNext = queueIndex < queueLength - 1;
  const audioPlayer = useAudioPlayer(remoteAudioSource, {
    updateInterval: 250,
    downloadFirst: true,
    keepAudioSessionActive: true
  });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const previousTrackRef = useRef<Track | null>(null);
  const previousQueueRef = useRef(queue);
  const previousPositionRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const initialSeekTrackRef = useRef<string | null>(null);
  const finishedTrackRef = useRef<string | null>(null);
  const lastPersistMarkerRef = useRef<string | null>(null);

  const persistCurrentProgress = useCallback(
    async (trackOverride?: Track | null, positionOverride?: number, queueOverride: Track[] = queue) => {
      const trackToPersist = trackOverride ?? track;
      if (!trackToPersist) {
        return;
      }

      const rawPositionSec = positionOverride ?? positionSec;
      const currentSec = Math.max(0, Math.floor(rawPositionSec));
      const marker = `${trackToPersist.id}:${currentSec}`;
      if (lastPersistMarkerRef.current === marker) {
        return;
      }
      lastPersistMarkerRef.current = marker;

      if (trackToPersist.sourceType === "course" && trackToPersist.parentId) {
        patchCoursePartPositionLocal(trackToPersist.parentId, trackToPersist.id, currentSec);
        try {
          const updatedCourse = await patchCoursePartPositionApi(trackToPersist.parentId, trackToPersist.id, currentSec);
          replaceCourse(updatedCourse);
        } catch {
          // Keep local position if API sync fails; next load will reconcile.
        }
        return;
      }

      if (trackToPersist.sourceType === "ai" && trackToPersist.parentId) {
        const fallbackAbsoluteIndex = queueOverride.findIndex((item) => item.id === trackToPersist.id);
        const absoluteOffsetSec =
          trackToPersist.absoluteOffsetSec ??
          (fallbackAbsoluteIndex > 0
            ? queueOverride.slice(0, fallbackAbsoluteIndex).reduce((sum, item) => sum + item.durationSec, 0)
            : 0);
        const totalProgressSec = absoluteOffsetSec + currentSec;

        patchPodcastLocalState(trackToPersist.parentId, { progressSec: totalProgressSec });
        updateDownloadedPodcastProgress(trackToPersist.parentId, totalProgressSec);
        try {
          const updated = await patchPodcastState(trackToPersist.parentId, { progress_sec: totalProgressSec });
          replacePodcast(updated);
        } catch {
          // Keep local progress if API sync fails; next refresh will reconcile.
        }
      }
    },
    [
      patchCoursePartPositionLocal,
      patchPodcastLocalState,
      positionSec,
      queue,
      replaceCourse,
      replacePodcast,
      updateDownloadedPodcastProgress,
      track
    ]
  );

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false
    });
  }, []);

  useEffect(() => {
    if (!track || !hasRemoteAudio) {
      clearLockScreenControls(audioPlayer);
      return;
    }

    setLockScreenControls(audioPlayer, track);
  }, [audioPlayer, hasRemoteAudio, track]);

  useEffect(() => {
    previousPositionRef.current = positionSec;
  }, [positionSec]);

  useEffect(() => {
    const previousTrack = previousTrackRef.current;
    if (previousTrack && previousTrack.id !== track?.id) {
      void persistCurrentProgress(previousTrack, previousPositionRef.current, previousQueueRef.current);
      initialSeekTrackRef.current = null;
      finishedTrackRef.current = null;
    }
    previousTrackRef.current = track;
    previousQueueRef.current = queue;
  }, [persistCurrentProgress, queue, track]);

  useEffect(() => {
    if (!track) {
      setPlaybackSnapshot({
        durationSec: 0,
        isBuffering: false,
        isLoaded: false,
        isPlaying: false,
        positionSec: 0
      });
      return;
    }

    if (!hasRemoteAudio) {
      setPlaybackSnapshot({
        durationSec: track.durationSec,
        isBuffering: false,
        isLoaded: false,
        isPlaying: false
      });
      return;
    }

    setPlaybackSnapshot({
      durationSec: audioStatus.duration > 0 ? audioStatus.duration : track.durationSec,
      isBuffering: audioStatus.isBuffering,
      isLoaded: audioStatus.isLoaded,
      isPlaying: audioStatus.playing,
      positionSec: Number.isFinite(audioStatus.currentTime) ? audioStatus.currentTime : undefined
    });
  }, [
    audioStatus.currentTime,
    audioStatus.duration,
    audioStatus.isBuffering,
    audioStatus.isLoaded,
    audioStatus.playing,
    hasRemoteAudio,
    setPlaybackSnapshot,
    track
  ]);

  useEffect(() => {
    if (!hasRemoteAudio) {
      if (pendingSeekSec !== null) {
        clearPendingSeek();
      }
      return;
    }

    safeAudioPlayerCall(() => {
      audioPlayer.shouldCorrectPitch = true;
      audioPlayer.setPlaybackRate(rate, "high");
    });
  }, [audioPlayer, clearPendingSeek, hasRemoteAudio, pendingSeekSec, rate]);

  useEffect(() => {
    if (!hasRemoteAudio) {
      if (isPlaying) {
        pause();
      }
      return;
    }

    if (isPlaying === audioStatus.playing) {
      return;
    }

    if (isPlaying) {
      safeAudioPlayerCall(() => {
        audioPlayer.play();
      });
      return;
    }
    safeAudioPlayerCall(() => {
      audioPlayer.pause();
    });
  }, [audioPlayer, audioStatus.playing, hasRemoteAudio, isPlaying, pause]);

  useEffect(() => {
    if (!hasRemoteAudio || pendingSeekSec === null || !audioStatus.isLoaded) {
      return;
    }

    let cancelled = false;
    void safeAudioPlayerAsyncCall(() => audioPlayer.seekTo(pendingSeekSec))
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          clearPendingSeek();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioPlayer, audioStatus.isLoaded, clearPendingSeek, hasRemoteAudio, pendingSeekSec]);

  useEffect(() => {
    if (!track || !hasRemoteAudio || !audioStatus.isLoaded) {
      return;
    }
    if (initialSeekTrackRef.current === track.id) {
      return;
    }

    initialSeekTrackRef.current = track.id;
    if (positionSec > 0.5) {
      void safeAudioPlayerAsyncCall(() => audioPlayer.seekTo(positionSec));
    }
  }, [audioPlayer, audioStatus.isLoaded, hasRemoteAudio, positionSec, track]);

  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      void persistCurrentProgress();
      void flushUsageConsumption();
    }
    wasPlayingRef.current = isPlaying;
  }, [flushUsageConsumption, isPlaying, persistCurrentProgress]);

  useEffect(() => {
    if (!track || !hasRemoteAudio) {
      finishedTrackRef.current = null;
      return;
    }

    if (!audioStatus.didJustFinish) {
      finishedTrackRef.current = null;
      return;
    }

    if (finishedTrackRef.current === track.id) {
      return;
    }
    finishedTrackRef.current = track.id;

    const finalPositionSec = audioStatus.duration > 0 ? audioStatus.duration : track.durationSec;
    setPlaybackSnapshot({
      isPlaying: false,
      positionSec: finalPositionSec
    });
    void persistCurrentProgress(track, finalPositionSec);
    void flushUsageConsumption();

    if (hasNext) {
      playNext();
      play();
      return;
    }
    pause();
  }, [
    audioStatus.didJustFinish,
    audioStatus.duration,
    flushUsageConsumption,
    hasNext,
    hasRemoteAudio,
    pause,
    persistCurrentProgress,
    play,
    playNext,
    setPlaybackSnapshot,
    track
  ]);

  useEffect(() => {
    const currentState = { value: AppState.currentState };
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const wasActive = currentState.value === "active";
      currentState.value = nextState;

      if (wasActive && nextState !== "active") {
        void persistCurrentProgress();
        void flushUsageConsumption();
      }
    });

    return () => subscription.remove();
  }, [flushUsageConsumption, persistCurrentProgress]);

  return null;
}
