import { useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components";
import { useLearningToolsStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
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

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Çalışma Araçları</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Günlük dinleme hedefi</Text>
        <Text style={styles.cardMeta}>
          Bugün {formatDuration(todayListenedSec)} dinledin. Hedefin {dailyGoalMin} dakika.
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as const }]} />
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ders planı</Text>
        <Text style={styles.cardMeta}>Bugün hangi başlıkları dinleyeceğini not et.</Text>
        <TextInput
          multiline
          value={studyPlan}
          onChangeText={setStudyPlan}
          style={styles.planInput}
          placeholder="Örn. Kardiyoloji tekrar, farmakoloji vaka özeti..."
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Kronometre</Text>
        <Text style={styles.stopwatchValue}>{formatTimer(stopwatchSec)}</Text>
        <Text style={styles.cardMeta}>Odak süreni takip etmek için başlat, durdur veya sıfırla.</Text>
        <View style={styles.stopwatchActions}>
          <Pressable
            style={[styles.actionButton, stopwatchRunning && styles.actionButtonMuted]}
            disabled={stopwatchRunning}
            onPress={startStopwatch}
          >
            <Text style={styles.actionLabel}>Başlat</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, !stopwatchRunning && styles.actionButtonMuted]}
            disabled={!stopwatchRunning}
            onPress={pauseStopwatch}
          >
            <Text style={styles.actionLabel}>Durdur</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={resetStopwatch}>
            <Text style={styles.secondaryLabel}>Sıfırla</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
  },
  goalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  goalChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  goalChipSelected: {
    borderColor: colors.motivationOrange,
    backgroundColor: "rgba(191,95,62,0.18)",
  },
  goalChipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  goalChipLabelSelected: {
    color: colors.textPrimary,
  },
  planInput: {
    minHeight: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    color: colors.textPrimary,
    padding: spacing.md,
    textAlignVertical: "top",
    ...typography.body,
  },
  stopwatchValue: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  stopwatchActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  actionButtonMuted: {
    opacity: 0.35,
  },
  actionLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
});
