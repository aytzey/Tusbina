import { apiRequest } from "./httpClient";
import { ApiQuizGenerateResponse, ApiQuizQuestion } from "./types";

export async function fetchQuizQuestions(podcastId: string): Promise<ApiQuizQuestion[]> {
  return apiRequest<ApiQuizQuestion[]>(`/quiz/${podcastId}`, { method: "GET" });
}

export async function generateQuizQuestions(podcastId: string): Promise<ApiQuizGenerateResponse> {
  return apiRequest<ApiQuizGenerateResponse>("/quiz/generate", {
    method: "POST",
    body: JSON.stringify({ podcast_id: podcastId })
  });
}
