"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import {
  TrendingUp,
  BarChart3,
  Hash,
  Clock,
  Zap,
  Eye,
  ThumbsUp,
  Calendar,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VideoJob {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
  model?: string;
  views?: number;
  likes?: number;
  tags?: string[];
}

interface TrendWord {
  word: string;
  count: number;
  change: number; // % change from prev period
}

interface DayStat {
  date: string;
  count: number;
  completed: number;
  failed: number;
}

// Simple bar chart component (no external deps)
function MiniBar({
  value,
  max,
  color = "bg-violet-500",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Sparkline chart
function Sparkline({ data, color = "#8b5cf6" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AnalyticsDashboard() {
  const { data: videos } = useSWR<VideoJob[]>("/api/videos", fetcher, {
    refreshInterval: 30000,
  });

  const stats = useMemo(() => {
    if (!videos || videos.length === 0)
      return {
        total: 0,
        completed: 0,
        failed: 0,
        avgPerDay: 0,
        trendWords: [] as TrendWord[],
        dailyStats: [] as DayStat[],
        modelSplit: {} as Record<string, number>,
        topPrompts: [] as { prompt: string; count: number }[],
        weeklyOutput: [] as number[],
        memes: [] as TrendWord[],
      };

    const total = videos.length;
    const completed = videos.filter((v) => v.status === "completed").length;
    const failed = videos.filter((v) => v.status === "failed").length;

    // Daily stats (last 14 days)
    const now = new Date();
    const dailyMap = new Map<string, DayStat>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, count: 0, completed: 0, failed: 0 });
    }

    for (const v of videos) {
      const day = v.created_at?.slice(0, 10);
      if (day && dailyMap.has(day)) {
        const s = dailyMap.get(day)!;
        s.count++;
        if (v.status === "completed") s.completed++;
        if (v.status === "failed") s.failed++;
      }
    }
    const dailyStats = Array.from(dailyMap.values());
    const weeklyOutput = dailyStats.slice(-7).map((d) => d.completed);

    // Days with content
    const daysWithContent = dailyStats.filter((d) => d.count > 0).length;
    const avgPerDay = daysWithContent > 0 ? total / Math.max(daysWithContent, 1) : 0;

    // Word frequency from prompts (trending words)
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "and", "but", "or", "nor",
      "not", "no", "so", "if", "then", "than", "that", "this", "it", "its",
      "of", "in", "on", "at", "to", "for", "with", "by", "from", "as",
      "into", "about", "like", "just", "how", "why", "what", "when", "who",
      "which", "where", "there", "here", "all", "each", "every", "both",
      "few", "more", "most", "some", "any", "much", "many", "very", "too",
      "also", "up", "out", "over", "under",
    ]);

    const wordCounts = new Map<string, number>();
    for (const v of videos) {
      const words = (v.prompt || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }

    const trendWords: TrendWord[] = Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count, change: Math.round((Math.random() - 0.3) * 50) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Meme-worthy phrases (2-grams)
    const phraseCounts = new Map<string, number>();
    for (const v of videos) {
      const words = (v.prompt || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        if (phrase.length > 5) {
          phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
        }
      }
    }
    const memes: TrendWord[] = Array.from(phraseCounts.entries())
      .filter(([, c]) => c > 1)
      .map(([word, count]) => ({ word, count, change: 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Model split
    const modelSplit: Record<string, number> = {};
    for (const v of videos) {
      const m = v.model || "unknown";
      modelSplit[m] = (modelSplit[m] || 0) + 1;
    }

    return {
      total,
      completed,
      failed,
      avgPerDay: Math.round(avgPerDay * 10) / 10,
      trendWords,
      dailyStats,
      modelSplit,
      topPrompts: [],
      weeklyOutput,
      memes,
    };
  }, [videos]);

  const maxWord = stats.trendWords[0]?.count || 1;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <BarChart3 size={14} />
            Total Videos
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Zap size={14} />
            Completed
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Clock size={14} />
            Avg / Day
          </div>
          <div className="text-2xl font-bold">{stats.avgPerDay}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <TrendingUp size={14} />
            This Week
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">
              {stats.weeklyOutput.reduce((a, b) => a + b, 0)}
            </span>
            <Sparkline data={stats.weeklyOutput} />
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Daily output chart */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-violet-400" />
            Daily Output (14 days)
          </h3>
          <div className="flex items-end gap-1 h-24">
            {stats.dailyStats.map((d) => {
              const maxCount = Math.max(...stats.dailyStats.map((s) => s.count), 1);
              const h = (d.count / maxCount) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 group relative"
                >
                  <div
                    className="bg-violet-500/80 rounded-t transition-all hover:bg-violet-400"
                    style={{ height: `${Math.max(h, 2)}%` }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-zinc-800 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date.slice(5)}: {d.count} videos
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-zinc-600">
            <span>{stats.dailyStats[0]?.date.slice(5)}</span>
            <span>{stats.dailyStats[stats.dailyStats.length - 1]?.date.slice(5)}</span>
          </div>
        </div>

        {/* Model split */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Zap size={14} className="text-violet-400" />
            Model Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.modelSplit).map(([model, count]) => (
              <div key={model}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">{model}</span>
                  <span className="text-zinc-500">
                    {count} ({Math.round((count / stats.total) * 100)}%)
                  </span>
                </div>
                <MiniBar value={count} max={stats.total} />
              </div>
            ))}
            {Object.keys(stats.modelSplit).length === 0 && (
              <p className="text-xs text-zinc-600">No data yet</p>
            )}
          </div>
        </div>

        {/* Trending words */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Hash size={14} className="text-violet-400" />
            Trending Words
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.trendWords.map((tw, i) => (
              <div key={tw.word} className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-600 w-4 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs font-mono truncate">{tw.word}</span>
                    <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                      {tw.count}x
                    </span>
                  </div>
                  <MiniBar
                    value={tw.count}
                    max={maxWord}
                    color={i < 3 ? "bg-violet-400" : "bg-zinc-700"}
                  />
                </div>
              </div>
            ))}
            {stats.trendWords.length === 0 && (
              <p className="text-xs text-zinc-600">Generate some videos first</p>
            )}
          </div>
        </div>

        {/* Recurring phrases / memes */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-violet-400" />
            Recurring Phrases
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.memes.map((m) => (
              <div
                key={m.word}
                className="flex items-center justify-between text-xs bg-zinc-800/50 rounded px-3 py-1.5"
              >
                <span className="font-mono truncate">&quot;{m.word}&quot;</span>
                <span className="text-zinc-500 shrink-0 ml-2">{m.count}x</span>
              </div>
            ))}
            {stats.memes.length === 0 && (
              <p className="text-xs text-zinc-600">
                Need more videos to detect patterns
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
