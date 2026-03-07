import { Platform } from "react-native";

export const colors = {
  /* ── Core palette ── */
  primaryNavy: "#0D1123",
  surfaceNavy: "#151D33",
  surfaceNavyLight: "#1B2641",
  cardBg: "#1A2440",
  cardBgElevated: "#1F2D4D",
  motivationOrange: "#BF5F3E",
  brickOrange: "#AE451F",
  premiumGold: "#BD9465",
  textPrimary: "#F2F2EF",
  textSecondary: "#8A94A8",
  textTertiary: "#5E6778",
  divider: "rgba(255,255,255,0.06)",
  dividerStrong: "rgba(255,255,255,0.10)",
  success: "#2E9E57",
  danger: "#D64545",
  overlay: "rgba(9,12,22,0.78)",

  /* ── Subtle tints for icon backgrounds ── */
  orangeTint: "rgba(191,95,62,0.12)",
  greenTint: "rgba(46,158,87,0.12)",
  goldTint: "rgba(189,148,101,0.12)",
  dangerTint: "rgba(214,69,69,0.10)",
  blueTint: "rgba(74,144,217,0.12)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
    },
    android: {
      elevation: 4,
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 4,
    },
  }),
  elevated: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
    },
    android: {
      elevation: 10,
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 10,
    },
  }),
  subtle: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.10,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.10,
      shadowRadius: 4,
      elevation: 2,
    },
  }),
  glow: (color: string) =>
    Platform.select({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 8,
      },
    }),
} as const;

export const timing = {
  fast: 120,
  normal: 200,
  slow: 350,
} as const;
