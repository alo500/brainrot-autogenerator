import { NextResponse } from "next/server";
import { getQueueStats } from "@/lib/queue";
import { wanHealth } from "@/lib/wan";

export async function GET() {
  const [stats, wanOnline] = await Promise.all([
    getQueueStats(),
    wanHealth(),
  ]);

  return NextResponse.json({ stats, wanOnline });
}
