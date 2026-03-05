"use client";

import { useState } from "react";
import type { GenerateRequest } from "@/types";

interface Props {
  onSubmit?: () => void;
}

export default function PromptForm({ onSubmit }: Props) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<GenerateRequest["model"]>("both");
  const [aspectRatio, setAspectRatio] = useState<GenerateRequest["aspectRatio"]>("9:16");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);

    try {
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, aspectRatio, duration }),
      });
      setSuccess(true);
      setPrompt("");
      onSubmit?.();
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">Generate Video</h2>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your video... e.g. 'satisfying slime mixing ASMR, close up, studio lighting'"
        rows={3}
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as GenerateRequest["model"])}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
          >
            <option value="both">Both (A/B test)</option>
            <option value="kling">Kling only</option>
            <option value="wan">Wan2.1 only</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as GenerateRequest["aspectRatio"])}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
          >
            <option value="9:16">9:16 (TikTok/Reels)</option>
            <option value="16:9">16:9 (YouTube)</option>
            <option value="1:1">1:1 (Square)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) as 5 | 10)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? "Queuing..." : success ? "Queued!" : "Generate"}
          </button>
        </div>
      </div>
    </form>
  );
}
