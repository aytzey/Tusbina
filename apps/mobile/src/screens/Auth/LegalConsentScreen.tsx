import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LEGAL_DOCUMENT_LINKS } from "@/content/legal";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function LegalConsentScreen() {
  const navigation = useNavigation<Navigation>();
  const completeRequiredConsents = useAuthStore((state) => state.completeRequiredConsents);
  const signOut = useAuthStore((state) => state.signOut);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const [acceptedRequired, setAcceptedRequired] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const handleContinue = async () => {
    if (!acceptedRequired) {
      return;
    }
    await completeRequiredConsents(marketingOptIn);
  };

  const requiredDocs = LEGAL_DOCUMENT_LINKS.filter((item) => item.required);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <View style={styles.heroCard}>
        <Ionicons name="shield-checkmark-outline" size={34} color={colors.motivationOrange} />
        <Text style={styles.title}>Devam etmeden önce yasal onay gerekli</Text>
        <Text style={styles.subtitle}>
          İlk girişten önce gizlilik, kullanım koşulları ve KVKK bilgilendirmesini görüp onaylaman gerekiyor.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Zorunlu metinler</Text>
        {requiredDocs.map((item) => (
          <Pressable
            key={item.id}
            style={styles.docRow}
            onPress={() => navigation.navigate("LegalDocument", { documentId: item.id, title: item.title })}
          >
            <Text style={styles.docTitle}>{item.title}</Text>
            <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        ))}

        <Pressable style={styles.checkboxRow} onPress={() => setAcceptedRequired((value) => !value)}>
          <Ionicons
            name={acceptedRequired ? "checkbox" : "square-outline"}
            size={22}
            color={acceptedRequired ? colors.motivationOrange : colors.textSecondary}
          />
          <Text style={styles.checkboxText}>
            Gizlilik Politikası, Kullanım Koşulları ve KVKK Aydınlatma Metni&apos;ni okudum; kabul ediyorum.
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Opsiyonel iletişim izni</Text>
        <Pressable style={styles.checkboxRow} onPress={() => setMarketingOptIn((value) => !value)}>
          <Ionicons
            name={marketingOptIn ? "checkbox" : "square-outline"}
            size={22}
            color={marketingOptIn ? colors.motivationOrange : colors.textSecondary}
          />
          <Text style={styles.checkboxText}>
            Ürün güncellemeleri ve bilgilendirmeler için benimle iletişime geçilmesini kabul ediyorum.
          </Text>
        </Pressable>
        <Pressable
          style={styles.docRow}
          onPress={() =>
            navigation.navigate("LegalDocument", {
              documentId: "marketing-consent",
              title: "Açık Rıza ve İletişim Tercihi",
            })
          }
        >
          <Text style={styles.docTitle}>Açık Rıza Metnini Gör</Text>
          <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, (!acceptedRequired || isLoading) && styles.buttonDisabled]}
        onPress={() => void handleContinue()}
        disabled={!acceptedRequired || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <Text style={styles.primaryButtonLabel}>Onayla ve Devam Et</Text>
        )}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => void signOut()}>
        <Text style={styles.secondaryButtonLabel}>Şimdilik Çıkış Yap</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  heroCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceNavy,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    gap: spacing.sm,
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
    backgroundColor: colors.surfaceNavy,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  docTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkboxText: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  primaryButton: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  secondaryButton: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
