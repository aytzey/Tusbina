import { apiRequest } from "./httpClient";
import { ApiUsage } from "./types";

export async function fetchUsage(): Promise<ApiUsage> {
  return apiRequest<ApiUsage>("/usage", { method: "GET" });
}

export async function consumeUsage(seconds: number): Promise<ApiUsage> {
  return apiRequest<ApiUsage>("/usage/consume", {
    method: "POST",
    body: JSON.stringify({ seconds })
  });
}

export async function activatePremiumUsage(): Promise<ApiUsage> {
  return apiRequest<ApiUsage>("/usage/premium/activate", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function addUsagePackage(extraSeconds: number): Promise<ApiUsage> {
  return apiRequest<ApiUsage>("/usage/package/add", {
    method: "POST",
    body: JSON.stringify({ extra_seconds: extraSeconds })
  });
}
