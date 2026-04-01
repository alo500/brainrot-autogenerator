"use client";

import { useState, useEffect } from "react";
import type { Series, Episode, SeriesGenre, VideoModel } from "@/types";

const GENRES: SeriesGenre[] = [
  "drama",
  "comedy",
  "thriller",
  "romance",
  "sci-fi",
  "fantasy",
  "horror",
];

const STATUS_COLORS: Record<string, string> = {
  scripted: "text-zinc-400 bg-zinc-800",
  queued: "text-amber-400 bg-amber-950",
  generating: "text-blue-400 bg-blue-950",
  completed: "text-emerald-400 bg-emerald-950",
};

interface Props {
  onQueue?: () => void;
}

export default function SeriesStudio({ onQueue }: Props) {
  const [seriesList, setSeriesList] = useState<
    Omit<Series, "episodes" | "characters">[]
  >([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [view, setView] = useState<"list" | "create" | "detail">("list");

  // Create form
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<SeriesGenre>("drama");
  const [premise, setPremise] = useState("");
  const [creating, setCreating] = useState(false);

  // Episode
  const [generatingEp, setGeneratingEp] = useState(false);
  const [queuingEpId, setQueuingEpId] = useState<string | null>(null);
  const [model, setModel] = useState<VideoModel | "both">("both");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");

  const [expandedEpId, setExpandedEpId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view === "list") loadSeriesList();
  }, [view]);

  async function loadSeriesList() {
    try {
      const res = await fetch("/api/series");
      const data = await res.json();
      setSeriesList(data.series ?? []);
    } catch {
      // silent
    }
  }

  async function loadSeries(id: string) {
    const res = await fetch(`/api/series/${id}`);
    const data = await res.json();
    setSelectedSeries(data.series);
    setView("detail");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !premise.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, genre, premise }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTitle("");
      setPremise("");
      await loadSeries(data.series.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create series");
    } finally {
      setCreating(false);
    }
  }

  async function handleGenerateEpisode() {
    if (!selectedSeries) return;
    setGeneratingEp(true);
    setError(null);

    try {
      const res = await fetch(`/api/series/${selectedSeries.id}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Reload full series to get updated episode list
      await loadSeries(selectedSeries.id);
      setExpandedEpId(data.episode.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate episode");
    } finally {
      setGeneratingEp(false);
    }
  }

  async function handleQueueEpisode(episodeId: string) {
    if (!selectedSeries) return;
    setQueuingEpId(episodeId);

    try {
      const res = await fetch(`/api/series/${selectedSeries.id}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue", episodeId, model, aspectRatio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onQueue?.();
      await loadSeries(selectedSeries.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue episode");
    } finally {
      setQueuingEpId(null);
    }
  }

  // ── List view ────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
            Series Studio
          </h2>
          <button
            onClick={() => setView("create")}
            className="text-xs bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + New Series
          </button>
        </div>

        {seriesList.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
            No series yet. Create your first drama.
          </div>
        ) : (
          <div className="space-y-2">
            {seriesList.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSeries(s.id)}
                className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-100">{s.title}</span>
                  <span className="text-xs text-zinc-500 capitalize bg-zinc-800 px-2 py-0.5 rounded-full">
                    {s.genre}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{s.premise}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Create view ──────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setView("list")}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to series
        </button>

        <form
          onSubmit={handleCreate}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
            Create New Series
          </h2>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Last Signal"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Genre</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenre(g)}
                  className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
                    genre === g
                      ? "border-violet-500 bg-violet-950 text-violet-200"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Premise</label>
            <textarea
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              placeholder="Describe your story concept in a few sentences... e.g. 'In a city where emotions are traded as currency, a broke empath discovers she can feel things other people have lost forever.'"
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={creating || !title.trim() || !premise.trim()}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {creating ? "Building series bible..." : "Create Series"}
          </button>
        </form>
      </div>
    );
  }

  // ── Detail view ──────────────────────────────────────────
  if (!selectedSeries) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setView("list"); setSelectedSeries(null); }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back
        </button>
        <h2 className="font-bold text-zinc-100">{selectedSeries.title}</h2>
        <span className="text-xs text-zinc-500 capitalize bg-zinc-800 px-2 py-0.5 rounded-full">
          {selectedSeries.genre}
        </span>
      </div>

      {/* World context */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">World</div>
        <p className="text-sm text-zinc-300">{selectedSeries.worldContext}</p>
      </div>

      {/* Characters */}
      <div className="space-y-2">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">
          Characters ({selectedSeries.characters.length})
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {selectedSeries.characters.map((c) => (
            <div
              key={c.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-100">{c.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    c.role === "protagonist"
                      ? "text-violet-400 bg-violet-950"
                      : c.role === "antagonist"
                      ? "text-red-400 bg-red-950"
                      : "text-zinc-400 bg-zinc-800"
                  }`}
                >
                  {c.role}
                </span>
              </div>
              <p className="text-xs text-zinc-400 italic">{c.appearance}</p>
              <p className="text-xs text-zinc-500">{c.personality}</p>
              {c.backstory && (
                <p className="text-xs text-zinc-600">{c.backstory}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Queue controls */}
      <div className="flex flex-wrap items-end gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
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
          onClick={handleGenerateEpisode}
          disabled={generatingEp}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {generatingEp
            ? "Writing episode..."
            : `Generate Episode ${selectedSeries.episodes.length + 1}`}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Episodes */}
      {selectedSeries.episodes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-widest">
            Episodes ({selectedSeries.episodes.length})
          </div>
          {[...selectedSeries.episodes]
            .sort((a, b) => b.episodeNumber - a.episodeNumber)
            .map((ep) => (
              <div
                key={ep.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
              >
                {/* Episode header */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setExpandedEpId(
                          expandedEpId === ep.id ? null : ep.id
                        )
                      }
                      className="text-left"
                    >
                      <span className="text-xs text-zinc-500 font-mono mr-2">
                        Ep {ep.episodeNumber}
                      </span>
                      <span className="font-semibold text-zinc-100 text-sm">
                        {ep.title}
                      </span>
                    </button>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[ep.status]}`}
                    >
                      {ep.status}
                    </span>
                  </div>
                  {ep.status === "scripted" && (
                    <button
                      onClick={() => handleQueueEpisode(ep.id)}
                      disabled={queuingEpId === ep.id}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {queuingEpId === ep.id ? "Queueing..." : `Queue ${ep.scenes.length} scenes`}
                    </button>
                  )}
                </div>

                {/* Episode detail (expanded) */}
                {expandedEpId === ep.id && (
                  <div className="border-t border-zinc-800 p-4 space-y-4">
                    <p className="text-sm text-zinc-400">{ep.synopsis}</p>

                    {ep.cliffhanger && (
                      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                        <div className="text-xs text-amber-500 uppercase tracking-widest mb-1">
                          Cliffhanger
                        </div>
                        <p className="text-sm text-zinc-300">{ep.cliffhanger}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      {ep.scenes.map((scene) => (
                        <div
                          key={scene.id}
                          className="border border-zinc-700 rounded-lg p-3 space-y-1.5"
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

                    <div className="flex flex-wrap gap-1.5">
                      {ep.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs text-violet-400 bg-violet-950 border border-violet-800 rounded-full px-2 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
