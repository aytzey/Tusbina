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

const TRACK_HEIGHT = 5;
const THUMB_SIZE = 14;
const TOUCH_PADDING = 12;

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "visible",
    justifyContent: "center",
    paddingVertical: TOUCH_PADDING,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: TOUCH_PADDING,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.motivationOrange,
  },
  thumb: {
    position: "absolute",
    top: TOUCH_PADDING - (THUMB_SIZE - TRACK_HEIGHT) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    marginLeft: -(THUMB_SIZE / 2),
    borderWidth: 2.5,
    borderColor: colors.motivationOrange,
    shadowColor: colors.motivationOrange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  pulse: {
    position: "absolute",
    left: 0,
    top: TOUCH_PADDING,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: "rgba(191,95,62,0.25)",
  },
});
