import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { enqueueJob } from "@/lib/queue";
import { saveJobToDb } from "@/lib/supabase";
import type { GenerateRequest, VideoJob, VideoModel } from "@/types";

export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json();

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const models: VideoModel[] =
    body.model === "both" ? ["kling", "wan"] : [body.model ?? "kling"];

  const jobs: VideoJob[] = models.map((model) => ({
    id: randomUUID(),
    prompt: body.prompt.trim(),
    model,
    status: "queued",
    aspectRatio: body.aspectRatio ?? "9:16",
    duration: body.duration ?? 5,
    templateId: body.templateId,
    createdAt: new Date().toISOString(),
  }));

  await Promise.all([
    ...jobs.map((j) => enqueueJob(j)),
    ...jobs.map((j) => saveJobToDb(j)),
  ]);

  return NextResponse.json({ jobs });
}
