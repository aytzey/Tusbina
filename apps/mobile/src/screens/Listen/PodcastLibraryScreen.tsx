import { useMemo, useState } from "react";
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PodcastCover, ScreenContainer } from "@/components";
import { Podcast } from "@/domain/models";
import { RootStackParamList } from "@/navigation/types";
import { patchPodcastState } from "@/services/api";
import { useDownloadsStore, usePlayerStore, usePodcastsStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { buildPodcastQueue, formatDuration, resolvePodcastQueueStart } from "@/utils";
import { EmptyLibraryScreen } from "@/screens/States/EmptyLibraryScreen";

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ListenFilter = "all" | "ai" | "favorites" | "downloaded";

const FILTERS: { key: ListenFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "ai", label: "AI Üretilenler" },
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

  const [filter, setFilter] = useState<ListenFilter>("all");
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
      patchPodcastLocalState(podcast.id, { isDownloaded: false });
      try {
        const updated = await patchPodcastState(podcast.id, { is_downloaded: false });
        replacePodcast(updated);
      } catch {}
      return;
    }

    try {
      const downloadedPodcast = await downloadPodcast(podcast);
      patchPodcastLocalState(downloadedPodcast.id, { isDownloaded: true });
      replacePodcast(downloadedPodcast);
      const updated = await patchPodcastState(podcast.id, { is_downloaded: true });
      replacePodcast(updated);
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
      <ScreenContainer contentStyle={styles.container}>
        <EmptyLibraryScreen onCreate={() => navigation.navigate("MainTabs", { screen: "UploadTab" })} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentStyle={styles.container}>
      <Text style={styles.title}>Podcast Kütüphanesi</Text>

      <View style={styles.filtersRow}>
        {FILTERS.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
            onPress={() => setFilter(item.key)}
          >
            <Text style={[styles.filterLabel, filter === item.key && styles.filterLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {filteredPodcasts.length === 0 ? (
        <View style={styles.emptyFiltered}>
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

            return (
              <Pressable style={styles.card} onPress={() => handleOpenPodcast(item)}>
                <PodcastCover
                  uri={item.coverImageUrl}
                  title={item.title}
                  subtitle="AI Podcast"
                  voice={item.voice}
                  size={72}
                />

                <View style={styles.cardBody}>
                  <Text style={styles.badge}>AI Üretildi</Text>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>
                    {item.voice} • {formatDuration(item.totalDurationSec)}
                  </Text>
                  <Text style={styles.downloadMeta}>
                    {offlinePartsCount > 0
                      ? `${offlinePartsCount}/${item.parts.length} bölüm çevrimdışı hazır`
                      : "Çevrimdışı kopya yok"}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: progressWidth }]} />
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <Pressable onPress={() => void updateFavoriteState(item)}>
                    <Text style={styles.cardAction}>{item.isFavorite ? "★" : "☆"}</Text>
                  </Pressable>
                  <Pressable onPress={() => void toggleDownloadState(item)} disabled={isDownloading}>
                    <Text style={styles.cardAction}>
                      {isDownloading ? "İndiriliyor..." : item.isDownloaded ? "Kaldır" : "İndir"}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => void handleDeletePodcast(item)} disabled={deletingPodcastId === item.id}>
                    <Text style={styles.deleteAction}>
                      {deletingPodcastId === item.id ? "Siliniyor..." : "Sil"}
                    </Text>
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
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
    borderColor: colors.divider,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  filterChipActive: {
    borderColor: colors.motivationOrange,
    backgroundColor: "rgba(191,95,62,0.18)",
  },
  filterLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filterLabelActive: {
    color: colors.textPrimary,
  },
  emptyFiltered: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    backgroundColor: colors.surfaceNavy,
  },
  emptyFilteredText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  coverImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.primaryNavy,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  badge: {
    ...typography.caption,
    color: colors.premiumGold,
  },
  cardTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  downloadMeta: {
    ...typography.caption,
    color: colors.motivationOrange,
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    marginTop: spacing.xs,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
  },
  cardActions: {
    gap: spacing.xs,
    alignItems: "flex-end",
  },
  cardAction: {
    ...typography.caption,
    color: colors.motivationOrange,
    fontWeight: "700",
  },
  deleteAction: {
    ...typography.caption,
    color: "#DF4A4A",
    fontWeight: "700",
  },
});
