import { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, ScreenContainer, WizardProgress } from "@/components";
import { UploadFileItem } from "@/domain/models";
import { RootStackParamList } from "@/navigation/types";
import { usePodcastsStore, useUploadWizardStore, useUserStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

const DEMO_MAX_UPLOADS = 2;

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const MAX_FILES = 6;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_COVER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
];
const SUPPORTED_FORMAT_LABEL = "PDF, Word, PowerPoint veya metin dosyası";

export function UploadStep1Screen() {
  const navigation = useNavigation<Navigation>();
  const files = useUploadWizardStore((state) => state.files);
  const coverImage = useUploadWizardStore((state) => state.coverImage);
  const addFiles = useUploadWizardStore((state) => state.addFiles);
  const removeFile = useUploadWizardStore((state) => state.removeFile);
  const setCoverImage = useUploadWizardStore((state) => state.setCoverImage);
  const isPremium = useUserStore((state) => state.user.isPremium);
  const totalPodcasts = usePodcastsStore((state) => state.podcasts.length);
  const [warning, setWarning] = useState<string | null>(null);

  const demoLimitReached = !isPremium && totalPodcasts >= DEMO_MAX_UPLOADS;
  const canAddMore = files.length < MAX_FILES;
  const remainingSlots = useMemo(() => Math.max(MAX_FILES - files.length, 0), [files.length]);

  const pickSourceFiles = async () => {
    if (!canAddMore) {
      setWarning(`En fazla ${MAX_FILES} belge ekleyebilirsin.`);
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_DOCUMENT_TYPES,
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    const validAssets = result.assets.filter((asset) => (asset.size ?? 0) <= MAX_FILE_SIZE_BYTES);
    const oversizedCount = result.assets.length - validAssets.length;

    const picked = validAssets.slice(0, remainingSlots).map<UploadFileItem>((asset, index) => ({
      localId: `${Date.now()}-${index}`,
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "application/pdf",
      size: asset.size ?? 0,
      kind: "document",
    }));

    if (oversizedCount > 0 && result.assets.length > remainingSlots) {
      setWarning(`50 MB üzeri ${oversizedCount} dosya ve limit dışı içerikler eklenmedi.`);
    } else if (oversizedCount > 0) {
      setWarning(`50 MB üzerinde ${oversizedCount} dosya var. Bu dosyalar eklenmedi.`);
    } else if (result.assets.length > remainingSlots) {
      setWarning(`Maksimum ${MAX_FILES} belge destekleniyor. Fazla dosyalar eklenmedi.`);
    } else if (picked.length === 0) {
      setWarning(`Geçerli bir dosya seçilmedi. Desteklenen: ${SUPPORTED_FORMAT_LABEL}`);
    } else {
      setWarning(null);
    }

    addFiles(picked);
  };

  const pickCoverImage = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset) {
      return;
    }

    const extension = asset.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_COVER_EXTENSIONS.has(extension)) {
      setWarning("Kapak için yalnızca PNG, JPG veya WEBP yükleyebilirsin.");
      return;
    }

    if ((asset.size ?? 0) > MAX_FILE_SIZE_BYTES) {
      setWarning("Kapak görseli 50 MB sınırını aşıyor.");
      return;
    }

    setCoverImage({
      localId: `cover-${Date.now()}`,
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/png",
      size: asset.size ?? 0,
      kind: "cover",
    });
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${Math.max(0.1, Number(mb.toFixed(1)))} MB`;
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Kaynak Yükle</Text>
      <WizardProgress label="Belge Seç" step={1} totalSteps={3} />

      <Pressable style={styles.uploadArea} onPress={() => void pickSourceFiles()}>
        <Ionicons name="document-text" size={40} color={colors.motivationOrange} />
        <Text style={styles.uploadTitle}>Belge dosyalarını yükle</Text>
        <Text style={styles.uploadDescription}>
          {SUPPORTED_FORMAT_LABEL} yükleyebilirsin. Sistem belgeyi otomatik bölümlendirip içerikten bölüm isimleri üretecek. Her dosya için üst sınır 50 MB.
        </Text>
      </Pressable>

      <Pressable style={styles.coverArea} onPress={() => void pickCoverImage()}>
        <View style={styles.coverBadge}>
          <Ionicons name="image-outline" size={18} color={colors.premiumGold} />
        </View>
        <View style={styles.coverBody}>
          <Text style={styles.coverTitle}>Kapak görseli ekle (opsiyonel)</Text>
          <Text style={styles.coverDescription}>
            PNG, JPG veya WEBP yükleyebilirsin. Yüklersen mevcut görsel kullanılır, yüklemezsen sistem otomatik kapak üretir.
          </Text>
        </View>
      </Pressable>

      {coverImage ? (
        <View style={styles.coverSelectedRow}>
          <View style={styles.coverMeta}>
            <Text style={styles.coverSelectedLabel}>Seçilen kapak</Text>
            <Text style={styles.coverSelectedName} numberOfLines={1}>
              {coverImage.name}
            </Text>
          </View>
          <Pressable style={styles.removeBtn} onPress={() => setCoverImage(null)}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {warning ? <Text style={styles.warning}>{warning}</Text> : null}

      {files.length > 0 && (
        <View style={styles.fileSection}>
          <View style={styles.fileListHeader}>
            <Text style={styles.fileListTitle}>Belgeler ({files.length})</Text>
            {canAddMore ? (
              <Pressable onPress={() => void pickSourceFiles()}>
                <Text style={styles.addMore}>+ Ekle</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.list}>
            {files.map((file) => (
              <View key={file.localId} style={styles.fileRow}>
                <Ionicons
                  name="document-text"
                  size={24}
                  color={colors.motivationOrange}
                  style={styles.fileIcon}
                />
                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                </View>
                <Pressable style={styles.removeBtn} onPress={() => removeFile(file.localId)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {demoLimitReached ? (
        <View style={styles.demoLimitCard}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.premiumGold} />
          <Text style={styles.demoLimitText}>
            Demo hesapla en fazla {DEMO_MAX_UPLOADS} içerik oluşturabilirsin. Daha fazlası için Premium'a geç.
          </Text>
          <Pressable
            style={styles.demoLimitButton}
            onPress={() => navigation.navigate("Premium")}
          >
            <Text style={styles.demoLimitButtonText}>Premium'a Geç</Text>
          </Pressable>
        </View>
      ) : null}

      <PrimaryButton
        label="Devam Et → Ses Seçimi"
        disabled={files.length === 0 || demoLimitReached}
        onPress={() => navigation.navigate("UploadStep2")}
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
  uploadArea: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.motivationOrange,
    borderRadius: radius.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(191,95,62,0.04)",
  },
  uploadTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    marginTop: spacing.xs,
    textAlign: "center",
  },
  uploadDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  coverArea: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  coverBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.goldTint,
  },
  coverBody: {
    flex: 1,
    gap: 2,
  },
  coverTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  coverDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  coverSelectedRow: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  coverMeta: {
    flex: 1,
    gap: 2,
  },
  coverSelectedLabel: {
    ...typography.caption,
    color: colors.premiumGold,
    fontWeight: "700",
  },
  coverSelectedName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  warning: {
    ...typography.caption,
    color: colors.premiumGold,
  },
  fileSection: {
    gap: spacing.sm,
  },
  fileListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fileListTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  addMore: {
    ...typography.caption,
    color: colors.motivationOrange,
    fontWeight: "700",
  },
  list: {
    gap: spacing.sm,
  },
  fileRow: {
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  fileIcon: {
    marginRight: spacing.md,
  },
  fileMeta: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  fileSize: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  demoLimitCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.premiumGold,
    backgroundColor: colors.goldTint,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  demoLimitText: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: "center",
  },
  demoLimitButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.premiumGold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  demoLimitButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
});
