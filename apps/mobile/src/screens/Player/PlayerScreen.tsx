import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { FeedbackModal, ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { patchCoursePartPosition as patchCoursePartPositionApi, patchPodcastState, submitFeedback } from "@/services/api";
import { useCoursesStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { formatDuration, formatTimer } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function PlayerScreen() {
  const navigation = useNavigation<Navigation>();
  const track = usePlayerStore((state) => state.activeTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const rate = usePlayerStore((state) => state.rate);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const playPrevious = usePlayerStore((state) => state.playPrevious);
  const playNext = usePlayerStore((state) => state.playNext);
  const seekTo = usePlayerStore((state) => state.seekTo);
  const setPosition = usePlayerStore((state) => state.setPosition);
  const cycleRate = usePlayerStore((state) => state.cycleRate);
  const addBookmarkAtCurrent = usePlayerStore((state) => state.addBookmarkAtCurrent);
  const removeBookmark = usePlayerStore((state) => state.removeBookmark);
  const bookmarksByTrack = usePlayerStore((state) => state.bookmarksByTrack);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);

  const patchPodcastLocalState = usePodcastsStore((state) => state.patchPodcastLocalState);
  const replacePodcast = usePodcastsStore((state) => state.replacePodcast);
  const patchCoursePartPositionLocal = useCoursesStore((state) => state.patchCoursePartPosition);
  const replaceCourse = useCoursesStore((state) => state.replaceCourse);

  const canPlay = useUserStore((state) => state.canPlay);
  const openLimitModal = useUserStore((state) => state.openLimitModal);
  const flushUsageConsumption = useUserStore((state) => state.flushUsageConsumption);

  const hasPrevious = queueIndex > 0;
  const hasNext = queueIndex < queue.length - 1;
  const bookmarks = track ? bookmarksByTrack[track.id] ?? [] : [];
  const [modalVisible, setModalVisible] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const beforeSec = queue.slice(0, queueIndex).reduce((sum, item) => sum + item.durationSec, 0);
  const totalProgressSec = Math.floor(beforeSec + positionSec);
  const remoteAudioSource = track?.audioUrl ?? null;
  const hasRemoteAudio = Boolean(track?.audioUrl);
  const audioPlayer = useAudioPlayer(remoteAudioSource, {
    updateInterval: 250,
    downloadFirst: true
  });
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  const persistCurrentProgress = useCallback(async () => {
    if (!track) {
      return;
    }

    const currentSec = Math.floor(positionSec);
    if (track.sourceType === "course" && track.parentId) {
      patchCoursePartPositionLocal(track.parentId, track.id, currentSec);
      try {
        const updatedCourse = await patchCoursePartPositionApi(track.parentId, track.id, currentSec);
        replaceCourse(updatedCourse);
      } catch {
        // Keep local position if API sync fails; next load will reconcile.
      }
      return;
    }

    if (track.sourceType === "ai" && track.parentId) {
      patchPodcastLocalState(track.parentId, { progressSec: totalProgressSec });

      try {
        const updated = await patchPodcastState(track.parentId, { progress_sec: totalProgressSec });
        replacePodcast(updated);
      } catch {
        // Keep local progress if API sync fails; next refresh will reconcile.
      }
    }
  }, [patchCoursePartPositionLocal, patchPodcastLocalState, positionSec, replaceCourse, replacePodcast, totalProgressSec, track]);

  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      void persistCurrentProgress();
      void flushUsageConsumption();
    }
    wasPlayingRef.current = isPlaying;
  }, [flushUsageConsumption, isPlaying, persistCurrentProgress]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: "duckOthers",
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false
    });
  }, []);

  useEffect(() => {
    if (!hasRemoteAudio) {
      return;
    }

    audioPlayer.setPlaybackRate(rate);
  }, [audioPlayer, hasRemoteAudio, rate]);

  useEffect(() => {
    if (!hasRemoteAudio) {
      return;
    }

    if (isPlaying) {
      audioPlayer.play();
      return;
    }
    audioPlayer.pause();
  }, [audioPlayer, hasRemoteAudio, isPlaying]);

  useEffect(() => {
    if (!hasRemoteAudio || !audioStatus.isLoaded || !Number.isFinite(audioStatus.currentTime)) {
      return;
    }
    setPosition(audioStatus.currentTime);
  }, [audioStatus.currentTime, audioStatus.isLoaded, hasRemoteAudio, setPosition]);

  const initialSeekTrackRef = useRef<string | null>(null);
  useEffect(() => {
    if (!track || !hasRemoteAudio || !audioStatus.isLoaded) {
      return;
    }
    if (initialSeekTrackRef.current === track.id) {
      return;
    }

    initialSeekTrackRef.current = track.id;
    if (positionSec > 0.5) {
      void audioPlayer.seekTo(positionSec);
    }
  }, [audioPlayer, audioStatus.isLoaded, hasRemoteAudio, positionSec, track]);

  const autoAdvancedRef = useRef<string | null>(null);
  useEffect(() => {
    if (hasRemoteAudio || !track || !hasNext || positionSec < track.durationSec) {
      autoAdvancedRef.current = null;
      return;
    }

    const marker = `${track.id}:${Math.floor(positionSec)}`;
    if (autoAdvancedRef.current === marker) {
      return;
    }
    autoAdvancedRef.current = marker;

    void persistCurrentProgress();
    playNext();
    play();
  }, [hasNext, hasRemoteAudio, persistCurrentProgress, play, playNext, positionSec, track]);

  const audioFinishedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!track || !hasRemoteAudio) {
      audioFinishedRef.current = null;
      return;
    }

    if (!audioStatus.didJustFinish) {
      audioFinishedRef.current = null;
      return;
    }

    if (audioFinishedRef.current === track.id) {
      return;
    }
    audioFinishedRef.current = track.id;

    void persistCurrentProgress();
    if (hasNext) {
      playNext();
      play();
      return;
    }
    pause();
  }, [audioStatus.didJustFinish, hasNext, hasRemoteAudio, pause, persistCurrentProgress, play, playNext, track]);

  if (!track) {
    return (
      <ScreenContainer contentStyle={styles.container}>
        <Text style={styles.empty}>Oynatılacak içerik seçilmedi.</Text>
      </ScreenContainer>
    );
  }

  const progress = track.durationSec > 0 ? (positionSec / track.durationSec) * 100 : 0;

  const onTogglePlay = () => {
    if (isPlaying) {
      pause();
      return;
    }

    if (!canPlay()) {
      openLimitModal();
      return;
    }

    play();
  };

  const onPrevious = () => {
    void persistCurrentProgress();
    playPrevious();
  };

  const onNext = () => {
    void persistCurrentProgress();
    playNext();
  };

  const onSeek = (seconds: number) => {
    const bounded = Math.min(Math.max(seconds, 0), track.durationSec);
    seekTo(bounded);
    if (hasRemoteAudio) {
      void audioPlayer.seekTo(bounded);
    }
  };

  const onToggleBookmark = () => {
    const second = Math.floor(positionSec);
    const existing = bookmarks.find((value) => Math.abs(value - second) <= 2);
    if (existing !== undefined) {
      removeBookmark(track.id, existing);
      setFeedbackToast("Yer işareti kaldırıldı.");
      setTimeout(() => setFeedbackToast(null), 1500);
      return;
    }

    const added = addBookmarkAtCurrent();
    if (added !== null) {
      setFeedbackToast(`Yer işareti eklendi: ${formatTimer(added)}`);
      setTimeout(() => setFeedbackToast(null), 1500);
    }
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: `${track.title} - ${track.subtitle}\nKonum: ${formatTimer(Math.floor(positionSec))}`
      });
    } catch {
      setFeedbackToast("Paylaşım açılamadı.");
      setTimeout(() => setFeedbackToast(null), 1500);
    }
  };

  const handleFeedbackSubmit = async (payload: { rating: number; tags: string[]; text: string }) => {
    await submitFeedback({
      rating: payload.rating,
      tags: payload.tags,
      text: payload.text,
      content_id: track.id
    });
    setFeedbackToast("Teşekkürler, geri bildirimin alındı.");
    setTimeout(() => setFeedbackToast(null), 2000);
  };

  const isCurrentBookmarked = bookmarks.some((b) => Math.abs(b - Math.floor(positionSec)) <= 2);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* --- Cover Art --- */}
      <View style={styles.coverWrapper}>
        <View style={styles.cover}>
          <View style={styles.iconGlow}>
            <Ionicons name="headset" size={64} color={colors.motivationOrange} />
          </View>
        </View>
        {track.sourceType === "ai" && (
          <View style={styles.aiBadge}>
            <Ionicons name="sparkles" size={12} color={colors.premiumGold} />
            <Text style={styles.aiBadgeText}>AI Üretildi</Text>
          </View>
        )}
      </View>

      {/* --- Track Info --- */}
      <Text style={styles.title}>{track.title}</Text>
      <Text style={styles.subtitle}>{track.subtitle}</Text>
      {track.sourceType === "ai" && track.voice ? (
        <Text style={styles.voiceInfo}>Seslendiren: {track.voice}</Text>
      ) : null}
      {track.sourceType === "ai" && !track.audioUrl ? (
        <Text style={styles.mutedInfo}>Ses dosyası henüz hazır değil.</Text>
      ) : null}

      {/* --- Seekbar --- */}
      <View style={styles.seekSection}>
        <ProgressBar progress={progress} />
        <View style={styles.timerRow}>
          <Text style={styles.timer}>{formatTimer(Math.floor(positionSec))}</Text>
          <Text style={styles.timer}>{formatDuration(track.durationSec)}</Text>
        </View>
      </View>

      {/* --- Main Controls --- */}
      <View style={styles.mainControls}>
        <Pressable onPress={cycleRate} hitSlop={8}>
          <Ionicons name="shuffle" size={24} color={colors.textSecondary} />
        </Pressable>

        <Pressable
          style={[styles.navButton, !hasPrevious && styles.controlDisabled]}
          onPress={onPrevious}
          disabled={!hasPrevious}
          hitSlop={8}
        >
          <Ionicons name="play-skip-back" size={28} color={colors.textPrimary} />
        </Pressable>

        <Pressable style={styles.playButton} onPress={onTogglePlay}>
          <Ionicons name={isPlaying ? "pause" : "play"} size={32} color={colors.textPrimary} />
        </Pressable>

        <Pressable
          style={[styles.navButton, !hasNext && styles.controlDisabled]}
          onPress={onNext}
          disabled={!hasNext}
          hitSlop={8}
        >
          <Ionicons name="play-skip-forward" size={28} color={colors.textPrimary} />
        </Pressable>

        <Pressable hitSlop={8}>
          <Ionicons name="repeat" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* --- Secondary Controls --- */}
      <View style={styles.secondaryControls}>
        <Pressable style={styles.secondaryBtn} onPress={cycleRate}>
          <Text style={styles.rateLabel}>{rate}x</Text>
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={onToggleBookmark}>
          <Ionicons
            name={isCurrentBookmarked ? "bookmark" : "bookmark-outline"}
            size={22}
            color={isCurrentBookmarked ? colors.motivationOrange : colors.textSecondary}
          />
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={() => void onShare()}>
          <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
        </Pressable>

        {track.sourceType === "ai" ? (
          <Pressable style={styles.secondaryBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="star-outline" size={18} color={colors.premiumGold} />
            <Text style={styles.secondaryBtnLabel}>Değerlendir</Text>
          </Pressable>
        ) : null}

        {track.sourceType === "ai" && track.parentId ? (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate("Quiz", { podcastId: track.parentId! })}
          >
            <Ionicons name="help-circle-outline" size={18} color={colors.motivationOrange} />
            <Text style={styles.secondaryBtnLabel}>Quiz</Text>
          </Pressable>
        ) : null}
      </View>

      {/* --- Bookmarks --- */}
      {bookmarks.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookmarksRow}>
          {bookmarks.map((bookmarkSec) => (
            <Pressable key={`${track.id}-${bookmarkSec}`} style={styles.bookmarkChip} onPress={() => onSeek(bookmarkSec)}>
              <Ionicons name="bookmark" size={12} color={colors.motivationOrange} />
              <Text style={styles.bookmarkLabel}>{formatTimer(bookmarkSec)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* --- Toast --- */}
      {feedbackToast ? (
        <View style={styles.toastContainer}>
          <Text style={styles.toast}>{feedbackToast}</Text>
        </View>
      ) : null}

      {/* --- Queue / Bolumler --- */}
      {queue.length > 1 ? (
        <View style={styles.queueSection}>
          <Text style={styles.queueTitle}>Bölümler</Text>
          {queue.map((item, index) => {
            const isActive = index === queueIndex;
            const isCompleted = index < queueIndex;

            return (
              <Pressable
                key={item.id}
                style={[styles.queueItem, isActive && styles.queueItemActive]}
                onPress={() => {
                  if (index !== queueIndex) {
                    void persistCurrentProgress();
                    if (index < queueIndex) {
                      for (let i = 0; i < queueIndex - index; i++) {
                        playPrevious();
                      }
                    } else {
                      for (let i = 0; i < index - queueIndex; i++) {
                        playNext();
                      }
                    }
                  }
                }}
              >
                <View style={styles.queueIndex}>
                  {isCompleted ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  ) : (
                    <Text style={[styles.queueIndexText, isActive && styles.queueIndexTextActive]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <View style={styles.queueItemBody}>
                  <Text
                    style={[styles.queueItemTitle, isActive && styles.queueItemTitleActive]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.queueItemDuration}>{formatDuration(item.durationSec)}</Text>
                </View>
                {isActive && (
                  <Ionicons name="volume-high" size={16} color={colors.motivationOrange} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <FeedbackModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleFeedbackSubmit} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xxl
  },

  /* ---- Cover ---- */
  coverWrapper: {
    alignItems: "center",
    marginBottom: spacing.md
  },
  cover: {
    width: 240,
    height: 240,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceNavy,
    alignItems: "center",
    justifyContent: "center"
  },
  iconGlow: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(191,95,62,0.15)",
    alignItems: "center",
    justifyContent: "center"
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: "rgba(189,148,101,0.15)"
  },
  aiBadgeText: {
    ...typography.caption,
    color: colors.premiumGold
  },

  /* ---- Track Info ---- */
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
    paddingHorizontal: spacing.lg
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg
  },
  voiceInfo: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center"
  },
  mutedInfo: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center"
  },

  /* ---- Seekbar ---- */
  seekSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.xs
  },
  timerRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  timer: {
    ...typography.caption,
    color: colors.textSecondary
  },

  /* ---- Main Controls ---- */
  mainControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    paddingVertical: spacing.md
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center"
  },
  controlDisabled: {
    opacity: 0.35
  },

  /* ---- Secondary Controls ---- */
  secondaryControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xs
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  rateLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  secondaryBtnLabel: {
    ...typography.caption,
    color: colors.premiumGold
  },

  /* ---- Bookmarks ---- */
  bookmarksRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs
  },
  bookmarkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.motivationOrange
  },
  bookmarkLabel: {
    ...typography.caption,
    color: colors.motivationOrange
  },

  /* ---- Toast ---- */
  toastContainer: {
    alignItems: "center",
    paddingVertical: spacing.xs
  },
  toast: {
    ...typography.caption,
    color: colors.success,
    textAlign: "center",
    backgroundColor: "rgba(46,158,87,0.12)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: "hidden"
  },

  /* ---- Queue ---- */
  queueSection: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs
  },
  queueTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceNavy,
    borderLeftWidth: 3,
    borderLeftColor: "transparent"
  },
  queueItemActive: {
    borderLeftColor: colors.motivationOrange,
    backgroundColor: "rgba(191,95,62,0.08)"
  },
  queueIndex: {
    width: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  queueIndexText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  queueIndexTextActive: {
    color: colors.motivationOrange,
    fontWeight: "700"
  },
  queueItemBody: {
    flex: 1,
    gap: 2
  },
  queueItemTitle: {
    ...typography.caption,
    color: colors.textPrimary
  },
  queueItemTitleActive: {
    color: colors.motivationOrange,
    fontWeight: "700"
  },
  queueItemDuration: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary
  }
});
