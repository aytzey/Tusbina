import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Track } from "@/domain/models";
import { patchCoursePartPosition as patchCoursePartPositionApi, patchPodcastState } from "@/services/api";
import { useCoursesStore, useDownloadsStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
import {
  safeAudioPlayerAsyncCall,
  safeAudioPlayerCall,
  shouldAdvanceQueueOnDidJustFinish,
  shouldIgnoreFinishSoonAfterResume,
  shouldResetPlaybackFromStaleEnd,
} from "@/utils/audioPlayer";

const LOCK_SCREEN_OPTIONS = {
  showSeekBackward: true,
  showSeekForward: true
} as const;
const PLAYER_DEBUG_ENABLED = process.env.EXPO_PUBLIC_ENABLE_PLAYER_DEBUG === "true";

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
  const startedTrackRef = useRef<string | null>(null);
  const deferredPauseRef = useRef(false);
  const resumeIssuedAtRef = useRef<number | null>(null);
  const resumePositionRef = useRef(0);
  const lastHeartbeatPersistRef = useRef<string | null>(null);

  const logPlayerDebug = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      if (!PLAYER_DEBUG_ENABLED) {
        return;
      }
      const payload = {
        trackId: track?.id ?? null,
        trackTitle: track?.title ?? null,
        queueIndex,
        isPlaying,
        statusPlaying: audioStatus.playing,
        didJustFinish: audioStatus.didJustFinish,
        currentTime: audioStatus.currentTime,
        duration: audioStatus.duration,
        positionSec,
        startedTrackId: startedTrackRef.current,
        ...extra,
      };
      console.log("[player-debug]", event, payload);
      const debugStore = globalThis as typeof globalThis & {
        __playerDebugEvents?: { event: string; payload: Record<string, unknown> }[];
      };
      debugStore.__playerDebugEvents = [...(debugStore.__playerDebugEvents ?? []), { event, payload }];
    },
    [
      audioStatus.currentTime,
      audioStatus.didJustFinish,
      audioStatus.duration,
      audioStatus.playing,
      isPlaying,
      positionSec,
      queueIndex,
      track,
    ]
  );

  useEffect(() => {
    if (!PLAYER_DEBUG_ENABLED) {
      return;
    }

    const debugStore = globalThis as typeof globalThis & {
      __playerDebugState?: Record<string, unknown>;
    };

    debugStore.__playerDebugState = {
      trackId: track?.id ?? null,
      queueIndex,
      intendedIsPlaying: isPlaying,
      intendedPositionSec: positionSec,
      pendingSeekSec,
      playbackRate: rate,
      hasRemoteAudio,
      startedTrackId: startedTrackRef.current,
      resumeIssuedAtMs: resumeIssuedAtRef.current,
      resumePositionSec: resumePositionRef.current,
      status: {
        currentTime: audioStatus.currentTime,
        didJustFinish: audioStatus.didJustFinish,
        duration: audioStatus.duration,
        isBuffering: audioStatus.isBuffering,
        isLoaded: audioStatus.isLoaded,
        playing: audioStatus.playing,
      },
    };
  }, [
    audioStatus.currentTime,
    audioStatus.didJustFinish,
    audioStatus.duration,
    audioStatus.isBuffering,
    audioStatus.isLoaded,
    audioStatus.playing,
    hasRemoteAudio,
    isPlaying,
    pendingSeekSec,
    positionSec,
    queueIndex,
    rate,
    track?.id,
  ]);

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
      logPlayerDebug("track-change", {
        fromTrackId: previousTrack.id,
        toTrackId: track?.id ?? null,
      });
      void persistCurrentProgress(previousTrack, previousPositionRef.current, previousQueueRef.current);
      initialSeekTrackRef.current = null;
      finishedTrackRef.current = null;
      deferredPauseRef.current = false;
      startedTrackRef.current = null;
      resumeIssuedAtRef.current = null;
    }
    previousTrackRef.current = track;
    previousQueueRef.current = queue;
  }, [logPlayerDebug, persistCurrentProgress, queue, track]);

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
    if (!track || !hasRemoteAudio) {
      deferredPauseRef.current = false;
      startedTrackRef.current = null;
      return;
    }

    const currentTime = Number.isFinite(audioStatus.currentTime) ? audioStatus.currentTime : 0;
    const withinTrackBounds = currentTime > 0.25 && currentTime < Math.max(track.durationSec - 0.25, 0.25);
    if (audioStatus.playing || withinTrackBounds || positionSec > 0.25) {
      startedTrackRef.current = track.id;
      if (audioStatus.playing) {
        resumeIssuedAtRef.current = null;
      }
    }
  }, [audioStatus.currentTime, audioStatus.playing, hasRemoteAudio, positionSec, track]);

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
      return;
    }

    if (isPlaying === audioStatus.playing) {
      return;
    }

    if (isPlaying) {
      deferredPauseRef.current = false;
      void safeAudioPlayerAsyncCall(async () => {
        resumeIssuedAtRef.current = Date.now();
        resumePositionRef.current = positionSec;
        logPlayerDebug("issue-play", {
          intendedPositionSec: positionSec,
          statusCurrentTimeSec: audioStatus.currentTime,
        });
        const durationSec = audioStatus.duration > 0 ? audioStatus.duration : track?.durationSec ?? 0;
        if (
          shouldResetPlaybackFromStaleEnd({
            durationSec,
            currentTimeSec: audioStatus.currentTime,
            intendedPositionSec: positionSec,
          })
        ) {
          await audioPlayer.seekTo(positionSec);
          finishedTrackRef.current = null;
          logPlayerDebug("resume-from-stale-end", {
            intendedPositionSec: positionSec,
          });
        }
        audioPlayer.play();
      });
      return;
    }

    if (resumeIssuedAtRef.current !== null && !audioStatus.playing) {
      deferredPauseRef.current = true;
      logPlayerDebug("defer-pause-until-play-start", {
        intendedPositionSec: positionSec,
        statusCurrentTimeSec: audioStatus.currentTime,
      });
      return;
    }

    deferredPauseRef.current = false;
    logPlayerDebug("issue-pause", {
      intendedPositionSec: positionSec,
      statusCurrentTimeSec: audioStatus.currentTime,
    });
    safeAudioPlayerCall(() => {
      audioPlayer.pause();
    });
  }, [
    audioPlayer,
    audioStatus.currentTime,
    audioStatus.duration,
    audioStatus.playing,
    hasRemoteAudio,
    isPlaying,
    logPlayerDebug,
    positionSec,
    track?.durationSec,
  ]);

  useEffect(() => {
    if (!hasRemoteAudio || pendingSeekSec === null || !audioStatus.isLoaded) {
      return;
    }

    logPlayerDebug("issue-seek", {
      pendingSeekSec,
      statusCurrentTimeSec: audioStatus.currentTime,
    });
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
  }, [audioPlayer, audioStatus.currentTime, audioStatus.isLoaded, clearPendingSeek, hasRemoteAudio, logPlayerDebug, pendingSeekSec]);

  useEffect(() => {
    if (!track || !hasRemoteAudio || !audioStatus.isLoaded) {
      return;
    }
    if (initialSeekTrackRef.current === track.id) {
      return;
    }

    initialSeekTrackRef.current = track.id;
    if (positionSec > 0.5) {
      logPlayerDebug("issue-initial-seek", {
        intendedPositionSec: positionSec,
        statusCurrentTimeSec: audioStatus.currentTime,
      });
      void safeAudioPlayerAsyncCall(() => audioPlayer.seekTo(positionSec));
    }
  }, [audioPlayer, audioStatus.currentTime, audioStatus.isLoaded, hasRemoteAudio, logPlayerDebug, positionSec, track]);

  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      void persistCurrentProgress();
      void flushUsageConsumption();
    }
    wasPlayingRef.current = isPlaying;
  }, [flushUsageConsumption, isPlaying, persistCurrentProgress]);

  useEffect(() => {
    if (!track || !hasRemoteAudio || !audioStatus.playing) {
      return;
    }

    const wholeSecond = Math.max(0, Math.floor(positionSec));
    if (wholeSecond <= 0 || wholeSecond % 15 !== 0) {
      return;
    }

    const marker = `${track.id}:${wholeSecond}`;
    if (lastHeartbeatPersistRef.current === marker) {
      return;
    }
    lastHeartbeatPersistRef.current = marker;

    void persistCurrentProgress(track, wholeSecond);
  }, [audioStatus.playing, hasRemoteAudio, persistCurrentProgress, positionSec, track]);

  useEffect(() => {
    if (!track || !hasRemoteAudio) {
      finishedTrackRef.current = null;
      return;
    }

    const didTrackActuallyFinish = shouldAdvanceQueueOnDidJustFinish({
      didJustFinish: audioStatus.didJustFinish,
      durationSec: audioStatus.duration > 0 ? audioStatus.duration : track.durationSec,
      currentTimeSec: audioStatus.currentTime,
      lastKnownPositionSec: Math.max(positionSec, previousPositionRef.current),
      startedForTrack: startedTrackRef.current === track.id,
    });
    const shouldIgnoreFastFinish = shouldIgnoreFinishSoonAfterResume({
      durationSec: audioStatus.duration > 0 ? audioStatus.duration : track.durationSec,
      resumePositionSec: resumePositionRef.current,
      elapsedSinceResumeMs:
        resumeIssuedAtRef.current === null ? Number.POSITIVE_INFINITY : Date.now() - resumeIssuedAtRef.current,
    });

    if (audioStatus.didJustFinish) {
      logPlayerDebug("did-just-finish-signal", {
        didTrackActuallyFinish,
        shouldIgnoreFastFinish,
        lastKnownPositionSec: Math.max(positionSec, previousPositionRef.current),
      });
    }

    if (audioStatus.didJustFinish && shouldIgnoreFastFinish) {
      void safeAudioPlayerAsyncCall(async () => {
        await audioPlayer.seekTo(resumePositionRef.current);
        audioPlayer.play();
      });
      finishedTrackRef.current = null;
      logPlayerDebug("ignored-fast-finish-after-resume", {
        resumePositionSec: resumePositionRef.current,
      });
      return;
    }

    if (!didTrackActuallyFinish) {
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
      logPlayerDebug("advance-next-after-finish");
      playNext();
      play();
      return;
    }
    logPlayerDebug("pause-after-finish");
    pause();
  }, [
    audioStatus.didJustFinish,
    audioStatus.duration,
    audioStatus.currentTime,
    audioPlayer,
    flushUsageConsumption,
    hasNext,
    hasRemoteAudio,
    logPlayerDebug,
    pause,
    positionSec,
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
