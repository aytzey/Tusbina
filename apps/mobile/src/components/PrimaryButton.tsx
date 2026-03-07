import { Animated, Platform, Pressable, StyleSheet, Text } from "react-native";
import { useRef } from "react";
import { colors, radius, spacing, shadows, typography } from "@/theme";

type ButtonVariant = "primary" | "gold" | "outline";

interface PrimaryButtonProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  variant?: ButtonVariant;
}

export function PrimaryButton({
  label,
  disabled = false,
  onPress,
  variant = "primary",
}: PrimaryButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
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
        ? shadows.subtle
        : undefined;

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        !disabled && shadowStyle,
      ]}
    >
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.button,
          variantStyle,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.label, labelStyle]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
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
  },
  labelOutline: {
    ...typography.button,
    color: colors.textSecondary,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});
