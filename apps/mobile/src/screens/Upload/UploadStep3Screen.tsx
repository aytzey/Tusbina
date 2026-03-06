import { Text, TextInput, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, ScreenContainer, WizardProgress } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useUploadWizardStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function UploadStep3Screen() {
  const navigation = useNavigation<Navigation>();
  const files = useUploadWizardStore((state) => state.files);
  const coverImage = useUploadWizardStore((state) => state.coverImage);
  const voice = useUploadWizardStore((state) => state.voice);
  const format = useUploadWizardStore((state) => state.format);
  const podcastName = useUploadWizardStore((state) => state.podcastName);
  const setPodcastName = useUploadWizardStore((state) => state.setPodcastName);

  const estimatedParts = Math.max(files.length * 3, 3);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Önizleme ve Oluştur</Text>
      <WizardProgress label="Otomatik plan" step={3} totalSteps={3} />

      <View style={styles.nameSection}>
        <Text style={styles.inputLabel}>Podcast adı</Text>
        <TextInput
          placeholder="Podcast adı"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          value={podcastName}
          onChangeText={setPodcastName}
        />
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="sparkles-outline" size={18} color={colors.motivationOrange} />
          <Text style={styles.infoTitle}>Sistem neleri otomatik yapacak?</Text>
        </View>
        <Text style={styles.infoText}>
          Belge başlıklarını tarayıp konu bazlı bölümleme oluşturacak, bölüm isimlerini içerikten türetecek ve hazırsa
          kapak görselini kullanacak. Görsel yoksa podcast için otomatik kapak üretilecek.
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Belge sayısı</Text>
          <Text style={styles.summaryValue}>{files.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Tahmini bölüm</Text>
          <Text style={styles.summaryValue}>~{estimatedParts}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Ses</Text>
          <Text style={styles.summaryValueSmall}>{voice ?? "-"}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Kapak</Text>
          <Text style={styles.summaryValueSmall}>{coverImage ? "Yüklendi" : "Otomatik"}</Text>
        </View>
      </View>

      <View style={styles.fileList}>
        {files.map((file) => (
          <View key={file.localId} style={styles.fileRow}>
            <Ionicons name="document-text-outline" size={18} color={colors.motivationOrange} />
            <Text style={styles.fileName} numberOfLines={1}>
              {file.name}
            </Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        label="Podcast Oluştur"
        disabled={!podcastName.trim() || files.length === 0 || !voice || !format}
        onPress={() => navigation.navigate("Uploading")}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  nameSection: {
    gap: spacing.xs,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceNavy,
    ...typography.body,
  },
  infoCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  infoText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  summaryCard: {
    width: "48%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  summaryValueSmall: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  fileList: {
    gap: spacing.sm,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
  },
  fileName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});
