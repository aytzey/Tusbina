export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

export interface UsageResponse {
  monthly_listen_quota_sec: number;
  monthly_used_sec: number;
  remaining_sec: number;
  is_premium: boolean;
}

export interface GeneratePodcastResponse {
  job_id: string;
  status: "queued";
}

export type PodcastPartStatus = "ready" | "queued" | "processing" | "failed";

export interface GeneratePodcastStatusResponse {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress_pct: number;
  plan_ready: boolean;
  audio_ready_parts: number;
  audio_total_parts: number;
  result_podcast_id?: string | null;
  error?: string | null;
}

export interface PodcastPartOrderPayload {
  part_ids: string[];
}
