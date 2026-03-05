const WAN_SERVER_URL =
  process.env.WAN_SERVER_URL ?? "http://localhost:8000";

export interface WanGenerateParams {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_frames?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  lora_path?: string;
  lora_scale?: number;
}

export interface WanTask {
  task_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  video_url?: string;
  error?: string;
  progress?: number;
}

export async function wanGenerate(
  params: WanGenerateParams
): Promise<string> {
  const res = await fetch(`${WAN_SERVER_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negative_prompt ?? "",
      width: params.width ?? 832,
      height: params.height ?? 480,
      num_frames: params.num_frames ?? 81,
      num_inference_steps: params.num_inference_steps ?? 50,
      guidance_scale: params.guidance_scale ?? 6.0,
      lora_path: params.lora_path,
      lora_scale: params.lora_scale ?? 1.0,
    }),
  });

  if (!res.ok) throw new Error(`Wan generate failed: ${await res.text()}`);
  const data = await res.json();
  return data.task_id as string;
}

export async function wanPollTask(taskId: string): Promise<WanTask> {
  const res = await fetch(`${WAN_SERVER_URL}/status/${taskId}`);
  if (!res.ok) throw new Error(`Wan poll failed: ${await res.text()}`);
  return res.json();
}

export async function wanHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WAN_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
