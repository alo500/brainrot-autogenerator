import { NextRequest, NextResponse } from "next/server";
import { getJobsFromDb } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 50);

  const jobs = await getJobsFromDb(limit);
  return NextResponse.json({ jobs });
}
