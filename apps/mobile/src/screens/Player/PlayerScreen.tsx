import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { FeedbackModal, PodcastCover, ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { prioritizePodcastPart, reorderPodcastParts, submitFeedback } from "@/services/api";
import { useDownloadsStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
import { colors, radius, shadows, spacing, typography } from "@/theme";
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
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
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
  const [modalVisible, setModalVisible] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
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
  const canWebReorderQueue = Platform.OS === "web" && Boolean(currentPodcast);
  const canNativeReorderQueue = Platform.OS !== "web" && Boolean(currentPodcast);
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
      .catch(() => {
        // Best-effort background prioritization. The queue still updates on polling.
      });
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
      setFeedbackToast("Bölüm öne alındı. Hazır olduğunda hemen dinleyebilirsin.");
      setTimeout(() => setFeedbackToast(null), 1800);
    } catch {
      setFeedbackToast("Bölüm sırası güncellenemedi.");
      setTimeout(() => setFeedbackToast(null), 1800);
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
    if (!canNativeReorderQueue) {
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
      setFeedbackToast("Bölüm sırası kaydedilemedi.");
      setTimeout(() => setFeedbackToast(null), 1800);
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

    if (!hasRemoteAudio) {
      if (track.sourceType === "ai" && track.parentId) {
        void prioritizeAiPart(track.id, track.parentId);
      }
      play();
      return;
    }

    play();
  };

  const onPrevious = () => playPrevious();

  const onNext = () => playNext();

  const onSeek = (seconds: number) => {
    const bounded = Math.min(Math.max(seconds, 0), actualDuration);
    seekTo(bounded);
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

  const handleToggleDownload = async () => {
    if (!currentPodcast) {
      return;
    }

    if (currentPodcast.isDownloaded && track.parentId === currentPodcast.id && track.localAudioUrl) {
      setFeedbackToast("Aktif çevrimdışı kaydı kaldırmak için önce başka bir içerik aç.");
      setTimeout(() => setFeedbackToast(null), 1800);
      return;
    }

    try {
      if (currentPodcast.isDownloaded) {
        await removePodcastDownload(currentPodcast.id);
        const updated = stripDownloadState(currentPodcast);
        replacePodcast(updated);
        syncPodcastQueue(updated);
        setFeedbackToast("Çevrimdışı kopya kaldırıldı.");
      } else {
        const downloadedPodcast = await downloadPodcast(currentPodcast);
        replacePodcast(downloadedPodcast);
        syncPodcastQueue(downloadedPodcast);
        setFeedbackToast("Podcast çevrimdışı dinleme için indirildi.");
      }
    } catch (error) {
      setFeedbackToast(error instanceof Error ? error.message : "İndirme durumu güncellenemedi.");
    }
    setTimeout(() => setFeedbackToast(null), 1800);
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* --- Cover Art --- */}
      <View style={styles.coverWrapper}>
        <View style={styles.coverGlow} />
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
        {track.sourceType === "ai" && (
          <View style={styles.aiBadge}>
            <Ionicons name="sparkles" size={12} color={colors.premiumGold} />
            <Text style={styles.aiBadgeText}>Üretildi</Text>
          </View>
        )}
      </View>

      {/* --- Track Info --- */}
      <Text style={styles.title}>{track.title}</Text>
      <Text style={styles.subtitle}>{track.subtitle}</Text>
      {track.sourceType === "ai" && track.voice ? (
        <Text style={styles.voiceInfo}>Seslendiren: {track.voice}</Text>
      ) : null}
      {currentTrackStatus ? <Text style={styles.trackStatus}>{currentTrackStatus}</Text> : null}
      {!track.audioUrl ? (
        <Text style={styles.mutedInfo}>
          {isPlaying
            ? "Bu bölüm hazırlanıyor. Hazır olur olmaz otomatik başlayacak."
            : "Bu bölüm hazır değil. İstersen oynat diyerek hazır olur olmaz otomatik başlatabilirsin."}
        </Text>
      ) : isAudioLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.motivationOrange} />
          <Text style={styles.mutedInfo}>Ses yükleniyor...</Text>
        </View>
      ) : null}

      {/* --- Seekbar --- */}
      <View style={styles.seekSection}>
        <ProgressBar
          progress={progress}
          buffering={isBuffering}
          onSeek={(pct) => onSeek((pct / 100) * actualDuration)}
        />
        <View style={styles.timerRow}>
          <Text style={styles.timer}>{formatTimer(Math.floor(positionSec))}</Text>
          {isBuffering ? (
            <Text style={styles.bufferingLabel}>Arabelleğe alınıyor...</Text>
          ) : (
            <Text style={styles.timer}>{formatDuration(actualDuration)}</Text>
          )}
        </View>
      </View>

      {/* --- Main Controls --- */}
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeChip, styles.modeChipActive]} onPress={cycleRate}>
          <Ionicons name="speedometer-outline" size={16} color={colors.motivationOrange} />
          <Text style={[styles.modeChipLabel, styles.modeChipLabelActive]}>Hız {rate}x</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, repeatMode !== "off" && styles.modeChipActive]}
          onPress={cycleRepeatMode}
        >
          <Ionicons
            name={repeatMode === "one" ? "repeat-outline" : "repeat"}
            size={16}
            color={repeatMode !== "off" ? colors.motivationOrange : colors.textSecondary}
          />
          <Text style={[styles.modeChipLabel, repeatMode !== "off" && styles.modeChipLabelActive]}>
            Tekrar {getRepeatModeLabel(repeatMode)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, shuffleEnabled && styles.modeChipActive]}
          onPress={toggleShuffle}
        >
          <Ionicons
            name="shuffle"
            size={16}
            color={shuffleEnabled ? colors.motivationOrange : colors.textSecondary}
          />
          <Text style={[styles.modeChipLabel, shuffleEnabled && styles.modeChipLabelActive]}>
            Karışık {shuffleEnabled ? "Açık" : "Kapalı"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.mainControls}>
        <Pressable
          style={[styles.navButton, !hasPrevious && styles.controlDisabled]}
          onPress={onPrevious}
          disabled={!hasPrevious}
          hitSlop={8}
        >
          <Ionicons name="play-skip-back" size={28} color={colors.textPrimary} />
        </Pressable>

        <Pressable
          style={[styles.playButton, !hasRemoteAudio && styles.playButtonQueued]}
          onPress={onTogglePlay}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={32} color={colors.textPrimary} />
          {isBuffering && isPlaying ? (
            <ActivityIndicator size={14} color={colors.motivationOrange} style={styles.playButtonSpinner} />
          ) : null}
        </Pressable>

        <Pressable
          style={[styles.navButton, !hasNext && styles.controlDisabled]}
          onPress={onNext}
          disabled={!hasNext}
          hitSlop={8}
        >
          <Ionicons name="play-skip-forward" size={28} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* --- Secondary Controls --- */}
      <View style={styles.secondaryControls}>
        <Pressable
          style={[styles.secondaryBtn, isCurrentBookmarked && styles.secondaryBtnActive]}
          onPress={onToggleBookmark}
        >
          <Ionicons
            name={isCurrentBookmarked ? "bookmark" : "bookmark-outline"}
            size={18}
            color={isCurrentBookmarked ? colors.motivationOrange : colors.textSecondary}
          />
          <Text style={[styles.secondaryBtnLabel, isCurrentBookmarked && styles.secondaryBtnLabelActive]}>
            Kayıt
          </Text>
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={() => void onShare()}>
          <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.secondaryBtnLabel}>Paylaş</Text>
        </Pressable>

        {track.sourceType === "ai" && currentPodcast ? (
          <Pressable
            style={[styles.secondaryBtn, currentPodcast.isDownloaded && styles.secondaryBtnActive]}
            onPress={() => void handleToggleDownload()}
            disabled={isCurrentPodcastDownloading}
          >
            <Ionicons
              name={currentPodcast.isDownloaded ? "download" : "download-outline"}
              size={18}
              color={currentPodcast.isDownloaded ? colors.motivationOrange : colors.textSecondary}
            />
            <Text style={styles.secondaryBtnLabel}>
              {isCurrentPodcastDownloading
                ? currentDownloadProgress
                  ? `${currentDownloadProgress.downloadedParts}/${currentDownloadProgress.totalParts}`
                  : "İndiriliyor"
                : currentPodcast.isDownloaded ? "İndirildi" : "İndir"}
            </Text>
          </Pressable>
        ) : null}

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
          <Text style={styles.queueHint}>
            {canWebReorderQueue
              ? "Sıralamayı sürükle-bırak ile değiştirebilirsin."
              : canNativeReorderQueue
                ? "Bir bölüme uzun bas, sonra hedef bölüme dokunarak sırayı değiştir."
                : "İstediğin bölüme dokunarak oynat."}
          </Text>
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
            const queueItemContent = (
              <>
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
                  <Text style={styles.queuePartLabel}>
                    Bölüm {index + 1}/{queue.length}
                  </Text>
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
                <View style={styles.queueRightCol}>
                  {currentPodcast ? (
                    Platform.OS === "web" ? (
                      <Ionicons name="reorder-three-outline" size={18} color={colors.textSecondary} />
                    ) : isPendingMove ? (
                      <Text style={styles.queueMoveLabel}>Seçildi</Text>
                    ) : pendingMovePartId ? (
                      <Text style={styles.queueMoveLabel}>Buraya bırak</Text>
                    ) : (
                      <Ionicons name="reorder-three-outline" size={18} color={colors.textSecondary} />
                    )
                  ) : null}
                  {isActive ? <Ionicons name="volume-high" size={16} color={colors.motivationOrange} /> : null}
                </View>
              </>
            );

            if (canWebReorderQueue && item.sourceType === "ai") {
              const webQueueStyle: CSSProperties = {
                ...(StyleSheet.flatten(styles.queueItem) as Record<string, unknown>),
                ...(isActive ? (StyleSheet.flatten(styles.queueItemActive) as Record<string, unknown>) : {}),
                ...(isPendingMove ? (StyleSheet.flatten(styles.queueItemMoving) as Record<string, unknown>) : {}),
                ...(isDropTarget ? (StyleSheet.flatten(styles.queueItemDropTarget) as Record<string, unknown>) : {}),
                cursor: draggedPartId === item.id ? "grabbing" : "grab",
                userSelect: "none",
              };

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  style={webQueueStyle}
                  draggable
                  onClick={() => handleSelectQueueItem(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectQueueItem(index);
                    }
                  }}
                  onDragStart={() => setDraggedPartId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedPartId || draggedPartId === item.id) {
                      return;
                    }
                    const draggedIndex = queue.findIndex((queueItem) => queueItem.id === draggedPartId);
                    if (draggedIndex < 0) {
                      return;
                    }
                    void handleReorderQueue(moveItem(queueIds, draggedIndex, index));
                    setDraggedPartId(null);
                  }}
                  onDragEnd={() => setDraggedPartId(null)}
                >
                  {queueItemContent}
                </div>
              );
            }

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
                {queueItemContent}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <FeedbackModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleFeedbackSubmit} />
    </ScreenContainer>
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const clone = [...items];
  const [item] = clone.splice(fromIndex, 1);
  clone.splice(toIndex, 0, item);
  return clone;
}

function getRepeatModeLabel(mode: "off" | "all" | "one"): string {
  if (mode === "all") {
    return "Tümü";
  }
  if (mode === "one") {
    return "Bu Bölüm";
  }
  return "Kapalı";
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
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
    marginBottom: spacing.lg,
  },
  coverGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.orangeTint,
    top: 30,
  },
  cover: {
    width: 260,
    height: 260,
    borderRadius: radius.xl,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.divider,
  },
  coverImage: {
    width: "100%",
    height: "100%",
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
    backgroundColor: colors.goldTint
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
  trackStatus: {
    ...typography.caption,
    color: colors.motivationOrange,
    textAlign: "center",
    fontWeight: "700"
  },
  mutedInfo: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },

  /* ---- Seekbar ---- */
  seekSection: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    gap: spacing.xs
  },
  timerRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  timer: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"] as const,
  },
  bufferingLabel: {
    ...typography.caption,
    color: colors.motivationOrange
  },

  /* ---- Main Controls ---- */
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  modeChipActive: {
    borderColor: "rgba(191,95,62,0.38)",
    backgroundColor: colors.orangeTint,
  },
  modeChipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    fontVariant: ["tabular-nums"] as const,
  },
  modeChipLabelActive: {
    color: colors.motivationOrange,
  },
  mainControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
    paddingVertical: spacing.md,
  },
  navButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow(colors.motivationOrange),
  },
  playButtonQueued: {
    opacity: 0.72
  },
  playButtonSpinner: {
    position: "absolute",
    bottom: 4,
    right: 4,
  },
  controlDisabled: {
    opacity: 0.35
  },

  /* ---- Secondary Controls ---- */
  secondaryControls: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 110,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.cardBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md
  },
  secondaryBtnActive: {
    borderColor: "rgba(191,95,62,0.38)",
    backgroundColor: colors.orangeTint,
  },
  secondaryBtnLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  secondaryBtnLabelActive: {
    color: colors.motivationOrange,
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
    height: 32,
    paddingHorizontal: spacing.md,
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
    backgroundColor: "rgba(46,158,87,0.14)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: "hidden"
  },

  /* ---- Queue ---- */
  queueSection: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs
  },
  queueTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  queueHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    borderLeftWidth: 3,
    borderLeftColor: "transparent"
  },
  queueItemActive: {
    borderLeftColor: colors.motivationOrange,
    backgroundColor: colors.cardBgElevated
  },
  queueItemMoving: {
    borderLeftColor: colors.premiumGold,
    borderWidth: 1,
    borderColor: "rgba(189,148,101,0.4)",
  },
  queueItemDropTarget: {
    borderColor: "rgba(191,95,62,0.24)",
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
  queuePartLabel: {
    ...typography.caption,
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"] as const,
  },
  queueMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  queueStatusLabel: {
    ...typography.caption,
    color: colors.textSecondary
  },
  queueStatusLabelActive: {
    color: colors.motivationOrange,
    fontWeight: "700"
  },
  queueRightCol: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  queueMoveLabel: {
    ...typography.caption,
    color: colors.motivationOrange,
    fontWeight: "700",
  }
});
