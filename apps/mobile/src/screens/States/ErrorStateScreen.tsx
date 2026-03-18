import { Image, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer, PrimaryButton } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { StaggerView, colors, radius, spacing, typography } from "@/theme";

const LOGO = require("../../../assets/logo.png");

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const CONTENT = {
  GeneralError: {
    icon: "alert-circle" as const,
    iconColor: colors.danger,
    iconBg: colors.dangerTint,
    title: "Bir şeyler ters gitti",
    description: "İşlem tamamlanamadı. Lütfen tekrar dene.",
  },
  NoInternet: {
    icon: "cloud-offline" as const,
    iconColor: colors.warning,
    iconBg: colors.warningTint,
    title: "Bağlantı kesildi",
    description: "İnternete yeniden bağlandıktan sonra tekrar dene.",
  },
} as const;

export function GeneralErrorScreen() {
  return <ErrorStateScreen variant="GeneralError" />;
}

export function NoInternetScreen() {
  return <ErrorStateScreen variant="NoInternet" />;
}

function ErrorStateScreen({ variant }: { variant: keyof typeof CONTENT }) {
  const navigation = useNavigation<Navigation>();
  const { icon, iconColor, iconBg, title, description } = CONTENT[variant];

  return (
    <ScreenContainer contentStyle={styles.content}>
      <StaggerView index={0} style={styles.centerGroup}>
        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={36} color={iconColor} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <PrimaryButton label="Tekrar Dene" onPress={() => navigation.goBack()} />
      </StaggerView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  centerGroup: {
    alignItems: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    maxWidth: 280,
  },
});
