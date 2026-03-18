import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { usePodcastsStore } from "@/state/stores";
import { colors, fw, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type ProcessingStatus = "ready" | "processing" | "failed" | "queued";

function resolveProcessingStatus(
  podcast: ReturnType<typeof usePodcastsStore.getState>["podcasts"][number]
): {
  accentColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  meta: string;
  status: ProcessingStatus;
} {
  const totalParts = podcast.parts.length;
  const readyCount = podcast.parts.filter((part) => part.status === "ready").length;
  const failedCount = podcast.parts.filter((part) => part.status === "failed").length;
  const processingCount = podcast.parts.filter((part) => part.status === "processing").length;

  if (failedCount > 0) {
    return {
      accentColor: colors.danger,
      icon: "alert-circle-outline",
      label: "Hata var",
      meta: `${failedCount} bölüm tekrar üretim istiyor`,
      status: "failed",
    };
  }

  if (readyCount === totalParts && totalParts > 0) {
    return {
      accentColor: colors.success,
      icon: "checkmark-circle",
      label: "Tamamlandı",
      meta: `${totalParts} bölüm dinlemeye hazır`,
      status: "ready",
    };
  }

  if (processingCount > 0 || readyCount > 0) {
    return {
      accentColor: colors.motivationOrange,
      icon: "sync-outline",
      label: "İşleniyor",
      meta: `${readyCount}/${totalParts} bölüm hazır`,
      status: "processing",
    };
  }

  return {
    accentColor: colors.premiumGold,
    icon: "time-outline",
    label: "Sırada",
    meta: `${totalParts} bölüm kuyruğa alındı`,
    status: "queued",
  };
}

export function NotificationsScreen() {
  const navigation = useNavigation<Navigation>();
  const podcasts = usePodcastsStore((state) => state.podcasts);

  const recentPodcasts = podcasts.slice(0, 6);
  const hasItems = recentPodcasts.length > 0;

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <View style={styles.introCard}>
        <View style={styles.introIcon}>
          <Ionicons name="sync-outline" size={22} color={colors.motivationOrange} />
        </View>
        <View style={styles.introBody}>
          <Text style={styles.introTitle}>Burası bildirim merkezi değil</Text>
          <Text style={styles.introText}>
            Yüklediğin içeriklerin planlanma, ses üretimi ve hazır olma durumunu burada takip edebilirsin.
          </Text>
        </View>
      </View>

      {hasItems ? (
        <View style={styles.list}>
          {recentPodcasts.map((podcast) => {
            const status = resolveProcessingStatus(podcast);
            return (
              <Pressable
                key={podcast.id}
                style={styles.card}
                onPress={() => navigation.navigate("MainTabs", { screen: "ListenTab" })}
              >
                <View style={[styles.iconCircle, { backgroundColor: `${status.accentColor}22` }]}>
                  <Ionicons name={status.icon} size={20} color={status.accentColor} />
                </View>
                <View style={styles.body}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {podcast.title}
                    </Text>
                    <View style={[styles.statusPill, { borderColor: `${status.accentColor}55` }]}>
                      <Text style={[styles.statusPillText, { color: status.accentColor }]}>{status.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{status.meta}</Text>
                  <Text style={styles.cardHint}>
                    {status.status === "ready"
                      ? "Dinlemek için kütüphaneye geç"
                      : status.status === "failed"
                        ? "Sorunlu bölüm için tekrar üretim gerekebilir"
                        : "Hazır olan bölümler dinleme ekranında anında açılır"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="cloud-upload-outline" size={48} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Henüz aktif işlem yok</Text>
          <Text style={styles.emptyText}>
            Bir PDF yüklediğinde bölüm planı, üretim sırası ve tamamlanan içerikler bu ekranda görünecek.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  introCard: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.orangeTint,
    alignItems: "center",
    justifyContent: "center",
  },
  introBody: {
    flex: 1,
    gap: 4,
  },
  introTitle: {
    ...typography.body,
    color: colors.textPrimary,
    ...fw.bold,
  },
  introText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.body,
    color: colors.textPrimary,
    ...fw.bold,
    flex: 1,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusPillText: {
    ...typography.caption,
    ...fw.bold,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingTop: 80,
  },
  emptyIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
});
