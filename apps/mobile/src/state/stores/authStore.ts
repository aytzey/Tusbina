import { Platform } from "react-native";
import { create } from "zustand";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import {
  LEGAL_DOCUMENT_VERSIONS,
  getLegalAcceptance,
  hasAcceptedRequiredLegal,
  type LegalAcceptanceMetadata,
} from "@/content/legal";
import { buildApiUrl, getApiBaseCandidates, setActiveApiBaseUrl } from "@/services/api/baseUrl";
import { supabase } from "@/services/supabase";
import type { Session, User } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri();

interface AuthState {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  confirmationPending: boolean;
  requiresLegalAcceptance: boolean;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string, marketingOptIn: boolean) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  completeRequiredConsents: (marketingOptIn: boolean) => Promise<boolean>;
  updateMarketingConsent: (marketingOptIn: boolean) => Promise<boolean>;
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
  requiresLegalAcceptance: false,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }

      const session = data.session;
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
        requiresLegalAcceptance: session ? !hasAcceptedRequiredLegal(session.user) : false,
      });

      if (session) {
        syncProfileToBackend(session.access_token, getUserDisplayName(session.user)).catch(() => {});
      }

      supabase.auth.onAuthStateChange((_event, newSession) => {
        set({
          session: newSession,
          user: newSession?.user ?? null,
          isAuthenticated: !!newSession,
          requiresLegalAcceptance: newSession ? !hasAcceptedRequiredLegal(newSession.user) : false,
        });
        if (newSession) {
          syncProfileToBackend(newSession.access_token, getUserDisplayName(newSession.user)).catch(() => {});
        }
      });
    } catch {
      set({
        isLoading: false,
        isAuthenticated: false,
        session: null,
        user: null,
        requiresLegalAcceptance: false,
      });
    }
  },

  signUp: async (email, password, displayName, marketingOptIn) => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      const legalAcceptance = buildNextLegalAcceptance(null, marketingOptIn, true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            legal_acceptance: legalAcceptance,
          },
        },
      });
      if (error) {
        throw error;
      }

      const session = data.session;

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
        requiresLegalAcceptance: false,
      });

      if (session) {
        await Promise.allSettled([
          syncProfileToBackend(session.access_token, displayName),
          syncLegalConsentToBackend(session.access_token, {
            required_consents_accepted: true,
            marketing_opt_in: marketingOptIn,
          }),
        ]);
      }

      return !!session;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Kayıt başarısız";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      const session = data.session;
      set({
        session,
        user: data.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
        requiresLegalAcceptance: !!session && !hasAcceptedRequiredLegal(data.user),
      });

      if (session) {
        syncProfileToBackend(session.access_token, getUserDisplayName(data.user)).catch(() => {});
      }

      return !!session;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Giriş başarısız";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      if (Platform.OS === "web") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) {
          throw error;
        }
        return true;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) {
        throw error;
      }
      if (!data.url) {
        throw new Error("OAuth URL alınamadı");
      }

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
          if (sessionError) {
            throw sessionError;
          }
          set({ isLoading: false });
          return true;
        }
      }

      set({ isLoading: false });
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google giriş başarısız";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signInWithApple: async () => {
    if (Platform.OS !== "ios") {
      set({ error: "Apple ile giriş sadece iOS'ta kullanılabilir" });
      return false;
    }

    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      const AppleAuth = await import("expo-apple-authentication");
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.EMAIL,
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("Apple kimlik tokeni alınamadı");
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) {
        throw error;
      }

      set({ isLoading: false });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Apple giriş başarısız";
      if (message.includes("cancelled") || message.includes("ERR_CANCELED")) {
        set({ isLoading: false });
        return false;
      }
      set({ isLoading: false, error: message });
      return false;
    }
  },

  completeRequiredConsents: async (marketingOptIn) => {
    set({ isLoading: true, error: null });
    try {
      const session = get().session;
      const user = get().user;
      if (!session || !user) {
        throw new Error("Oturum bulunamadı.");
      }

      const nextAcceptance = buildNextLegalAcceptance(user, marketingOptIn, true);
      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata ?? {}),
          legal_acceptance: nextAcceptance,
        },
      });
      if (error) {
        throw error;
      }

      await syncLegalConsentToBackend(session.access_token, {
        required_consents_accepted: true,
        marketing_opt_in: marketingOptIn,
      });

      const nextUser = data.user ?? user;
      set({
        user: nextUser,
        isLoading: false,
        requiresLegalAcceptance: !hasAcceptedRequiredLegal(nextUser),
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Yasal onaylar kaydedilemedi";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  updateMarketingConsent: async (marketingOptIn) => {
    set({ isLoading: true, error: null });
    try {
      const session = get().session;
      const user = get().user;
      if (!session || !user) {
        throw new Error("Oturum bulunamadı.");
      }

      const nextAcceptance = buildNextLegalAcceptance(user, marketingOptIn, hasAcceptedRequiredLegal(user));
      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata ?? {}),
          legal_acceptance: nextAcceptance,
        },
      });
      if (error) {
        throw error;
      }

      await syncLegalConsentToBackend(session.access_token, {
        marketing_opt_in: marketingOptIn,
      });

      const nextUser = data.user ?? user;
      set({
        user: nextUser,
        isLoading: false,
        requiresLegalAcceptance: !hasAcceptedRequiredLegal(nextUser),
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Açık rıza tercihi güncellenemedi";
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
        requiresLegalAcceptance: data.user ? !hasAcceptedRequiredLegal(data.user) : state.requiresLegalAcceptance,
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
        requiresLegalAcceptance: false,
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
    if (!hash) {
      return map;
    }
    for (const pair of hash.split("&")) {
      const [key, val] = pair.split("=");
      if (key && val) {
        map.set(decodeURIComponent(key), decodeURIComponent(val));
      }
    }
  } catch {
    // ignore parse errors
  }
  return map;
}

async function syncProfileToBackend(accessToken: string, displayName?: string) {
  const body: Record<string, string> = {};
  if (displayName) {
    body.display_name = displayName;
  }
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

async function syncLegalConsentToBackend(
  accessToken: string,
  payload: { required_consents_accepted?: boolean; marketing_opt_in: boolean }
) {
  let lastError: unknown = null;

  for (const baseUrl of getApiBaseCandidates()) {
    try {
      const response = await fetch(buildApiUrl("/auth/legal-consent", baseUrl), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Legal consent sync failed (${response.status})`);
      }

      setActiveApiBaseUrl(baseUrl);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Legal consent sync failed");
}

function buildNextLegalAcceptance(
  user: User | null | undefined,
  marketingOptIn: boolean,
  acceptRequired: boolean
): LegalAcceptanceMetadata {
  const current = getLegalAcceptance(user) ?? {};
  const acceptedAt = acceptRequired ? current.accepted_at ?? new Date().toISOString() : current.accepted_at;

  return {
    ...current,
    privacy_policy_version: acceptRequired
      ? LEGAL_DOCUMENT_VERSIONS.privacyPolicy
      : current.privacy_policy_version,
    terms_of_use_version: acceptRequired
      ? LEGAL_DOCUMENT_VERSIONS.termsOfUse
      : current.terms_of_use_version,
    kvkk_notice_version: acceptRequired ? LEGAL_DOCUMENT_VERSIONS.kvkkNotice : current.kvkk_notice_version,
    accepted_at: acceptedAt,
    marketing_opt_in: marketingOptIn,
    marketing_consent_version: marketingOptIn ? LEGAL_DOCUMENT_VERSIONS.marketingConsent : null,
    marketing_consent_updated_at: new Date().toISOString(),
  };
}

function getUserDisplayName(user: User | null | undefined): string | undefined {
  const value = user?.user_metadata?.display_name;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
