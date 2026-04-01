import { NextRequest, NextResponse } from "next/server";
import { generateScript } from "@/lib/scriptgen";
import { saveScript, getScripts } from "@/lib/supabase";
import type { ScriptStyle } from "@/types";

export async function GET() {
  const scripts = await getScripts();
  return NextResponse.json({ scripts });
}

export async function POST(req: NextRequest) {
  const { topic, style } = await req.json();

  if (!topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  const script = await generateScript(
    topic.trim(),
    (style as ScriptStyle) ?? "educational"
  );

  await saveScript(script);

  return NextResponse.json({ script });
}
