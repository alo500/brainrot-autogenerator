import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { enqueueJob, redis } from "@/lib/queue";
import { saveJobToDb, updateScriptSceneJob } from "@/lib/supabase";
import type { VideoJob, VideoModel } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { scenes, model = "both", aspectRatio = "9:16" } = await req.json();

  if (!scenes?.length) {
    return NextResponse.json({ error: "scenes are required" }, { status: 400 });
  }

  const models: VideoModel[] = model === "both" ? ["kling", "wan"] : [model];
  const jobs: VideoJob[] = [];

  for (const scene of scenes) {
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
      await updateScriptSceneJob(scene.id, job.id);
    }
  }

  return NextResponse.json({ jobs, count: jobs.length });
}
