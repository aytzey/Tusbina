import { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, ScreenContainer, WizardProgress } from "@/components";
import { UploadFileItem } from "@/domain/models";
import { RootStackParamList } from "@/navigation/types";
import { useUploadWizardStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const MAX_FILES = 4;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export function UploadStep1Screen() {
  const navigation = useNavigation<Navigation>();
  const files = useUploadWizardStore((state) => state.files);
  const coverImage = useUploadWizardStore((state) => state.coverImage);
  const addFiles = useUploadWizardStore((state) => state.addFiles);
  const removeFile = useUploadWizardStore((state) => state.removeFile);
  const setCoverImage = useUploadWizardStore((state) => state.setCoverImage);
  const [warning, setWarning] = useState<string | null>(null);

  const canAddMore = files.length < MAX_FILES;
  const remainingSlots = useMemo(() => Math.max(MAX_FILES - files.length, 0), [files.length]);

  const pickSourceFiles = async () => {
    if (!canAddMore) {
      setWarning(`En fazla ${MAX_FILES} belge ekleyebilirsin.`);
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "text/plain"],
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
      setWarning("Geçerli bir PDF veya metin dosyası seçilmedi.");
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
        <Text style={styles.uploadTitle}>PDF veya metin dosyalarını yükle</Text>
        <Text style={styles.uploadDescription}>
          Sistem belgeyi otomatik bölümlendirip içerikten bölüm isimleri üretecek.
        </Text>
      </Pressable>

      <Pressable style={styles.coverArea} onPress={() => void pickCoverImage()}>
        <View style={styles.coverBadge}>
          <Ionicons name="image-outline" size={18} color={colors.premiumGold} />
        </View>
        <View style={styles.coverBody}>
          <Text style={styles.coverTitle}>Kapak görseli ekle (opsiyonel)</Text>
          <Text style={styles.coverDescription}>
            Yüklersen mevcut görsel kullanılır, yüklemezsen sistem otomatik kapak üretir.
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

      <PrimaryButton
        label="Devam Et → Ses Seçimi"
        disabled={files.length === 0}
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
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.motivationOrange,
    borderRadius: radius.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
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
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  coverBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(189,148,101,0.14)",
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
    backgroundColor: colors.surfaceNavy,
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
    ...typography.body,
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
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
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
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
});
