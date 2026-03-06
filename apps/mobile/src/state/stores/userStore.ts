import AsyncStorage from "@react-native-async-storage/async-storage";
import { activatePremiumUsage, addUsagePackage, consumeUsage, fetchUsage } from "@/services/api";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const DEFAULT_QUOTA_SEC = 60 * 60;
const PREMIUM_QUOTA_SEC = 10 * 60 * 60;
const EXTRA_PACKAGE_SEC = 5 * 60 * 60;
const USAGE_FLUSH_BATCH_SEC = 60 * 60;

interface UserState {
  user: {
    id: string;
    name: string;
    isPremium: boolean;
    monthlyListenQuotaSec: number;
    monthlyUsedSec: number;
  };
  pendingUsageSec: number;
  usageFlushInFlight: boolean;
  usageLoading: boolean;
  usageError: string | null;
  limitModalVisible: boolean;
  remainingQuotaSec: () => number;
  canPlay: () => boolean;
  consumeOneSecond: () => boolean;
  flushUsageConsumption: () => Promise<void>;
  openLimitModal: () => void;
  closeLimitModal: () => void;
  activatePremium: () => Promise<void>;
  addExtraPackage: () => Promise<void>;
  logoutMock: () => void;
  resetMonthlyUsage: () => void;
  syncUsage: () => Promise<void>;
}

const DEFAULT_USER = {
  id: "demo-user",
  name: "Kullanıcı",
  isPremium: false,
  monthlyListenQuotaSec: DEFAULT_QUOTA_SEC,
  monthlyUsedSec: 0
};

function applyUsageToState(usage: {
  is_premium: boolean;
  monthly_listen_quota_sec: number;
  monthly_used_sec: number;
}, pendingUsageSec = 0) {
  const normalizedUsedSec = Math.min(
    usage.monthly_used_sec + pendingUsageSec,
    usage.monthly_listen_quota_sec
  );

  return (state: UserState) => ({
    user: {
      ...state.user,
      isPremium: usage.is_premium,
      monthlyListenQuotaSec: usage.monthly_listen_quota_sec,
      monthlyUsedSec: normalizedUsedSec
    }
  });
}

function applyServerUsage(usage: {
  is_premium: boolean;
  monthly_listen_quota_sec: number;
  monthly_used_sec: number;
}) {
  return (state: UserState) => applyUsageToState(usage, state.pendingUsageSec)(state);
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: DEFAULT_USER,
      pendingUsageSec: 0,
      usageFlushInFlight: false,
      usageLoading: false,
      usageError: null,
      limitModalVisible: false,
      remainingQuotaSec: () => {
        const { monthlyListenQuotaSec, monthlyUsedSec } = get().user;
        return Math.max(monthlyListenQuotaSec - monthlyUsedSec, 0);
      },
      canPlay: () => get().remainingQuotaSec() > 0,
      consumeOneSecond: () => {
        const current = get();
        const remaining = current.remainingQuotaSec();

        if (remaining <= 0) {
          set({ limitModalVisible: true });
          return false;
        }

        set((state) => ({
          user: {
            ...state.user,
            monthlyUsedSec: Math.min(state.user.monthlyUsedSec + 1, state.user.monthlyListenQuotaSec)
          },
          pendingUsageSec: state.pendingUsageSec + 1
        }));
        return true;
      },
      flushUsageConsumption: async () => {
        const { pendingUsageSec, usageFlushInFlight } = get();
        if (usageFlushInFlight || pendingUsageSec <= 0) {
          return;
        }

        set({ usageFlushInFlight: true });

        try {
          let continueFlush = true;
          while (continueFlush) {
            const stateBefore = get();
            if (stateBefore.pendingUsageSec <= 0) {
              break;
            }

            const secondsToFlush = Math.min(stateBefore.pendingUsageSec, USAGE_FLUSH_BATCH_SEC);
            const usage = await consumeUsage(secondsToFlush);
            const consumedSec = Math.min(Math.max(usage.consumed_sec ?? secondsToFlush, 0), secondsToFlush);

            set((state) => ({
              ...applyUsageToState(usage, Math.max(state.pendingUsageSec - consumedSec, 0))(state),
              pendingUsageSec: Math.max(state.pendingUsageSec - consumedSec, 0),
              usageError: null,
              limitModalVisible: usage.limit_reached ? true : state.limitModalVisible
            }));

            if (usage.limit_reached || consumedSec < secondsToFlush) {
              continueFlush = false;
            }
          }
          set({ usageFlushInFlight: false });
        } catch {
          set({ usageFlushInFlight: false, usageError: "Kullanım senkronlanamadı." });
        }
      },
      openLimitModal: () => set({ limitModalVisible: true }),
      closeLimitModal: () => set({ limitModalVisible: false }),
      activatePremium: async () => {
        set((state) => ({
          user: {
            ...state.user,
            isPremium: true,
            monthlyListenQuotaSec: Math.max(state.user.monthlyListenQuotaSec, PREMIUM_QUOTA_SEC)
          },
          usageLoading: true,
          usageError: null,
          limitModalVisible: false
        }));

        try {
          const usage = await activatePremiumUsage();
          set((state) => ({
            ...applyServerUsage(usage)(state),
            usageLoading: false
          }));
        } catch {
          set({ usageLoading: false, usageError: "Premium aktivasyonu senkronlanamadı." });
        }
      },
      addExtraPackage: async () => {
        set((state) => ({
          user: {
            ...state.user,
            monthlyListenQuotaSec: state.user.monthlyListenQuotaSec + EXTRA_PACKAGE_SEC
          },
          usageLoading: true,
          usageError: null
        }));

        try {
          const usage = await addUsagePackage(EXTRA_PACKAGE_SEC);
          set((state) => ({
            ...applyServerUsage(usage)(state),
            usageLoading: false
          }));
        } catch {
          set({ usageLoading: false, usageError: "Ek paket senkronlanamadı." });
        }
      },
      logoutMock: () =>
        set({
          user: DEFAULT_USER,
          pendingUsageSec: 0,
          usageFlushInFlight: false,
          usageLoading: false,
          usageError: null,
          limitModalVisible: false
        }),
      resetMonthlyUsage: () =>
        set((state) => ({
          user: {
            ...state.user,
            monthlyUsedSec: 0
          },
          pendingUsageSec: 0
        })),
      syncUsage: async () => {
        set({ usageLoading: true, usageError: null });
        try {
          const usage = await fetchUsage();
          set((state) => ({
            ...applyServerUsage(usage)(state),
            usageLoading: false
          }));
        } catch {
          set({ usageLoading: false, usageError: "Kullanım bilgisi güncellenemedi." });
        }
      }
    }),
    {
      name: "tusbina-user-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user, pendingUsageSec: state.pendingUsageSec })
    }
  )
);
