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

const redirectTo = makeRedirectUri({ scheme: "tusbina", path: "auth/callback" });
const DEV_AUTH_BYPASS_ENABLED = process.env.EXPO_PUBLIC_ENABLE_DEV_AUTH_BYPASS === "true";
const DEV_AUTH_BYPASS_USER_ID = process.env.EXPO_PUBLIC_DEMO_USER_ID ?? "demo-user";
const SUPABASE_CONFIGURED = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

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
      if (isLocalDevAuthBypassEnabled()) {
        set({
          session: null,
          user: buildDevBypassUser(),
          isAuthenticated: true,
          isLoading: false,
          error: null,
          confirmationPending: false,
          requiresLegalAcceptance: false,
        });
        return;
      }

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
      const message = normalizeAuthErrorMessage(err, "Kayıt tamamlanamadı.");
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
      const message = normalizeAuthErrorMessage(err, "Giriş yapılamadı.");
      set({ isLoading: false, error: message });
      return false;
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null, confirmationPending: false });
    try {
      assertSupabaseConfigured();

      if (Platform.OS === "web") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
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
      if (result.type !== "success") {
        set({ isLoading: false });
        return false;
      }

      const didAuthenticate = await applyAuthSessionFromRedirect(result.url);
      if (!didAuthenticate) {
        throw new Error("Google oturumu tamamlanamadı. Lütfen tekrar dene.");
      }

      set({ isLoading: false });
      return true;
    } catch (err: unknown) {
      const message = normalizeAuthErrorMessage(err, "Google ile giriş yapılamadı.");
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
      assertSupabaseConfigured();
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
      const message = normalizeAuthErrorMessage(err, "Apple ile giriş yapılamadı.");
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
  return extractUrlParams(url, "hash");
}

function extractQueryParams(url: string): Map<string, string> {
  return extractUrlParams(url, "query");
}

function extractUrlParams(url: string, source: "hash" | "query"): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const target =
      source === "hash"
        ? url.includes("#")
          ? url.split("#")[1]
          : ""
        : url.includes("?")
          ? url.split("?")[1]?.split("#")[0] ?? ""
          : "";
    if (!target) {
      return map;
    }
    for (const pair of target.split("&")) {
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

async function applyAuthSessionFromRedirect(url: string): Promise<boolean> {
  const redirectError = extractRedirectError(url);
  if (redirectError) {
    throw new Error(redirectError);
  }

  const queryParams = extractQueryParams(url);
  const code = queryParams.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    return Boolean(data.session);
  }

  const hashParams = extractHashParams(url);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw error;
    }
    return Boolean(data.session);
  }

  return false;
}

function extractRedirectError(url: string): string | null {
  const queryParams = extractQueryParams(url);
  const hashParams = extractHashParams(url);
  const message =
    queryParams.get("error_description") ??
    hashParams.get("error_description") ??
    queryParams.get("error") ??
    hashParams.get("error");

  return message ? decodeURIComponent(message.replace(/\+/g, " ")) : null;
}

function assertSupabaseConfigured() {
  if (!SUPABASE_CONFIGURED) {
    throw new Error("Sosyal giriş şu anda yapılandırılmamış. Lütfen destek ekibiyle iletişime geç.");
  }
}

function normalizeAuthErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (!message) {
    return fallback;
  }
  if (lower.includes("invalid login credentials")) {
    return "E-posta veya şifre hatalı.";
  }
  if (lower.includes("email not confirmed")) {
    return "E-posta adresini onayladıktan sonra giriş yapabilirsin.";
  }
  if (lower.includes("user already registered")) {
    return "Bu e-posta adresiyle daha önce hesap oluşturulmuş.";
  }
  if (lower.includes("password should be at least")) {
    return "Şifre en az 6 karakter olmalı.";
  }
  if (lower.includes("provider is not enabled")) {
    return "Google ile giriş henüz aktif değil.";
  }
  if (lower.includes("network request failed") || lower.includes("fetch failed")) {
    return "Bağlantı kurulamadı. İnternet erişimini kontrol edip tekrar dene.";
  }
  if (lower.includes("oauth") || lower.includes("redirect")) {
    return "Sosyal giriş yönlendirmesi tamamlanamadı. Lütfen tekrar dene.";
  }
  return message;
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

function isLocalDevAuthBypassEnabled(): boolean {
  if (!DEV_AUTH_BYPASS_ENABLED || Platform.OS !== "web") {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }

  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function buildDevBypassUser(): User {
  const now = new Date().toISOString();

  return {
    id: DEV_AUTH_BYPASS_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: `${DEV_AUTH_BYPASS_USER_ID}@local.tusbina.test`,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: {
      provider: "email",
      providers: ["email"],
    },
    user_metadata: {
      display_name: "Demo Öğrenci",
      legal_acceptance: {
        privacy_policy_version: LEGAL_DOCUMENT_VERSIONS.privacyPolicy,
        terms_of_use_version: LEGAL_DOCUMENT_VERSIONS.termsOfUse,
        kvkk_notice_version: LEGAL_DOCUMENT_VERSIONS.kvkkNotice,
        accepted_at: now,
        marketing_opt_in: false,
        marketing_consent_version: null,
        marketing_consent_updated_at: now,
      },
    },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User;
}
