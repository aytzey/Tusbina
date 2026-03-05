import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components";
import { colors, spacing, typography } from "@/theme";

interface EmptyLibraryScreenProps {
  onCreate: () => void;
}

export function EmptyLibraryScreen({ onCreate }: EmptyLibraryScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Henüz podcast oluşturmadın</Text>
      <Text style={styles.description}>PDF yükleyip birkaç dakikada dinlenebilir AI podcast içeriği üretebilirsin.</Text>
      <PrimaryButton label="PDF Yükle" onPress={onCreate} />
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
