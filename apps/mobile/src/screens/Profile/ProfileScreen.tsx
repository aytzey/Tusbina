import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useUserStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { formatDuration } from "@/utils";

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
        <Ionicons
          name={icon}
          size={20}
          color={danger ? colors.danger : colors.textSecondary}
        />
        <Text style={[styles.menuLabel, danger && styles.dangerLabel]}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (hours >= 1) {
    return `${hours.toFixed(1).replace(/\.0$/, "")}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}dk`;
}

export function ProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const user = useUserStore((state) => state.user);
  const usageLoading = useUserStore((state) => state.usageLoading);
  const usageError = useUserStore((state) => state.usageError);
  const addExtraPackage = useUserStore((state) => state.addExtraPackage);
  const logoutMock = useUserStore((state) => state.logoutMock);
  const syncUsage = useUserStore((state) => state.syncUsage);

  useFocusEffect(
    useCallback(() => {
      void syncUsage();
    }, [syncUsage])
  );

  const used = user.monthlyUsedSec;
  const quota = user.monthlyListenQuotaSec;
  const remaining = Math.max(0, quota - used);
  const usageProgress = quota > 0 ? (used / quota) * 100 : 0;

  const usedHours = (used / 3600).toFixed(1).replace(/\.0$/, "");
  const quotaHours = (quota / 3600).toFixed(0);
  const remainingHours = Math.floor(remaining / 3600);
  const remainingMinutes = Math.floor((remaining % 3600) / 60);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* Header */}
      <Text style={styles.title}>Profil</Text>

      {/* Avatar + Name + Badge */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person-outline" size={36} color={colors.textPrimary} />
        </View>

        <Text style={styles.userName}>{user.name}</Text>

        <View style={styles.badgeRow}>
          <Ionicons
            name="shield-checkmark"
            size={16}
            color={user.isPremium ? colors.premiumGold : colors.textSecondary}
          />
          <Text
            style={[
              styles.badgeText,
              { color: user.isPremium ? colors.premiumGold : colors.textSecondary }
            ]}
          >
            {user.isPremium ? "Premium Üye" : "Demo"}
          </Text>
        </View>
      </View>

      {/* Stat Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.motivationOrange }]}>
            {formatHours(used)}
          </Text>
          <Text style={styles.statLabel}>Dinleme</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>12</Text>
          <Text style={styles.statLabel}>Ders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {formatHours(remaining)}
          </Text>
          <Text style={styles.statLabel}>Kalan</Text>
        </View>
      </View>

      {/* Monthly Usage */}
      <View style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageSectionTitle}>Aylık Kullanım</Text>
          <Text style={styles.usageValue}>
            {usedHours}s / {quotaHours}s
          </Text>
        </View>
        <ProgressBar progress={usageProgress} />
        <Text style={styles.usageSubtitle}>
          Bu ay {remainingHours} saat {remainingMinutes} dakika dinleme hakkınız kaldı
        </Text>
        {usageLoading ? (
          <Text style={styles.info}>Güncelleniyor...</Text>
        ) : null}
        {usageError ? <Text style={styles.error}>{usageError}</Text> : null}
      </View>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <MenuItem
          icon="settings-outline"
          label="Hesap Ayarları"
          onPress={() => {}}
        />
        <MenuItem
          icon="download-outline"
          label="İndirilenler"
          onPress={() => {}}
        />
        <MenuItem
          icon="card-outline"
          label="Abonelik Yönetimi"
          onPress={() => navigation.navigate("Premium")}
        />
        <MenuItem
          icon="help-circle-outline"
          label="Yardım & Destek"
          onPress={() => {}}
        />
      </View>

      {/* Logout */}
      <MenuItem
        icon="log-out-outline"
        label="Çıkış Yap"
        onPress={logoutMock}
        danger
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center"
  },

  /* Profile Header */
  profileHeader: {
    alignItems: "center",
    gap: spacing.sm
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center"
  },
  userName: {
    ...typography.h2,
    color: colors.textPrimary
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  badgeText: {
    ...typography.caption,
    fontWeight: "600"
  },

  /* Stat Cards */
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: spacing.xs
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary
  },

  /* Usage Card */
  usageCard: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm
  },
  usageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  usageSectionTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  usageValue: {
    ...typography.body,
    color: colors.motivationOrange,
    fontWeight: "700"
  },
  usageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary
  },
  info: {
    ...typography.caption,
    color: colors.textSecondary
  },
  error: {
    ...typography.caption,
    color: colors.danger
  },

  /* Menu */
  menuSection: {
    gap: 1
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  menuLabel: {
    ...typography.body,
    color: colors.textPrimary
  },
  dangerLabel: {
    color: colors.danger
  }
});
