import { Image, StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer, PrimaryButton } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { colors, spacing, typography } from "@/theme";

const LOGO = require("../../../assets/logo.png");

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function NoInternetScreen() {
  const navigation = useNavigation<Navigation>();

  return (
    <ScreenContainer contentStyle={styles.content}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Bağlantı kesildi</Text>
      <Text style={styles.description}>İnternete yeniden bağlandıktan sonra içerik otomatik devam eder.</Text>
      <PrimaryButton label="Tekrar Dene" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    justifyContent: "center",
    alignItems: "center"
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
    textAlign: "center",
    marginTop: spacing.xs
  }
});
