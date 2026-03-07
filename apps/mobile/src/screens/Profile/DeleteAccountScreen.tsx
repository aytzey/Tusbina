import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components";
import { deleteMyAccount } from "@/services/api";
import { useAuthStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

const CONFIRM_PHRASE = "HESABIMI SIL";

export function DeleteAccountScreen() {
  const signOut = useAuthStore((state) => state.signOut);
  const [confirmValue, setConfirmValue] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canDelete = confirmValue.trim().toUpperCase() === CONFIRM_PHRASE && !deleting;

  const handleDelete = async () => {
    if (!canDelete) {
      return;
    }

    setDeleting(true);
    setMessage(null);
    try {
      const response = await deleteMyAccount();
      Alert.alert(
        response.auth_account_deleted ? "Hesap silindi" : "Silme işlemi kısmen tamamlandı",
        response.message,
        [
          {
            text: "Tamam",
            onPress: () => {
              void signOut();
            },
          },
        ]
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hesap silme işlemi başlatılamadı.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Hesabı Kalıcı Olarak Sil</Text>
      <Text style={styles.subtitle}>
        Bu işlem profilini, yüklediğin içerikleri, üretilen podcastleri ve ilerleme kayıtlarını geri döndürülemez şekilde kaldırır.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Silinecek başlıca veriler</Text>
        <Bullet text="Kullanıcı profili ve açık rıza tercihleri" />
        <Bullet text="Yüklediğin dosyalar, oluşturulan sesler ve quiz çıktıları" />
        <Bullet text="Dinleme ilerlemesi, favoriler ve indirme kayıtları" />
        <Bullet text="Geri bildirim ve destek geçmişinin kullanıcıya bağlı bölümü" />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Onay için şu ifadeyi yaz</Text>
        <Text style={styles.helper}>{CONFIRM_PHRASE}</Text>
        <TextInput
          value={confirmValue}
          onChangeText={setConfirmValue}
          autoCapitalize="characters"
          placeholder={CONFIRM_PHRASE}
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          editable={!deleting}
        />
      </View>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <Pressable
        style={[styles.deleteButton, !canDelete && styles.buttonDisabled]}
        disabled={!canDelete}
        onPress={() => void handleDelete()}
      >
        {deleting ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={styles.deleteButtonLabel}>Hesabı Sil</Text>}
      </Pressable>
    </ScreenContainer>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
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
  sectionTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  helper: {
    ...typography.caption,
    color: colors.motivationOrange,
    letterSpacing: 1,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bulletMark: {
    ...typography.body,
    color: colors.danger,
  },
  bulletText: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  deleteButton: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
