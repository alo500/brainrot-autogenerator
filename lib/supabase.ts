import { createClient } from "@supabase/supabase-js";
import type {
  VideoJob,
  VideoTemplate,
  Script,
  Scene,
  Series,
  Character,
  Episode,
  EpisodeScene,
  EpisodeStatus,
} from "@/types";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Video Jobs ───────────────────────────────────────────

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

// ─── Scripts ─────────────────────────────────────────────

export async function saveScript(script: Script): Promise<void> {
  const { error: scriptError } = await supabase.from("scripts").insert({
    id: script.id,
    topic: script.topic,
    style: script.style,
    hook: script.hook,
    hashtags: script.hashtags,
    created_at: script.createdAt,
  });
  if (scriptError) throw scriptError;

  if (script.scenes.length > 0) {
    const { error: scenesError } = await supabase.from("script_scenes").insert(
      script.scenes.map((s) => ({
        id: s.id,
        script_id: script.id,
        order_index: s.order,
        narration: s.narration,
        visual_prompt: s.visualPrompt,
        setting: s.setting,
        duration: s.duration,
        job_id: s.jobId ?? null,
      }))
    );
    if (scenesError) throw scenesError;
  }
}

export async function getScripts(): Promise<Script[]> {
  const { data: scriptsData, error: scriptsError } = await supabase
    .from("scripts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (scriptsError) throw scriptsError;
  if (!scriptsData?.length) return [];

  const ids = scriptsData.map((s) => s.id);
  const { data: scenesData, error: scenesError } = await supabase
    .from("script_scenes")
    .select("*")
    .in("script_id", ids)
    .order("order_index");

  if (scenesError) throw scenesError;

  return scriptsData.map((s) => ({
    id: s.id,
    topic: s.topic,
    style: s.style,
    hook: s.hook,
    hashtags: s.hashtags ?? [],
    scenes: (scenesData ?? [])
      .filter((sc) => sc.script_id === s.id)
      .map(dbRowToScene),
    createdAt: s.created_at,
  }));
}

export async function updateScriptSceneJob(
  sceneId: string,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from("script_scenes")
    .update({ job_id: jobId })
    .eq("id", sceneId);
  if (error) throw error;
}

function dbRowToScene(row: Record<string, unknown>): Scene {
  return {
    id: row.id as string,
    order: row.order_index as number,
    narration: row.narration as string,
    visualPrompt: row.visual_prompt as string,
    setting: row.setting as string,
    duration: (row.duration as 5 | 10) ?? 5,
    jobId: row.job_id as string | undefined,
  };
}

// ─── Series ───────────────────────────────────────────────

export async function saveSeries(
  series: Omit<Series, "episodes">
): Promise<void> {
  const { error: seriesError } = await supabase.from("series").insert({
    id: series.id,
    title: series.title,
    genre: series.genre,
    premise: series.premise,
    world_context: series.worldContext,
    created_at: series.createdAt,
  });
  if (seriesError) throw seriesError;

  if (series.characters.length > 0) {
    const { error: charsError } = await supabase.from("characters").insert(
      series.characters.map((c) => ({
        id: c.id,
        series_id: series.id,
        name: c.name,
        appearance: c.appearance,
        personality: c.personality,
        role: c.role,
        backstory: c.backstory,
      }))
    );
    if (charsError) throw charsError;
  }
}

export async function getSeriesList(): Promise<
  Omit<Series, "episodes" | "characters">[]
> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    genre: s.genre,
    premise: s.premise,
    worldContext: s.world_context,
    createdAt: s.created_at,
  }));
}

export async function getSeriesById(id: string): Promise<Series | null> {
  const { data: s, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", id)
    .single();

  if (seriesError || !s) return null;

  const { data: charsData } = await supabase
    .from("characters")
    .select("*")
    .eq("series_id", id);

  const { data: episodesData } = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", id)
    .order("episode_number");

  const episodes: Episode[] = [];
  for (const ep of episodesData ?? []) {
    const { data: scenesData } = await supabase
      .from("episode_scenes")
      .select("*")
      .eq("episode_id", ep.id)
      .order("order_index");

    episodes.push({
      id: ep.id,
      seriesId: ep.series_id,
      episodeNumber: ep.episode_number,
      title: ep.title,
      synopsis: ep.synopsis,
      cliffhanger: ep.cliffhanger,
      hashtags: ep.hashtags ?? [],
      status: ep.status as EpisodeStatus,
      scenes: (scenesData ?? []).map(dbRowToEpisodeScene),
      createdAt: ep.created_at,
    });
  }

  return {
    id: s.id,
    title: s.title,
    genre: s.genre,
    premise: s.premise,
    worldContext: s.world_context,
    characters: (charsData ?? []).map(dbRowToCharacter),
    episodes,
    createdAt: s.created_at,
  };
}

export async function saveEpisode(episode: Episode): Promise<void> {
  const { error: epError } = await supabase.from("episodes").insert({
    id: episode.id,
    series_id: episode.seriesId,
    episode_number: episode.episodeNumber,
    title: episode.title,
    synopsis: episode.synopsis,
    cliffhanger: episode.cliffhanger,
    hashtags: episode.hashtags,
    status: episode.status,
    created_at: episode.createdAt,
  });
  if (epError) throw epError;

  if (episode.scenes.length > 0) {
    const { error: scenesError } = await supabase
      .from("episode_scenes")
      .insert(
        episode.scenes.map((s) => ({
          id: s.id,
          episode_id: episode.id,
          order_index: s.order,
          narration: s.narration,
          visual_prompt: s.visualPrompt,
          setting: s.setting,
          character_ids: s.characterIds,
          duration: s.duration,
          job_id: s.jobId ?? null,
        }))
      );
    if (scenesError) throw scenesError;
  }
}

export async function updateEpisodeStatus(
  id: string,
  status: EpisodeStatus
): Promise<void> {
  const { error } = await supabase
    .from("episodes")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function updateEpisodeSceneJob(
  sceneId: string,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from("episode_scenes")
    .update({ job_id: jobId })
    .eq("id", sceneId);
  if (error) throw error;
}

function dbRowToCharacter(row: Record<string, unknown>): Character {
  return {
    id: row.id as string,
    seriesId: row.series_id as string,
    name: row.name as string,
    appearance: row.appearance as string,
    personality: row.personality as string,
    role: row.role as Character["role"],
    backstory: row.backstory as string,
  };
}

function dbRowToEpisodeScene(row: Record<string, unknown>): EpisodeScene {
  return {
    id: row.id as string,
    order: row.order_index as number,
    narration: row.narration as string,
    visualPrompt: row.visual_prompt as string,
    setting: row.setting as string,
    duration: (row.duration as 5 | 10) ?? 5,
    jobId: row.job_id as string | undefined,
    characterIds: (row.character_ids as string[]) ?? [],
  };
}
