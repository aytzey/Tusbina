import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerStore, useUserStore } from "@/state/stores";
import { colors, fw, radius, spacing, touch, typography } from "@/theme";

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

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

  /* ── Animated progress ── */
  const animProgress = useRef(new Animated.Value(0)).current;

  /* ── Play button spring ── */
  const playScale = useRef(new Animated.Value(1)).current;

  const duration = track ? (playbackDurationSec > 0 ? playbackDurationSec : track.durationSec) : 0;
  const progressPct = duration > 0 ? Math.min(100, (positionSec / duration) * 100) : 0;

  /* Smooth progress animation — must be before any early return */
  useEffect(() => {
    Animated.timing(animProgress, {
      toValue: progressPct,
      duration: 300,
      easing: EASE_OUT_EXPO,
      useNativeDriver: false,
    }).start();
  }, [progressPct]);

  const progressWidth = animProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  if (!track) return null;

  const handleTogglePlay = () => {
    /* Spring press feedback */
    playScale.setValue(0.85);
    Animated.spring(playScale, {
      toValue: 1,
      tension: 250,
      friction: 12,
      useNativeDriver: true,
    }).start();

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
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
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
        <Animated.View style={{ transform: [{ scale: playScale }] }}>
          <Pressable
            style={styles.playBtn}
            onPress={handleTogglePlay}
            hitSlop={touch.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Duraklat" : "Oynat"}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={20}
              color={colors.textPrimary}
            />
          </Pressable>
        </Animated.View>

        {/* Close */}
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={stop}
          hitSlop={touch.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surfaceNavyLight,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.motivationOrange,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: radius.xs,
    backgroundColor: colors.cardBgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    ...fw.semiBold,
  },
  subtitle: {
    ...typography.small,
    color: colors.textTertiary,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: touch.minSize,
    height: touch.minSize,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
});
