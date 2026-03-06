import { useEffect } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { PlaybackController } from "@/app/PlaybackController";
import { QuotaLimitModal } from "@/components";
import { RootNavigator } from "@/navigation";
import { useAuthStore, useCoursesStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
import { colors } from "@/theme";

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.motivationOrange,
    background: colors.primaryNavy,
    card: colors.surfaceNavy,
    text: colors.textPrimary,
    border: colors.divider
  }
};

function useBootstrapData() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadCourses = useCoursesStore((state) => state.loadCourses);
  const loadPodcasts = usePodcastsStore((state) => state.loadPodcasts);
  const syncUsage = useUserStore((state) => state.syncUsage);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadCourses();
    void loadPodcasts();
    void syncUsage();
  }, [isAuthenticated, loadCourses, loadPodcasts, syncUsage]);
}

function usePendingPodcastSync() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const podcasts = usePodcastsStore((state) => state.podcasts);
  const loadPodcasts = usePodcastsStore((state) => state.loadPodcasts);
  const hasPendingParts = podcasts.some((podcast) =>
    podcast.parts.some((part) => part.status === "queued" || part.status === "processing")
  );

  useEffect(() => {
    if (!isAuthenticated || !hasPendingParts) {
      return;
    }

    const interval = setInterval(() => {
      void loadPodcasts();
    }, 3000);

    return () => clearInterval(interval);
  }, [hasPendingParts, isAuthenticated, loadPodcasts]);
}

function usePlaybackQuotaSync() {
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const activeTrack = usePlayerStore((state) => state.activeTrack);
  const tick = usePlayerStore((state) => state.tick);
  const pause = usePlayerStore((state) => state.pause);
  const consumeOneSecond = useUserStore((state) => state.consumeOneSecond);
  const flushUsageConsumption = useUserStore((state) => state.flushUsageConsumption);

  useEffect(() => {
    if (!isPlaying) {
      void flushUsageConsumption();
      return;
    }

    const interval = setInterval(() => {
      const canContinue = consumeOneSecond();
      if (!canContinue) {
        pause();
        void flushUsageConsumption();
        return;
      }
      if (!activeTrack?.audioUrl) {
        tick();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrack?.audioUrl, consumeOneSecond, flushUsageConsumption, isPlaying, pause, tick]);

  useEffect(() => {
    const interval = setInterval(() => {
      void flushUsageConsumption();
    }, 15000);

    return () => clearInterval(interval);
  }, [flushUsageConsumption]);
}

export function App() {
  useBootstrapData();
  usePendingPodcastSync();
  usePlaybackQuotaSync();

  return (
    <NavigationContainer theme={appTheme}>
      <StatusBar style="light" />
      <PlaybackController />
      <RootNavigator />
      <QuotaLimitModal />
    </NavigationContainer>
  );
}
