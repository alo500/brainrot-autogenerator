"use client";

import { useState } from "react";
import type { Script, ScriptStyle, VideoModel } from "@/types";

const STYLES: { value: ScriptStyle; label: string; desc: string }[] = [
  { value: "educational", label: "Educational", desc: "Surprising facts + mind-blowing ending" },
  { value: "comedy", label: "Comedy", desc: "Absurdist humor + meme energy" },
  { value: "horror", label: "Horror", desc: "Slow dread + unsettling reveal" },
  { value: "asmr", label: "ASMR", desc: "Tactile, calming, satisfying" },
  { value: "storytime", label: "Storytime", desc: "Confessional + emotional arc" },
  { value: "drama", label: "Drama", desc: "High stakes + cinematic tension" },
];

interface Props {
  onQueue?: () => void;
}

export default function ScriptBuilder({ onQueue }: Props) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<ScriptStyle>("educational");
  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<Script | null>(null);
  const [model, setModel] = useState<VideoModel | "both">("both");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [queueing, setQueueing] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setScript(null);
    setError(null);
    setQueued(false);

    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScript(data.script);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }

  async function handleQueue() {
    if (!script) return;
    setQueueing(true);
    try {
      const res = await fetch(`/api/script/${script.id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: script.scenes, model, aspectRatio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQueued(true);
      onQueue?.();
      setTimeout(() => setQueued(false), 4000);
    } finally {
      setQueueing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Input form */}
      <form
        onSubmit={handleGenerate}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
          Script Generator
        </h2>

        <div className="space-y-2">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Describe your video concept... e.g. 'a cute potassium molecule explaining health benefits'"
            rows={2}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
          />
        </div>

        {/* Style picker */}
        <div className="grid grid-cols-3 gap-2">
          {STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStyle(s.value)}
              className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                style === s.value
                  ? "border-violet-500 bg-violet-950 text-violet-200"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <div className="font-semibold text-zinc-200">{s.label}</div>
              <div className="text-zinc-500 mt-0.5 leading-snug">{s.desc}</div>
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={generating || !topic.trim()}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {generating ? "Generating script..." : "Generate Script"}
        </button>

        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}
      </form>

      {/* Script preview */}
      {script && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
          {/* Hook + hashtags */}
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Hook</div>
            <div className="text-lg font-bold text-white">{script.hook}</div>
            <div className="flex flex-wrap gap-1.5">
              {script.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-violet-400 bg-violet-950 border border-violet-800 rounded-full px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Scenes */}
          <div className="space-y-3">
            <div className="text-xs text-zinc-500 uppercase tracking-widest">
              Scenes ({script.scenes.length})
            </div>
            {script.scenes.map((scene) => (
              <div
                key={scene.id}
                className="border border-zinc-700 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-500">
                    Scene {scene.order}
                  </span>
                  <span className="text-xs text-zinc-600 bg-zinc-800 rounded px-2 py-0.5">
                    {scene.duration}s · {scene.setting}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-100">
                  {scene.narration}
                </p>
                <p className="text-xs text-zinc-500 font-mono leading-relaxed">
                  {scene.visualPrompt}
                </p>
              </div>
            ))}
          </div>

          {/* Queue controls */}
          <div className="border-t border-zinc-800 pt-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as typeof model)}
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
                onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
              >
                <option value="9:16">9:16 (TikTok/Reels)</option>
                <option value="16:9">16:9 (YouTube)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>
            </div>
            <button
              onClick={handleQueue}
              disabled={queueing || queued}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {queueing
                ? "Queueing..."
                : queued
                ? `Queued ${script.scenes.length} scenes!`
                : `Queue All ${script.scenes.length} Scenes`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
