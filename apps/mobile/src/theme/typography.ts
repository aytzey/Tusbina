import { TextStyle } from "react-native";

export const typography = {
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700"
  } satisfies TextStyle,
  h2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700"
  } satisfies TextStyle,
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400"
  } satisfies TextStyle,
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500"
  } satisfies TextStyle,
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700"
  } satisfies TextStyle
};
