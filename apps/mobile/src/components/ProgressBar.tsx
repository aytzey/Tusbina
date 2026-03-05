import { useRef } from "react";
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";

interface ProgressBarProps {
  progress: number;
  buffering?: boolean;
  onSeek?: (progress: number) => void;
}

export function ProgressBar({ progress, buffering, onSeek }: ProgressBarProps) {
  const width = `${Math.max(0, Math.min(100, progress))}%` as `${number}%`;
  const trackWidth = useRef(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const handleTouch = (e: GestureResponderEvent) => {
    if (!onSeek || trackWidth.current <= 0) return;
    const x = e.nativeEvent.locationX;
    const pct = Math.max(0, Math.min(100, (x / trackWidth.current) * 100));
    onSeek(pct);
  };

  return (
    <View
      style={styles.track}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => Boolean(onSeek)}
      onMoveShouldSetResponder={() => Boolean(onSeek)}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
    >
      {buffering && <View style={styles.pulse} />}
      <View style={[styles.fill, { width }]} />
      {onSeek && progress > 0 && progress < 100 && (
        <View style={[styles.thumb, { left: width }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "visible",
    justifyContent: "center",
    paddingVertical: 8,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.motivationOrange,
  },
  thumb: {
    position: "absolute",
    top: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.motivationOrange,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  pulse: {
    position: "absolute",
    left: 0,
    top: 8,
    right: 0,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(191,95,62,0.25)",
  },
});
