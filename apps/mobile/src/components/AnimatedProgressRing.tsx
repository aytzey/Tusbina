import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle as any);

interface AnimatedProgressRingProps {
  /** 0–100 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Enables subtle scale pulse (1.0→1.03) */
  breathing?: boolean;
  children?: React.ReactNode;
}

export function AnimatedProgressRing({
  progress,
  size = 56,
  strokeWidth = 4,
  breathing = false,
  children,
}: AnimatedProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = Math.PI * 2 * r;
  const center = size / 2;

  const progressAnim = useRef(new Animated.Value(0)).current;
  const breathScale = useRef(new Animated.Value(1)).current;
  const breathAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: Math.min(100, Math.max(0, progress)) / 100,
      tension: 30,
      friction: 10,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    breathAnim.current?.stop();
    if (breathing) {
      breathAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breathScale, {
            toValue: 1.03,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breathScale, {
            toValue: 1.0,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      breathAnim.current.start();
    } else {
      Animated.timing(breathScale, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [breathing]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <Animated.View style={[styles.container, { width: size, height: size, transform: [{ scale: breathScale }] }]}>
      {/* @ts-expect-error react-native-svg types incompatible with React 19 */}
      <Svg width={size} height={size} style={styles.svg}>
        {/* @ts-expect-error react-native-svg types incompatible with React 19 */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated fill arc */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={r}
          stroke={colors.motivationOrange}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      {children ? <View style={styles.childrenOverlay}>{children}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  svg: {
    position: "absolute",
  },
  childrenOverlay: {
    alignItems: "center",
    justifyContent: "center",
  },
});
