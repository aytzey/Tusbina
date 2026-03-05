import { StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer, PrimaryButton } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { colors, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function GeneralErrorScreen() {
  const navigation = useNavigation<Navigation>();

  return (
    <ScreenContainer contentStyle={styles.content}>
      <Text style={styles.title}>Bir şeyler ters gitti</Text>
      <Text style={styles.description}>İşlem tamamlanamadı. Lütfen tekrar dene.</Text>
      <PrimaryButton label="Tekrar Dene" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    justifyContent: "center"
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs
  }
});
