export interface ApiCoursePart {
  id: string;
  course_id: string;
  title: string;
  duration_sec: number;
  status: "completed" | "inProgress" | "locked" | "new";
  last_position_sec: number;
  audio_url?: string | null;
}

export interface ApiCourse {
  id: string;
  title: string;
  category: string;
  total_parts: number;
  total_duration_sec: number;
  progress_pct: number;
  parts: ApiCoursePart[];
}

export interface ApiPodcastPart {
  id: string;
  podcast_id: string;
  title: string;
  duration_sec: number;
  page_range: string;
  status: "ready" | "queued" | "processing" | "failed";
  audio_url?: string | null;
}

export interface ApiPodcast {
  id: string;
  title: string;
  source_type: "course" | "ai";
  voice: string;
  format: "narrative" | "summary" | "qa";
  total_duration_sec: number;
  parts: ApiPodcastPart[];
  is_favorite?: boolean;
  is_downloaded?: boolean;
  progress_sec?: number;
}

export interface ApiPodcastStatePayload {
  is_favorite?: boolean;
  is_downloaded?: boolean;
  progress_sec?: number;
  increment_progress_sec?: number;
}

export interface ApiUsage {
  monthly_listen_quota_sec: number;
  monthly_used_sec: number;
  remaining_sec: number;
  is_premium: boolean;
  consumed_sec?: number;
  limit_reached?: boolean;
}

export interface ApiUploadAsset {
  id: string;
  filename: string;
  public_url: string;
}

export interface ApiUploadResponse {
  ok: boolean;
  files: string[];
  file_ids: string[];
  assets: ApiUploadAsset[];
}

export interface ApiGenerateRequest {
  title: string;
  voice: string;
  format: "narrative" | "summary" | "qa";
  file_ids: string[];
  sections?: {
    id: string;
    title: string;
    enabled: boolean;
    source_file_id?: string;
  }[];
}

export interface ApiGenerateResponse {
  job_id: string;
  status: "queued";
}

export interface ApiGenerateStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress_pct: number;
  result_podcast_id?: string | null;
  error?: string | null;
}

export interface ApiPodcastPartOrderPayload {
  part_ids: string[];
}

export interface ApiDeletePodcastResponse {
  ok: boolean;
  podcast_id: string;
  deleted_parts: number;
  deleted_files: number;
}

export interface ApiQuizQuestion {
  id: string;
  podcast_id: string;
  category: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface ApiQuizGenerateResponse {
  podcast_id: string;
  questions: ApiQuizQuestion[];
}

export interface ApiQuizGenerateRequest {
  podcast_id: string;
  part_id?: string;
  question_count?: number;
}
