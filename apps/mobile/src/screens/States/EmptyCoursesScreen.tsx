import { Image, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components";
import { colors, spacing, typography } from "@/theme";

const LOGO = require("../../../assets/logo.png");

interface EmptyCoursesScreenProps {
  onExplore: () => void;
}

export function EmptyCoursesScreen({ onExplore }: EmptyCoursesScreenProps) {
  return (
    <View style={styles.container}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
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
    alignItems: "center",
    gap: spacing.sm
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: spacing.md
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center"
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center"
  }
});
