import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const maxDuration = 300; // 5 min

export async function POST(req: NextRequest) {
  const { topic, voice, channel } = await req.json();

  if (!topic) {
    return Response.json({ error: "Topic required" }, { status: 400 });
  }

  const pipelineDir = path.join(process.cwd(), "pipeline");
  const venvPython = path.join(pipelineDir, "venv", "bin", "python");
  const script = path.join(pipelineDir, "generator_local.py");

  const args = [script, topic];
  if (voice) args.push("--voice", voice);

  // Add channel-specific output directory
  const outputDir = channel
    ? path.join(pipelineDir, "output", channel)
    : path.join(pipelineDir, "output");
  args.push("--output-dir", outputDir);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      send({ type: "status", message: `Starting generation: "${topic}"` });

      const proc = spawn(venvPython, args, {
        cwd: pipelineDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          send({ type: "log", message: line });
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          // Filter out noisy warnings
          if (line.includes("FutureWarning") || line.includes("UserWarning")) continue;
          send({ type: "log", message: line });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          send({ type: "done", message: "Video generated successfully!" });
        } else {
          send({ type: "error", message: `Pipeline exited with code ${code}` });
        }
        controller.close();
      });

      proc.on("error", (err) => {
        send({ type: "error", message: `Failed to start: ${err.message}` });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
