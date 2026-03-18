import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedProgressRing, RollingNumber, ScreenContainer } from "@/components";
import {
  useAuthStore,
  useCoursesStore,
  useLearningToolsStore,
  usePlayerStore,
  useUserStore,
} from "@/state/stores";
import { StaggerView, colors, fw, radius, spacing, typography } from "@/theme";
import { formatDuration, getSpecialtyColor, getSpecialtyIcon } from "@/utils";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "İyi Geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi Günler";
  return "İyi Akşamlar";
}

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const authUser = useAuthStore((s) => s.user);
  const courses = useCoursesStore((s) => s.courses);
  const selectCourse = useCoursesStore((s) => s.selectCourse);
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const user = useUserStore((s) => s.user);
  const dailyGoalMin = useLearningToolsStore((s) => s.dailyGoalMin);
  const todayListenedSec = useLearningToolsStore((s) => s.todayListenedSec);

  const displayName = useMemo(
    () => authUser?.user_metadata?.display_name || authUser?.email?.split("@")[0] || "Doktor",
    [authUser?.email, authUser?.user_metadata?.display_name],
  );

  const greeting = useMemo(() => getGreeting(), []);
  const dailyGoalSec = dailyGoalMin * 60;
  const dailyGoalProgress =
    dailyGoalSec > 0 ? Math.min(100, Math.round((todayListenedSec / dailyGoalSec) * 100)) : 0;
  const remainingGoalSec = Math.max(0, dailyGoalSec - todayListenedSec);
  const goalComplete = remainingGoalSec === 0 && dailyGoalSec > 0;

  const continueItem = useMemo(() => {
    if (activeTrack) {
      return {
        type: "track" as const,
        title: activeTrack.title,
        subtitle: `${activeTrack.subtitle} · ${formatDuration(Math.max(0, activeTrack.durationSec - positionSec))} kaldı`,
      };
    }
    for (const course of courses) {
      const inProgress = course.parts.find((p) => p.status === "inProgress");
      if (inProgress) {
        return {
          type: "course" as const,
          courseId: course.id,
          title: `${course.title} - ${inProgress.title}`,
          subtitle: `${formatDuration(Math.max(0, inProgress.durationSec - inProgress.lastPositionSec))} kaldı`,
        };
      }
    }
    return null;
  }, [activeTrack, courses, positionSec]);

  const handleContinue = () => {
    if (continueItem?.type === "track") {
      navigation.navigate("Player");
    } else if (continueItem?.type === "course") {
      navigation.navigate("CourseDetail", { courseId: continueItem.courseId });
    }
  };

  const openCourse = async (courseId: string) => {
    await selectCourse(courseId);
    navigation.navigate("CourseDetail", { courseId });
  };

  let sectionIndex = 0;

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* ── Header ── */}
      <StaggerView index={sectionIndex++} style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require("../../../assets/logo.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerBrand}>TUSBINA</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.notifButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
          onPress={() => navigation.navigate("Notifications")}
        >
          <Ionicons name="sync-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </StaggerView>

      {/* ── Greeting ── */}
      <StaggerView index={sectionIndex++} style={styles.greetingBlock}>
        <Text style={styles.greeting}>{greeting},</Text>
        <Text style={styles.greetingName}>{displayName}</Text>
        <Text style={styles.greetingSub}>Bugün ne dinlemek istersin?</Text>
      </StaggerView>

      {/* ── Goal Card with Progress Ring ── */}
      <StaggerView index={sectionIndex++}>
        <Pressable
          style={({ pressed }) => [styles.goalCard, goalComplete && styles.goalCardComplete, pressed && { opacity: 0.9 }]}
          onPress={() => navigation.navigate("StudyTools")}
        >
          <View style={styles.goalLeft}>
            <AnimatedProgressRing
              progress={dailyGoalProgress}
              size={72}
              strokeWidth={5}
              breathing={isPlaying}
            >
              <RollingNumber
                value={dailyGoalProgress}
                prefix="%"
                style={styles.ringPercent}
              />
            </AnimatedProgressRing>
          </View>

          <View style={styles.goalRight}>
            <Text style={styles.goalLabel}>Günlük Hedef</Text>
            <Text style={styles.goalTime}>
              {formatDuration(todayListenedSec)}
              <Text style={styles.goalTimeDim}> / {dailyGoalMin} dk</Text>
            </Text>
            <Text style={styles.goalHint}>
              {goalComplete
                ? "Bugünkü hedef tamamlandı!"
                : `${formatDuration(remainingGoalSec)} kaldı`}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
      </StaggerView>

      {/* ── Continue Listening ── */}
      {continueItem ? (
        <StaggerView index={sectionIndex++}>
          <Pressable
            style={({ pressed }) => [styles.continueCard, pressed && { opacity: 0.9 }]}
            onPress={handleContinue}
          >
            <View style={styles.continuePlay}>
              <Ionicons name="play" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.continueInfo}>
              <Text style={styles.continueLabel}>Kaldığın yerden</Text>
              <Text style={styles.continueTitle} numberOfLines={1}>
                {continueItem.title}
              </Text>
              <Text style={styles.continueSub} numberOfLines={1}>
                {continueItem.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </StaggerView>
      ) : null}

      {/* ── Quick Actions ── */}
      <StaggerView index={sectionIndex++} style={styles.quickActions}>
        <Pressable
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.8 }]}
          onPress={() => navigation.navigate("CoursesTab")}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.greenTint }]}>
            <Ionicons name="book-outline" size={20} color={colors.success} />
          </View>
          <View style={styles.quickActionText}>
            <RollingNumber value={courses.length} style={styles.quickActionValue} />
            <Text style={styles.quickActionLabel}>Ders</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.8 }]}
          onPress={() => navigation.navigate("UploadTab")}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.goldTint }]}>
            <Ionicons name="add-outline" size={22} color={colors.premiumGold} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionValue}>Yükle</Text>
            <Text style={styles.quickActionLabel}>PDF</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.8 }]}
          onPress={() => navigation.navigate("Notifications")}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.blueTint }]}>
            <Ionicons name="sync-outline" size={20} color={colors.info} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionValue}>Durum</Text>
            <Text style={styles.quickActionLabel}>İşlemler</Text>
          </View>
        </Pressable>
      </StaggerView>

      {/* ── Courses Section ── */}
      <StaggerView index={sectionIndex++} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Dersler</Text>
        <Pressable
          onPress={() => navigation.navigate("CoursesTab")}
          hitSlop={8}
        >
          <Text style={styles.seeAll}>Tümünü Gör</Text>
        </Pressable>
      </StaggerView>

      <View style={styles.courseList}>
        {courses.slice(0, 7).map((course, i) => {
          const iconColor = getSpecialtyColor(course.title);
          const iconName = getSpecialtyIcon(course.title);
          const completedParts = course.parts.filter((p) => p.status === "completed").length;
          const progressPct = course.totalParts > 0 ? Math.round((completedParts / course.totalParts) * 100) : 0;

          return (
            <StaggerView
              key={course.id}
              index={sectionIndex + i}
            >
              <Pressable
                style={({ pressed }) => [styles.courseCard, pressed && { opacity: 0.85 }]}
                onPress={() => void openCourse(course.id)}
              >
                <View style={[styles.courseAccent, { backgroundColor: iconColor }]} />
                <View style={[styles.courseIcon, { backgroundColor: `${iconColor}20` }]}>
                  <Ionicons name={iconName} size={20} color={iconColor} />
                </View>
                <View style={styles.courseMain}>
                  <Text style={styles.courseTitle} numberOfLines={1}>
                    {course.title}
                  </Text>
                  <Text style={styles.courseMeta}>
                    {course.totalParts} Bölüm · {formatDuration(course.totalDurationSec)}
                  </Text>
                  {progressPct > 0 ? (
                    <View style={styles.courseProgressTrack}>
                      <View style={[styles.courseProgressFill, { width: `${progressPct}%` as `${number}%`, backgroundColor: iconColor }]} />
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            </StaggerView>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.sm,
  },

  /* ── Header ── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
  },
  headerBrand: {
    ...typography.h3,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  notifButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Greeting ── */
  greetingBlock: {
    marginBottom: spacing.sm,
  },
  greeting: {
    ...typography.title,
    color: colors.textSecondary,
    fontSize: 24,
    lineHeight: 30,
  },
  greetingName: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    marginBottom: spacing.xs,
  },
  greetingSub: {
    ...typography.body,
    color: colors.textTertiary,
  },

  /* ── Goal Card ── */
  goalCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.cardBgElevated,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  goalCardComplete: {
    borderColor: "rgba(212,170,85,0.3)",
    backgroundColor: colors.goldTint,
  },
  goalLeft: {
    alignItems: "center",
    justifyContent: "center",
  },
  goalRight: {
    flex: 1,
    gap: 2,
  },
  ringPercent: {
    ...typography.caption,
    color: colors.motivationOrange,
    ...fw.extraBold,
    fontSize: 15,
    fontVariant: ["tabular-nums"] as const,
  },
  goalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    ...fw.semiBold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    fontSize: 11,
  },
  goalTime: {
    ...typography.h3,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"] as const,
  },
  goalTimeDim: {
    color: colors.textSecondary,
    ...fw.regular,
  },
  goalHint: {
    ...typography.small,
    color: colors.motivationOrange,
    marginTop: 2,
  },

  /* ── Continue ── */
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.orangeTint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(232,130,74,0.15)",
  },
  continuePlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  continueInfo: {
    flex: 1,
    gap: 1,
  },
  continueLabel: {
    ...typography.small,
    color: colors.motivationOrange,
    ...fw.bold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  continueTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    ...fw.semiBold,
  },
  continueSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ── Quick Actions ── */
  quickActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  quickAction: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionText: {
    flex: 1,
  },
  quickActionValue: {
    fontSize: 15,
    ...fw.bold,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"] as const,
  },
  quickActionLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },

  /* ── Section Header ── */
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  seeAll: {
    ...typography.caption,
    color: colors.motivationOrange,
    ...fw.semiBold,
  },

  /* ── Course Cards ── */
  courseList: {
    gap: spacing.sm,
  },
  courseCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingLeft: 0,
    gap: spacing.md,
    overflow: "hidden",
  },
  courseAccent: {
    width: 3,
    alignSelf: "stretch",
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  courseIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  courseMain: {
    flex: 1,
    gap: 3,
  },
  courseTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    ...fw.semiBold,
  },
  courseMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  courseProgressTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginTop: 2,
  },
  courseProgressFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
});
