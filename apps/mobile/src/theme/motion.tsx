import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, LayoutAnimation, Platform, StyleProp, UIManager, ViewStyle } from "react-native";

/* Enable LayoutAnimation on Android */
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);
const ENTRANCE_DURATION = 450;
const STAGGER_MS = 80;

interface StaggerViewProps {
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Staggered fade + slide-up entrance for screen sections. */
export function StaggerView({ index, children, style }: StaggerViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ENTRANCE_DURATION,
          easing: EASE_OUT_EXPO,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTRANCE_DURATION,
          easing: EASE_OUT_EXPO,
          useNativeDriver: true,
        }),
      ]).start();
    }, index * STAGGER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

interface PopViewProps {
  animKey: string;
  children: React.ReactNode;
}

/** Quick scale pop on value change — for icon toggles. */
export function PopView({ animKey, children }: PopViewProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    scale.setValue(0.3);
    Animated.timing(scale, {
      toValue: 1,
      duration: 200,
      easing: EASE_OUT_EXPO,
      useNativeDriver: true,
    }).start();
  }, [animKey]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {children}
    </Animated.View>
  );
}

/* ── FadeInView — simple fade entrance (no translate) ── */
interface FadeInViewProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Fade-in wrapper for conditional content (error cards, toasts, form reveals). */
export function FadeInView({ delay = 0, duration = 300, children, style }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing: EASE_OUT_EXPO,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
}

/* ── useAnimatedProgress — smooth progress bar transitions ── */
export function useAnimatedProgress(targetValue: number, duration = 350): Animated.Value {
  const anim = useRef(new Animated.Value(targetValue)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: targetValue,
      duration,
      easing: EASE_OUT_EXPO,
      useNativeDriver: false, // width/interpolation needs JS driver
    }).start();
  }, [targetValue, duration]);

  return anim;
}

/* ── useCheckboxScale — scale pop for checkbox/toggle toggles ── */
export function useCheckboxScale(): {
  scale: Animated.Value;
  onToggle: () => void;
} {
  const scale = useRef(new Animated.Value(1)).current;

  const onToggle = useCallback(() => {
    scale.setValue(0.8);
    Animated.spring(scale, {
      toValue: 1,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return { scale, onToggle };
}

/* ── configureListAnimation — LayoutAnimation preset for list changes ── */
export function configureListAnimation() {
  LayoutAnimation.configureNext({
    duration: 250,
    create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeOut },
    delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  });
}

/* ── Easing exports for consistent motion across the app ── */
export { EASE_OUT_EXPO };
