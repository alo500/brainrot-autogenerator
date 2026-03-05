import { createClient } from "@supabase/supabase-js";
import type { VideoJob, VideoTemplate } from "@/types";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function saveJobToDb(job: VideoJob): Promise<void> {
  const { error } = await supabase.from("video_jobs").upsert({
    id: job.id,
    prompt: job.prompt,
    model: job.model,
    status: job.status,
    video_url: job.videoUrl,
    thumbnail_url: job.thumbnailUrl,
    error: job.error,
    duration: job.duration,
    aspect_ratio: job.aspectRatio,
    template_id: job.templateId,
    created_at: job.createdAt,
    completed_at: job.completedAt,
  });
  if (error) throw error;
}

export async function getJobsFromDb(limit = 50): Promise<VideoJob[]> {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(dbRowToJob);
}

export async function getTemplates(): Promise<VideoTemplate[]> {
  const { data, error } = await supabase
    .from("video_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function saveTemplate(
  template: Omit<VideoTemplate, "id" | "createdAt">
): Promise<VideoTemplate> {
  const { data, error } = await supabase
    .from("video_templates")
    .insert({
      name: template.name,
      prompt_template: template.promptTemplate,
      variables: template.variables,
      model: template.model,
      aspect_ratio: template.aspectRatio,
      duration: template.duration,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

function dbRowToJob(row: Record<string, unknown>): VideoJob {
  return {
    id: row.id as string,
    prompt: row.prompt as string,
    model: row.model as VideoJob["model"],
    status: row.status as VideoJob["status"],
    videoUrl: row.video_url as string | undefined,
    thumbnailUrl: row.thumbnail_url as string | undefined,
    error: row.error as string | undefined,
    duration: row.duration as number | undefined,
    aspectRatio: row.aspect_ratio as VideoJob["aspectRatio"],
    templateId: row.template_id as string | undefined,
    createdAt: row.created_at as string,
    completedAt: row.completed_at as string | undefined,
  };
}
