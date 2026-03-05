import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { useUserStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "library-outline", label: "Tüm derslere sınırsız erişim" },
  { icon: "time-outline", label: "Ayda 10 saat dinleme hakkı" },
  { icon: "cloud-upload-outline", label: "Sınırsız dosya yükleme (500 MB)" },
  { icon: "layers-outline", label: "Konulara göre otomatik ayırma" },
  { icon: "list-outline", label: "Step-step bölünebilir podcast'ler" },
  { icon: "download-outline", label: "Çevrimdışı dinleme" }
];

export function PremiumScreen() {
  const user = useUserStore((state) => state.user);
  const usageLoading = useUserStore((state) => state.usageLoading);
  const usageError = useUserStore((state) => state.usageError);
  const activatePremium = useUserStore((state) => state.activatePremium);
  const addExtraPackage = useUserStore((state) => state.addExtraPackage);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* --- Crown Icon --- */}
      <View style={styles.crownCircle}>
        <Ionicons name="trophy" size={40} color={colors.premiumGold} />
      </View>

      {/* --- Pricing --- */}
      <Text style={styles.price}>250 TL / Ay</Text>
      <Text style={styles.quotaHighlight}>10 Saat Dinleme Hakkı</Text>

      {/* --- Status --- */}
      <View style={styles.statusBadge}>
        <Ionicons
          name={user.isPremium ? "checkmark-circle" : "information-circle-outline"}
          size={16}
          color={user.isPremium ? colors.success : colors.textSecondary}
        />
        <Text style={[styles.statusText, user.isPremium && styles.statusTextPremium]}>
          Mevcut Durum: {user.isPremium ? "Premium" : "Demo"}
        </Text>
      </View>

      {/* --- Features --- */}
      <View style={styles.featuresCard}>
        {FEATURES.map((item) => (
          <View key={item.label} style={styles.featureRow}>
            <View style={styles.featureIconCircle}>
              <Ionicons name={item.icon} size={18} color={colors.motivationOrange} />
            </View>
            <Text style={styles.featureLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* --- Comparison Card --- */}
      <View style={styles.comparisonRow}>
        <View style={styles.comparisonCard}>
          <Text style={styles.compareTitle}>Demo</Text>
          <View style={styles.compareDivider} />
          <Text style={styles.compareValue}>1 saat / ay</Text>
          <Text style={styles.compareDetail}>Sınırlı içerik</Text>
        </View>
        <View style={[styles.comparisonCard, styles.comparisonCardHighlight]}>
          <Text style={[styles.compareTitle, styles.compareTitleGold]}>Premium</Text>
          <View style={[styles.compareDivider, styles.compareDividerGold]} />
          <Text style={styles.compareValue}>10 saat / ay</Text>
          <Text style={styles.compareDetail}>Tam erişim</Text>
        </View>
      </View>

      {/* --- Extra Package Card --- */}
      <View style={styles.extraCard}>
        <View style={styles.extraCardHeader}>
          <Ionicons name="add-circle-outline" size={22} color={colors.premiumGold} />
          <Text style={styles.extraTitle}>Ekstra Paket</Text>
        </View>
        <Text style={styles.extraDescription}>
          Kotanız dolduğunda ekstra dinleme süresi ekleyin.
        </Text>
        <Pressable
          style={[styles.extraButton, usageLoading && styles.buttonDisabled]}
          onPress={() => void addExtraPackage()}
          disabled={usageLoading}
        >
          <Text style={styles.extraButtonLabel}>
            {usageLoading ? "İşleniyor..." :"Ekstra Paket Al - 150 TL"}
          </Text>
        </Pressable>
      </View>

      {/* --- CTA --- */}
      <Pressable
        style={[styles.ctaButton, usageLoading && styles.buttonDisabled]}
        onPress={() => void activatePremium()}
        disabled={usageLoading}
      >
        <Ionicons name="star" size={18} color={colors.textPrimary} />
        <Text style={styles.ctaLabel}>
          {usageLoading ? "İşleniyor..." : "Premium'a Geç - 250 TL/Ay"}
        </Text>
      </Pressable>

      {/* --- Restore --- */}
      <Pressable style={styles.restoreButton}>
        <Text style={styles.restoreLabel}>Satın Alımı Geri Yükle</Text>
      </Pressable>

      {/* --- Error --- */}
      {usageError ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.error}>{usageError}</Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    alignItems: "center"
  },

  /* ---- Crown ---- */
  crownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(189,148,101,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm
  },

  /* ---- Pricing ---- */
  price: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center"
  },
  quotaHighlight: {
    ...typography.body,
    color: colors.motivationOrange,
    fontWeight: "700",
    textAlign: "center"
  },

  /* ---- Status ---- */
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceNavy
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  statusTextPremium: {
    color: colors.success
  },

  /* ---- Features ---- */
  featuresCard: {
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.lg,
    gap: spacing.md
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  featureIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(191,95,62,0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  featureLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  },

  /* ---- Comparison ---- */
  comparisonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%"
  },
  comparisonCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs
  },
  comparisonCardHighlight: {
    borderColor: colors.premiumGold
  },
  compareTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700"
  },
  compareTitleGold: {
    color: colors.premiumGold
  },
  compareDivider: {
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.divider
  },
  compareDividerGold: {
    backgroundColor: colors.premiumGold
  },
  compareValue: {
    ...typography.h2,
    color: colors.textPrimary
  },
  compareDetail: {
    ...typography.caption,
    color: colors.textSecondary
  },

  /* ---- Extra Package ---- */
  extraCard: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.lg,
    gap: spacing.sm
  },
  extraCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  extraTitle: {
    ...typography.body,
    color: colors.premiumGold,
    fontWeight: "700"
  },
  extraDescription: {
    ...typography.caption,
    color: colors.textSecondary
  },
  extraButton: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.premiumGold,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs
  },
  extraButtonLabel: {
    ...typography.button,
    color: colors.premiumGold
  },

  /* ---- CTA ---- */
  ctaButton: {
    width: "100%",
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.premiumGold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  ctaLabel: {
    ...typography.button,
    color: colors.textPrimary
  },
  buttonDisabled: {
    opacity: 0.5
  },

  /* ---- Restore ---- */
  restoreButton: {
    paddingVertical: spacing.sm
  },
  restoreLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textDecorationLine: "underline"
  },

  /* ---- Error ---- */
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: "rgba(214,69,69,0.1)"
  },
  error: {
    ...typography.caption,
    color: colors.danger
  }
});
