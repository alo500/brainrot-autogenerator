import { NextRequest, NextResponse } from "next/server";
import { getSeriesById } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const series = await getSeriesById(params.id);
  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }
  return NextResponse.json({ series });
}
