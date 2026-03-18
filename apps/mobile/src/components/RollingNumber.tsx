import { useEffect, useRef, useState } from "react";
import { Animated, Text, TextStyle } from "react-native";

interface RollingNumberProps {
  value: number;
  style?: TextStyle;
  /** Suffix appended after the number (e.g. "%" or " dk") */
  suffix?: string;
  /** Prefix before the number (e.g. "%" for Turkish percent format) */
  prefix?: string;
}

export function RollingNumber({ value, style, suffix = "", prefix = "" }: RollingNumberProps) {
  const [display, setDisplay] = useState(value);
  const anim = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    const listener = anim.addListener(({ value: v }) => {
      setDisplay(Math.round(v));
    });

    Animated.spring(anim, {
      toValue: value,
      tension: 30,
      friction: 10,
      useNativeDriver: false,
    }).start();

    return () => anim.removeListener(listener);
  }, [value]);

  return (
    <Text style={style}>
      {prefix}{display}{suffix}
    </Text>
  );
}
