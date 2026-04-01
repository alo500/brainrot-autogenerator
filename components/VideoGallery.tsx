"use client";

import { useState } from "react";
import useSWR from "swr";
import type { VideoJob } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_STYLES: Record<VideoJob["status"], string> = {
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  processing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

const MODEL_STYLES: Record<VideoJob["model"], string> = {
  kling: "bg-orange-500/10 text-orange-400",
  wan: "bg-cyan-500/10 text-cyan-400",
};

interface Props {
  refreshKey?: number;
}

export default function VideoGallery({ refreshKey }: Props) {
  const { data, mutate } = useSWR<{ jobs: VideoJob[] }>(
    "/api/videos?limit=50",
    fetcher,
    { refreshInterval: 6000 }
  );

  // Trigger re-fetch when parent signals new job was submitted
  if (refreshKey) mutate();

  const jobs = data?.jobs ?? [];

  if (!jobs.length) {
    return (
      <div className="text-center py-20 text-zinc-600 text-sm">
        No videos yet. Submit a prompt above to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {jobs.map((job) => (
        <VideoCard key={job.id} job={job} onRetry={() => mutate()} />
      ))}
    </div>
  );
}

function VideoCard({
  job,
  onRetry,
}: {
  job: VideoJob;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onRetry();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
      {/* Video preview */}
      <div className="aspect-[9/16] bg-zinc-950 relative flex items-center justify-center">
        {job.status === "completed" && job.videoUrl ? (
          <video
            src={job.videoUrl}
            className="w-full h-full object-cover"
            loop
            muted
            playsInline
            onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
            onMouseLeave={(e) => {
              const v = e.currentTarget as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-700">
            {job.status === "processing" && (
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-xs capitalize">{job.status}</span>
          </div>
        )}

        {/* Download button */}
        {job.status === "completed" && job.videoUrl && (
          <a
            href={job.videoUrl}
            download
            className="absolute top-2 right-2 bg-black/70 text-white rounded-md px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ↓
          </a>
        )}
      </div>

      {/* Meta */}
      <div className="p-3 space-y-2">
        <p className="text-xs text-zinc-300 line-clamp-2">{job.prompt}</p>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODEL_STYLES[job.model]}`}>
            {job.model}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_STYLES[job.status]}`}>
            {job.status}
          </span>
        </div>
        <p className="text-xs text-zinc-600">{timeAgo(job.createdAt)}</p>
        {job.error && (
          <p className="text-xs text-red-400 truncate" title={job.error}>
            {job.error}
          </p>
        )}

        {/* Retry button for failed jobs */}
        {job.status === "failed" && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed border border-zinc-700 hover:border-zinc-600 text-zinc-300 font-medium py-1.5 rounded-lg transition-colors"
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
        {retryError && (
          <p className="text-xs text-red-400">{retryError}</p>
        )}
      </div>
    </div>
  );
}
