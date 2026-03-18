import { useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedProgressRing, RollingNumber, ScreenContainer } from "@/components";
import { useLearningToolsStore } from "@/state/stores";
import { colors, fw, radius, spacing, typography } from "@/theme";
import { formatDuration, formatTimer } from "@/utils";

const GOAL_OPTIONS = [15, 30, 45, 60];

export function StudyToolsScreen() {
  const dailyGoalMin = useLearningToolsStore((state) => state.dailyGoalMin);
  const todayListenedSec = useLearningToolsStore((state) => state.todayListenedSec);
  const studyPlan = useLearningToolsStore((state) => state.studyPlan);
  const stopwatchSec = useLearningToolsStore((state) => state.stopwatchSec);
  const stopwatchRunning = useLearningToolsStore((state) => state.stopwatchRunning);
  const setDailyGoalMin = useLearningToolsStore((state) => state.setDailyGoalMin);
  const setStudyPlan = useLearningToolsStore((state) => state.setStudyPlan);
  const resetTodayIfNeeded = useLearningToolsStore((state) => state.resetTodayIfNeeded);
  const startStopwatch = useLearningToolsStore((state) => state.startStopwatch);
  const pauseStopwatch = useLearningToolsStore((state) => state.pauseStopwatch);
  const resetStopwatch = useLearningToolsStore((state) => state.resetStopwatch);

  useEffect(() => {
    resetTodayIfNeeded();
  }, [resetTodayIfNeeded]);

  const goalSec = dailyGoalMin * 60;
  const progressPct = Math.min(100, Math.round((todayListenedSec / goalSec) * 100));
  const goalComplete = progressPct >= 100;

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* ── Daily Goal ── */}
      <View style={[styles.card, styles.goalCard]}>
        <View style={styles.goalTop}>
          <AnimatedProgressRing
            progress={progressPct}
            size={96}
            strokeWidth={6}
          >
            <RollingNumber
              value={progressPct}
              prefix="%"
              style={styles.ringPercent}
            />
          </AnimatedProgressRing>
          <View style={styles.goalInfo}>
            <Text style={styles.goalLabel}>GÜNLÜK HEDEF</Text>
            <Text style={styles.goalTimeValue}>
              {formatDuration(todayListenedSec)}
              <Text style={styles.goalTimeDim}> / {dailyGoalMin} dk</Text>
            </Text>
            <Text style={styles.goalStatus}>
              {goalComplete
                ? "Bugünkü hedef tamamlandı!"
                : `${formatDuration(Math.max(0, goalSec - todayListenedSec))} kaldı`}
            </Text>
          </View>
        </View>
        <View style={styles.goalRow}>
          {GOAL_OPTIONS.map((minutes) => {
            const selected = dailyGoalMin === minutes;
            return (
              <Pressable
                key={minutes}
                style={[styles.goalChip, selected && styles.goalChipSelected]}
                onPress={() => setDailyGoalMin(minutes)}
              >
                <Text style={[styles.goalChipLabel, selected && styles.goalChipLabelSelected]}>{minutes} dk</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Stopwatch ── */}
      <View style={[styles.card, styles.stopwatchCard]}>
        <View style={styles.stopwatchHeader}>
          <Ionicons name="timer-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.cardLabel}>KRONOMETRE</Text>
        </View>
        <Text style={[styles.stopwatchValue, stopwatchRunning && styles.stopwatchValueActive]}>
          {formatTimer(stopwatchSec)}
        </Text>
        <View style={styles.stopwatchActions}>
          {stopwatchRunning ? (
            <Pressable
              style={[styles.stopwatchBtn, styles.stopwatchBtnPause]}
              onPress={pauseStopwatch}
            >
              <Ionicons name="pause" size={18} color={colors.textPrimary} />
              <Text style={styles.stopwatchBtnLabel}>Durdur</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.stopwatchBtn, styles.stopwatchBtnPlay]}
              onPress={startStopwatch}
            >
              <Ionicons name="play" size={18} color={colors.textPrimary} />
              <Text style={styles.stopwatchBtnLabel}>{stopwatchSec > 0 ? "Devam" : "Başlat"}</Text>
            </Pressable>
          )}
          {stopwatchSec > 0 ? (
            <Pressable
              style={[styles.stopwatchBtn, styles.stopwatchBtnReset]}
              onPress={resetStopwatch}
            >
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              <Text style={styles.stopwatchBtnLabelMuted}>Sıfırla</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Study Plan ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.cardLabel}>DERS PLANI</Text>
        </View>
        <Text style={styles.cardMeta}>Bugün hangi başlıkları dinleyeceğini not et.</Text>
        <TextInput
          multiline
          value={studyPlan}
          onChangeText={setStudyPlan}
          style={styles.planInput}
          placeholder="Örn. Kardiyoloji tekrar, farmakoloji vaka özeti..."
          placeholderTextColor={colors.textTertiary}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardLabel: {
    ...typography.small,
    color: colors.textSecondary,
    ...fw.semiBold,
    letterSpacing: 0.5,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ── Goal ── */
  goalCard: {
    gap: spacing.lg,
  },
  goalTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  goalInfo: {
    flex: 1,
    gap: 3,
  },
  goalLabel: {
    ...typography.small,
    color: colors.textSecondary,
    ...fw.semiBold,
    letterSpacing: 0.5,
  },
  goalTimeValue: {
    ...typography.h3,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"] as const,
    fontSize: 20,
  },
  goalTimeDim: {
    color: colors.textSecondary,
    ...fw.regular,
    fontSize: 14,
  },
  goalStatus: {
    ...typography.caption,
    color: colors.motivationOrange,
  },
  ringPercent: {
    ...typography.caption,
    color: colors.motivationOrange,
    ...fw.extraBold,
    fontSize: 18,
    fontVariant: ["tabular-nums"] as const,
  },
  goalRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  goalChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
  },
  goalChipSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.orangeTint,
  },
  goalChipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    ...fw.bold,
  },
  goalChipLabelSelected: {
    color: colors.motivationOrange,
  },

  /* ── Stopwatch ── */
  stopwatchCard: {
    alignItems: "center",
  },
  stopwatchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
  },
  stopwatchValue: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "800",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"] as const,
    letterSpacing: -1,
    fontFamily: "Jakarta-ExtraBold",
  },
  stopwatchValueActive: {
    color: colors.motivationOrange,
  },
  stopwatchActions: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
  },
  stopwatchBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  stopwatchBtnPlay: {
    backgroundColor: colors.motivationOrange,
  },
  stopwatchBtnPause: {
    backgroundColor: colors.cardBgElevated,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
  },
  stopwatchBtnReset: {
    backgroundColor: colors.cardBgElevated,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  stopwatchBtnLabel: {
    ...typography.body,
    color: colors.textPrimary,
    ...fw.bold,
    fontSize: 15,
  },
  stopwatchBtnLabelMuted: {
    ...typography.body,
    color: colors.textSecondary,
    ...fw.semiBold,
    fontSize: 15,
  },

  /* ── Plan ── */
  planInput: {
    minHeight: 120,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    color: colors.textPrimary,
    padding: spacing.md,
    textAlignVertical: "top",
    ...typography.input,
    backgroundColor: colors.cardBgElevated,
  },
});
