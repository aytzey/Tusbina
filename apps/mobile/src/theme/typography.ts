import { TextStyle } from "react-native";

/*
 * Font: Plus Jakarta Sans — geometric sans-serif with personality.
 * Warm, modern, confident — matches "Ambitious, Modern, Motivating" brand.
 *
 * Weight mapping:
 *   800 ExtraBold = hero headlines
 *   700 Bold      = page titles, section headings
 *   600 SemiBold  = sub-headings, card titles, emphasized labels
 *   500 Medium    = captions, secondary text
 *   400 Regular   = body text, descriptions
 */

/*
 * Weight utilities — ALWAYS use these when overriding fontWeight in styles.
 * React Native requires fontFamily to match fontWeight for custom fonts.
 * Using fontWeight alone will silently fall back to the system font.
 */
export const fw = {
  regular: { fontWeight: "400", fontFamily: "Jakarta-Regular" } satisfies TextStyle,
  medium: { fontWeight: "500", fontFamily: "Jakarta-Medium" } satisfies TextStyle,
  semiBold: { fontWeight: "600", fontFamily: "Jakarta-SemiBold" } satisfies TextStyle,
  bold: { fontWeight: "700", fontFamily: "Jakarta-Bold" } satisfies TextStyle,
  extraBold: { fontWeight: "800", fontFamily: "Jakarta-ExtraBold" } satisfies TextStyle,
} as const;

export const typography = {
  /** 40px — splash greetings, onboarding headlines */
  hero: {
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.2,
    ...fw.extraBold,
  } satisfies TextStyle,

  /** 30px — screen-level page titles (HomeScreen only) */
  title: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    ...fw.bold,
  } satisfies TextStyle,

  /** 22px — section headings, inner page titles */
  h2: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    ...fw.bold,
  } satisfies TextStyle,

  /** 20px — mid-level headings (profile, library, settings screen titles) */
  h2Small: {
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    ...fw.bold,
  } satisfies TextStyle,

  /** 17px — card titles, sub-sections */
  h3: {
    fontSize: 17,
    lineHeight: 23,
    ...fw.semiBold,
  } satisfies TextStyle,

  /** 16px — primary readable text */
  body: {
    fontSize: 16,
    lineHeight: 24,
    ...fw.regular,
  } satisfies TextStyle,

  /** 16px medium — emphasized body, list titles */
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    ...fw.medium,
  } satisfies TextStyle,

  /** 14px — compact body for dense lists, queue items, secondary info */
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    ...fw.regular,
  } satisfies TextStyle,

  /** 13px — metadata, timestamps, badges */
  caption: {
    fontSize: 13,
    lineHeight: 18,
    ...fw.medium,
  } satisfies TextStyle,

  /** 11px — fine print, tertiary labels */
  small: {
    fontSize: 11,
    lineHeight: 15,
    ...fw.medium,
  } satisfies TextStyle,

  /** 16px bold — CTA buttons */
  button: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
    ...fw.bold,
  } satisfies TextStyle,

  /** 10px — bottom tab labels */
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.3,
    ...fw.semiBold,
  } satisfies TextStyle,

  /** 16px — TextInput fields (prevents iOS auto-zoom) */
  input: {
    fontSize: 16,
    lineHeight: 22,
    ...fw.regular,
  } satisfies TextStyle,

  /** Tabular numbers for timers, stats, counters */
  mono: {
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
};
