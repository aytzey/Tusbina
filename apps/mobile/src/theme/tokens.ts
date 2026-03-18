import { Platform } from "react-native";

export const colors = {
  /* ── Surfaces — deep black base, warm semi-transparent layers ── */
  primaryNavy: "#060810",
  surfaceNavy: "#0A0E18",
  surfaceNavyLight: "#101624",
  cardBg: "rgba(255,255,255,0.035)",
  cardBgElevated: "rgba(255,255,255,0.06)",

  /* ── Accent — warm amber, alive and confident ── */
  motivationOrange: "#E8824A",
  brickOrange: "#D0612A",
  premiumGold: "#D4AA55",

  /* ── Text — warm bone white, strong steps between levels ── */
  textPrimary: "#EDE8DF",
  textSecondary: "#8E95A6",
  textTertiary: "#515868",

  /* ── Borders — very subtle, only where needed ── */
  divider: "rgba(255,255,255,0.06)",
  dividerStrong: "rgba(255,255,255,0.10)",

  /* ── Semantic ── */
  success: "#4CB87A",
  danger: "#E85B5B",
  warning: "#D4A03A",
  info: "#4A90D9",
  overlay: "rgba(4,5,10,0.85)",

  /* ── Platform-specific surfaces (tokenized, not hardcoded) ── */
  appleSurface: "#F5F5F7",
  appleText: "#1D1D1F",

  /* ── Tints ── */
  orangeTint: "rgba(232,130,74,0.12)",
  greenTint: "rgba(76,184,122,0.10)",
  goldTint: "rgba(212,170,85,0.10)",
  dangerTint: "rgba(232,91,91,0.08)",
  blueTint: "rgba(74,144,217,0.10)",
  warningTint: "rgba(212,160,58,0.10)",
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
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    },
    android: { elevation: 6 },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
  }),
  elevated: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
    },
    android: { elevation: 14 },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 14,
    },
  }),
  subtle: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    android: { elevation: 3 },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
  }),
  glow: (color: string) =>
    Platform.select({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
      default: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 10,
      },
    }),
} as const;

export const timing = {
  fast: 120,
  normal: 200,
  slow: 350,
} as const;

export const touch = {
  minSize: 44,
  hitSlop: { top: 8, right: 8, bottom: 8, left: 8 } as const,
} as const;
