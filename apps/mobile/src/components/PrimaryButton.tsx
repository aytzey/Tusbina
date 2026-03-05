import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "@/theme";

interface PrimaryButtonProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}

export function PrimaryButton({ label, disabled = false, onPress }: PrimaryButtonProps) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md
  },
  label: {
    ...typography.button,
    color: colors.textPrimary
  },
  disabled: {
    opacity: 0.4
  },
  pressed: {
    opacity: 0.8
  }
});
