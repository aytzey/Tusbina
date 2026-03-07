import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

interface ScreenContainerProps extends PropsWithChildren {
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function ScreenContainer({ children, scroll = false, contentStyle }: ScreenContainerProps) {
  if (scroll) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]}>{children}</ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={[styles.safeArea, contentStyle]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primaryNavy
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl
  }
});
