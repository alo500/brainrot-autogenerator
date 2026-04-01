import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { generateSeriesBible } from "@/lib/scriptgen";
import { saveSeries, getSeriesList } from "@/lib/supabase";
import type { SeriesGenre } from "@/types";

export async function GET() {
  const series = await getSeriesList();
  return NextResponse.json({ series });
}

export async function POST(req: NextRequest) {
  const { title, genre, premise } = await req.json();

  if (!title?.trim() || !premise?.trim()) {
    return NextResponse.json(
      { error: "title and premise are required" },
      { status: 400 }
    );
  }

  const bible = await generateSeriesBible(
    title.trim(),
    (genre as SeriesGenre) ?? "drama",
    premise.trim()
  );

  const seriesId = randomUUID();
  const now = new Date().toISOString();

  const series = {
    id: seriesId,
    title: title.trim(),
    genre: (genre as SeriesGenre) ?? "drama",
    premise: premise.trim(),
    worldContext: bible.worldContext,
    characters: bible.characters.map((c) => ({
      ...c,
      id: randomUUID(),
      seriesId,
    })),
    createdAt: now,
  };

  await saveSeries(series);

  return NextResponse.json({ series });
}
