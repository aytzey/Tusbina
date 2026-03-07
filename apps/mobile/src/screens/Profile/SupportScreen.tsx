import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { colors, radius, spacing, typography } from "@/theme";

const SUPPORT_EMAIL = "info@machinity.ai";
const SUPPORT_PHONE = "+90 312 439 99 35";
const SUPPORT_WEBSITE = "https://machinity.ai/iletisim";

export function SupportScreen() {
  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Yardım & Destek</Text>
      <Text style={styles.subtitle}>
        Ürünle ilgili sorun, öneri veya acil destek ihtiyacında doğrudan ekiple iletişime geçebilirsin.
      </Text>

      <ActionCard
        icon="mail-outline"
        title="E-posta gönder"
        description={SUPPORT_EMAIL}
        onPress={() =>
          void openSupportUrl(`mailto:${SUPPORT_EMAIL}?subject=TUSBINA%20Destek`, "E-posta uygulaması açılamadı.")
        }
      />

      <ActionCard
        icon="call-outline"
        title="Telefonla ulaş"
        description={SUPPORT_PHONE}
        onPress={() =>
          void openSupportUrl(`tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`, "Telefon bağlantısı açılamadı.")
        }
      />

      <ActionCard
        icon="globe-outline"
        title="İletişim sayfasını aç"
        description="Machinity iletişim formu"
        onPress={() => void openSupportUrl(SUPPORT_WEBSITE, "İletişim sayfası açılamadı.")}
      />
    </ScreenContainer>
  );
}

async function openSupportUrl(url: string, fallbackMessage: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      throw new Error("Link unsupported");
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Bağlantı açılamadı", fallbackMessage);
  }
}

function ActionCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.motivationOrange} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
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
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(191,95,62,0.12)",
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
