import { apiRequest } from "./httpClient";
import { ApiProfile, ApiProfileUpdateRequest } from "./types";

export async function fetchMyProfile(): Promise<ApiProfile> {
  return apiRequest<ApiProfile>("/auth/me", { method: "GET" });
}

export async function updateMyProfile(payload: ApiProfileUpdateRequest): Promise<ApiProfile> {
  return apiRequest<ApiProfile>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
