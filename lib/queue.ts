import { Redis } from "@upstash/redis";
import type { VideoJob } from "@/types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const QUEUE_KEY = "brainrot:queue";
const JOB_PREFIX = "brainrot:job:";

export async function enqueueJob(job: VideoJob): Promise<void> {
  await redis.set(`${JOB_PREFIX}${job.id}`, job);
  await redis.lpush(QUEUE_KEY, job.id);
}

export async function dequeueJob(): Promise<VideoJob | null> {
  const jobId = await redis.rpop<string>(QUEUE_KEY);
  if (!jobId) return null;
  return getJob(jobId);
}

export async function getJob(jobId: string): Promise<VideoJob | null> {
  return redis.get<VideoJob>(`${JOB_PREFIX}${jobId}`);
}

export async function updateJob(
  jobId: string,
  updates: Partial<VideoJob>
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await redis.set(`${JOB_PREFIX}${jobId}`, { ...job, ...updates });
}

export async function getQueueLength(): Promise<number> {
  return redis.llen(QUEUE_KEY);
}

export async function getAllJobs(limit = 50): Promise<VideoJob[]> {
  const keys = await redis.keys(`${JOB_PREFIX}*`);
  if (!keys.length) return [];

  const sliced = keys.slice(0, limit);
  const jobs = await Promise.all(
    sliced.map((k) => redis.get<VideoJob>(k))
  );

  return (jobs.filter(Boolean) as VideoJob[]).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getQueueStats() {
  const jobs = await getAllJobs(500);
  return {
    queued: jobs.filter((j) => j.status === "queued").length,
    processing: jobs.filter((j) => j.status === "processing").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };
}

export { redis };
