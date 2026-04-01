export type VideoModel = "kling" | "wan";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type ScriptStyle =
  | "educational"
  | "comedy"
  | "horror"
  | "asmr"
  | "storytime"
  | "drama";

export type SeriesGenre =
  | "drama"
  | "comedy"
  | "thriller"
  | "romance"
  | "sci-fi"
  | "fantasy"
  | "horror";

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

// ─── Script (single viral video) ─────────────────────────

export interface Scene {
  id: string;
  order: number;
  narration: string;
  visualPrompt: string;
  setting: string;
  duration: 5 | 10;
  jobId?: string;
}

export interface Script {
  id: string;
  topic: string;
  style: ScriptStyle;
  hook: string;
  hashtags: string[];
  scenes: Scene[];
  createdAt: string;
}

// ─── Series (multi-episode drama) ────────────────────────

export interface Character {
  id: string;
  seriesId: string;
  name: string;
  appearance: string;
  personality: string;
  role: "protagonist" | "antagonist" | "supporting";
  backstory: string;
  voiceStyle: "terse" | "dramatic" | "sarcastic" | "warm" | "cold" | "chaotic";
}

export type EpisodeStatus = "scripted" | "queued" | "generating" | "completed";

export interface EpisodeScene extends Scene {
  characterIds: string[];
}

export interface Episode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  cliffhanger: string;
  hashtags: string[];
  status: EpisodeStatus;
  scenes: EpisodeScene[];
  createdAt: string;
}

export interface Series {
  id: string;
  title: string;
  genre: SeriesGenre;
  premise: string;
  worldContext: string;
  characters: Character[];
  episodes: Episode[];
  createdAt: string;
}
