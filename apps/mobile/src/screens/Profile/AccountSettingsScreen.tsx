import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { updateMyProfile } from "@/services/api";
import { useAuthStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function AccountSettingsScreen() {
  const navigation = useNavigation<Navigation>();
  const authUser = useAuthStore((state) => state.user);
  const updateDisplayName = useAuthStore((state) => state.updateDisplayName);
  const isLoading = useAuthStore((state) => state.isLoading);

  const initialDisplayName = useMemo(
    () => authUser?.user_metadata?.display_name ?? authUser?.email?.split("@")[0] ?? "",
    [authUser?.email, authUser?.user_metadata]
  );

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(initialDisplayName);
  }, [initialDisplayName]);

  const handleSave = async () => {
    const nextValue = displayName.trim();
    if (nextValue.length < 2) {
      setMessage("Görünen ad en az 2 karakter olmalı.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const authUpdated = await updateDisplayName(nextValue);
      if (!authUpdated) {
        throw new Error("Kimlik profili güncellenemedi.");
      }
      try {
        await updateMyProfile({ display_name: nextValue });
      } catch {
        const reverted = await updateDisplayName(initialDisplayName).catch(() => false);
        setDisplayName(reverted ? initialDisplayName : nextValue);
        throw new Error(
          reverted
            ? "Profil senkronu tamamlanamadı. Görünen ad geri alındı."
            : "Profil senkronu tamamlanamadı. Görünen ad farklı kalmış olabilir."
        );
      }
      setMessage("Hesap ayarları kaydedildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profil ayarları güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Hesap Ayarları</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Görünen ad</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Ad Soyad"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          editable={!saving && !isLoading}
        />

        <Text style={styles.label}>E-posta</Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{authUser?.email ?? "Bilinmiyor"}</Text>
        </View>

        <Text style={styles.helper}>
          Bu alan profil ve giriş ekranındaki görünen adını günceller.
        </Text>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          style={[styles.button, (saving || isLoading) && styles.buttonDisabled]}
          disabled={saving || isLoading}
          onPress={() => void handleSave()}
        >
          {saving || isLoading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.buttonLabel}>Kaydet</Text>
          )}
        </Pressable>

        <View style={styles.secondaryActions}>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("LegalCenter")}>
            <Text style={styles.secondaryButtonLabel}>Hukuk & Gizlilik</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, styles.dangerButton]} onPress={() => navigation.navigate("DeleteAccount")}>
            <Text style={[styles.secondaryButtonLabel, styles.dangerButtonLabel]}>Hesabı Sil</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
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
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  readonlyBox: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  readonlyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  helper: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  message: {
    ...typography.caption,
    color: colors.motivationOrange,
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
  secondaryActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    fontWeight: "600",
  },
  dangerButton: {
    borderColor: "rgba(214,69,69,0.4)",
  },
  dangerButtonLabel: {
    color: colors.danger,
  },
});
