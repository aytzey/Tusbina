const CONFIGURED_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const API_BASE_URL = normalizeBaseUrl(CONFIGURED_API_BASE_URL);

let activeApiBaseUrl = API_BASE_URL;

export function getActiveApiBaseUrl(): string {
  return activeApiBaseUrl;
}

export function setActiveApiBaseUrl(nextBaseUrl: string): void {
  activeApiBaseUrl = normalizeBaseUrl(nextBaseUrl);
}

export function buildApiUrl(path: string, baseUrl = activeApiBaseUrl): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
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

export function getApiBaseCandidates(): string[] {
  if (!isWebRuntime()) {
    return [API_BASE_URL];
  }

  const fallbackBases = buildWebFallbackBaseUrls();
  return dedupe([activeApiBaseUrl, API_BASE_URL, ...fallbackBases]);
}

export async function resolveReachableApiUrl(path: string): Promise<string> {
  if (!isWebRuntime()) {
    return buildApiUrl(path);
  }

  for (const baseUrl of getApiBaseCandidates()) {
    const targetUrl = buildApiUrl(path, baseUrl);
    try {
      const response = await fetch(targetUrl, { method: "HEAD" });
      if (!response.ok) {
        continue;
      }
      setActiveApiBaseUrl(baseUrl);
      return targetUrl;
    } catch {
      continue;
    }
  }

  return buildApiUrl(path);
}

function getApiOrigin(): string | null {
  try {
    const parsed = new URL(activeApiBaseUrl);
    return parsed.origin;
  } catch {
    return null;
  }
}

function buildWebFallbackBaseUrls(): string[] {
  const fallbacks: string[] = [];

  try {
    const configured = new URL(API_BASE_URL);
    const apiPath = configured.pathname.replace(/\/+$/, "") || "/api/v1";
    const port = configured.port || "8090";
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    const currentHost = window.location.hostname;

    fallbacks.push(`${protocol}://${currentHost}:${port}${apiPath}`);
    if (currentHost !== "127.0.0.1") {
      fallbacks.push(`http://127.0.0.1:${port}${apiPath}`);
    }
    if (currentHost !== "localhost") {
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
