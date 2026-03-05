export type VideoModel = "kling" | "wan";

export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface VideoJob {
  id: string;
  prompt: string;
  model: VideoModel;
  status: JobStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  duration?: number; // seconds
  aspectRatio?: "16:9" | "9:16" | "1:1";
  createdAt: string;
  completedAt?: string;
  templateId?: string;
  views?: number;
  likes?: number;
}

export interface VideoTemplate {
  id: string;
  name: string;
  promptTemplate: string; // supports {{variable}} placeholders
  variables: Record<string, string[]>; // variable name -> possible values
  model: VideoModel | "both";
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: 5 | 10;
  createdAt: string;
}

export interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface GenerateRequest {
  prompt: string;
  model: VideoModel | "both";
  aspectRatio?: "16:9" | "9:16" | "1:1";
  duration?: 5 | 10;
  templateId?: string;
}
