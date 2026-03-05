import { apiRequest } from "./httpClient";
import { ApiQuizGenerateRequest, ApiQuizGenerateResponse, ApiQuizQuestion } from "./types";

export async function fetchQuizQuestions(podcastId: string): Promise<ApiQuizQuestion[]> {
  return apiRequest<ApiQuizQuestion[]>(`/quiz/${podcastId}`, { method: "GET" });
}

export async function generateQuizQuestions(
  podcastId: string,
  partId?: string
): Promise<ApiQuizGenerateResponse> {
  const payload: ApiQuizGenerateRequest = { podcast_id: podcastId };
  if (partId) {
    payload.part_id = partId;
  }

  return apiRequest<ApiQuizGenerateResponse>("/quiz/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
