import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface LearningToolsState {
  dailyGoalMin: number;
  todayKey: string;
  todayListenedSec: number;
  studyPlan: string;
  stopwatchSec: number;
  stopwatchRunning: boolean;
  setDailyGoalMin: (minutes: number) => void;
  setStudyPlan: (value: string) => void;
  recordListeningSecond: () => void;
  resetTodayIfNeeded: () => void;
  startStopwatch: () => void;
  pauseStopwatch: () => void;
  resetStopwatch: () => void;
  tickStopwatch: () => void;
}

export const useLearningToolsStore = create<LearningToolsState>()(
  persist(
    (set) => ({
      dailyGoalMin: 30,
      todayKey: currentDayKey(),
      todayListenedSec: 0,
      studyPlan: "Bugün için dinlemek istediğin konu başlıklarını buraya yaz.",
      stopwatchSec: 0,
      stopwatchRunning: false,
      setDailyGoalMin: (minutes) =>
        set((state) => ({
          ...normalizeDay(state),
          dailyGoalMin: Math.min(Math.max(Math.round(minutes), 10), 240),
        })),
      setStudyPlan: (value) =>
        set((state) => ({
          ...normalizeDay(state),
          studyPlan: value,
        })),
      recordListeningSecond: () =>
        set((state) => {
          const normalized = normalizeDay(state);
          return {
            ...normalized,
            todayListenedSec: normalized.todayListenedSec + 1,
          };
        }),
      resetTodayIfNeeded: () =>
        set((state) => ({
          ...normalizeDay(state),
        })),
      startStopwatch: () =>
        set((state) => ({
          ...normalizeDay(state),
          stopwatchRunning: true,
        })),
      pauseStopwatch: () =>
        set((state) => ({
          ...normalizeDay(state),
          stopwatchRunning: false,
        })),
      resetStopwatch: () =>
        set((state) => ({
          ...normalizeDay(state),
          stopwatchSec: 0,
          stopwatchRunning: false,
        })),
      tickStopwatch: () =>
        set((state) => {
          const normalized = normalizeDay(state);
          if (!normalized.stopwatchRunning) {
            return normalized;
          }
          return {
            ...normalized,
            stopwatchSec: normalized.stopwatchSec + 1,
          };
        }),
    }),
    {
      name: "tusbina-learning-tools",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

function normalizeDay(state: Pick<LearningToolsState, "todayKey" | "todayListenedSec" | "dailyGoalMin" | "studyPlan" | "stopwatchSec" | "stopwatchRunning">) {
  const todayKey = currentDayKey();
  if (state.todayKey === todayKey) {
    return state;
  }
  return {
    ...state,
    todayKey,
    todayListenedSec: 0,
  };
}

function currentDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
