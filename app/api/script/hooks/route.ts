import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ScriptStyle } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { topic, style } = await req.json();

  if (!topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `You are a viral short-form video scriptwriter. Generate 3 different hook variants for a TikTok/Reels video.

Topic: "${topic}"
Style: ${(style as ScriptStyle) ?? "educational"}

Create exactly 3 hooks using these distinct angles:
1. SHOCKING STAT — Open with a surprising, counterintuitive statistic or fact
2. BOLD CLAIM — Make a provocative, debatable assertion that demands attention
3. QUESTION-BASED — Ask a question that triggers curiosity or self-reflection

Rules:
- Each hook must be max 8 words
- Each hook must be a complete, attention-grabbing opener
- Must work as on-screen text caption

Respond ONLY with valid JSON:
{
  "hooks": [
    { "angle": "shocking_stat", "text": "hook text here" },
    { "angle": "bold_claim", "text": "hook text here" },
    { "angle": "question", "text": "hook text here" }
  ]
}`,
      },
    ],
  });

  const raw = (message.content[0] as { text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to generate hooks" }, { status: 500 });
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return NextResponse.json({ hooks: parsed.hooks });
}
