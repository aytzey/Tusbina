import { useEffect } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { QuotaLimitModal } from "@/components";
import { RootNavigator } from "@/navigation";
import { useCoursesStore, usePlayerStore, usePodcastsStore, useUserStore } from "@/state/stores";
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
  const loadCourses = useCoursesStore((state) => state.loadCourses);
  const loadPodcasts = usePodcastsStore((state) => state.loadPodcasts);
  const syncUsage = useUserStore((state) => state.syncUsage);

  useEffect(() => {
    void loadCourses();
    void loadPodcasts();
    void syncUsage();
  }, [loadCourses, loadPodcasts, syncUsage]);
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
  usePlaybackQuotaSync();

  return (
    <NavigationContainer theme={appTheme}>
      <StatusBar style="light" />
      <RootNavigator />
      <QuotaLimitModal />
    </NavigationContainer>
  );
}
