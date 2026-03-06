import { useAuthStore } from "@/state/stores/authStore";
import { supabase } from "@/services/supabase";
import {
  API_BASE_URL,
  buildApiUrl,
  getApiBaseCandidates,
  resolveApiAssetUrl,
  setActiveApiBaseUrl,
} from "./baseUrl";
const DEFAULT_USER_ID = process.env.EXPO_PUBLIC_DEMO_USER_ID ?? "demo-user";

interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  userId?: string;
  isJson?: boolean;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(`API error (${status})`);
    this.status = status;
    this.payload = payload;
  }
}

export function isNetworkApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 0;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { headers = {}, userId = DEFAULT_USER_ID, isJson = true, body, ...init } = options;
  const candidateBaseUrls = getApiBaseCandidates();
  let lastNetworkMessage = "Network request failed";
  const accessToken = useAuthStore.getState().getAccessToken();

  for (const baseUrl of candidateBaseUrls) {
    try {
      let response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: buildRequestHeaders({ accessToken, headers, isJson, userId }),
        body
      });

      if (response.status === 401 && accessToken) {
        const refreshedToken = await refreshAccessToken(accessToken);
        if (refreshedToken) {
          response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: buildRequestHeaders({
              accessToken: refreshedToken,
              headers,
              isJson,
              userId,
            }),
            body,
          });
        }
      }

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw new ApiError(response.status, payload);
      }

      setActiveApiBaseUrl(baseUrl);
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        throw error;
      }

      lastNetworkMessage = error instanceof Error ? error.message : "Network request failed";
      continue;
    }
  }

  throw new ApiError(0, { message: lastNetworkMessage });
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export { API_BASE_URL, buildApiUrl, resolveApiAssetUrl };

function buildRequestHeaders({
  accessToken,
  headers,
  isJson,
  userId,
}: {
  accessToken: string | null;
  headers: Record<string, string>;
  isJson: boolean;
  userId: string;
}): Record<string, string> {
  const authHeaders: Record<string, string> = {};
  if (accessToken) {
    authHeaders.Authorization = `Bearer ${accessToken}`;
  } else {
    authHeaders["x-user-id"] = userId;
  }

  return {
    ...(isJson ? { "Content-Type": "application/json" } : {}),
    ...authHeaders,
    ...headers,
  };
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? safeJsonParse(text) : null;
}

async function refreshAccessToken(staleToken: string): Promise<string | null> {
  try {
    const current = await supabase.auth.getSession();
    const session = current.data.session;
    if (session?.access_token && session.access_token !== staleToken) {
      syncAuthStoreSession(session);
      return session.access_token;
    }
  } catch {
    // Fall through to an explicit refresh.
  }

  try {
    const refreshed = await supabase.auth.refreshSession();
    const session = refreshed.data.session;
    if (session?.access_token) {
      syncAuthStoreSession(session);
      return session.access_token;
    }
  } catch {
    // Surface the original 401 to the caller.
  }

  return null;
}

function syncAuthStoreSession(session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>) {
  useAuthStore.setState({
    session,
    user: session.user,
    isAuthenticated: true,
    error: null,
  });
}
