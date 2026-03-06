import { Podcast, UploadFileItem } from "@/domain/models";
import { apiRequest } from "./httpClient";
import { mapApiPodcast } from "./mappers";
import {
  ApiDeletePodcastResponse,
  ApiGenerateRequest,
  ApiGenerateResponse,
  ApiGenerateStatus,
  ApiPodcast,
  ApiPodcastPartOrderPayload,
  ApiPodcastStatePayload,
  ApiUploadResponse
} from "./types";

export async function fetchPodcasts(): Promise<Podcast[]> {
  const payload = await apiRequest<ApiPodcast[]>("/podcasts", { method: "GET" });
  return payload.map(mapApiPodcast);
}

export async function fetchPodcastById(podcastId: string): Promise<Podcast> {
  const payload = await apiRequest<ApiPodcast>(`/podcasts/${podcastId}`, { method: "GET" });
  return mapApiPodcast(payload);
}

export async function patchPodcastState(podcastId: string, state: ApiPodcastStatePayload): Promise<Podcast> {
  const payload = await apiRequest<ApiPodcast>(`/podcasts/${podcastId}/state`, {
    method: "PUT",
    body: JSON.stringify(state)
  });
  return mapApiPodcast(payload);
}

export async function uploadPdfFiles(files: UploadFileItem[]): Promise<ApiUploadResponse> {
  const formData = new FormData();
  const isWeb = typeof document !== "undefined";

  for (const file of files) {
    if (isWeb) {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      formData.append("files", new File([blob], file.name, { type: file.mimeType || "application/pdf" }));
    } else {
      formData.append(
        "files",
        {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || "application/pdf"
        } as unknown as Blob
      );
    }
  }

  return apiRequest<ApiUploadResponse>("/upload", {
    method: "POST",
    body: formData,
    isJson: false
  });
}

export async function requestPodcastGeneration(payload: ApiGenerateRequest): Promise<ApiGenerateResponse> {
  return apiRequest<ApiGenerateResponse>("/generatePodcast", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchGenerationStatus(jobId: string): Promise<ApiGenerateStatus> {
  return apiRequest<ApiGenerateStatus>(`/generatePodcast/${jobId}/status`, { method: "GET" });
}

export async function prioritizePodcastPart(podcastId: string, partId: string): Promise<Podcast> {
  const payload = await apiRequest<ApiPodcast>(`/podcasts/${podcastId}/parts/${partId}/prioritize`, {
    method: "POST"
  });
  return mapApiPodcast(payload);
}

export async function reorderPodcastParts(
  podcastId: string,
  state: ApiPodcastPartOrderPayload
): Promise<Podcast> {
  const payload = await apiRequest<ApiPodcast>(`/podcasts/${podcastId}/parts/order`, {
    method: "PUT",
    body: JSON.stringify(state)
  });
  return mapApiPodcast(payload);
}

export async function deletePodcastById(podcastId: string): Promise<ApiDeletePodcastResponse> {
  return apiRequest<ApiDeletePodcastResponse>(`/podcasts/${podcastId}`, {
    method: "DELETE"
  });
}
