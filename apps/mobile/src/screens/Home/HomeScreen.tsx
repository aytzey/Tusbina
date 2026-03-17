import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import {
  useAuthStore,
  useCoursesStore,
  useLearningToolsStore,
  usePlayerStore,
  useUserStore,
} from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
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
  const positionSec = usePlayerStore((s) => s.positionSec);
  const user = useUserStore((s) => s.user);
  const dailyGoalMin = useLearningToolsStore((s) => s.dailyGoalMin);
  const todayListenedSec = useLearningToolsStore((s) => s.todayListenedSec);

  const displayName = useMemo(
    () => authUser?.user_metadata?.display_name || authUser?.email?.split("@")[0] || "Doktor",
    [authUser?.email, authUser?.user_metadata?.display_name]
  );

  const greeting = useMemo(() => getGreeting(), []);
  const dailyGoalSec = dailyGoalMin * 60;
  const dailyGoalProgress = dailyGoalSec > 0 ? Math.min(100, Math.round((todayListenedSec / dailyGoalSec) * 100)) : 0;
  const remainingGoalSec = Math.max(0, dailyGoalSec - todayListenedSec);

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

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require("../../../assets/logo.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerBrand}>TUSBINA</Text>
        </View>
        <Pressable style={styles.notifButton} hitSlop={8} onPress={() => navigation.navigate("Notifications")}>
          <Ionicons name="sync-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* ---- Greeting ---- */}
      <Text style={styles.greeting}>{greeting}, {displayName}!</Text>
      <Text style={styles.greetingSub}>Bugün ne dinlemek istersin?</Text>

      {/* ---- Search Bar ---- */}
      <Pressable
        style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
        onPress={() => navigation.navigate("CoursesTab")}
      >
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.searchPlaceholder}>Ders veya konu ara...</Text>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.goalCard, pressed && styles.goalCardPressed]} onPress={() => navigation.navigate("StudyTools")}>
        <View style={styles.goalHeader}>
          <View style={styles.goalTitleRow}>
            <View style={styles.goalIconWrap}>
              <Ionicons name="headset-outline" size={18} color={colors.motivationOrange} />
            </View>
            <View style={styles.goalTitleBlock}>
              <Text style={styles.goalTitle}>Günlük dinleme hedefi</Text>
              <Text style={styles.goalSubtitle}>
                {formatDuration(todayListenedSec)} / {dailyGoalMin} dk
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
        <View style={styles.goalProgressTrack}>
          <View style={[styles.goalProgressFill, { width: `${dailyGoalProgress}%` as const }]} />
        </View>
        <Text style={styles.goalHint}>
          {remainingGoalSec > 0
            ? `${formatDuration(remainingGoalSec)} kaldı. Çalışma sayfasını aç`
            : "Bugünkü hedef tamamlandı. Çalışma sayfasından planını güncelle"}
        </Text>
      </Pressable>

      {/* ---- Quick Stats ---- */}
      <View style={styles.quickStats}>
        <Pressable style={({ pressed }) => [styles.quickStatCard, styles.quickStatCourses, pressed && styles.quickStatPressed]} onPress={() => navigation.navigate("CoursesTab")}>
          <Ionicons name="book-outline" size={20} color={colors.success} />
          <Text style={styles.quickStatValue}>{courses.length}</Text>
          <Text style={styles.quickStatLabel}>Ders</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.quickStatCard, styles.quickStatUpload, pressed && styles.quickStatPressed]} onPress={() => navigation.navigate("UploadTab")}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.premiumGold} />
          <Text style={styles.quickStatValue}>Yükle</Text>
          <Text style={styles.quickStatLabel}>PDF</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.quickStatCard, styles.quickStatStatus, pressed && styles.quickStatPressed]} onPress={() => navigation.navigate("Notifications")}>
          <Ionicons name="sync-outline" size={20} color={colors.textPrimary} />
          <Text style={styles.quickStatValue}>Aç</Text>
          <Text style={styles.quickStatLabel}>İşlemler</Text>
        </Pressable>
      </View>

      {/* ---- Continue Listening ---- */}
      {continueItem ? (
        <View style={styles.continueSection}>
          <Text style={styles.sectionTitle}>Devam Et</Text>
          <Pressable style={styles.continueCard} onPress={handleContinue}>
            <View style={styles.continuePlay}>
              <Ionicons name="play" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.continueInfo}>
              <Text style={styles.continueTitle} numberOfLines={1}>
                {continueItem.title}
              </Text>
              <Text style={styles.continueSub} numberOfLines={1}>
                {continueItem.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* ---- Courses Section ---- */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Dersler</Text>
        <Pressable onPress={() => navigation.navigate("CoursesTab")}>
          <Text style={styles.seeAll}>Tümünü Gör</Text>
        </Pressable>
      </View>

      <View style={styles.courseList}>
        {courses.slice(0, 7).map((course) => {
          const iconColor = getSpecialtyColor(course.title);
          const iconName = getSpecialtyIcon(course.title);

          return (
            <Pressable
              key={course.id}
              style={({ pressed }) => [styles.courseCard, pressed && styles.courseCardPressed]}
              onPress={() => void openCourse(course.id)}
            >
              <View style={[styles.courseIcon, { backgroundColor: iconColor }]}>
                <Ionicons name={iconName} size={20} color="#FFFFFF" />
              </View>
              <View style={styles.courseMain}>
                <Text style={styles.courseTitle} numberOfLines={1}>
                  {course.title}
                </Text>
                <Text style={styles.courseMeta}>
                  {course.totalParts} Bölüm · {formatDuration(course.totalDurationSec)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
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

  /* ---- Header ---- */
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
    width: 30,
    height: 30,
    borderRadius: radius.sm,
  },
  headerBrand: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    letterSpacing: 1,
  },
  notifButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.divider,
  },

  /* ---- Greeting ---- */
  greeting: {
    ...typography.title,
    color: colors.textPrimary,
  },
  greetingSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  /* ---- Search ---- */
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  searchPlaceholder: {
    ...typography.body,
    color: colors.textSecondary,
  },

  goalCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.cardBgElevated,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  goalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  goalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orangeTint,
  },
  goalTitleBlock: {
    flex: 1,
    gap: 2,
  },
  goalTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  goalSubtitle: {
    ...typography.caption,
    color: colors.motivationOrange,
    fontWeight: "700",
    fontVariant: ["tabular-nums"] as const,
  },
  goalProgressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  goalProgressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
  },
  goalHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ---- Quick Stats ---- */
  quickStats: {
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  quickStatCard: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  quickStatCourses: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  quickStatUpload: {
    borderLeftWidth: 3,
    borderLeftColor: colors.premiumGold,
  },
  quickStatStatus: {
    borderLeftWidth: 3,
    borderLeftColor: colors.textPrimary,
  },
  quickStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"] as const,
  },
  quickStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },

  /* ---- Continue ---- */
  continueSection: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardBgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.motivationOrange,
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
    gap: 2,
  },
  continueTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  continueSub: {
    ...typography.caption,
    color: colors.motivationOrange,
  },

  /* ---- Section Header ---- */
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  seeAll: {
    ...typography.body,
    color: colors.motivationOrange,
    fontWeight: "600",
  },

  /* ---- Course Cards ---- */
  courseList: {
    gap: spacing.sm,
  },
  courseCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  courseCardPressed: {
    opacity: 0.8,
  },
  searchBarPressed: {
    opacity: 0.7,
  },
  goalCardPressed: {
    opacity: 0.85,
  },
  quickStatPressed: {
    opacity: 0.75,
  },
  courseIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  courseMain: {
    flex: 1,
    gap: spacing.xs,
  },
  courseTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  courseMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
