import { Platform } from "react-native";
import { create } from "zustand";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { buildApiUrl, getApiBaseCandidates, setActiveApiBaseUrl } from "@/services/api/baseUrl";
import { supabase } from "@/services/supabase";
import type { Session, User } from "@supabase/supabase-js";

// Needed so the browser dismisses properly on iOS after OAuth
WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri();

interface AuthState {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  confirmationPending: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  updateDisplayName: (displayName: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
  getAccessToken: () => string | null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  confirmationPending: false,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const session = data.session;
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });

      if (session) {
        syncProfileToBackend(session.access_token, getUserDisplayName(session.user)).catch(() => {});
      }

      supabase.auth.onAuthStateChange((_event, newSession) => {
        set({
          session: newSession,
          user: newSession?.user ?? null,
          isAuthenticated: !!newSession,
        });
        // Sync profile on any new sign-in
        if (newSession) {
          syncProfileToBackend(newSession.access_token, getUserDisplayName(newSession.user)).catch(() => {});
        }
      });
    } catch {
      set({ isLoading: false, isAuthenticated: false, session: null, user: null });
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;

      const session = data.session;

      // If no session returned, email confirmation is required
      if (!session && data.user) {
        set({
          isLoading: false,
          confirmationPending: true,
          error: null,
        });
        return false;
      }

      set({
        session,
        user: data.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });

      if (session) {
        syncProfileToBackend(session.access_token, displayName).catch(() => {});
      }

      return !!session;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Kayit basarisiz";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const session = data.session;
      set({
        session,
        user: data.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });

      if (session) {
        syncProfileToBackend(session.access_token, getUserDisplayName(data.user)).catch(() => {});
      }

      return !!session;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Giris basarisiz";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      if (Platform.OS === "web") {
        // On web: full page redirect, onAuthStateChange handles the rest
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
        // Page will redirect — no need to set isLoading false
        return true;
      }

      // On mobile: use in-app browser
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("OAuth URL alinamadi");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        const url = result.url;
        const hashParams = extractHashParams(url);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
          set({ isLoading: false });
          return true;
        }
      }

      set({ isLoading: false });
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google giris basarisiz";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signInWithApple: async () => {
    if (Platform.OS !== "ios") {
      set({ error: "Apple ile giris sadece iOS'ta kullanilabilir" });
      return false;
    }

    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      // Dynamic import to avoid crash on non-iOS
      const AppleAuth = await import("expo-apple-authentication");
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.EMAIL,
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("Apple kimlik tokeni alinamadi");
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) throw error;

      set({ isLoading: false });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Apple giris basarisiz";
      // User cancelled = not an error
      if (message.includes("cancelled") || message.includes("ERR_CANCELED")) {
        set({ isLoading: false });
        return false;
      }
      set({ isLoading: false, error: message });
      return false;
    }
  },

  updateDisplayName: async (displayName) => {
    set({ error: null });
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: displayName },
      });
      if (error) {
        throw error;
      }

      set((state) => ({
        user: data.user ?? state.user,
      }));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Profil güncellenemedi";
      set({ error: message });
      return false;
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      await supabase.auth.signOut();
    } finally {
      set({
        session: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  clearError: () => set({ error: null, confirmationPending: false }),

  getAccessToken: () => get().session?.access_token ?? null,
}));

function extractHashParams(url: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const hash = url.includes("#") ? url.split("#")[1] : "";
    if (!hash) return map;
    for (const pair of hash.split("&")) {
      const [key, val] = pair.split("=");
      if (key && val) map.set(decodeURIComponent(key), decodeURIComponent(val));
    }
  } catch {
    // ignore parse errors
  }
  return map;
}

async function syncProfileToBackend(accessToken: string, displayName?: string) {
  const body: Record<string, string> = {};
  if (displayName) body.display_name = displayName;
  let lastError: unknown = null;

  for (const baseUrl of getApiBaseCandidates()) {
    try {
      const response = await fetch(buildApiUrl("/auth/profile", baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Profile sync failed (${response.status})`);
      }

      setActiveApiBaseUrl(baseUrl);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Profile sync failed");
}

function getUserDisplayName(user: User | null | undefined): string | undefined {
  const value = user?.user_metadata?.display_name;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
