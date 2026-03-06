import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { usePlayerStore, useDownloadsStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { buildPodcastQueue, formatDuration, resolveTrackQueueStart } from "@/utils";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/types";
import { patchPodcastState } from "@/services/api";
import { usePodcastsStore } from "@/state/stores/podcastsStore";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function DownloadsScreen() {
  const navigation = useNavigation<Navigation>();
  const downloads = useDownloadsStore((state) => state.downloads);
  const removePodcastDownload = useDownloadsStore((state) => state.removePodcastDownload);
  const patchPodcastLocalState = usePodcastsStore((state) => state.patchPodcastLocalState);
  const replacePodcast = usePodcastsStore((state) => state.replacePodcast);
  const setQueue = usePlayerStore((state) => state.setQueue);

  const sortedDownloads = [...downloads].sort((a, b) =>
    (b.downloadedAt ?? "").localeCompare(a.downloadedAt ?? "")
  );

  const handlePlay = (podcastId: string) => {
    const podcast = downloads.find((item) => item.id === podcastId);
    if (!podcast) {
      return;
    }

    const offlineQueue = buildPodcastQueue(podcast).filter((track) => Boolean(track.localAudioUrl));
    if (offlineQueue.length === 0) {
      Alert.alert("Henüz hazır değil", "Bu podcast için çevrimdışı oynatılabilir bölüm bulunamadı.");
      return;
    }

    const { startIndex, startPositionSec } = resolveTrackQueueStart(offlineQueue, podcast.progressSec ?? 0);
    setQueue(offlineQueue, startIndex, startPositionSec);
    navigation.navigate("Player", { trackId: offlineQueue[startIndex]?.id, sourceType: "ai" });
  };

  const handleRemove = async (podcastId: string) => {
    await removePodcastDownload(podcastId);
    patchPodcastLocalState(podcastId, { isDownloaded: false });
    try {
      const updated = await patchPodcastState(podcastId, { is_downloaded: false });
      replacePodcast(updated);
    } catch {
      // Keep local removal even if remote state sync fails.
    }
  };

  if (sortedDownloads.length === 0) {
    return (
      <ScreenContainer contentStyle={styles.container}>
        <View style={styles.emptyCard}>
          <Ionicons name="download-outline" size={36} color={colors.motivationOrange} />
          <Text style={styles.emptyTitle}>Henüz indirilen içerik yok</Text>
          <Text style={styles.emptyText}>
            Kütüphanedeki bir podcasti indirerek internet olmadan dinleyebilirsin.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentStyle={styles.container}>
      <Text style={styles.title}>İndirilenler</Text>
      <Text style={styles.subtitle}>Çevrimdışı dinlemeye hazır podcastlerin burada tutulur.</Text>

      <FlatList
        data={sortedDownloads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const offlineParts = item.parts.filter((part) => Boolean(part.localAudioUrl)).length;
          const offlineDurationSec = item.parts.reduce(
            (total, part) => total + (part.localAudioUrl ? part.durationSec : 0),
            0
          );
          return (
            <View style={styles.card}>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>
                  {offlineParts}/{item.parts.length} bölüm çevrimdışı • {formatDuration(offlineDurationSec)}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <Pressable style={styles.actionButton} onPress={() => handlePlay(item.id)}>
                  <Ionicons name="play" size={18} color={colors.textPrimary} />
                </Pressable>
                <Pressable style={styles.removeButton} onPress={() => void handleRemove(item.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
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
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyCard: {
    marginTop: spacing.xxl,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
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
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#B74444",
    alignItems: "center",
    justifyContent: "center",
  },
});
