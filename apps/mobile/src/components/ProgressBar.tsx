import { useEffect, useRef } from "react";
import { Animated, Easing, GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

interface ProgressBarProps {
  progress: number;
  buffering?: boolean;
  onSeek?: (progress: number) => void;
}

export function ProgressBar({ progress, buffering, onSeek }: ProgressBarProps) {
  const trackWidth = useRef(0);
  const animProgress = useRef(new Animated.Value(progress)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.timing(animProgress, {
      toValue: Math.max(0, Math.min(100, progress)),
      duration: 350,
      easing: EASE_OUT_EXPO,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  /* Buffering pulse */
  useEffect(() => {
    pulseAnim.current?.stop();
    if (buffering) {
      pulseAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(pulseOpacity, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      );
      pulseAnim.current.start();
    } else {
      Animated.timing(pulseOpacity, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
  }, [buffering]);

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const handleTouch = (e: GestureResponderEvent) => {
    if (!onSeek || trackWidth.current <= 0) return;
    const x = e.nativeEvent.locationX;
    const pct = Math.max(0, Math.min(100, (x / trackWidth.current) * 100));
    onSeek(pct);
  };

  const fillWidth = animProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const thumbLeft = animProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const showThumb = onSeek && progress > 0 && progress < 100;

  return (
    <View
      style={styles.track}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => Boolean(onSeek)}
      onMoveShouldSetResponder={() => Boolean(onSeek)}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
    >
      <Animated.View style={[styles.pulse, { opacity: pulseOpacity }]} />
      <Animated.View style={[styles.fill, { width: fillWidth }]} />
      {showThumb && (
        <Animated.View style={[styles.thumb, { left: thumbLeft }]} />
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
