import { NextRequest, NextResponse } from "next/server";
import { dequeueJob, updateJob } from "@/lib/queue";
import { saveJobToDb } from "@/lib/supabase";
import { uploadVideoFromUrl } from "@/lib/storage";
import { klingGenerate, klingPollTask } from "@/lib/kling";
import { wanGenerate, wanPollTask } from "@/lib/wan";

// Called by a cron job (Vercel cron or external) to process one job at a time
export async function POST(req: NextRequest) {
  // Simple shared secret auth for the worker endpoint
  const auth = req.headers.get("x-worker-secret");
  if (auth !== process.env.WORKER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const job = await dequeueJob();
  if (!job) return NextResponse.json({ message: "queue empty" });

  await updateJob(job.id, { status: "processing" });
  await saveJobToDb({ ...job, status: "processing" });

  try {
    let videoUrl: string;

    if (job.model === "kling") {
      videoUrl = await processKling(job.prompt, job.aspectRatio, job.duration);
    } else {
      videoUrl = await processWan(job.prompt, job.aspectRatio);
    }

    // Mirror to R2 for permanent storage
    const storageKey = `videos/${job.model}/${job.id}.mp4`;
    const storedUrl = await uploadVideoFromUrl(videoUrl, storageKey);

    const completed = {
      ...job,
      status: "completed" as const,
      videoUrl: storedUrl,
      completedAt: new Date().toISOString(),
    };

    await updateJob(job.id, completed);
    await saveJobToDb(completed);

    return NextResponse.json({ job: completed });
  } catch (err) {
    const failed = {
      ...job,
      status: "failed" as const,
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    };
    await updateJob(job.id, failed);
    await saveJobToDb(failed);
    return NextResponse.json({ job: failed }, { status: 500 });
  }
}

async function processKling(
  prompt: string,
  aspectRatio: string = "9:16",
  duration: number = 5
): Promise<string> {
  const taskId = await klingGenerate({
    prompt,
    aspect_ratio: aspectRatio as "9:16" | "16:9" | "1:1",
    duration: String(duration) as "5" | "10",
  });

  // Poll until done (max 5 minutes)
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(8000);
    const task = await klingPollTask(taskId);

    if (task.task_status === "succeed") {
      const video = task.task_result?.videos?.[0];
      if (!video?.url) throw new Error("Kling returned no video URL");
      return video.url;
    }

    if (task.task_status === "failed") {
      throw new Error(`Kling task failed: ${task.task_status_msg}`);
    }
  }

  throw new Error("Kling task timed out");
}

async function processWan(
  prompt: string,
  aspectRatio: string = "9:16"
): Promise<string> {
  const [w, h] =
    aspectRatio === "9:16"
      ? [480, 832]
      : aspectRatio === "16:9"
      ? [832, 480]
      : [512, 512];

  const taskId = await wanGenerate({ prompt, width: w, height: h });

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(10000);
    const task = await wanPollTask(taskId);

    if (task.status === "completed") {
      if (!task.video_url) throw new Error("Wan returned no video URL");
      return task.video_url;
    }

    if (task.status === "failed") {
      throw new Error(`Wan task failed: ${task.error}`);
    }
  }

  throw new Error("Wan task timed out");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
