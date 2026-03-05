import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components";
import { colors, spacing, typography } from "@/theme";

interface EmptyCoursesScreenProps {
  onExplore: () => void;
}

export function EmptyCoursesScreen({ onExplore }: EmptyCoursesScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Henüz bir dersin yok</Text>
      <Text style={styles.description}>Katalogdan bir ders seçerek TUS hazırlığını sesli şekilde başlatabilirsin.</Text>
      <PrimaryButton label="Dersleri Keşfet" onPress={onExplore} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.sm
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary
  },
  description: {
    ...typography.body,
    color: colors.textSecondary
  }
});
