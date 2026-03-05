import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ProgressBar, ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useCoursesStore, usePlayerStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { formatDuration } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, "CourseDetail">;

const specialtyColors: Record<string, string> = {
  Anatomi: "#BF5F3E",
  Farmakoloji: "#2E9E57",
  Mikrobiyoloji: "#4A90D9",
  Fizyoloji: "#9B59B6",
  Biyokimya: "#E67E22",
};

const specialtyIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Anatomi: "body-outline",
  Farmakoloji: "flask-outline",
  Mikrobiyoloji: "bug-outline",
  Fizyoloji: "pulse-outline",
  Biyokimya: "beaker-outline",
};

function getSpecialtyColor(title: string): string {
  for (const key of Object.keys(specialtyColors)) {
    if (title.includes(key)) {
      return specialtyColors[key];
    }
  }
  return "#BD9465";
}

function getSpecialtyIcon(title: string): keyof typeof Ionicons.glyphMap {
  for (const key of Object.keys(specialtyIcons)) {
    if (title.includes(key)) {
      return specialtyIcons[key];
    }
  }
  return "book-outline";
}

function formatRemaining(remainingSec: number): string {
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)} kaldı`;
}

export function CourseDetailScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<ScreenRoute>();
  const selectedCourse = useCoursesStore((state) => state.selectedCourse);
  const selectCourse = useCoursesStore((state) => state.selectCourse);
  const setQueue = usePlayerStore((state) => state.setQueue);

  useEffect(() => {
    void selectCourse(route.params.courseId);
  }, [route.params.courseId, selectCourse]);

  const openPart = (partId: string) => {
    const course = selectedCourse;
    const part = course?.parts.find((item) => item.id === partId);

    if (!course || !part) {
      return;
    }

    if (part.status === "locked") {
      navigation.navigate("Premium");
      return;
    }

    const playableParts = course.parts.filter((item) => item.status !== "locked");
    const queue = playableParts.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: course.title,
      durationSec: item.durationSec,
      sourceType: "course" as const,
      parentId: course.id,
      resumePositionSec: item.lastPositionSec,
      audioUrl: item.audioUrl,
    }));
    const startIndex = queue.findIndex((item) => item.id === part.id);
    setQueue(queue, startIndex, part.lastPositionSec);

    navigation.navigate("Player", { trackId: part.id, sourceType: "course" });
  };

  if (!selectedCourse) {
    return (
      <ScreenContainer contentStyle={styles.container}>
        <Text style={styles.emptyText}>Ders bulunamadı.</Text>
      </ScreenContainer>
    );
  }

  const courseColor = getSpecialtyColor(selectedCourse.title);
  const courseIcon = getSpecialtyIcon(selectedCourse.title);

  const firstPlayablePart =
    selectedCourse.parts.find((part) => part.status === "inProgress" || part.status === "new") ??
    selectedCourse.parts.find((part) => part.status !== "locked");

  return (
    <ScreenContainer contentStyle={styles.container}>
      {/* Course header with icon and title */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIcon, { backgroundColor: courseColor + "1A" }]}>
          <Ionicons name={courseIcon} size={28} color={courseColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.courseTitle}>{selectedCourse.title}</Text>
          <Text style={styles.meta}>
            {selectedCourse.totalParts} Bölüm  ·  {formatDuration(selectedCourse.totalDurationSec)}
          </Text>
        </View>
      </View>

      {/* Progress section */}
      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <View style={styles.progressBarWrapper}>
            <ProgressBar progress={selectedCourse.progressPct} />
          </View>
          <Text style={styles.progressValue}>%{selectedCourse.progressPct}</Text>
        </View>
      </View>

      {/* Play all button */}
      <Pressable
        style={({ pressed }) => [
          styles.playAllButton,
          !firstPlayablePart && styles.playAllDisabled,
          pressed && styles.playAllPressed,
        ]}
        disabled={!firstPlayablePart}
        onPress={() => firstPlayablePart && openPart(firstPlayablePart.id)}
      >
        <Ionicons name="shuffle-outline" size={20} color={colors.textPrimary} />
        <Text style={styles.playAllLabel}>Tümünü Dinle</Text>
      </Pressable>

      {/* Chapter list */}
      <View style={styles.chapterList}>
        {selectedCourse.parts.map((part, index) => {
          const partNumber = index + 1;
          const isCompleted = part.status === "completed";
          const isInProgress = part.status === "inProgress";
          const isLocked = part.status === "locked";
          const remainingSec = part.durationSec - part.lastPositionSec;

          return (
            <Pressable
              key={part.id}
              style={[styles.chapterCard, isLocked && styles.chapterLocked]}
              onPress={() => openPart(part.id)}
            >
              {/* Left indicator circle */}
              {isCompleted ? (
                <View style={[styles.chapterCircle, styles.circleCompleted]}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
              ) : isInProgress ? (
                <View style={[styles.chapterCircle, styles.circleInProgress]}>
                  <Ionicons name="play" size={14} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.chapterCircle, styles.circleDefault]}>
                  <Text style={styles.circleNumber}>{partNumber}</Text>
                </View>
              )}

              {/* Text block */}
              <View style={styles.chapterTextBlock}>
                <Text style={styles.chapterName} numberOfLines={1}>{part.title}</Text>
                <Text style={styles.chapterDuration}>{formatDuration(part.durationSec)}</Text>
              </View>

              {/* Right status indicator */}
              <View style={styles.chapterRight}>
                {isCompleted && (
                  <Text style={styles.statusCompleted}>Tamamlandı</Text>
                )}
                {isInProgress && (
                  <Text style={styles.statusInProgress}>{formatRemaining(remainingSec)}</Text>
                )}
                {isLocked && (
                  <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  /* Header */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  courseTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  /* Progress */
  progressBlock: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  progressBarWrapper: {
    flex: 1,
  },
  progressValue: {
    ...typography.caption,
    color: colors.motivationOrange,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "right",
  },
  /* Play all button */
  playAllButton: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  playAllLabel: {
    ...typography.button,
    color: colors.textPrimary,
  },
  playAllDisabled: {
    opacity: 0.4,
  },
  playAllPressed: {
    opacity: 0.8,
  },
  /* Chapter list */
  chapterList: {
    gap: 10,
  },
  chapterCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    gap: spacing.md,
  },
  chapterLocked: {
    opacity: 0.5,
  },
  /* Circle indicators */
  chapterCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  circleCompleted: {
    backgroundColor: colors.success,
  },
  circleInProgress: {
    backgroundColor: colors.motivationOrange,
  },
  circleDefault: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  circleNumber: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  /* Chapter text */
  chapterTextBlock: {
    flex: 1,
    gap: 2,
  },
  chapterName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  chapterDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  /* Right status */
  chapterRight: {
    alignItems: "flex-end",
  },
  statusCompleted: {
    ...typography.caption,
    color: colors.success,
  },
  statusInProgress: {
    ...typography.caption,
    color: colors.motivationOrange,
  },
});
