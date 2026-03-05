import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useCoursesStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import { EmptyCoursesScreen } from "@/screens/States/EmptyCoursesScreen";
import { formatDuration } from "@/utils";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const categories = ["Tümü", "Temel Tıp", "Klinik", "Cerrahi"];

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

export function CoursesCatalogScreen() {
  const navigation = useNavigation<Navigation>();
  const courses = useCoursesStore((state) => state.courses);
  const selectCourse = useCoursesStore((state) => state.selectCourse);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tümü");

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesCategory = category === "Tümü" || course.category === category;
      const matchesQuery = course.title.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [category, courses, query]);

  const openCourse = async (courseId: string) => {
    await selectCourse(courseId);
    navigation.navigate("CourseDetail", { courseId });
  };

  return (
    <ScreenContainer contentStyle={styles.container}>
      <Text style={styles.title}>Dersler</Text>

      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          placeholder="Ders ara..."
          placeholderTextColor={colors.textSecondary}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={styles.categoryRow}>
        {categories.map((chip) => (
          <Pressable
            key={chip}
            style={[styles.chip, chip === category && styles.chipActive]}
            onPress={() => setCategory(chip)}
          >
            <Text style={[styles.chipLabel, chip === category && styles.chipLabelActive]}>{chip}</Text>
          </Pressable>
        ))}
      </View>

      {filteredCourses.length === 0 ? (
        <EmptyCoursesScreen onExplore={() => setCategory("Tümü")} />
      ) : (
        <FlatList
          data={filteredCourses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const iconColor = getSpecialtyColor(item.title);
            const iconName = getSpecialtyIcon(item.title);

            return (
              <Pressable style={styles.card} onPress={() => void openCourse(item.id)}>
                <View style={[styles.cardIcon, { backgroundColor: iconColor + "1A" }]}>
                  <Ionicons name={iconName} size={22} color={iconColor} />
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
        />
      )}
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
    textAlign: "center",
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceNavy,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    color: colors.textPrimary,
    ...typography.body,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  chipActive: {
    backgroundColor: colors.motivationOrange,
    borderColor: colors.motivationOrange,
  },
  chipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.textPrimary,
  },
  listContent: {
    paddingBottom: spacing.xxl,
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMain: {
    flex: 1,
    gap: spacing.xs,
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
});
