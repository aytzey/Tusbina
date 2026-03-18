import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from "react-native";
import { useRef } from "react";
import { colors, radius, spacing, shadows, typography } from "@/theme";

type ButtonVariant = "primary" | "gold" | "outline";

interface PrimaryButtonProps {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: ButtonVariant;
}

export function PrimaryButton({
  label,
  disabled = false,
  loading = false,
  onPress,
  variant = "primary",
}: PrimaryButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 200,
      friction: 15,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  };

  const variantStyle =
    variant === "gold"
      ? styles.gold
      : variant === "outline"
        ? styles.outline
        : styles.primary;

  const labelStyle =
    variant === "outline" ? styles.labelOutline : styles.label;

  const shadowStyle =
    variant === "gold"
      ? shadows.glow(colors.premiumGold)
      : variant === "primary"
        ? shadows.glow(colors.motivationOrange)
        : undefined;

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        !disabled && shadowStyle,
      ]}
    >
      <Pressable
        disabled={disabled || loading}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.button,
          variantStyle,
          (disabled || loading) && styles.disabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator color={variant === "outline" ? colors.textSecondary : colors.textPrimary} />
        ) : (
          <Text style={[styles.label, labelStyle]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  primary: {
    backgroundColor: colors.motivationOrange,
  },
  gold: {
    backgroundColor: colors.premiumGold,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.dividerStrong,
  },
  label: {
    ...typography.button,
    color: colors.textPrimary,
    textTransform: "none",
  },
  labelOutline: {
    ...typography.button,
    color: colors.textSecondary,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.88,
  },
});
