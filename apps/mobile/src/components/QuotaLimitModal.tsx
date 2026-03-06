import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useUserStore } from "@/state/stores";
import { RootStackParamList } from "@/navigation/types";
import { colors, radius, spacing, typography } from "@/theme";

const LOGO = require("../../assets/logo.png");

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "time-outline", label: "Ayda 10 saat dinleme hakkı" },
  { icon: "book-outline", label: "Tüm derslere sınırsız erişim" },
  { icon: "cloud-upload-outline", label: "500 MB'a kadar dosya yükleme" }
];

export function QuotaLimitModal() {
  const navigation = useNavigation<Navigation>();
  const visible = useUserStore((state) => state.limitModalVisible);
  const close = useUserStore((state) => state.closeLimitModal);

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Logo */}
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />

          {/* Title */}
          <Text style={styles.title}>Demo Limitine Ulaştın!</Text>

          {/* Description */}
          <Text style={styles.description}>
            Demo sürümüyle yalnızca 5 dakika dinleyebilir ve 50 MB dosya yükleyebilirsin.
            Premium&apos;a geçerek tüm özelliklerin kilidini aç!
          </Text>

          {/* Benefits card */}
          <View style={styles.benefitsCard}>
            {BENEFITS.map((item) => (
              <View key={item.label} style={styles.benefitRow}>
                <View style={styles.benefitIconCircle}>
                  <Ionicons name={item.icon} size={18} color={colors.motivationOrange} />
                </View>
                <Text style={styles.benefitLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA button */}
          <Pressable
            style={styles.primary}
            onPress={() => {
              close();
              navigation.navigate("Premium");
            }}
          >
            <Text style={styles.primaryLabel}>Premium&apos;a Geç - 250 TL/Ay</Text>
          </Pressable>

          {/* Later link */}
          <Pressable style={styles.secondary} onPress={close}>
            <Text style={styles.secondaryLabel}>Daha Sonra</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    padding: spacing.lg
  },
  card: {
    backgroundColor: colors.primaryNavy,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: "center"
  },

  /* Logo */
  logo: {
    width: 72,
    height: 72,
    marginBottom: spacing.xs
  },

  /* Title */
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center"
  },

  /* Description */
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22
  },

  /* Benefits card */
  benefitsCard: {
    width: "100%",
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  benefitIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(191,95,62,0.15)",
    alignItems: "center",
    justifyContent: "center"
  },
  benefitLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  },

  /* CTA button */
  primary: {
    width: "100%",
    marginTop: spacing.xs,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.premiumGold,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryLabel: {
    ...typography.button,
    color: "#FFFFFF"
  },

  /* Later link */
  secondary: {
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryLabel: {
    ...typography.body,
    color: colors.textSecondary
  }
});
