import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { usePodcastsStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function NotificationsScreen() {
  const navigation = useNavigation<Navigation>();
  const podcasts = usePodcastsStore((state) => state.podcasts);

  const recentPodcasts = podcasts.slice(0, 5);
  const hasNotifications = recentPodcasts.length > 0;

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {hasNotifications ? (
        <View style={styles.list}>
          {recentPodcasts.map((podcast) => {
            const readyParts = podcast.parts.filter((p) => p.status === "ready").length;
            const totalParts = podcast.parts.length;
            const allReady = readyParts === totalParts;

            return (
              <Pressable
                key={podcast.id}
                style={styles.card}
                onPress={() => navigation.navigate("MainTabs", { screen: "ListenTab" })}
              >
                <View style={[styles.iconCircle, allReady ? styles.iconCircleReady : styles.iconCircleProcessing]}>
                  <Ionicons
                    name={allReady ? "checkmark-circle" : "hourglass-outline"}
                    size={20}
                    color={allReady ? colors.success : colors.premiumGold}
                  />
                </View>
                <View style={styles.body}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{podcast.title}</Text>
                  <Text style={styles.cardMeta}>
                    {allReady
                      ? `${totalParts} bölüm hazır`
                      : `${readyParts}/${totalParts} bölüm hazır`}
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
            <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Bildirim yok</Text>
          <Text style={styles.emptyText}>
            Podcast oluşturduğunda ve içerik hazır olduğunda burada bildirim göreceksin.
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleReady: {
    backgroundColor: "rgba(52,199,89,0.12)",
  },
  iconCircleProcessing: {
    backgroundColor: colors.goldTint,
  },
  body: {
    flex: 1,
    gap: 2,
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
