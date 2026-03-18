import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PodcastCover, ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { prioritizePodcastPart, reorderPodcastParts } from "@/services/api";
import { useDownloadsStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
import { FadeInView, PopView, StaggerView, colors, fw, radius, shadows, spacing, typography } from "@/theme";
import { formatDuration, formatTimer, getPodcastPartStatusLabel, stripDownloadState } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function PlayerScreen() {
  const navigation = useNavigation<Navigation>();
  const track = usePlayerStore((state) => state.activeTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const rate = usePlayerStore((state) => state.rate);
  const playbackDurationSec = usePlayerStore((state) => state.playbackDurationSec);
  const isPlaybackBuffering = usePlayerStore((state) => state.isBuffering);
  const isPlaybackLoaded = usePlayerStore((state) => state.isLoaded);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const playPrevious = usePlayerStore((state) => state.playPrevious);
  const playNext = usePlayerStore((state) => state.playNext);
  const selectQueueIndex = usePlayerStore((state) => state.selectQueueIndex);
  const syncPodcastQueue = usePlayerStore((state) => state.syncPodcastQueue);
  const seekTo = usePlayerStore((state) => state.seekTo);
  const cycleRate = usePlayerStore((state) => state.cycleRate);
  const shuffleEnabled = usePlayerStore((state) => state.shuffleEnabled);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const cycleRepeatMode = usePlayerStore((state) => state.cycleRepeatMode);
  const addBookmarkAtCurrent = usePlayerStore((state) => state.addBookmarkAtCurrent);
  const removeBookmark = usePlayerStore((state) => state.removeBookmark);
  const bookmarksByTrack = usePlayerStore((state) => state.bookmarksByTrack);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const podcasts = usePodcastsStore((state) => state.podcasts);
  const replacePodcast = usePodcastsStore((state) => state.replacePodcast);
  const downloadPodcast = useDownloadsStore((state) => state.downloadPodcast);
  const removePodcastDownload = useDownloadsStore((state) => state.removePodcastDownload);
  const downloadingIds = useDownloadsStore((state) => state.downloadingIds);
  const getDownloadedPodcast = useDownloadsStore((state) => state.getDownloadedPodcast);
  const getDownloadProgress = useDownloadsStore((state) => state.getDownloadProgress);

  const canPlay = useUserStore((state) => state.canPlay);
  const openLimitModal = useUserStore((state) => state.openLimitModal);

  const hasPrevious = queue.length > 1 && (shuffleEnabled || queueIndex > 0 || repeatMode === "all");
  const hasNext = queue.length > 1 && (shuffleEnabled || queueIndex < queue.length - 1 || repeatMode === "all");
  const bookmarks = track ? bookmarksByTrack[track.id] ?? [] : [];
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [pendingMovePartId, setPendingMovePartId] = useState<string | null>(null);
  const hasRemoteAudio = Boolean(track?.audioUrl);
  const isBuffering = hasRemoteAudio && isPlaybackBuffering;
  const isAudioLoading = hasRemoteAudio && !isPlaybackLoaded;
  const prioritizeMarkerRef = useRef<string | null>(null);
  const lookAheadPriorityRef = useRef(new Set<string>());
  const currentPodcast = useMemo(
    () =>
      track?.sourceType === "ai" && track.parentId
        ? podcasts.find((item) => item.id === track.parentId) ?? getDownloadedPodcast(track.parentId) ?? null
        : null,
    [getDownloadedPodcast, podcasts, track?.parentId, track?.sourceType]
  );
  const queueIds = useMemo(() => queue.map((item) => item.id), [queue]);
  const canReorderQueue = Boolean(currentPodcast);
  const isCurrentPodcastDownloading = currentPodcast ? downloadingIds.includes(currentPodcast.id) : false;
  const currentDownloadProgress = currentPodcast && isCurrentPodcastDownloading ? getDownloadProgress(currentPodcast.id) : null;
  const currentPartBadge = queue.length > 1 ? `Bölüm ${queueIndex + 1}/${queue.length}` : undefined;

  useEffect(() => {
    if (!currentPodcast) {
      return;
    }
    syncPodcastQueue(currentPodcast);
  }, [currentPodcast, syncPodcastQueue]);

  useEffect(() => {
    lookAheadPriorityRef.current.clear();
  }, [currentPodcast?.id]);

  useEffect(() => {
    setPendingMovePartId(null);
  }, [currentPodcast?.id]);

  useEffect(() => {
    if (!track || track.sourceType !== "ai" || !track.parentId || track.partStatus === "ready") {
      return;
    }

    const marker = `${track.parentId}:${track.id}:${track.partStatus}`;
    if (prioritizeMarkerRef.current === marker) {
      return;
    }
    prioritizeMarkerRef.current = marker;

    void prioritizePodcastPart(track.parentId, track.id)
      .then((updatedPodcast) => {
        replacePodcast(updatedPodcast);
        syncPodcastQueue(updatedPodcast);
      })
      .catch(() => {});
  }, [replacePodcast, syncPodcastQueue, track]);

  useEffect(() => {
    if (!currentPodcast) {
      return;
    }

    const nextPendingPart = queue
      .slice(queueIndex + 1)
      .find(
        (item) =>
          item.sourceType === "ai" &&
          item.parentId === currentPodcast.id &&
          !item.audioUrl &&
          item.partStatus !== "failed"
      );

    if (!nextPendingPart?.parentId) {
      return;
    }

    const marker = `${nextPendingPart.parentId}:${nextPendingPart.id}`;
    if (lookAheadPriorityRef.current.has(marker)) {
      return;
    }
    lookAheadPriorityRef.current.add(marker);

    void prioritizePodcastPart(nextPendingPart.parentId, nextPendingPart.id)
      .then((updatedPodcast) => {
        replacePodcast(updatedPodcast);
        syncPodcastQueue(updatedPodcast);
      })
      .catch(() => {
        lookAheadPriorityRef.current.delete(marker);
      });
  }, [currentPodcast, queue, queueIndex, replacePodcast, syncPodcastQueue]);

  /* ── Cover glow breathing when playing ── */
  const glowOpacity = useRef(new Animated.Value(0.5)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    glowAnimRef.current?.stop();
    if (isPlaying) {
      glowAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowOpacity, { toValue: 0.9, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(glowScale, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(glowOpacity, { toValue: 0.3, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(glowScale, { toValue: 0.92, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ]),
      );
      glowAnimRef.current.start();
    } else {
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 0.5, duration: 400, useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [isPlaying]);

  /* ── Play button spring ── */
  const playBtnScale = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: track?.sourceType === "ai" ? "Özel Podcast" : "Şimdi Dinleniyor",
    });
  }, [navigation, track?.sourceType]);

  if (!track) {
    return (
      <ScreenContainer contentStyle={styles.container}>
        <Text style={styles.empty}>Oynatılacak içerik seçilmedi.</Text>
      </ScreenContainer>
    );
  }

  const actualDuration = playbackDurationSec > 0 ? playbackDurationSec : track.durationSec;
  const progress = actualDuration > 0 ? (positionSec / actualDuration) * 100 : 0;
  const currentTrackStatus =
    track.sourceType === "ai"
      ? getPodcastPartStatusLabel(track.partStatus, {
          hasPlayableAudio: hasRemoteAudio,
          isActive: true,
          isPlaying,
        })
      : null;

  const showToast = (message: string, durationMs = 1800) => {
    setFeedbackToast(message);
    setTimeout(() => setFeedbackToast(null), durationMs);
  };

  const prioritizeAiPart = async (partId: string, podcastId: string) => {
    if (!podcastId) {
      return;
    }
    try {
      const updatedPodcast = await prioritizePodcastPart(podcastId, partId);
      replacePodcast(updatedPodcast);
      syncPodcastQueue(updatedPodcast);
      showToast("Bölüm öne alındı.");
    } catch {
      showToast("Bölüm sırası güncellenemedi.");
    }
  };

  const handleSelectQueueItem = (index: number) => {
    const selected = queue[index];
    if (!selected) {
      return;
    }

    if (pendingMovePartId && currentPodcast) {
      if (pendingMovePartId === selected.id) {
        setPendingMovePartId(null);
        showToast("Taşıma iptal edildi.");
        return;
      }

      const draggedIndex = queue.findIndex((queueItem) => queueItem.id === pendingMovePartId);
      if (draggedIndex >= 0 && draggedIndex !== index) {
        void handleReorderQueue(moveItem(queueIds, draggedIndex, index));
        setPendingMovePartId(null);
        showToast(`Bölüm ${index + 1}. sıraya taşındı.`);
        return;
      }
    }

    selectQueueIndex(index, 0);
    if (selected.sourceType === "ai" && !selected.audioUrl && selected.parentId) {
      void prioritizeAiPart(selected.id, selected.parentId);
    }
  };

  const handleQueueItemLongPress = (index: number) => {
    if (!canReorderQueue) {
      return;
    }

    const selected = queue[index];
    if (!selected) {
      return;
    }

    setPendingMovePartId((current) => {
      const nextValue = current === selected.id ? null : selected.id;
      showToast(
        nextValue
          ? `"${selected.title}" seçildi. Hedef bölüme dokunarak sırayı değiştir.`
          : "Taşıma modu kapatıldı."
      );
      return nextValue;
    });
  };

  const handleReorderQueue = async (nextIds: string[]) => {
    if (!currentPodcast) {
      return;
    }
    try {
      const updatedPodcast = await reorderPodcastParts(currentPodcast.id, { part_ids: nextIds });
      replacePodcast(updatedPodcast);
      syncPodcastQueue(updatedPodcast);
      setPendingMovePartId(null);
    } catch {
      showToast("Bölüm sırası kaydedilemedi.");
    }
  };

  const onTogglePlay = () => {
    if (isPlaying) {
      pause();
      return;
    }
    if (!canPlay()) {
      openLimitModal();
      return;
    }
    if (!hasRemoteAudio && track.sourceType === "ai" && track.parentId) {
      void prioritizeAiPart(track.id, track.parentId);
    }
    play();
  };

  const onSeek = (seconds: number) => {
    seekTo(Math.min(Math.max(seconds, 0), actualDuration));
  };

  const onToggleBookmark = () => {
    const second = Math.floor(positionSec);
    const existing = bookmarks.find((value) => Math.abs(value - second) <= 2);
    if (existing !== undefined) {
      removeBookmark(track.id, existing);
      showToast("Yer işareti kaldırıldı.", 1500);
      return;
    }
    const added = addBookmarkAtCurrent();
    if (added !== null) {
      showToast(`Yer işareti eklendi: ${formatTimer(added)}`, 1500);
    }
  };

  const handleToggleDownload = async () => {
    if (!currentPodcast) {
      return;
    }
    if (currentPodcast.isDownloaded && track.parentId === currentPodcast.id && track.localAudioUrl) {
      showToast("Aktif çevrimdışı kaydı kaldırmak için önce başka bir içerik aç.");
      return;
    }
    try {
      if (currentPodcast.isDownloaded) {
        await removePodcastDownload(currentPodcast.id);
        const updated = stripDownloadState(currentPodcast);
        replacePodcast(updated);
        syncPodcastQueue(updated);
        showToast("Çevrimdışı kopya kaldırıldı.");
      } else {
        const downloadedPodcast = await downloadPodcast(currentPodcast);
        replacePodcast(downloadedPodcast);
        syncPodcastQueue(downloadedPodcast);
        showToast("Podcast indirildi.");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "İndirme durumu güncellenemedi.");
    }
  };

  const isCurrentBookmarked = bookmarks.some((b) => Math.abs(b - Math.floor(positionSec)) <= 2);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* --- Cover Art --- */}
      <StaggerView index={0} style={styles.coverWrapper}>
        <Animated.View style={[styles.coverGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        <View style={styles.cover}>
          <PodcastCover
            uri={track.coverImageUrl}
            title={track.title}
            subtitle={track.subtitle}
            voice={track.voice}
            size={260}
            badgeText={currentPartBadge}
          />
        </View>
      </StaggerView>

      {/* --- Track Info --- */}
      <StaggerView index={1} style={styles.trackInfoGroup}>
        <Text style={styles.title} numberOfLines={2}>{track.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{track.subtitle}</Text>
        {currentTrackStatus ? <Text style={styles.trackStatus}>{currentTrackStatus}</Text> : null}
        {!track.audioUrl ? (
          <Text style={styles.mutedInfo}>
            {isPlaying
              ? "Bölüm hazırlanıyor. Hazır olunca otomatik başlayacak."
              : "Bölüm henüz hazır değil. Oynat dersen hazır olunca başlar."}
          </Text>
        ) : isAudioLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.motivationOrange} />
            <Text style={styles.mutedInfo}>Ses yükleniyor...</Text>
          </View>
        ) : null}
      </StaggerView>

      {/* --- Seekbar --- */}
      <StaggerView index={2} style={styles.seekSection}>
        <ProgressBar
          progress={progress}
          buffering={isBuffering}
          onSeek={(pct) => onSeek((pct / 100) * actualDuration)}
        />
        <View style={styles.timerRow}>
          <Text style={styles.timer}>{formatTimer(Math.floor(positionSec))}</Text>
          <View style={styles.timerCenter}>
            <Pressable style={styles.speedPill} onPress={cycleRate} hitSlop={8}>
              <PopView animKey={`rate-${rate}`}>
                <Text style={styles.speedLabel}>{rate}x</Text>
              </PopView>
            </Pressable>
            <Pressable style={styles.repeatButton} onPress={cycleRepeatMode} hitSlop={8}>
              <Ionicons
                name={repeatMode === "one" ? "repeat-outline" : "repeat"}
                size={18}
                color={repeatMode !== "off" ? colors.motivationOrange : colors.textTertiary}
              />
            </Pressable>
          </View>
          {isBuffering ? (
            <Text style={styles.bufferingLabel}>Arabellek...</Text>
          ) : (
            <Text style={styles.timer}>{formatDuration(actualDuration)}</Text>
          )}
        </View>
      </StaggerView>

      {/* --- Main Controls --- */}
      <StaggerView index={3} style={styles.mainControls}>
        <Pressable
          style={[styles.navButton, !hasPrevious && styles.controlDisabled]}
          onPress={() => playPrevious()}
          disabled={!hasPrevious}
          hitSlop={8}
        >
          <Ionicons name="play-skip-back" size={28} color={colors.textPrimary} />
        </Pressable>

        <Animated.View style={{ transform: [{ scale: playBtnScale }] }}>
          <Pressable
            style={[styles.playButton, !hasRemoteAudio && styles.playButtonQueued]}
            onPress={onTogglePlay}
            onPressIn={() => {
              Animated.spring(playBtnScale, { toValue: 0.9, useNativeDriver: true, speed: 50, bounciness: 2 }).start();
            }}
            onPressOut={() => {
              Animated.spring(playBtnScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
            }}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={32} color={colors.textPrimary} />
            {isBuffering && isPlaying ? (
              <ActivityIndicator size={14} color={colors.motivationOrange} style={styles.playButtonSpinner} />
            ) : null}
          </Pressable>
        </Animated.View>

        <Pressable
          style={[styles.navButton, !hasNext && styles.controlDisabled]}
          onPress={() => playNext()}
          disabled={!hasNext}
          hitSlop={8}
        >
          <Ionicons name="play-skip-forward" size={28} color={colors.textPrimary} />
        </Pressable>

      </StaggerView>

      {/* --- Actions --- */}
      <StaggerView index={4} style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, isCurrentBookmarked && styles.actionBtnActive]}
          onPress={onToggleBookmark}
        >
          <PopView animKey={`bm-${isCurrentBookmarked}`}>
            <Ionicons
              name={isCurrentBookmarked ? "bookmark" : "bookmark-outline"}
              size={18}
              color={isCurrentBookmarked ? colors.motivationOrange : colors.textSecondary}
            />
          </PopView>
          <Text style={[styles.actionBtnLabel, isCurrentBookmarked && styles.actionBtnLabelActive]}>
            Kayıt
          </Text>
        </Pressable>

        {track.sourceType === "ai" && currentPodcast ? (
          <Pressable
            style={[styles.actionBtn, currentPodcast.isDownloaded && styles.actionBtnActive]}
            onPress={() => void handleToggleDownload()}
            disabled={isCurrentPodcastDownloading}
          >
            <Ionicons
              name={currentPodcast.isDownloaded ? "download" : "download-outline"}
              size={18}
              color={currentPodcast.isDownloaded ? colors.motivationOrange : colors.textSecondary}
            />
            <Text style={styles.actionBtnLabel}>
              {isCurrentPodcastDownloading
                ? currentDownloadProgress
                  ? `${currentDownloadProgress.downloadedParts}/${currentDownloadProgress.totalParts}`
                  : "..."
                : currentPodcast.isDownloaded ? "İndirildi" : "İndir"}
            </Text>
          </Pressable>
        ) : null}

        {track.sourceType === "ai" && track.parentId ? (
          <Pressable
            style={styles.actionBtn}
            onPress={() => navigation.navigate("Quiz", { podcastId: track.parentId! })}
          >
            <Ionicons name="help-circle-outline" size={18} color={colors.motivationOrange} />
            <Text style={styles.actionBtnLabel}>Quiz</Text>
          </Pressable>
        ) : null}
      </StaggerView>

      {/* --- Bookmarks --- */}
      {bookmarks.length > 0 ? (
        <StaggerView index={5}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookmarksRow}>
            {bookmarks.map((bookmarkSec) => (
              <Pressable key={`${track.id}-${bookmarkSec}`} style={styles.bookmarkChip} onPress={() => onSeek(bookmarkSec)}>
                <Ionicons name="bookmark" size={12} color={colors.motivationOrange} />
                <Text style={styles.bookmarkLabel}>{formatTimer(bookmarkSec)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </StaggerView>
      ) : null}

      {/* --- Toast --- */}
      {feedbackToast ? (
        <FadeInView style={styles.toastContainer}>
          <Text style={styles.toast}>{feedbackToast}</Text>
        </FadeInView>
      ) : null}

      {/* --- Queue --- */}
      {queue.length > 1 ? (
        <StaggerView index={5} style={styles.queueSection}>
          <Text style={styles.queueTitle}>Bölümler</Text>
          {queue.map((item, index) => {
            const isActive = index === queueIndex;
            const isCompleted = index < queueIndex;
            const isPendingMove = pendingMovePartId === item.id;
            const isDropTarget = Boolean(pendingMovePartId) && pendingMovePartId !== item.id;
            const statusLabel =
              item.sourceType === "ai"
                ? getPodcastPartStatusLabel(item.partStatus, {
                    hasPlayableAudio: Boolean(item.audioUrl),
                    isActive,
                    isPlaying: isActive && isPlaying,
                  })
                : isCompleted
                  ? "Dinlendi"
                  : "Hazır";

            return (
              <Pressable
                key={item.id}
                style={[
                  styles.queueItem,
                  isActive && styles.queueItemActive,
                  isPendingMove && styles.queueItemMoving,
                  isDropTarget && styles.queueItemDropTarget,
                ]}
                onPress={() => handleSelectQueueItem(index)}
                onLongPress={() => handleQueueItemLongPress(index)}
                delayLongPress={180}
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
                  <View style={styles.queueMetaRow}>
                    <Text style={styles.queueItemDuration}>{formatDuration(item.durationSec)}</Text>
                    <Text style={[styles.queueStatusLabel, isActive && styles.queueStatusLabelActive]}>{statusLabel}</Text>
                  </View>
                </View>
                {isActive ? <Ionicons name="volume-high" size={16} color={colors.motivationOrange} /> : null}
              </Pressable>
            );
          })}
        </StaggerView>
      ) : null}
    </ScreenContainer>
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const clone = [...items];
  const [item] = clone.splice(fromIndex, 1);
  clone.splice(toIndex, 0, item);
  return clone;
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
    alignItems: "center",
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xxl,
    width: "100%",
  },

  /* ── Cover ── */
  coverWrapper: {
    alignItems: "center",
    marginBottom: spacing.md,
    width: "100%",
  },
  coverGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(212,105,60,0.10)",
    top: 24,
  },
  cover: {
    width: 260,
    height: 260,
    borderRadius: radius.xl,
    backgroundColor: colors.cardBgElevated,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  /* ── Track Info ── */
  trackInfoGroup: {
    gap: spacing.xs,
    width: "100%",
    alignItems: "center",
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  trackStatus: {
    ...typography.caption,
    color: colors.motivationOrange,
    textAlign: "center",
    ...fw.bold,
  },
  mutedInfo: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },

  /* ── Seekbar ── */
  seekSection: {
    width: "100%",
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  timerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  timer: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"] as const,
  },
  speedPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.orangeTint,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  speedLabel: {
    ...typography.caption,
    color: colors.motivationOrange,
    ...fw.extraBold,
    fontVariant: ["tabular-nums"] as const,
  },
  bufferingLabel: {
    ...typography.caption,
    color: colors.motivationOrange,
  },

  /* ── Main Controls ── */
  mainControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    paddingVertical: spacing.xl,
  },
  navButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow(colors.motivationOrange),
  },
  playButtonQueued: {
    opacity: 0.72,
  },
  playButtonSpinner: {
    position: "absolute",
    bottom: 4,
    right: 4,
  },
  controlDisabled: {
    opacity: 0.35,
  },
  repeatButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardBg,
  },

  /* ── Actions ── */
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  actionBtnActive: {
    backgroundColor: colors.orangeTint,
  },
  actionBtnLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    ...fw.bold,
  },
  actionBtnLabelActive: {
    color: colors.motivationOrange,
  },

  /* ── Bookmarks ── */
  bookmarksRow: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  bookmarkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.motivationOrange,
  },
  bookmarkLabel: {
    ...typography.caption,
    color: colors.motivationOrange,
  },

  /* ── Toast ── */
  toastContainer: {
    alignItems: "center",
    width: "100%",
    paddingVertical: spacing.xs,
  },
  toast: {
    ...typography.caption,
    color: colors.success,
    textAlign: "center",
    backgroundColor: "rgba(46,158,87,0.14)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: "hidden",
  },

  /* ── Queue ── */
  queueSection: {
    marginTop: spacing.xl,
    width: "100%",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  queueTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  queueItemActive: {
    backgroundColor: colors.orangeTint,
    borderColor: "rgba(232,130,74,0.2)",
  },
  queueItemMoving: {
    borderColor: "rgba(201,165,106,0.5)",
  },
  queueItemDropTarget: {
    borderColor: "rgba(191,95,62,0.24)",
  },
  queueIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceNavyLight,
    alignItems: "center",
    justifyContent: "center",
  },
  queueIndexText: {
    ...typography.small,
    color: colors.textTertiary,
    ...fw.semiBold,
    fontVariant: ["tabular-nums"] as const,
  },
  queueIndexTextActive: {
    color: colors.motivationOrange,
    ...fw.bold,
  },
  queueItemBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  queueItemTitle: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  queueItemTitleActive: {
    color: colors.motivationOrange,
    ...fw.semiBold,
  },
  queueItemDuration: {
    ...typography.small,
    color: colors.textTertiary,
    fontVariant: ["tabular-nums"] as const,
  },
  queueMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  queueStatusLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  queueStatusLabelActive: {
    color: colors.motivationOrange,
    ...fw.semiBold,
  },
});
