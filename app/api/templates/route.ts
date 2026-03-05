import { NextRequest, NextResponse } from "next/server";
import { getTemplates, saveTemplate } from "@/lib/supabase";

export async function GET() {
  const templates = await getTemplates();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !body.promptTemplate) {
    return NextResponse.json(
      { error: "name and promptTemplate required" },
      { status: 400 }
    );
  }

  const template = await saveTemplate({
    name: body.name,
    promptTemplate: body.promptTemplate,
    variables: body.variables ?? {},
    model: body.model ?? "both",
    aspectRatio: body.aspectRatio ?? "9:16",
    duration: body.duration ?? 5,
  });

  return NextResponse.json({ template });
}
