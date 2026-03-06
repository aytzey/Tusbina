import { memo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SvgUri } from "react-native-svg";
import { PodcastArtwork } from "./PodcastArtwork";

interface PodcastCoverProps {
  uri?: string;
  title: string;
  subtitle?: string;
  voice?: string;
  size?: number;
}

const SVG_PATTERN = /\.svg($|[?#])/i;

function PodcastCoverComponent({
  uri,
  title,
  subtitle,
  voice,
  size = 120,
}: PodcastCoverProps) {
  const borderRadius = Math.max(18, Math.round(size * 0.18));

  if (!uri) {
    return <PodcastArtwork title={title} subtitle={subtitle} voice={voice} size={size} />;
  }

  if (SVG_PATTERN.test(uri)) {
    return (
      <View style={[styles.frame, { width: size, height: size, borderRadius }]}>
        <SvgUri uri={uri} width={size} height={size} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius }}
      resizeMode="cover"
    />
  );
}

export const PodcastCover = memo(PodcastCoverComponent);

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
});
