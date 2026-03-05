import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { usePlayerStore, useQuizStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

const LETTERS = ["A", "B", "C", "D", "E"];

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type QuizRoute = RouteProp<RootStackParamList, "Quiz">;

export function QuizScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<QuizRoute>();
  const podcastId = route.params.podcastId;
  const activeTrack = usePlayerStore((state) => state.activeTrack);
  const currentPartId =
    activeTrack?.sourceType === "ai" && activeTrack.parentId === podcastId ? activeTrack.id : undefined;
  const currentPartTitle =
    activeTrack?.sourceType === "ai" && activeTrack.parentId === podcastId ? activeTrack.title : undefined;

  const questions = useQuizStore((state) => state.questions);
  const index = useQuizStore((state) => state.index);
  const answers = useQuizStore((state) => state.answers);
  const loading = useQuizStore((state) => state.loading);
  const generating = useQuizStore((state) => state.generating);
  const error = useQuizStore((state) => state.error);
  const loadQuiz = useQuizStore((state) => state.loadQuiz);
  const generateQuiz = useQuizStore((state) => state.generateQuiz);
  const next = useQuizStore((state) => state.next);
  const prev = useQuizStore((state) => state.prev);
  const answerQuestion = useQuizStore((state) => state.answerQuestion);

  useEffect(() => {
    if (currentPartId) {
      void generateQuiz(podcastId, currentPartId);
      return;
    }
    void loadQuiz(podcastId);
  }, [currentPartId, generateQuiz, loadQuiz, podcastId]);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(questions.length - 1, 0));
  const current = questions[safeIndex];
  const selected = current ? answers[current.id] : undefined;
  const progressPct = questions.length > 0 ? ((safeIndex + 1) / questions.length) * 100 : 0;
  const answeredCount = Object.keys(answers).length;

  const isCorrect = useMemo(() => {
    if (!current || selected === undefined) return null;
    return selected === current.correct_index;
  }, [current, selected]);

  // Loading state
  if (loading || generating) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={colors.motivationOrange} />
        <Text style={styles.loadingText}>
          {generating ? "Sorular AI ile üretiliyor..." : "Sorular yükleniyor..."}
        </Text>
      </ScreenContainer>
    );
  }

  // No questions — offer to generate
  if (questions.length === 0) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <View style={styles.emptyIcon}>
          <Ionicons name="help-circle-outline" size={48} color={colors.motivationOrange} />
        </View>
        <Text style={styles.emptyTitle}>
          {error ?? "Bu podcast için henüz quiz oluşturulmamış."}
        </Text>
        <Text style={styles.emptySubtitle}>
          {currentPartTitle
            ? `AI, aktif bolumden (${currentPartTitle}) TUS formatinda soru uretir.`
            : "AI ile podcast içeriğinden TUS formatında sorular üretilebilir."}
        </Text>
        <PrimaryButton
          label="Quiz Oluştur"
          onPress={() => void generateQuiz(podcastId, currentPartId)}
        />
      </ScreenContainer>
    );
  }

  const correctLetter = LETTERS[current.correct_index];
  const correctOptionText = current.options[current.correct_index];

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* Source badge */}
      <View style={styles.sourceBadge}>
        <Ionicons name="document-text" size={14} color={colors.success} />
        <Text style={styles.sourceBadgeText}>
          {currentPartTitle ? `${currentPartTitle} - Bolum Kaynagi` : `${current.category} - Kaynak Dosya`}
        </Text>
      </View>

      {/* Question number + score */}
      <View style={styles.questionHeader}>
        <View style={styles.questionBadge}>
          <Text style={styles.questionBadgeText}>Soru {safeIndex + 1}</Text>
        </View>
        <Text style={styles.scoreText}>
          {answeredCount}/{questions.length} cevaplandı
        </Text>
      </View>

      {/* Progress bar */}
      <ProgressBar progress={progressPct} />

      {/* Question card */}
      <View style={styles.questionCard}>
        <Text style={styles.questionText}>{current.question}</Text>
      </View>

      {/* Answer options */}
      <View style={styles.options}>
        {current.options.map((option, optionIndex) => {
          const isSelected = selected === optionIndex;
          const isCorrectOption = optionIndex === current.correct_index;
          const isWrongSelection = selected !== undefined && isSelected && !isCorrectOption;
          const isCorrectSelection = selected !== undefined && isCorrectOption;

          return (
            <Pressable
              key={`${current.id}-${optionIndex}`}
              style={[
                styles.option,
                isSelected && !isCorrectSelection && !isWrongSelection && styles.optionSelected,
                isCorrectSelection && styles.optionCorrect,
                isWrongSelection && styles.optionWrong
              ]}
              onPress={() => {
                if (selected === undefined) {
                  answerQuestion(current.id, optionIndex);
                }
              }}
            >
              <View
                style={[
                  styles.letterCircle,
                  isCorrectSelection && styles.letterCircleCorrect,
                  isWrongSelection && styles.letterCircleWrong
                ]}
              >
                {isCorrectSelection ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : isWrongSelection ? (
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                ) : (
                  <Text style={styles.letterText}>{LETTERS[optionIndex]}</Text>
                )}
              </View>
              <Text style={styles.optionLabel}>{option}</Text>
              {isCorrectSelection && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.success}
                  style={styles.optionTrailingIcon}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Explanation card */}
      {selected !== undefined && (
        <View style={styles.explanationCard}>
          <Text style={styles.explanationTitle}>
            Doğru Cevap: {correctLetter} - {correctOptionText}
          </Text>
          <Text style={styles.explanationText}>
            {current.explanation}
          </Text>
        </View>
      )}

      {/* Bottom navigation */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.navBtnOutlined, safeIndex === 0 && styles.navBtnDisabled]}
          disabled={safeIndex === 0}
          onPress={prev}
        >
          <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
          <Text style={styles.navBtnOutlinedLabel}>Önceki</Text>
        </Pressable>

        <Text style={styles.footerCounter}>
          {safeIndex + 1} / {questions.length}
        </Text>

        {safeIndex === questions.length - 1 ? (
          <Pressable
            style={styles.navBtnFilled}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.navBtnFilledLabel}>Bitir</Text>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable
            style={styles.navBtnFilled}
            onPress={next}
          >
            <Text style={styles.navBtnFilledLabel}>Sonraki</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md
  },

  /* Loading */
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center"
  },

  /* Empty state */
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(191,95,62,0.15)",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center"
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center"
  },

  /* Source badge */
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(46,158,87,0.15)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill
  },
  sourceBadgeText: {
    ...typography.caption,
    color: colors.success
  },

  /* Question header */
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  questionBadge: {
    backgroundColor: colors.surfaceNavy,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill
  },
  questionBadgeText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  scoreText: {
    ...typography.caption,
    color: colors.textSecondary
  },

  /* Question card */
  questionCard: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.lg
  },
  questionText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 24
  },

  /* Options */
  options: {
    gap: spacing.sm
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md,
    gap: spacing.md
  },
  optionSelected: {
    borderColor: colors.motivationOrange
  },
  optionCorrect: {
    borderColor: colors.success,
    backgroundColor: "rgba(46,158,87,0.12)"
  },
  optionWrong: {
    borderColor: colors.danger,
    backgroundColor: "rgba(214,69,69,0.10)"
  },
  letterCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  letterCircleCorrect: {
    backgroundColor: colors.success
  },
  letterCircleWrong: {
    backgroundColor: colors.danger
  },
  letterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700"
  },
  optionLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  },
  optionTrailingIcon: {
    marginLeft: "auto"
  },

  /* Explanation card */
  explanationCard: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    padding: spacing.lg,
    gap: spacing.sm
  },
  explanationTitle: {
    ...typography.caption,
    color: colors.success,
    fontWeight: "700",
    fontSize: 14
  },
  explanationText: {
    ...typography.body,
    color: colors.textSecondary
  },

  /* Footer */
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm
  },
  navBtnOutlined: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider
  },
  navBtnOutlinedLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600"
  },
  footerCounter: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: "600"
  },
  navBtnFilled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange
  },
  navBtnFilledLabel: {
    ...typography.body,
    color: "#FFFFFF",
    fontWeight: "700"
  },
  navBtnDisabled: {
    opacity: 0.4
  }
});
