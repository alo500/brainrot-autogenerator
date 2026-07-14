import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) {
    return new Response("Missing path", { status: 400 });
  }

  // Security: ensure path is within project
  const resolved = path.resolve(process.cwd(), filePath);
  if (!resolved.startsWith(process.cwd())) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json",
    ".mp3": "audio/mpeg",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";
  const stat = fs.statSync(resolved);

  // Support range requests for video streaming
  const range = req.headers.get("range");
  if (range && ext === ".mp4") {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(resolved, { start, end });
    return new Response(stream as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
      },
    });
  }

  const buffer = fs.readFileSync(resolved);
  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
    },
  });
}
