import { Platform, TextStyle } from "react-native";

const fontFamily = Platform.select({
  ios: "System",
  android: undefined,
  default: undefined,
});

export const typography = {
  hero: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily,
  } satisfies TextStyle,
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.3,
    fontFamily,
  } satisfies TextStyle,
  h2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.2,
    fontFamily,
  } satisfies TextStyle,
  h3: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "600",
    fontFamily,
  } satisfies TextStyle,
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    fontFamily,
  } satisfies TextStyle,
  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    fontFamily,
  } satisfies TextStyle,
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    fontFamily,
  } satisfies TextStyle,
  small: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    fontFamily,
  } satisfies TextStyle,
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0.2,
    fontFamily,
  } satisfies TextStyle,
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
    fontFamily,
  } satisfies TextStyle,
};
