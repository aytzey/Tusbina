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
  const addFiles = useUploadWizardStore((state) => state.addFiles);
  const removeFile = useUploadWizardStore((state) => state.removeFile);
  const [warning, setWarning] = useState<string | null>(null);

  const canAddMore = files.length < MAX_FILES;
  const remainingSlots = useMemo(() => Math.max(MAX_FILES - files.length, 0), [files.length]);

  const pickPdfFiles = async () => {
    if (!canAddMore) {
      setWarning(`En fazla ${MAX_FILES} PDF ekleyebilirsin.`);
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true
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
      size: asset.size ?? 0
    }));

    if (oversizedCount > 0 && result.assets.length > remainingSlots) {
      setWarning(`50MB üzeri ${oversizedCount} dosya ve limit dışı dosyalar eklenmedi.`);
    } else if (oversizedCount > 0) {
      setWarning(`50MB üzerinde ${oversizedCount} dosya var. Bu dosyalar eklenmedi.`);
    } else if (result.assets.length > remainingSlots) {
      setWarning(`Maksimum ${MAX_FILES} dosya destekleniyor. Fazla dosyalar eklenmedi.`);
    } else if (picked.length === 0) {
      setWarning("Geçerli PDF bulunamadı.");
    } else {
      setWarning(null);
    }

    addFiles(picked);
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${Math.max(0.1, Number(mb.toFixed(1)))} MB`;
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Kaynak Yükle</Text>
      <WizardProgress label="Dosya Seç" step={1} totalSteps={3} />

      {/* Upload Zone */}
      <Pressable style={styles.uploadArea} onPress={() => void pickPdfFiles()}>
        <Ionicons name="document-text" size={40} color={colors.motivationOrange} />
        <Text style={styles.uploadTitle}>PDF dosyalarınızı yükleyin</Text>
        <Text style={styles.uploadDescription}>
          Birden fazla dosya seçebilirsiniz · Maks 50 MB (Demo)
        </Text>
      </Pressable>

      {warning ? <Text style={styles.warning}>{warning}</Text> : null}

      {/* File List */}
      {files.length > 0 && (
        <View style={styles.fileSection}>
          <View style={styles.fileListHeader}>
            <Text style={styles.fileListTitle}>
              Yüklenen Dosyalar ({files.length})
            </Text>
            {canAddMore && (
              <Pressable onPress={() => void pickPdfFiles()}>
                <Text style={styles.addMore}>+ Ekle</Text>
              </Pressable>
            )}
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
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removeFile(file.localId)}
                  hitSlop={8}
                >
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
    gap: spacing.md
  },
  title: {
    ...typography.title,
    color: colors.textPrimary
  },

  /* Upload Zone */
  uploadArea: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.motivationOrange,
    borderRadius: radius.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm
  },
  uploadTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    marginTop: spacing.xs
  },
  uploadDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center"
  },

  /* Warning */
  warning: {
    ...typography.caption,
    color: colors.premiumGold
  },

  /* File Section */
  fileSection: {
    gap: spacing.sm
  },
  fileListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  fileListTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  addMore: {
    ...typography.caption,
    color: colors.motivationOrange,
    fontWeight: "700"
  },

  /* File Row */
  list: {
    gap: spacing.sm
  },
  fileRow: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center"
  },
  fileIcon: {
    marginRight: spacing.md
  },
  fileMeta: {
    flex: 1,
    gap: 2
  },
  fileName: {
    ...typography.body,
    color: colors.textPrimary
  },
  fileSize: {
    ...typography.caption,
    color: colors.textSecondary
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm
  }
});
