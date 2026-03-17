import { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";
import { PodcastArtwork } from "./PodcastArtwork";
import { colors, radius, spacing, typography } from "@/theme";

interface PodcastCoverProps {
  uri?: string;
  title: string;
  subtitle?: string;
  voice?: string;
  size?: number;
  badgeText?: string;
}

const SVG_PATTERN = /\.svg($|[?#])/i;

function PodcastCoverComponent({
  uri,
  title,
  subtitle,
  voice,
  size = 120,
  badgeText,
}: PodcastCoverProps) {
  const borderRadius = Math.max(18, Math.round(size * 0.18));

  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius }]}>
      {!uri ? (
        <PodcastArtwork title={title} subtitle={subtitle} voice={voice} size={size} />
      ) : SVG_PATTERN.test(uri) ? (
        <SvgUri uri={uri} width={size} height={size} />
      ) : (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      )}
      {badgeText ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const PodcastCover = memo(PodcastCoverComponent);

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: "rgba(13,17,35,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  badgeText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
  },
});
