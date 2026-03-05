import { SignJWT } from "jose";

const KLING_API_BASE = "https://api.klingai.com/v1";
const ACCESS_KEY = process.env.KLING_ACCESS_KEY!;
const SECRET_KEY = process.env.KLING_SECRET_KEY!;

async function getKlingToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(SECRET_KEY);

  return new SignJWT({
    iss: ACCESS_KEY,
    exp: now + 1800,
    nbf: now - 5,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(secret);
}

export interface KlingGenerateParams {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  duration?: "5" | "10";
  mode?: "std" | "pro";
  cfg_scale?: number;
}

export interface KlingTask {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg?: string;
  task_result?: {
    videos: Array<{
      id: string;
      url: string;
      duration: string;
    }>;
  };
}

export async function klingGenerate(
  params: KlingGenerateParams
): Promise<string> {
  const token = await getKlingToken();

  const res = await fetch(`${KLING_API_BASE}/videos/text2video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "kling-v1",
      prompt: params.prompt,
      negative_prompt: params.negative_prompt ?? "",
      aspect_ratio: params.aspect_ratio ?? "9:16",
      duration: params.duration ?? "5",
      mode: params.mode ?? "std",
      cfg_scale: params.cfg_scale ?? 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling generate failed: ${err}`);
  }

  const data = await res.json();
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`);
  return data.data.task_id as string;
}

export async function klingPollTask(taskId: string): Promise<KlingTask> {
  const token = await getKlingToken();

  const res = await fetch(
    `${KLING_API_BASE}/videos/text2video/${taskId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) throw new Error(`Kling poll failed: ${await res.text()}`);

  const data = await res.json();
  if (data.code !== 0) throw new Error(`Kling poll error: ${data.message}`);
  return data.data as KlingTask;
}
