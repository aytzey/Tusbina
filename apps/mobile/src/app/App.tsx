import { useEffect } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { PlaybackController } from "@/app/PlaybackController";
import { QuotaLimitModal } from "@/components";
import { RootNavigator } from "@/navigation";
import {
  useAuthStore,
  useCoursesStore,
  useDownloadsStore,
  useLearningToolsStore,
  usePlayerStore,
  usePodcastsStore,
  useUserStore,
} from "@/state/stores";
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

function useUserScopedStores() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUserId = useAuthStore((state) => state.user?.id ?? null);
  const bindDownloadsToUser = useDownloadsStore((state) => state.bindToUser);
  const bindLearningToolsToUser = useLearningToolsStore((state) => state.bindToUser);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }
    bindDownloadsToUser(authUserId).catch(() => undefined);
    bindLearningToolsToUser(authUserId);
  }, [authUserId, bindDownloadsToUser, bindLearningToolsToUser, isAuthenticated]);
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
  const recordListeningSecond = useLearningToolsStore((state) => state.recordListeningSecond);

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
      recordListeningSecond();
      if (!activeTrack?.audioUrl) {
        tick();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrack?.audioUrl, consumeOneSecond, flushUsageConsumption, isPlaying, pause, recordListeningSecond, tick]);

  useEffect(() => {
    const interval = setInterval(() => {
      void flushUsageConsumption();
    }, 15000);

    return () => clearInterval(interval);
  }, [flushUsageConsumption]);
}

function useLearningToolsClock() {
  const resetTodayIfNeeded = useLearningToolsStore((state) => state.resetTodayIfNeeded);
  const tickStopwatch = useLearningToolsStore((state) => state.tickStopwatch);

  useEffect(() => {
    resetTodayIfNeeded();
    const interval = setInterval(() => {
      resetTodayIfNeeded();
      tickStopwatch();
    }, 1000);

    return () => clearInterval(interval);
  }, [resetTodayIfNeeded, tickStopwatch]);
}

export function App() {
  useUserScopedStores();
  useBootstrapData();
  usePendingPodcastSync();
  usePlaybackQuotaSync();
  useLearningToolsClock();

  return (
    <NavigationContainer theme={appTheme}>
      <StatusBar style="light" />
      <PlaybackController />
      <RootNavigator />
      <QuotaLimitModal />
    </NavigationContainer>
  );
}
