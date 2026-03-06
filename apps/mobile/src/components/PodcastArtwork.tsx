import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, typography } from "@/theme";

const LOGO = require("../../assets/logo.png");

interface PodcastArtworkProps {
  title: string;
  subtitle?: string;
  voice?: string;
  size?: number;
}

const PALETTES = [
  { background: "#23345B", accent: "#BF5F3E", secondary: "#E9C38C" },
  { background: "#1C4E5F", accent: "#E07A52", secondary: "#9ED9D2" },
  { background: "#5C3E2E", accent: "#E0A15B", secondary: "#F7DFB5" },
  { background: "#2B3F35", accent: "#D88C57", secondary: "#BED6B4" },
  { background: "#462F55", accent: "#D9A35C", secondary: "#F0D8B7" },
];

function hashText(value: string): number {
  return value.split("").reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function pickPalette(seed: string) {
  return PALETTES[hashText(seed) % PALETTES.length];
}

function getInitials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (words.length === 0) {
    return "TB";
  }
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function resolveSubtitle(subtitle?: string, voice?: string): string {
  if (voice && subtitle) {
    return `${subtitle} • ${voice}`;
  }
  return subtitle || voice || "Sesli öğrenme";
}

function PodcastArtworkComponent({
  title,
  subtitle,
  voice,
  size = 120,
}: PodcastArtworkProps) {
  const palette = pickPalette(`${title}|${subtitle}|${voice}`);
  const radiusValue = Math.max(18, Math.round(size * 0.18));
  const initials = getInitials(title);
  const subline = resolveSubtitle(subtitle, voice);

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radiusValue,
          backgroundColor: palette.background,
        },
      ]}
    >
      <View
        style={[
          styles.glowLarge,
          {
            backgroundColor: palette.accent,
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size * 0.36,
            top: size * 0.08,
            right: -size * 0.14,
          },
        ]}
      />
      <View
        style={[
          styles.glowSmall,
          {
            backgroundColor: palette.secondary,
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: size * 0.21,
            bottom: -size * 0.08,
            left: -size * 0.08,
          },
        ]}
      />
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
          <Ionicons name="sparkles" size={Math.max(11, size * 0.08)} color={palette.secondary} />
          <Text style={[styles.badgeText, { fontSize: Math.max(9, size * 0.075) }]}>AI</Text>
        </View>
        <Image
          source={LOGO}
          style={{ width: Math.max(20, size * 0.18), height: Math.max(20, size * 0.18), borderRadius: Math.max(10, size * 0.09) }}
          resizeMode="contain"
        />
      </View>

      <View style={styles.body}>
        <Text style={[styles.initials, { fontSize: Math.max(28, size * 0.24) }]}>{initials}</Text>
        <Text style={[styles.title, { fontSize: Math.max(12, size * 0.105) }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { fontSize: Math.max(9, size * 0.075) }]} numberOfLines={2}>
          {subline}
        </Text>
      </View>
    </View>
  );
}

export const PodcastArtwork = memo(PodcastArtworkComponent);

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    padding: 12,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  glowLarge: {
    position: "absolute",
    opacity: 0.26,
  },
  glowSmall: {
    position: "absolute",
    opacity: 0.2,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.textPrimary,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  body: {
    gap: 6,
    zIndex: 1,
  },
  initials: {
    color: colors.textPrimary,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    lineHeight: 18,
  },
  subtitle: {
    color: "rgba(248,248,246,0.74)",
    lineHeight: 14,
  },
});
