import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { generateEpisode } from "@/lib/scriptgen";
import { getSeriesById, saveEpisode } from "@/lib/supabase";
import { enqueueJob, redis } from "@/lib/queue";
import { saveJobToDb, updateEpisodeSceneJob, updateEpisodeStatus } from "@/lib/supabase";
import type { VideoJob, VideoModel } from "@/types";

// POST /api/series/[id]/episodes
// body: { action: "generate" } | { action: "queue", episodeId, model, aspectRatio }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const series = await getSeriesById(params.id);

  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // ── Generate next episode script ──────────────────────
  if (body.action === "generate") {
    const episodeNumber = series.episodes.length + 1;
    const previousSummaries = series.episodes
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map((ep) => ep.synopsis);

    const generated = await generateEpisode(
      series,
      episodeNumber,
      previousSummaries
    );

    const episode = {
      ...generated,
      id: randomUUID(),
      seriesId: series.id,
      status: "scripted" as const,
      createdAt: new Date().toISOString(),
    };

    await saveEpisode(episode);

    return NextResponse.json({ episode });
  }

  // ── Queue an existing episode's scenes ───────────────
  if (body.action === "queue") {
    const { episodeId, model = "both", aspectRatio = "9:16" } = body;

    const episode = series.episodes.find((ep) => ep.id === episodeId);
    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    const models: VideoModel[] = model === "both" ? ["kling", "wan"] : [model];
    const jobs: VideoJob[] = [];

    for (const scene of episode.scenes) {
      for (const m of models) {
        const job: VideoJob = {
          id: randomUUID(),
          prompt: scene.visualPrompt,
          model: m,
          status: "queued",
          aspectRatio,
          duration: scene.duration ?? 5,
          createdAt: new Date().toISOString(),
        };
        jobs.push(job);
        await enqueueJob(job);
        await saveJobToDb(job);
        await updateEpisodeSceneJob(scene.id, job.id);
      }
    }

    await updateEpisodeStatus(episodeId, "queued");

    return NextResponse.json({ jobs, count: jobs.length });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
