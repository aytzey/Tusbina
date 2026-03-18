import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PodcastCover, ScreenContainer } from "@/components";
import { Podcast } from "@/domain/models";
import { RootStackParamList } from "@/navigation/types";
import { patchPodcastState } from "@/services/api";
import { useCoursesStore, useDownloadsStore, usePlayerStore, usePodcastsStore } from "@/state/stores";
import { PopView, StaggerView, configureListAnimation, colors, fw, radius, spacing, typography } from "@/theme";
import { PrimaryButton } from "@/components";
import { buildPodcastQueue, formatDuration, resolvePodcastQueueStart, stripDownloadState } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ListenFilter = "all" | "ai" | "favorites" | "downloaded";

const FILTERS: { key: ListenFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "ai", label: "Üretilenler" },
  { key: "favorites", label: "Favoriler" },
  { key: "downloaded", label: "İndirilenler" },
];

export function PodcastLibraryScreen() {
  const navigation = useNavigation<Navigation>();
  const podcasts = usePodcastsStore((state) => state.podcasts);
  const patchPodcastLocalState = usePodcastsStore((state) => state.patchPodcastLocalState);
  const replacePodcast = usePodcastsStore((state) => state.replacePodcast);
  const deletePodcast = usePodcastsStore((state) => state.deletePodcast);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const downloadPodcast = useDownloadsStore((state) => state.downloadPodcast);
  const removePodcastDownload = useDownloadsStore((state) => state.removePodcastDownload);
  const downloadingIds = useDownloadsStore((state) => state.downloadingIds);
  const getOfflinePartsCount = useDownloadsStore((state) => state.getOfflinePartsCount);
  const getDownloadProgress = useDownloadsStore((state) => state.getDownloadProgress);

  const courses = useCoursesStore((state) => state.courses);

  const [filter, setFilter] = useState<ListenFilter>("all");

  const handleFilterChange = (key: ListenFilter) => {
    configureListAnimation();
    setFilter(key);
  };
  const [deletingPodcastId, setDeletingPodcastId] = useState<string | null>(null);

  const filteredPodcasts = useMemo(() => {
    if (filter === "all") {
      return podcasts;
    }
    if (filter === "ai") {
      return podcasts.filter((item) => item.sourceType === "ai");
    }
    if (filter === "favorites") {
      return podcasts.filter((item) => Boolean(item.isFavorite));
    }
    return podcasts.filter((item) => Boolean(item.isDownloaded));
  }, [filter, podcasts]);

  const updateFavoriteState = async (podcast: Podcast) => {
    const nextFavorite = !Boolean(podcast.isFavorite);
    patchPodcastLocalState(podcast.id, { isFavorite: nextFavorite });

    try {
      const updated = await patchPodcastState(podcast.id, { is_favorite: nextFavorite });
      replacePodcast(updated);
    } catch {
      patchPodcastLocalState(podcast.id, { isFavorite: podcast.isFavorite });
    }
  };

  const toggleDownloadState = async (podcast: Podcast) => {
    if (Boolean(podcast.isDownloaded)) {
      await removePodcastDownload(podcast.id);
      replacePodcast(stripDownloadState(podcast));
      return;
    }

    try {
      const downloadedPodcast = await downloadPodcast(podcast);
      patchPodcastLocalState(downloadedPodcast.id, { isDownloaded: true });
      replacePodcast(downloadedPodcast);
    } catch (error) {
      Alert.alert(
        "İndirme başarısız",
        error instanceof Error ? error.message : "Podcast çevrimdışı kaydedilemedi."
      );
    }
  };

  const confirmDelete = async (podcast: Podcast): Promise<boolean> => {
    const message = `"${podcast.title}" podcastini silmek istediğine emin misin? Bu işlem geri alınamaz.`;

    if (Platform.OS === "web") {
      const webConfirm = (globalThis as { confirm?: (value?: string) => boolean }).confirm;
      if (typeof webConfirm === "function") {
        return webConfirm(message);
      }
    }

    return new Promise((resolve) => {
      Alert.alert("Podcast silinsin mi?", message, [
        {
          text: "Vazgeç",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ]);
    });
  };

  const handleDeletePodcast = async (podcast: Podcast) => {
    if (deletingPodcastId) {
      return;
    }
    const approved = await confirmDelete(podcast);
    if (!approved) {
      return;
    }

    setDeletingPodcastId(podcast.id);
    const ok = await deletePodcast(podcast.id);
    setDeletingPodcastId(null);

    if (!ok) {
      Alert.alert("Silme başarısız", "Podcast silinemedi. Lütfen tekrar dene.");
    }
  };

  const handleOpenPodcast = (podcast: Podcast) => {
    if (podcast.parts.length === 0) {
      return;
    }

    const queue = buildPodcastQueue(podcast);
    const { startIndex, startPositionSec } = resolvePodcastQueueStart(podcast);
    setQueue(queue, startIndex, startPositionSec);
    navigation.navigate("Player", { trackId: queue[startIndex].id, sourceType: "ai" });
  };

  if (podcasts.length === 0) {
    return (
      <ScreenContainer contentStyle={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="musical-notes" size={36} color={colors.motivationOrange} />
        </View>
        <Text style={styles.emptyTitle}>Henüz podcast oluşturmadın</Text>
        <Text style={styles.emptyDesc}>PDF yükleyip birkaç dakikada dinlenebilir içerik üretebilirsin.</Text>
        <PrimaryButton label="PDF Yükle" onPress={() => navigation.navigate("MainTabs", { screen: "UploadTab" })} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentStyle={styles.container}>
      <StaggerView index={0}>
        <Text style={styles.title}>Podcast Kütüphanesi</Text>
      </StaggerView>

      <StaggerView index={1} style={styles.filtersRow}>
        {FILTERS.map((item) => (
          <Pressable
            key={item.key}
            style={({ pressed }) => [styles.filterChip, filter === item.key && styles.filterChipActive, pressed && styles.filterChipPressed]}
            onPress={() => handleFilterChange(item.key)}
          >
            <Text style={[styles.filterLabel, filter === item.key && styles.filterLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </StaggerView>

      {filteredPodcasts.length === 0 ? (
        <View style={styles.emptyFiltered}>
          <Ionicons name="musical-notes-outline" size={32} color={colors.textTertiary} />
          <Text style={styles.emptyFilteredText}>Bu filtre için içerik bulunamadı.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPodcasts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const progressPct = item.totalDurationSec > 0 ? ((item.progressSec ?? 0) / item.totalDurationSec) * 100 : 0;
            const progressWidth = `${Math.min(100, Math.max(0, progressPct))}%` as `${number}%`;
            const offlinePartsCount = getOfflinePartsCount(item.id);
            const isDownloading = downloadingIds.includes(item.id);
            const dlProgress = isDownloading ? getDownloadProgress(item.id) : null;

            return (
              <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => handleOpenPodcast(item)}>
                <PodcastCover
                  uri={item.coverImageUrl}
                  title={item.title}
                  subtitle="Podcast"
                  voice={item.voice}
                  size={80}
                />

                <View style={styles.cardBody}>
                  <Text style={styles.badge}>
                    {item.courseId
                      ? courses.find((c) => c.id === item.courseId)?.title ?? "Üretildi"
                      : "Üretildi"}
                  </Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.cardMeta}>
                    {item.voice} · {item.parts.length} bölüm · {formatDuration(item.totalDurationSec)}
                  </Text>
                  {isDownloading && dlProgress ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round((dlProgress.downloadedParts / Math.max(1, dlProgress.totalParts)) * 100)}%` as `${number}%`, backgroundColor: colors.premiumGold }]} />
                    </View>
                  ) : progressPct > 0 ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: progressWidth }]} />
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardActions}>
                  <Pressable style={styles.actionBtn} onPress={() => void updateFavoriteState(item)} hitSlop={8}>
                    <PopView animKey={`fav-${item.id}-${item.isFavorite}`}>
                      <Ionicons
                        name={item.isFavorite ? "heart" : "heart-outline"}
                        size={20}
                        color={item.isFavorite ? colors.motivationOrange : colors.textSecondary}
                      />
                    </PopView>
                  </Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => void toggleDownloadState(item)} disabled={isDownloading} hitSlop={8}>
                    {isDownloading ? (
                      <ActivityIndicator size={16} color={colors.motivationOrange} />
                    ) : (
                      <Ionicons
                        name={item.isDownloaded ? "cloud-done" : "cloud-download-outline"}
                        size={20}
                        color={item.isDownloaded ? colors.success : colors.textSecondary}
                      />
                    )}
                  </Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => void handleDeletePodcast(item)} disabled={deletingPodcastId === item.id} hitSlop={8}>
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={deletingPodcastId === item.id ? colors.textTertiary : colors.danger}
                    />
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.h2Small,
    color: colors.textPrimary,
  },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.motivationOrange,
  },
  filterLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    ...fw.semiBold,
  },
  filterLabelActive: {
    color: colors.textPrimary,
  },
  emptyFiltered: {
    marginTop: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyFilteredText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  badge: {
    ...typography.small,
    color: colors.premiumGold,
    ...fw.semiBold,
  },
  cardTitle: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    ...fw.semiBold,
  },
  cardMeta: {
    ...typography.small,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
    borderRadius: radius.pill,
  },
  cardActions: {
    gap: spacing.xs,
    alignItems: "center",
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipPressed: {
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.orangeTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.h2Small,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
