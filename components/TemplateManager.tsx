"use client";

import { useState } from "react";
import useSWR from "swr";
import type { VideoTemplate } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  onGenerate?: () => void;
}

export default function TemplateManager({ onGenerate }: Props) {
  const { data, mutate } = useSWR<{ templates: VideoTemplate[] }>(
    "/api/templates",
    fetcher
  );
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    promptTemplate: "",
    model: "both" as VideoTemplate["model"],
    aspectRatio: "9:16" as VideoTemplate["aspectRatio"],
    duration: 5 as 5 | 10,
  });

  const templates = data?.templates ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await mutate();
    setCreating(false);
    setForm({ name: "", promptTemplate: "", model: "both", aspectRatio: "9:16", duration: 5 });
  }

  // Fill a template's variables randomly and submit to generate
  async function handleRunTemplate(t: VideoTemplate) {
    let prompt = t.promptTemplate;
    for (const [key, values] of Object.entries(t.variables)) {
      const val = values[Math.floor(Math.random() * values.length)];
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
    }

    await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: t.model,
        aspectRatio: t.aspectRatio,
        duration: t.duration,
        templateId: t.id,
      }),
    });
    onGenerate?.();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
          Templates
        </h2>
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs text-violet-400 hover:text-violet-300"
        >
          {creating ? "Cancel" : "+ New template"}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="space-y-3 border border-zinc-700 rounded-lg p-4">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Template name"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
          <textarea
            value={form.promptTemplate}
            onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })}
            placeholder="Prompt with {{variable}} placeholders, e.g. 'A {{animal}} doing {{action}} in slow motion'"
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none resize-none"
          />
          <p className="text-xs text-zinc-600">
            Variables defined in the template will be replaced randomly on each run. Add variable values in the JSON field.
          </p>
          <div className="flex gap-2">
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value as VideoTemplate["model"] })}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 flex-1"
            >
              <option value="both">Both models</option>
              <option value="kling">Kling</option>
              <option value="wan">Wan2.1</option>
            </select>
            <select
              value={form.aspectRatio}
              onChange={(e) => setForm({ ...form, aspectRatio: e.target.value as VideoTemplate["aspectRatio"] })}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 flex-1"
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-lg text-sm"
          >
            Save Template
          </button>
        </form>
      )}

      {templates.length === 0 && !creating && (
        <p className="text-xs text-zinc-600">No templates yet. Create one to bulk-generate content.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between border border-zinc-800 rounded-lg px-4 py-3"
          >
            <div>
              <p className="text-sm text-zinc-200 font-medium">{t.name}</p>
              <p className="text-xs text-zinc-600 line-clamp-1 mt-0.5">
                {t.promptTemplate}
              </p>
            </div>
            <button
              onClick={() => handleRunTemplate(t)}
              className="ml-4 shrink-0 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg"
            >
              Run
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
