import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useCoursesStore } from "@/state/stores";
import { StaggerView, colors, fw, radius, spacing, typography } from "@/theme";
import { EmptyCoursesScreen } from "@/screens/States/EmptyCoursesScreen";
import { formatDuration, getSpecialtyColor, getSpecialtyIcon } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function CoursesCatalogScreen() {
  const navigation = useNavigation<Navigation>();
  const courses = useCoursesStore((state) => state.courses);
  const selectCourse = useCoursesStore((state) => state.selectCourse);
  const [query, setQuery] = useState("");

  const filteredCourses = useMemo(() => {
    if (!query) return courses;
    const q = query.toLowerCase();
    return courses.filter((course) => course.title.toLowerCase().includes(q));
  }, [courses, query]);

  const openCourse = async (courseId: string) => {
    await selectCourse(courseId);
    navigation.navigate("CourseDetail", { courseId });
  };

  if (courses.length === 0) {
    return (
      <ScreenContainer contentStyle={styles.container}>
        <EmptyCoursesScreen onExplore={() => {}} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentStyle={styles.container}>
      <StaggerView index={0} style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          placeholder="Ders ara..."
          placeholderTextColor={colors.textSecondary}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
      </StaggerView>

      <FlatList
        data={filteredCourses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const iconColor = getSpecialtyColor(item.title);
          const iconName = getSpecialtyIcon(item.title);

          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => void openCourse(item.id)}
            >
              <View style={[styles.cardIcon, { backgroundColor: iconColor }]}>
                <Ionicons name={iconName} size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.cardMain}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardMeta}>
                  {item.totalParts} bölüm  ·  {formatDuration(item.totalDurationSec)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.noResults}>"{query}" ile eşleşen ders bulunamadı.</Text>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    color: colors.textPrimary,
    ...typography.input,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMain: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    ...fw.semiBold,
  },
  cardMeta: {
    ...typography.small,
    color: colors.textSecondary,
  },
  noResults: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
