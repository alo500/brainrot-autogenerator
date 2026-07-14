import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

interface LocalVideo {
  id: string;
  channel: string;
  topic: string;
  videoPath: string;
  scriptPath: string | null;
  thumbnailPath: string | null;
  createdAt: string;
  duration: number | null;
  fileSize: number;
}

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get("channel") || "";
  const outputBase = path.join(process.cwd(), "pipeline", "output");

  if (!fs.existsSync(outputBase)) {
    return Response.json([]);
  }

  const videos: LocalVideo[] = [];

  // Scan output directory — each run creates a subdirectory
  const scanDir = (dir: string, channelName: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const runDir = path.join(dir, entry.name);
      const files = fs.readdirSync(runDir);

      const mp4 = files.find((f) => f.endsWith(".mp4"));
      if (!mp4) continue;

      const mp4Path = path.join(runDir, mp4);
      const scriptFile = files.find((f) => f === "script.json");
      const thumbFile = files.find(
        (f) => f.endsWith(".png") || f.endsWith(".jpg")
      );

      let topic = entry.name.replace(/-/g, " ");
      if (scriptFile) {
        try {
          const script = JSON.parse(
            fs.readFileSync(path.join(runDir, scriptFile), "utf-8")
          );
          topic = script.topic || script.title || topic;
        } catch {}
      }

      const stat = fs.statSync(mp4Path);
      videos.push({
        id: `${channelName}/${entry.name}`,
        channel: channelName,
        topic,
        videoPath: `/api/local/serve?path=${encodeURIComponent(
          path.relative(process.cwd(), mp4Path)
        )}`,
        scriptPath: scriptFile
          ? `/api/local/serve?path=${encodeURIComponent(
              path.relative(process.cwd(), path.join(runDir, scriptFile))
            )}`
          : null,
        thumbnailPath: thumbFile
          ? `/api/local/serve?path=${encodeURIComponent(
              path.relative(process.cwd(), path.join(runDir, thumbFile))
            )}`
          : null,
        createdAt: stat.mtime.toISOString(),
        duration: null,
        fileSize: stat.size,
      });
    }
  };

  if (channel) {
    scanDir(path.join(outputBase, channel), channel);
  } else {
    // Scan all channels + root
    const topEntries = fs.readdirSync(outputBase, { withFileTypes: true });
    for (const entry of topEntries) {
      if (entry.isDirectory()) {
        // Check if this is a channel dir (contains run subdirs) or a run dir itself
        const innerPath = path.join(outputBase, entry.name);
        const innerFiles = fs.readdirSync(innerPath);
        const hasMp4 = innerFiles.some((f) => f.endsWith(".mp4"));

        if (hasMp4) {
          // This is a run dir at root level
          scanDir(outputBase, "general");
          break;
        } else {
          // This is a channel dir
          scanDir(innerPath, entry.name);
        }
      }
    }
    // Also scan root for ungrouped runs
    scanDir(outputBase, "general");
  }

  // Sort by newest first
  videos.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return Response.json(videos);
}
