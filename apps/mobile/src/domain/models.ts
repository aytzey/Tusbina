export type SourceType = "course" | "ai";
export type CoursePartStatus = "completed" | "inProgress" | "locked" | "new";
export type PodcastPartStatus = "ready" | "queued" | "failed";
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
}

export interface Podcast {
  id: string;
  title: string;
  sourceType: SourceType;
  voice: string;
  format: PodcastFormat;
  totalDurationSec: number;
  parts: PodcastPart[];
  isFavorite?: boolean;
  isDownloaded?: boolean;
  progressSec?: number;
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
  parentId?: string;
  resumePositionSec?: number;
  voice?: string;
}

export interface UploadFileItem {
  localId: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
}
