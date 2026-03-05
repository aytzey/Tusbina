import { create } from "zustand";
import { supabase } from "@/services/supabase";
import type { Session, User } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

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

      // Listen for auth state changes (token refresh, sign out from another tab, etc.)
      supabase.auth.onAuthStateChange((_event, newSession) => {
        set({
          session: newSession,
          user: newSession?.user ?? null,
          isAuthenticated: !!newSession,
        });
      });
    } catch {
      set({ isLoading: false, isAuthenticated: false, session: null, user: null });
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;

      const session = data.session;
      set({
        session,
        user: data.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });

      // Sync profile to our backend
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
    set({ isLoading: true, error: null });
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

      // Sync profile to our backend
      if (session) {
        syncProfileToBackend(session.access_token).catch(() => {});
      }

      return !!session;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Giris basarisiz";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null });
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

  getAccessToken: () => get().session?.access_token ?? null,
}));

async function syncProfileToBackend(accessToken: string, displayName?: string) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
  const body: Record<string, string> = {};
  if (displayName) body.display_name = displayName;

  await fetch(`${apiUrl}/auth/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
}
