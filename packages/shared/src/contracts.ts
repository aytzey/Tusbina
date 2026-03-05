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
