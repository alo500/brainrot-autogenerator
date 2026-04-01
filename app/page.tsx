"use client";

import { useState } from "react";
import QueueStats from "@/components/QueueStats";
import PromptForm from "@/components/PromptForm";
import VideoGallery from "@/components/VideoGallery";
import TemplateManager from "@/components/TemplateManager";
import ScriptBuilder from "@/components/ScriptBuilder";
import SeriesStudio from "@/components/SeriesStudio";

type Tab = "gallery" | "templates" | "script" | "series";

const TABS: { value: Tab; label: string }[] = [
  { value: "gallery", label: "Gallery" },
  { value: "templates", label: "Templates" },
  { value: "script", label: "Script" },
  { value: "series", label: "Series" },
];

export default function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("gallery");

  const handleGenerate = () => setRefreshKey((k) => k + 1);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            brainrot<span className="text-violet-400">.</span>autocreator
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kling + Wan2.1 · short-form video at scale
          </p>
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`text-xs px-4 py-2 rounded-lg capitalize transition-colors ${
                tab === t.value
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue stats — always visible */}
      <QueueStats />

      {/* Single prompt — only on gallery/templates tabs */}
      {(tab === "gallery" || tab === "templates") && (
        <PromptForm onSubmit={handleGenerate} />
      )}

      {/* Tab content */}
      {tab === "gallery" && <VideoGallery refreshKey={refreshKey} />}
      {tab === "templates" && <TemplateManager onGenerate={handleGenerate} />}
      {tab === "script" && <ScriptBuilder onQueue={handleGenerate} />}
      {tab === "series" && <SeriesStudio onQueue={handleGenerate} />}
    </div>
  );
}
