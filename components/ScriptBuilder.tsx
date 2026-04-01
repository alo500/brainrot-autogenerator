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

const ANGLE_LABELS: Record<string, string> = {
  shocking_stat: "Shocking Stat",
  bold_claim: "Bold Claim",
  question: "Question",
};

const ANGLE_COLORS: Record<string, string> = {
  shocking_stat: "border-amber-500 bg-amber-950 text-amber-200",
  bold_claim: "border-red-500 bg-red-950 text-red-200",
  question: "border-cyan-500 bg-cyan-950 text-cyan-200",
};

const ANGLE_BADGE: Record<string, string> = {
  shocking_stat: "text-amber-400 bg-amber-950 border-amber-800",
  bold_claim: "text-red-400 bg-red-950 border-red-800",
  question: "text-cyan-400 bg-cyan-950 border-cyan-800",
};

interface HookVariant {
  angle: string;
  text: string;
}

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

  // A/B hook tester state
  const [testingHooks, setTestingHooks] = useState(false);
  const [hookVariants, setHookVariants] = useState<HookVariant[] | null>(null);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);

  async function handleTestHooks() {
    if (!topic.trim()) return;
    setTestingHooks(true);
    setHookVariants(null);
    setSelectedHook(null);
    setError(null);

    try {
      const res = await fetch("/api/script/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHookVariants(data.hooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate hooks");
    } finally {
      setTestingHooks(false);
    }
  }

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
        body: JSON.stringify({ topic, style, hook: selectedHook ?? undefined }),
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

        {/* A/B Hook tester */}
        <div className="border border-zinc-700 rounded-lg p-3 space-y-3 bg-zinc-950/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">
              Hook A/B Tester
            </span>
            <button
              type="button"
              onClick={handleTestHooks}
              disabled={testingHooks || !topic.trim()}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              {testingHooks ? "Testing..." : "A/B Test Hooks"}
            </button>
          </div>

          {hookVariants && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                Pick a hook, or skip to let Claude choose:
              </p>
              {hookVariants.map((h) => (
                <button
                  key={h.angle}
                  type="button"
                  onClick={() =>
                    setSelectedHook(selectedHook === h.text ? null : h.text)
                  }
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedHook === h.text
                      ? ANGLE_COLORS[h.angle] ?? "border-violet-500 bg-violet-950 text-violet-200"
                      : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        ANGLE_BADGE[h.angle] ?? "text-zinc-400 bg-zinc-800 border-zinc-700"
                      }`}
                    >
                      {ANGLE_LABELS[h.angle] ?? h.angle}
                    </span>
                    {selectedHook === h.text && (
                      <span className="text-xs text-emerald-400">Selected</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-zinc-100">{h.text}</p>
                </button>
              ))}
              {selectedHook && (
                <button
                  type="button"
                  onClick={() => setSelectedHook(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Clear selection (let Claude choose)
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={generating || !topic.trim()}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {generating
            ? "Generating script..."
            : selectedHook
            ? "Generate Script with Selected Hook"
            : "Generate Script"}
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
