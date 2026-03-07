import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { PrimaryButton, ScreenContainer, WizardProgress } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useCoursesStore, useUploadWizardStore } from "@/state/stores";
import { PodcastFormat } from "@/domain/models";
import { resolveReachableApiUrl } from "@/services/api/baseUrl";
import { colors, radius, spacing, typography } from "@/theme";
import { safeAudioPlayerCall } from "@/utils/audioPlayer";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface VoiceOption {
  key: string;
  label: string;
  subtitle: string;
}

const voiceOptions: VoiceOption[] = [
  {
    key: "Elif",
    label: "Elif · Öğretici",
    subtitle: "Sıcak, samimi ve anlaşılır bir kadın sesi",
  },
  {
    key: "Ahmet",
    label: "Ahmet · Profesyonel",
    subtitle: "Güvenilir, net ve akademik bir erkek sesi",
  },
  {
    key: "Zeynep",
    label: "Zeynep · Enerjik",
    subtitle: "Canlı, motive eden ve tempolu bir anlatım",
  },
  {
    key: "Diyalog",
    label: "Diyalog · Elif & Ahmet",
    subtitle: "İki kişi arasında soru-cevap akışı",
  },
  {
    key: "Emel Neural",
    label: "Emel Neural · Gerçekçi",
    subtitle: "Daha doğal vurgu ve akıcı anlatım",
  },
  {
    key: "Ahmet Neural",
    label: "Ahmet Neural · Derin Ton",
    subtitle: "Daha tok ve net erkek sesi",
  },
  {
    key: "Diyalog Neural",
    label: "Diyalog Neural · Emel & Ahmet",
    subtitle: "Neural kadın/erkek ikili diyalog akışı",
  },
];

interface FormatOption {
  key: PodcastFormat;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const formatOptions: FormatOption[] = [
  { key: "narrative", label: "Anlatım", icon: "book-outline" },
  { key: "summary", label: "Özet", icon: "list-outline" },
  { key: "qa", label: "Soru-Cevap", icon: "help-circle-outline" },
];

export function UploadStep2Screen() {
  const navigation = useNavigation<Navigation>();
  const voice = useUploadWizardStore((state) => state.voice);
  const format = useUploadWizardStore((state) => state.format);
  const courseId = useUploadWizardStore((state) => state.courseId);
  const setVoice = useUploadWizardStore((state) => state.setVoice);
  const setFormat = useUploadWizardStore((state) => state.setFormat);
  const setCourseId = useUploadWizardStore((state) => state.setCourseId);
  const courses = useCoursesStore((state) => state.courses);

  const previewPlayer = useAudioPlayer(undefined, { updateInterval: 250, downloadFirst: true });
  const previewStatus = useAudioPlayerStatus(previewPlayer);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      safeAudioPlayerCall(() => {
        previewPlayer.pause();
      });
    };
  }, [previewPlayer]);

  const handlePreview = async (voiceKey: string) => {
    setPreviewError(null);

    if (previewingVoice === voiceKey && previewStatus.playing) {
      safeAudioPlayerCall(() => {
        previewPlayer.pause();
      });
      setPreviewingVoice(null);
      return;
    }

    if (previewStatus.playing) {
      safeAudioPlayerCall(() => {
        previewPlayer.pause();
      });
      setPreviewingVoice(null);
    }

    try {
      const previewUrl = await resolveReachableApiUrl(`/voices/${encodeURIComponent(voiceKey)}/preview`);
      safeAudioPlayerCall(() => {
        previewPlayer.replace(previewUrl);
        previewPlayer.play();
      });
      setPreviewingVoice(voiceKey);
    } catch (error) {
      setPreviewingVoice(null);
      setPreviewError(error instanceof Error ? error.message : "Ses örneği başlatılamadı.");
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Ses ve Format Seçimi</Text>
      <WizardProgress label="Ses ve Format" step={2} totalSteps={3} />

      <Text style={styles.sectionTitle}>Seslendirici seçin</Text>
      <Text style={styles.sectionDescription}>
        Her sesin kısa örneğini dinleyerek sana en uygun anlatımı seçebilirsin.
      </Text>

      <View style={styles.voiceGroup}>
        {voiceOptions.map((option) => {
          const isSelected = voice === option.key;
          const isPreviewing = previewingVoice === option.key && previewStatus.playing;
          return (
            <Pressable
              key={option.key}
              style={[styles.voiceOption, isSelected && styles.voiceOptionSelected]}
              onPress={() => { setVoice(option.key); setValidationError(null); }}
            >
              <View style={styles.voiceLeft}>
                <View style={[styles.voiceIconWrap, isSelected && styles.voiceIconWrapSelected]}>
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
              <Pressable
                hitSlop={8}
                onPress={() => void handlePreview(option.key)}
                style={styles.previewButton}
              >
                <Ionicons
                  name={isPreviewing ? "pause-circle" : "play-circle-outline"}
                  size={32}
                  color={isSelected || isPreviewing ? colors.motivationOrange : colors.textSecondary}
                />
              </Pressable>
            </Pressable>
          );
        })}
      </View>

      {previewError ? <Text style={styles.warning}>{previewError}</Text> : null}

      <Text style={styles.sectionTitle}>İçerik formatı</Text>
      <View style={styles.formatRow}>
        {formatOptions.map((item) => {
          const isSelected = format === item.key;
          return (
            <Pressable
              key={item.key}
              style={[styles.formatCard, isSelected && styles.formatCardSelected]}
              onPress={() => { setFormat(item.key); setValidationError(null); }}
            >
              <Ionicons
                name={item.icon}
                size={24}
                color={isSelected ? colors.textPrimary : colors.textSecondary}
              />
              <Text style={[styles.formatLabel, isSelected && styles.formatLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* --- Course Association --- */}
      {courses.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Ders ile ilişkilendir (isteğe bağlı)</Text>
          <View style={styles.courseGroup}>
            <Pressable
              style={[styles.courseChip, !courseId && styles.courseChipSelected]}
              onPress={() => setCourseId(null)}
            >
              <Text style={[styles.courseChipLabel, !courseId && styles.courseChipLabelSelected]}>Bağımsız</Text>
            </Pressable>
            {courses.map((course) => {
              const isSelected = courseId === course.id;
              return (
                <Pressable
                  key={course.id}
                  style={[styles.courseChip, isSelected && styles.courseChipSelected]}
                  onPress={() => setCourseId(course.id)}
                >
                  <Text style={[styles.courseChipLabel, isSelected && styles.courseChipLabelSelected]} numberOfLines={1}>
                    {course.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {validationError ? <Text style={styles.warning}>{validationError}</Text> : null}

      <PrimaryButton
        label={!format ? "İçerik formatı seçiniz" : "Devam Et → İçerik Planla"}
        disabled={!voice || !format}
        onPress={() => {
          setValidationError(null);
          safeAudioPlayerCall(() => {
            previewPlayer.pause();
          });
          setPreviewingVoice(null);
          navigation.navigate("UploadStep3");
        }}
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
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  sectionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  voiceGroup: {
    gap: spacing.sm,
  },
  voiceOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.cardBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  voiceOptionSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.orangeTint,
  },
  voiceLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
  },
  voiceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  voiceIconWrapSelected: {
    backgroundColor: colors.orangeTint,
  },
  voiceText: {
    flex: 1,
    gap: 2,
  },
  voiceLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  voiceSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewButton: {
    paddingLeft: spacing.sm,
  },
  warning: {
    ...typography.caption,
    color: colors.premiumGold,
  },
  formatRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formatCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.cardBg,
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  formatCardSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.motivationOrange,
  },
  formatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  formatLabelSelected: {
    color: colors.textPrimary,
  },
  courseGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  courseChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  courseChipSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.orangeTint,
  },
  courseChipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  courseChipLabelSelected: {
    color: colors.motivationOrange,
    fontWeight: "600",
  },
});
