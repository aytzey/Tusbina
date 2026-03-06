export type SourceType = "course" | "ai";
export type CoursePartStatus = "completed" | "inProgress" | "locked" | "new";
export type PodcastPartStatus = "ready" | "queued" | "processing" | "failed";
export type PodcastFormat = "narrative" | "summary" | "qa";

export interface User {
  id: string;
  name: string;
  isPremium: boolean;
  monthlyListenQuotaSec: number;
  monthlyUsedSec: number;
}

export interface CoursePart {
  id: string;
  courseId: string;
  title: string;
  durationSec: number;
  status: CoursePartStatus;
  lastPositionSec: number;
  audioUrl?: string;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  totalParts: number;
  totalDurationSec: number;
  progressPct: number;
  parts: CoursePart[];
}

export interface PodcastPart {
  id: string;
  podcastId: string;
  title: string;
  durationSec: number;
  pageRange: string;
  status: PodcastPartStatus;
  audioUrl?: string;
  remoteAudioUrl?: string;
  localAudioUrl?: string;
}

export interface Podcast {
  id: string;
  title: string;
  sourceType: SourceType;
  voice: string;
  format: PodcastFormat;
  totalDurationSec: number;
  coverImageUrl?: string;
  coverImageSource?: string;
  parts: PodcastPart[];
  isFavorite?: boolean;
  isDownloaded?: boolean;
  progressSec?: number;
  downloadedAt?: string;
}

export interface Feedback {
  rating: number;
  tags: string[];
  text: string;
  createdAt: string;
  contentId: string;
}

export interface Track {
  id: string;
  title: string;
  subtitle: string;
  durationSec: number;
  sourceType: SourceType;
  audioUrl?: string;
  remoteAudioUrl?: string;
  localAudioUrl?: string;
  parentId?: string;
  resumePositionSec?: number;
  voice?: string;
  partStatus?: PodcastPartStatus;
  coverImageUrl?: string;
}

export interface UploadFileItem {
  localId: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  kind?: "document" | "cover";
}
