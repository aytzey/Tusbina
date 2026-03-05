import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const width = `${Math.max(0, Math.min(100, progress))}%` as `${number}%`;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    backgroundColor: colors.motivationOrange
  }
});
