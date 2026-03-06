import { useAuthStore } from "@/state/stores/authStore";
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

  // Build auth headers: prefer Bearer token, fall back to x-user-id
  const authHeaders: Record<string, string> = {};
  const accessToken = useAuthStore.getState().getAccessToken();
  if (accessToken) {
    authHeaders["Authorization"] = `Bearer ${accessToken}`;
  } else {
    authHeaders["x-user-id"] = userId;
  }

  for (const baseUrl of candidateBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...(isJson ? { "Content-Type": "application/json" } : {}),
          ...authHeaders,
          ...headers
        },
        body
      });
      const text = await response.text();
      const payload = text ? safeJsonParse(text) : null;

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
