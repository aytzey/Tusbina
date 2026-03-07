import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LEGAL_DOCUMENT_LINKS } from "@/content/legal";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { fetchMyLegalConsent, type ApiLegalConsent } from "@/services/api";
import { useAuthStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function ConsentPreferencesScreen() {
  const navigation = useNavigation<Navigation>();
  const updateMarketingConsent = useAuthStore((state) => state.updateMarketingConsent);
  const storeError = useAuthStore((state) => state.error);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [consent, setConsent] = useState<ApiLegalConsent | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingMessage(null);
    fetchMyLegalConsent()
      .then((payload) => {
        if (!active) {
          return;
        }
        setConsent(payload);
        setMarketingOptIn(payload.marketing_opt_in);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadingMessage(error instanceof Error ? error.message : "Tercihler yüklenemedi.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    setSavingMessage(null);
    const ok = await updateMarketingConsent(marketingOptIn);
    if (!ok) {
      return;
    }

    try {
      const nextConsent = await fetchMyLegalConsent();
      setConsent(nextConsent);
      setMarketingOptIn(nextConsent.marketing_opt_in);
      setSavingMessage("İletişim tercihi güncellendi.");
    } catch (error) {
      setSavingMessage(error instanceof Error ? error.message : "Tercihler yenilenemedi.");
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Açık Rıza Tercihleri</Text>
      <Text style={styles.subtitle}>
        Zorunlu yasal kabulleri görüntüleyebilir, opsiyonel iletişim iznini güncelleyebilirsin.
      </Text>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Ionicons
            name={consent?.required_consents_complete ? "checkmark-circle" : "alert-circle-outline"}
            size={22}
            color={consent?.required_consents_complete ? colors.success : colors.danger}
          />
          <View style={styles.statusBody}>
            <Text style={styles.statusTitle}>Zorunlu onay durumu</Text>
            <Text style={styles.statusText}>
              {consent?.required_consents_complete
                ? "Gizlilik Politikası, Kullanım Koşulları ve KVKK metni kabul edilmiş."
                : "Zorunlu yasal onaylar eksik görünüyor."}
            </Text>
          </View>
        </View>

        <Text style={styles.helper}>
          Son onay zamanı: {consent?.required_consents_accepted_at ?? "Henüz kaydedilmedi"}
        </Text>
      </View>

      <Pressable style={styles.card} onPress={() => setMarketingOptIn((value) => !value)}>
        <View style={styles.checkboxRow}>
          <Ionicons
            name={marketingOptIn ? "checkbox" : "square-outline"}
            size={22}
            color={marketingOptIn ? colors.motivationOrange : colors.textSecondary}
          />
          <View style={styles.statusBody}>
            <Text style={styles.statusTitle}>Ürün duyuruları için iletişim izni</Text>
            <Text style={styles.statusText}>
              Eğitim içerikleri, güncellemeler ve kampanya duyuruları için bana ulaşılmasını kabul ediyorum.
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.statusTitle}>İlgili metinler</Text>
        {LEGAL_DOCUMENT_LINKS.map((item) => (
          <Pressable
            key={item.id}
            style={styles.linkRow}
            onPress={() => navigation.navigate("LegalDocument", { documentId: item.id, title: item.title })}
          >
            <Text style={styles.linkText}>{item.title}</Text>
            <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>

      {loadingMessage ? <Text style={styles.error}>{loadingMessage}</Text> : null}
      {storeError ? <Text style={styles.error}>{storeError}</Text> : null}
      {savingMessage ? <Text style={styles.success}>{savingMessage}</Text> : null}

      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        disabled={isLoading}
        onPress={() => void handleSave()}
      >
        {isLoading ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={styles.buttonLabel}>Kaydet</Text>}
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
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
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  statusBody: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  helper: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  linkText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  success: {
    ...typography.caption,
    color: colors.success,
  },
  button: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
});
