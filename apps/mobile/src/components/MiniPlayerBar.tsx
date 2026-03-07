import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerStore, useUserStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

export function MiniPlayerBar() {
  const track = usePlayerStore((s) => s.activeTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const playbackDurationSec = usePlayerStore((s) => s.playbackDurationSec);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const stop = usePlayerStore((s) => s.stop);
  const canPlay = useUserStore((s) => s.canPlay);
  const openLimitModal = useUserStore((s) => s.openLimitModal);
  const navigation = useNavigation<any>();

  if (!track) return null;

  const duration = playbackDurationSec > 0 ? playbackDurationSec : track.durationSec;
  const progressPct = duration > 0 ? Math.min(100, (positionSec / duration) * 100) : 0;

  const handleTogglePlay = () => {
    if (isPlaying) {
      pause();
    } else if (!canPlay()) {
      openLimitModal();
    } else {
      play();
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Progress indicator line at top */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      <Pressable
        style={styles.container}
        onPress={() => navigation.navigate("Player")}
      >
        {/* Cover / Icon */}
        <View style={styles.cover}>
          <Ionicons name="headset" size={20} color={colors.motivationOrange} />
        </View>

        {/* Track Info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {track.subtitle}
          </Text>
        </View>

        {/* Play / Pause */}
        <Pressable style={styles.playBtn} onPress={handleTogglePlay} hitSlop={8}>
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={20}
            color={colors.textPrimary}
          />
        </Pressable>

        {/* Close */}
        <Pressable style={styles.closeBtn} onPress={stop} hitSlop={8}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surfaceNavyLight,
    borderTopWidth: 1,
    borderTopColor: colors.dividerStrong,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.cardBgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});
