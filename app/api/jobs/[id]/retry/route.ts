import { NextRequest, NextResponse } from "next/server";
import { getJob, enqueueJob, updateJob } from "@/lib/queue";
import { saveJobToDb } from "@/lib/supabase";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed jobs can be retried" },
      { status: 400 }
    );
  }

  const retried = {
    ...job,
    status: "queued" as const,
    error: undefined,
    completedAt: undefined,
  };

  // Update Redis job record
  await updateJob(id, { status: "queued", error: undefined, completedAt: undefined });

  // Re-enqueue in the queue list
  await enqueueJob(retried);

  // Sync to Supabase
  await saveJobToDb(retried);

  return NextResponse.json({ job: retried });
}
