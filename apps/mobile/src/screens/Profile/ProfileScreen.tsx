import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore, useDownloadsStore, useLearningToolsStore, useUserStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { formatDuration, formatTimer } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onPress, danger = false }: MenuItemProps) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textSecondary} />
        <Text style={[styles.menuLabel, danger && styles.dangerLabel]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

export function ProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const user = useUserStore((state) => state.user);
  const usageLoading = useUserStore((state) => state.usageLoading);
  const usageError = useUserStore((state) => state.usageError);
  const syncUsage = useUserStore((state) => state.syncUsage);
  const signOut = useAuthStore((state) => state.signOut);
  const authUser = useAuthStore((state) => state.user);
  const downloads = useDownloadsStore((state) => state.downloads);
  const dailyGoalMin = useLearningToolsStore((state) => state.dailyGoalMin);
  const todayListenedSec = useLearningToolsStore((state) => state.todayListenedSec);
  const studyPlan = useLearningToolsStore((state) => state.studyPlan);
  const stopwatchSec = useLearningToolsStore((state) => state.stopwatchSec);
  const resetTodayIfNeeded = useLearningToolsStore((state) => state.resetTodayIfNeeded);

  useFocusEffect(
    useCallback(() => {
      resetTodayIfNeeded();
      void syncUsage();
    }, [resetTodayIfNeeded, syncUsage])
  );

  const used = user.monthlyUsedSec;
  const quota = user.monthlyListenQuotaSec;
  const remaining = Math.max(0, quota - used);
  const usageProgress = quota > 0 ? (used / quota) * 100 : 0;
  const dailyGoalSec = dailyGoalMin * 60;
  const dailyProgress = Math.min(100, Math.round((todayListenedSec / dailyGoalSec) * 100));
  const displayName = useMemo(
    () => authUser?.user_metadata?.display_name || authUser?.email?.split("@")[0] || user.name,
    [authUser?.email, authUser?.user_metadata?.display_name, user.name]
  );

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Profil</Text>

      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person-outline" size={36} color={colors.textPrimary} />
        </View>

        <Text style={styles.userName}>{displayName}</Text>

        <View style={styles.badgeRow}>
          <Ionicons
            name="shield-checkmark"
            size={16}
            color={user.isPremium ? colors.premiumGold : colors.textSecondary}
          />
          <Text style={[styles.badgeText, { color: user.isPremium ? colors.premiumGold : colors.textSecondary }]}>
            {user.isPremium ? "Premium Üye" : "Standart"}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.motivationOrange }]}>{formatDuration(used)}</Text>
          <Text style={styles.statLabel}>Bu ay dinlenen</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>{downloads.length}</Text>
          <Text style={styles.statLabel}>İndirilen podcast</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{dailyGoalMin} dk</Text>
          <Text style={styles.statLabel}>Günlük hedef</Text>
        </View>
      </View>

      <View style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageSectionTitle}>Aylık kullanım</Text>
          <Text style={styles.usageValue}>
            {formatDuration(used)} / {formatDuration(quota)}
          </Text>
        </View>
        <ProgressBar progress={usageProgress} />
        <Text style={styles.usageSubtitle}>Kalan dinleme hakkın: {formatDuration(remaining)}</Text>
        {usageLoading ? <Text style={styles.info}>Kullanım bilgisi güncelleniyor...</Text> : null}
        {usageError ? <Text style={styles.error}>{usageError}</Text> : null}
      </View>

      <Pressable style={styles.toolsCard} onPress={() => navigation.navigate("StudyTools")}>
        <View style={styles.toolsHeader}>
          <Text style={styles.toolsTitle}>Çalışma araçları</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
        <Text style={styles.toolsMeta}>
          Günlük hedef: {formatDuration(todayListenedSec)} / {dailyGoalMin} dk
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${dailyProgress}%` as const }]} />
        </View>
        <Text style={styles.toolsSubline}>Kronometre: {formatTimer(stopwatchSec)}</Text>
        <Text style={styles.planPreview} numberOfLines={2}>
          {studyPlan}
        </Text>
      </Pressable>

      <View style={styles.menuSection}>
        <MenuItem icon="settings-outline" label="Hesap Ayarları" onPress={() => navigation.navigate("AccountSettings")} />
        <MenuItem icon="download-outline" label="İndirilenler" onPress={() => navigation.navigate("Downloads")} />
        <MenuItem icon="timer-outline" label="Çalışma Araçları" onPress={() => navigation.navigate("StudyTools")} />
        <MenuItem icon="card-outline" label="Abonelik Yönetimi" onPress={() => navigation.navigate("Premium")} />
        <MenuItem icon="help-circle-outline" label="Yardım & Destek" onPress={() => navigation.navigate("Support")} />
      </View>

      {authUser?.email ? (
        <View style={styles.emailRow}>
          <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.emailText}>{authUser.email}</Text>
        </View>
      ) : null}

      <MenuItem icon="log-out-outline" label="Çıkış Yap" onPress={signOut} danger />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },
  profileHeader: {
    alignItems: "center",
    gap: spacing.sm,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  usageCard: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  usageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  usageSectionTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  usageValue: {
    ...typography.body,
    color: colors.motivationOrange,
    fontWeight: "700",
  },
  usageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  info: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  toolsCard: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  toolsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolsTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  toolsMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
  },
  toolsSubline: {
    ...typography.caption,
    color: colors.premiumGold,
    fontWeight: "700",
  },
  planPreview: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  menuSection: {
    gap: spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  menuLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  dangerLabel: {
    color: colors.danger,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  emailText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
