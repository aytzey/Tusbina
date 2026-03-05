import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, ScreenContainer, WizardProgress } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useUploadWizardStore } from "@/state/stores";
import { PodcastFormat } from "@/domain/models";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface VoiceOption {
  key: string;
  label: string;
  subtitle: string;
}

const voiceOptions: VoiceOption[] = [
  {
    key: "Elif",
    label: "Elif - Öğretici",
    subtitle: "Sıcak, samimi ve anlaşılır bir kadın sesi"
  },
  {
    key: "Ahmet",
    label: "Ahmet - Profesyonel",
    subtitle: "Güvenilir, net ve akademik bir erkek sesi"
  },
  {
    key: "Zeynep",
    label: "Zeynep - Enerjik",
    subtitle: "Canlı, dinamik ve motive eden bir kadın sesi"
  },
  {
    key: "Diyalog",
    label: "Diyalog - Elif & Ahmet",
    subtitle: "İki kişi arasında soru-cevap formatı"
  }
];

interface FormatOption {
  key: PodcastFormat;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const formatOptions: FormatOption[] = [
  { key: "narrative", label: "Anlatım", icon: "book-outline" },
  { key: "summary", label: "Özet", icon: "list-outline" },
  { key: "qa", label: "Soru-Cevap", icon: "help-circle-outline" }
];

export function UploadStep2Screen() {
  const navigation = useNavigation<Navigation>();
  const voice = useUploadWizardStore((state) => state.voice);
  const format = useUploadWizardStore((state) => state.format);
  const setVoice = useUploadWizardStore((state) => state.setVoice);
  const setFormat = useUploadWizardStore((state) => state.setFormat);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Ses & Format Seçimi</Text>
      <WizardProgress label="Ses ve Format" step={2} totalSteps={3} />

      {/* Voice Selection */}
      <Text style={styles.sectionTitle}>Seslendirici Seçin</Text>
      <View style={styles.voiceGroup}>
        {voiceOptions.map((option) => {
          const isSelected = voice === option.key;
          return (
            <Pressable
              key={option.key}
              style={[styles.voiceOption, isSelected && styles.voiceOptionSelected]}
              onPress={() => setVoice(option.key)}
            >
              <View style={styles.voiceLeft}>
                <View
                  style={[
                    styles.voiceIconWrap,
                    isSelected && styles.voiceIconWrapSelected
                  ]}
                >
                  <Ionicons
                    name="mic"
                    size={20}
                    color={isSelected ? colors.motivationOrange : colors.textSecondary}
                  />
                </View>
                <View style={styles.voiceText}>
                  <Text style={styles.voiceLabel}>{option.label}</Text>
                  <Text style={styles.voiceSubtitle}>{option.subtitle}</Text>
                </View>
              </View>
              <Pressable hitSlop={8}>
                <Ionicons
                  name="play-circle-outline"
                  size={28}
                  color={isSelected ? colors.motivationOrange : colors.textSecondary}
                />
              </Pressable>
            </Pressable>
          );
        })}
      </View>

      {/* Format Selection */}
      <Text style={styles.sectionTitle}>İçerik Formatı</Text>
      <View style={styles.formatRow}>
        {formatOptions.map((item) => {
          const isSelected = format === item.key;
          return (
            <Pressable
              key={item.key}
              style={[styles.formatCard, isSelected && styles.formatCardSelected]}
              onPress={() => setFormat(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={24}
                color={isSelected ? colors.textPrimary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.formatLabel,
                  isSelected && styles.formatLabelSelected
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton
        label="Devam Et → Önizleme"
        disabled={!voice || !format}
        onPress={() => navigation.navigate("UploadStep3")}
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
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginTop: spacing.sm
  },

  /* Voice Options */
  voiceGroup: {
    gap: spacing.sm
  },
  voiceOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md
  },
  voiceOptionSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: "rgba(191,95,62,0.12)"
  },
  voiceLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.md
  },
  voiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  voiceIconWrapSelected: {
    backgroundColor: "rgba(191,95,62,0.2)"
  },
  voiceText: {
    flex: 1,
    gap: 2
  },
  voiceLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600"
  },
  voiceSubtitle: {
    ...typography.caption,
    color: colors.textSecondary
  },

  /* Format Cards */
  formatRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  formatCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.sm
  },
  formatCardSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.motivationOrange
  },
  formatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600"
  },
  formatLabelSelected: {
    color: colors.textPrimary
  }
});
