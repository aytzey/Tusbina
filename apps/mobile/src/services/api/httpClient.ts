import { useAuthStore } from "@/state/stores/authStore";

const CONFIGURED_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
export const API_BASE_URL = normalizeBaseUrl(CONFIGURED_API_BASE_URL);
let activeApiBaseUrl = API_BASE_URL;
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

export function resolveApiAssetUrl(rawUrl: string | null | undefined): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  const apiOrigin = getApiOrigin();
  if (!apiOrigin) {
    return rawUrl;
  }

  if (rawUrl.startsWith("/")) {
    return `${apiOrigin}${rawUrl}`;
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return rawUrl;
  } catch {
    const normalized = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
    return `${apiOrigin}${normalized}`;
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

      activeApiBaseUrl = baseUrl;
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

function getApiOrigin(): string | null {
  try {
    const parsed = new URL(activeApiBaseUrl);
    return parsed.origin;
  } catch {
    return null;
  }
}

function getApiBaseCandidates(): string[] {
  if (!isWebRuntime()) {
    return [API_BASE_URL];
  }

  const fallbackBases = buildWebFallbackBaseUrls();
  const host = window.location.hostname;
  const ordered = [API_BASE_URL, ...fallbackBases];
  return dedupe(ordered);
}

function buildWebFallbackBaseUrls(): string[] {
  const fallbacks: string[] = [];

  try {
    const configured = new URL(API_BASE_URL);
    const apiPath = configured.pathname.replace(/\/+$/, "") || "/api/v1";
    const port = configured.port || "8090";
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    const host = window.location.hostname;

    fallbacks.push(`${protocol}://${host}:${port}${apiPath}`);
    if (host !== "127.0.0.1") {
      fallbacks.push(`http://127.0.0.1:${port}${apiPath}`);
    }
    if (host !== "localhost") {
      fallbacks.push(`http://localhost:${port}${apiPath}`);
    }
  } catch {
    // Keep only configured base if URL parsing fails.
  }

  return fallbacks.map(normalizeBaseUrl);
}

function isWebRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function dedupe(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
