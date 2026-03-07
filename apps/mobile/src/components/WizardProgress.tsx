import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "@/theme";

interface WizardProgressProps {
  label: string;
  step: number;
  totalSteps: number;
}

const STEP_LABELS = ["Yukle", "Ayarla", "Olustur"];

export function WizardProgress({ label, step, totalSteps }: WizardProgressProps) {
  const safeTotal = Math.max(totalSteps, 1);
  const safeStep = Math.min(Math.max(step, 1), safeTotal);

  const steps = Array.from({ length: safeTotal }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      {/* Optional label */}
      {label ? <Text style={styles.label}>{label}</Text> : null}

      {/* Step circles with connecting lines */}
      <View style={styles.stepsRow}>
        {steps.map((stepNum, idx) => {
          const isCompleted = stepNum < safeStep;
          const isActive = stepNum === safeStep;
          const isUpcoming = stepNum > safeStep;

          return (
            <View key={stepNum} style={styles.stepWrapper}>
              {/* Step item: circle + label */}
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.circle,
                    isCompleted && styles.circleCompleted,
                    isActive && styles.circleActive,
                    isUpcoming && styles.circleUpcoming
                  ]}
                >
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.circleText,
                        isActive && styles.circleTextActive,
                        isUpcoming && styles.circleTextUpcoming
                      ]}
                    >
                      {stepNum}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isActive && styles.stepLabelActive,
                    isCompleted && styles.stepLabelCompleted,
                    isUpcoming && styles.stepLabelUpcoming
                  ]}
                >
                  {STEP_LABELS[idx] ?? `Adim ${stepNum}`}
                </Text>
              </View>

              {/* Connecting line (not after last step) */}
              {idx < steps.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    stepNum < safeStep && styles.connectorCompleted
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CIRCLE_SIZE = 34;

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    textAlign: "center"
  },

  /* Steps row */
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center"
  },

  stepWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1
  },

  stepItem: {
    alignItems: "center",
    gap: spacing.xs
  },

  /* Circle */
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  circleActive: {
    backgroundColor: colors.motivationOrange
  },
  circleCompleted: {
    backgroundColor: colors.success
  },
  circleUpcoming: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.dividerStrong
  },

  /* Circle text */
  circleText: {
    ...typography.caption,
    fontWeight: "700",
    color: "#FFFFFF"
  },
  circleTextActive: {
    color: "#FFFFFF"
  },
  circleTextUpcoming: {
    color: colors.textSecondary
  },

  /* Step label below circle */
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center"
  },
  stepLabelActive: {
    color: colors.textPrimary,
    fontWeight: "700"
  },
  stepLabelCompleted: {
    color: colors.success
  },
  stepLabelUpcoming: {
    color: colors.textSecondary
  },

  /* Connector line */
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.dividerStrong,
    marginTop: CIRCLE_SIZE / 2 - 1,
    marginHorizontal: spacing.xs
  },
  connectorCompleted: {
    backgroundColor: colors.success
  }
});
