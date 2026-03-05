import { apiRequest } from "./httpClient";

interface SubmitFeedbackPayload {
  rating: number;
  tags: string[];
  text: string;
  content_id: string;
}

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<void> {
  await apiRequest<{ ok: boolean }>("/feedback", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
