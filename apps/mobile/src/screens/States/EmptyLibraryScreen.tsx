import { Image, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components";
import { colors, spacing, typography } from "@/theme";

const LOGO = require("../../../assets/logo.png");

interface EmptyLibraryScreenProps {
  onCreate: () => void;
}

export function EmptyLibraryScreen({ onCreate }: EmptyLibraryScreenProps) {
  return (
    <View style={styles.container}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
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
