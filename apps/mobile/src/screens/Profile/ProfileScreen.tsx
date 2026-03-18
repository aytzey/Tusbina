import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import {
  useAuthStore,
  useDownloadsStore,
  usePodcastsStore,
  useUserStore,
} from "@/state/stores";
import { StaggerView, colors, fw, radius, spacing, typography } from "@/theme";
import { formatDuration } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string | null;
}

function MenuItem({ icon, label, onPress, danger = false, badge = null }: MenuItemProps) {
  return (
    <Pressable style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.cardBgElevated }]} onPress={onPress}>
      <View style={[styles.menuIconWrap, danger && { backgroundColor: colors.dangerTint }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} />
      </View>
      <Text style={[styles.menuLabel, danger && styles.dangerLabel]}>{label}</Text>
      <View style={styles.menuRight}>
        {badge ? (
          <View style={styles.menuBadge}>
            <Text style={styles.menuBadgeText}>{badge}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
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
  const podcasts = usePodcastsStore((state) => state.podcasts);

  useFocusEffect(
    useCallback(() => {
      void syncUsage();
    }, [syncUsage])
  );

  const used = user.monthlyUsedSec;
  const quota = user.monthlyListenQuotaSec;
  const remaining = Math.max(0, quota - used);
  const usageProgress = quota > 0 ? (used / quota) * 100 : 0;
  const processingCount = podcasts.filter((podcast) =>
    podcast.parts.some((part) => part.status === "queued" || part.status === "processing" || part.status === "failed")
  ).length;
  const displayName = useMemo(
    () => authUser?.user_metadata?.display_name || authUser?.email?.split("@")[0] || user.name,
    [authUser?.email, authUser?.user_metadata?.display_name, user.name]
  );

  const initials = useMemo(() => {
    const name = displayName ?? "";
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [displayName]);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* ── Profile header ── */}
      <StaggerView index={0} style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.userName}>{displayName}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.tierBadge, user.isPremium && styles.tierBadgePremium]}>
              <Ionicons
                name="shield-checkmark"
                size={12}
                color={user.isPremium ? colors.premiumGold : colors.textSecondary}
              />
              <Text style={[styles.badgeText, { color: user.isPremium ? colors.premiumGold : colors.textSecondary }]}>
                {user.isPremium ? "Premium" : "Standart"}
              </Text>
            </View>
          </View>
        </View>
      </StaggerView>

      {/* ── Monthly usage ── */}
      <StaggerView index={1} style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>AYLIK KULLANIM</Text>
          <Text style={styles.usageValue}>
            {formatDuration(used)} / {formatDuration(quota)}
          </Text>
        </View>
        <ProgressBar progress={usageProgress} />
        <Text style={styles.usageSubtitle}>Kalan: {formatDuration(remaining)}</Text>
        {usageLoading ? <Text style={styles.info}>Güncelleniyor...</Text> : null}
        {usageError ? <Text style={styles.error}>{usageError}</Text> : null}
      </StaggerView>

      {/* ── Menu ── */}
      <StaggerView index={2} style={styles.menuCard}>
        <MenuItem
          icon="download-outline"
          label="İndirilenler"
          badge={downloads.length > 0 ? `${downloads.length}` : null}
          onPress={() => navigation.navigate("Downloads")}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon="sync-outline"
          label="İşlem Durumu"
          badge={processingCount > 0 ? `${processingCount}` : null}
          onPress={() => navigation.navigate("Notifications")}
        />
        <View style={styles.menuDivider} />
        <MenuItem icon="timer-outline" label="Çalışma Araçları" onPress={() => navigation.navigate("StudyTools")} />
        <View style={styles.menuDivider} />
        <MenuItem icon="card-outline" label="Abonelik" onPress={() => navigation.navigate("Premium")} />
      </StaggerView>

      <StaggerView index={3} style={styles.menuCard}>
        <MenuItem icon="settings-outline" label="Hesap Ayarları" onPress={() => navigation.navigate("AccountSettings")} />
        <View style={styles.menuDivider} />
        <MenuItem icon="shield-checkmark-outline" label="Hukuk & Gizlilik" onPress={() => navigation.navigate("LegalCenter")} />
        <View style={styles.menuDivider} />
        <MenuItem icon="help-circle-outline" label="Yardım & Destek" onPress={() => navigation.navigate("Support")} />
      </StaggerView>

      {/* ── Footer ── */}
      <StaggerView index={4}>
        <View style={styles.menuCard}>
          <MenuItem icon="log-out-outline" label="Çıkış Yap" onPress={signOut} danger />
        </View>

        {authUser?.email ? (
          <Text style={styles.emailText}>{authUser.email}</Text>
        ) : null}
      </StaggerView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },

  /* ── Profile header ── */
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    ...typography.h2Small,
    color: colors.textPrimary,
  },
  profileInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  userName: {
    ...typography.h2Small,
    color: colors.textPrimary,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.cardBg,
  },
  tierBadgePremium: {
    backgroundColor: colors.goldTint,
  },
  badgeText: {
    ...typography.small,
    ...fw.semiBold,
  },

  /* ── Usage ── */
  usageCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  usageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  usageLabel: {
    ...typography.small,
    color: colors.textSecondary,
    ...fw.semiBold,
    letterSpacing: 0.5,
  },
  usageValue: {
    ...typography.caption,
    color: colors.motivationOrange,
    ...fw.bold,
    fontVariant: ["tabular-nums"] as const,
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

  /* ── Menu ── */
  menuCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.divider,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 52,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    minHeight: 52,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.cardBgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginLeft: "auto",
  },
  menuLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    ...fw.medium,
  },
  menuBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.orangeTint,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBadgeText: {
    ...typography.small,
    color: colors.motivationOrange,
    ...fw.bold,
  },
  dangerLabel: {
    color: colors.danger,
  },

  /* ── Footer ── */
  emailText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
