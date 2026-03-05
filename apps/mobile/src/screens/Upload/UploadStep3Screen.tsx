import { useMemo } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
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
  const voice = useUploadWizardStore((state) => state.voice);
  const format = useUploadWizardStore((state) => state.format);
  const sections = useUploadWizardStore((state) => state.sections);
  const podcastName = useUploadWizardStore((state) => state.podcastName);
  const setSectionTitle = useUploadWizardStore((state) => state.setSectionTitle);
  const toggleSection = useUploadWizardStore((state) => state.toggleSection);
  const moveSectionUp = useUploadWizardStore((state) => state.moveSectionUp);
  const moveSectionDown = useUploadWizardStore((state) => state.moveSectionDown);
  const setPodcastName = useUploadWizardStore((state) => state.setPodcastName);

  const enabledSections = useMemo(
    () => sections.filter((section) => section.enabled),
    [sections]
  );
  const validEnabledSections = useMemo(
    () => enabledSections.filter((section) => section.title.trim().length > 0),
    [enabledSections]
  );

  const totalEstimatedMinutes = enabledSections.length * 8;

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Önizleme ve Oluştur</Text>
      <WizardProgress label="Önizleme" step={3} totalSteps={3} />

      {/* Podcast Name Input */}
      <View style={styles.nameSection}>
        <Text style={styles.inputLabel}>Podcast Adı (Otomatik Üretildi)</Text>
        <TextInput
          placeholder="Podcast adı"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          value={podcastName}
          onChangeText={setPodcastName}
        />
      </View>

      {/* Section List */}
      <Text style={styles.sectionTitle}>Bölüm Listesi</Text>
      {sections.length === 0 ? (
        <Text style={styles.emptySections}>Bölüm listesi için önce PDF ekle.</Text>
      ) : (
        <View style={styles.sectionList}>
          {sections.map((section, index) => {
            const pageStart = index * 14 + 1;
            const pageEnd = pageStart + 13;
            return (
              <View key={section.id} style={styles.sectionItem}>
                {/* Drag handle */}
                <View style={styles.dragHandle}>
                  <Pressable
                    onPress={() => moveSectionUp(section.id)}
                    disabled={index === 0}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={16}
                      color={index === 0 ? "rgba(255,255,255,0.15)" : colors.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => moveSectionDown(section.id)}
                    disabled={index === sections.length - 1}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={
                        index === sections.length - 1
                          ? "rgba(255,255,255,0.15)"
                          : colors.textSecondary
                      }
                    />
                  </Pressable>
                </View>

                {/* Number Badge */}
                <View
                  style={[
                    styles.numberBadge,
                    section.enabled
                      ? styles.numberBadgeEnabled
                      : styles.numberBadgeDisabled
                  ]}
                >
                  <Text
                    style={[
                      styles.numberBadgeText,
                      section.enabled
                        ? styles.numberBadgeTextEnabled
                        : styles.numberBadgeTextDisabled
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>

                {/* Title + Meta */}
                <View style={styles.sectionContent}>
                  <TextInput
                    style={[
                      styles.sectionInput,
                      !section.enabled && styles.sectionDisabled
                    ]}
                    placeholder="Bölüm adı"
                    placeholderTextColor={colors.textSecondary}
                    value={section.title}
                    onChangeText={(value) => setSectionTitle(section.id, value)}
                  />
                  <Text style={styles.sectionMeta}>
                    ~8 dk - Sayfa {pageStart}-{pageEnd}
                  </Text>
                </View>

                {/* Toggle */}
                <Switch
                  value={section.enabled}
                  onValueChange={() => toggleSection(section.id)}
                  trackColor={{
                    false: "rgba(255,255,255,0.12)",
                    true: colors.motivationOrange
                  }}
                  thumbColor={colors.textPrimary}
                />
              </View>
            );
          })}
        </View>
      )}

      {enabledSections.length > 0 && validEnabledSections.length === 0 ? (
        <Text style={styles.warningText}>
          Aktif bölüm başlıkları boş olamaz.
        </Text>
      ) : null}

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {enabledSections.length} Bölüm | ~{totalEstimatedMinutes}dk |{" "}
          {voice ?? "-"}
        </Text>
      </View>

      <PrimaryButton
        label="Podcast Oluştur"
        disabled={
          !podcastName.trim() ||
          validEnabledSections.length === 0 ||
          files.length === 0 ||
          !voice ||
          !format
        }
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
    gap: spacing.md
  },
  title: {
    ...typography.title,
    color: colors.textPrimary
  },

  /* Podcast Name */
  nameSection: {
    gap: spacing.xs
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceNavy,
    ...typography.body
  },

  /* Section List */
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary
  },
  emptySections: {
    ...typography.caption,
    color: colors.textSecondary
  },
  sectionList: {
    gap: spacing.sm
  },
  sectionItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    gap: spacing.sm
  },

  /* Drag Handle */
  dragHandle: {
    alignItems: "center",
    justifyContent: "center",
    gap: -4
  },

  /* Number Badge */
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  numberBadgeEnabled: {
    backgroundColor: colors.motivationOrange
  },
  numberBadgeDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)"
  },
  numberBadgeText: {
    fontSize: 13,
    fontWeight: "700"
  },
  numberBadgeTextEnabled: {
    color: colors.textPrimary
  },
  numberBadgeTextDisabled: {
    color: colors.textSecondary
  },

  /* Section Content */
  sectionContent: {
    flex: 1,
    gap: 2
  },
  sectionInput: {
    height: 32,
    borderRadius: radius.sm,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.body,
    fontWeight: "600"
  },
  sectionDisabled: {
    color: colors.textSecondary,
    opacity: 0.6
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm
  },

  /* Warning */
  warningText: {
    ...typography.caption,
    color: colors.premiumGold
  },

  /* Summary Bar */
  summaryBar: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center"
  },
  summaryText: {
    ...typography.body,
    color: colors.motivationOrange,
    fontWeight: "700"
  }
});
