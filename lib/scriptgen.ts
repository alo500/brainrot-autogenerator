import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import type {
  Script,
  ScriptStyle,
  Scene,
  Series,
  SeriesGenre,
  Character,
  Episode,
  EpisodeScene,
} from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Single Video Script ──────────────────────────────────

const STYLE_GUIDES: Record<ScriptStyle, string> = {
  educational:
    "informative but fun, hook with a surprising fact, end with a mind-blowing statement that makes viewers comment",
  comedy:
    "absurdist humor, unexpected punchlines, self-aware jokes, meme-aware references, comedic timing in visual cuts",
  horror:
    "slow dread build, unsettling visual details, cryptic narration, escalating tension, disturbing reveal in final scene",
  asmr:
    "soft whisper narration, highly tactile visual descriptions, slow calming progression, satisfying textures and sounds",
  storytime:
    "personal confessional tone, 'you won't believe this' energy, emotional arc, relatable stakes, satisfying resolution",
  drama:
    "high stakes emotional conflict, cinematic visuals, tension building, character vulnerability, powerful final beat",
};

export async function generateScript(
  topic: string,
  style: ScriptStyle,
  hook?: string
): Promise<Script> {
  const hookInstruction = hook
    ? `\nHOOK OVERRIDE: Use this exact hook: "${hook}" — do not change it.`
    : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a viral short-form video scriptwriter optimizing for TikTok/Reels engagement.

Topic: "${topic}"
Style: ${style} — ${STYLE_GUIDES[style]}${hookInstruction}

Viral optimization rules:
- HOOK: Must grab attention in the first 3 seconds. Use a pattern interrupt, shocking stat, or bold visual claim.
- PACING: Each scene should feel visually distinct — change setting, color, or subject to reset viewer attention.
- NARRATION: Short, punchy, caption-friendly. Max 10 words per line. Designed to be read as on-screen text.
- VISUAL PROMPTS: Highly specific for AI video generation (Kling/Wan2.1). Always include: subject, action, camera angle, lighting, color palette, mood, "9:16 vertical video".
- ENDING: Close with something that demands comments — a question, controversial claim, or satisfying payoff.
- LENGTH: 4-6 scenes for a 30-60s video.

Respond ONLY with valid JSON matching this exact shape:
{
  "hook": "opening caption text, max 8 words, attention-grabbing",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "scenes": [
    {
      "order": 1,
      "narration": "short punchy caption text, max 10 words",
      "visualPrompt": "detailed AI video generation prompt with subject, action, camera angle, lighting, color palette, mood, 9:16 vertical video, cinematic quality",
      "setting": "brief environment description",
      "duration": 5
    }
  ]
}`,
      },
    ],
  });

  const raw = (message.content[0] as { text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse script response");

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    id: randomUUID(),
    topic,
    style,
    hook: parsed.hook,
    hashtags: parsed.hashtags ?? [],
    scenes: (parsed.scenes ?? []).map(
      (s: {
        order: number;
        narration: string;
        visualPrompt: string;
        setting: string;
        duration?: number;
      }) => ({
        id: randomUUID(),
        order: s.order,
        narration: s.narration,
        visualPrompt: s.visualPrompt,
        setting: s.setting,
        duration: (s.duration as 5 | 10) ?? 5,
      })
    ),
    createdAt: new Date().toISOString(),
  };
}

// ─── Series Bible ─────────────────────────────────────────

export async function generateSeriesBible(
  title: string,
  genre: SeriesGenre,
  premise: string
): Promise<{
  worldContext: string;
  characters: Omit<Character, "id" | "seriesId">[];
}> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are creating the bible for a viral short-form drama series on TikTok/Reels.

Title: "${title}"
Genre: ${genre}
Premise: ${premise}

Design this series to be:
- Binge-watchable: each episode is 30-60s and MUST end with a cliffhanger
- Visually distinct and cinematic for AI video generation
- Character-driven with instantly recognizable, memorable characters
- Built for serialized engagement (viewers follow for the next episode)

Create:
1. World context (2-3 sentences: setting, tone, the "rules" of this world)
2. 2-4 main characters with extremely specific visual appearances
   CRITICAL: Appearance descriptions will be copy-pasted verbatim into AI video prompts for EVERY scene featuring that character — they must be precise and consistent (hair color/style, eye color, skin tone, signature clothing item, any distinguishing features)

Respond ONLY with valid JSON:
{
  "worldContext": "2-3 sentence world/setting description capturing tone and visual style",
  "characters": [
    {
      "name": "Character Name",
      "appearance": "PRECISE visual description for AI video prompts: e.g. 'young woman, short silver-white hair with undercut, glowing blue cybernetic left eye, tan skin, always wearing a worn red leather jacket over black tank top, small scar above right eyebrow'",
      "personality": "2-3 personality traits that create conflict and drive story",
      "role": "protagonist",
      "backstory": "1-2 sentences of backstory that explains their motivation",
      "voiceStyle": "one of: terse, dramatic, sarcastic, warm, cold, chaotic — choose the one that best fits this character's personality and role"
    }
  ]
}`,
      },
    ],
  });

  const raw = (message.content[0] as { text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse series bible response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Episode Generator ────────────────────────────────────

export async function generateEpisode(
  series: Pick<
    Series,
    "title" | "genre" | "premise" | "worldContext" | "characters"
  >,
  episodeNumber: number,
  previousSummaries: string[]
): Promise<Omit<Episode, "id" | "seriesId" | "status" | "createdAt">> {
  const characterList = series.characters
    .map(
      (c) =>
        `- ${c.name} (${c.role})\n  Appearance: ${c.appearance}\n  Personality: ${c.personality}\n  Voice Style: ${c.voiceStyle ?? "dramatic"} — When this character speaks or narrates, write in their voice style`
    )
    .join("\n");

  const previousContext =
    previousSummaries.length > 0
      ? `PREVIOUS EPISODES:\n${previousSummaries
          .map((s, i) => `Ep ${i + 1}: ${s}`)
          .join("\n")}`
      : `This is Episode 1. Establish the world and characters compellingly. End on a hook that makes it impossible NOT to watch Episode 2.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are writing Episode ${episodeNumber} of a viral short-form drama series.

SERIES: "${series.title}" (${series.genre})
PREMISE: ${series.premise}
WORLD: ${series.worldContext}

CHARACTERS:
${characterList}

${previousContext}

Write Episode ${episodeNumber} as a 30-60s short-form video. Rules:
- 4-6 scenes, each 5-10 seconds
- CLIFFHANGER REQUIRED: The final scene must end on a moment that makes viewers desperate for Episode ${episodeNumber + 1}
- VISUAL CONSISTENCY: Each scene's visualPrompt MUST include the full appearance description of every character in that scene, copy-pasted exactly — this ensures consistent character appearance across AI-generated clips
- NARRATION: Can be captions, inner monologue, or dialogue. Short and punchy. Max 10 words per line.
- PACING: Each scene should have a distinct visual beat — new angle, new setting, or escalating tension
- List character names involved in each scene via characterNames array (must exactly match character names above)

Respond ONLY with valid JSON:
{
  "title": "Episode ${episodeNumber}: Descriptive Subtitle",
  "synopsis": "1-2 sentence episode summary for series continuity",
  "cliffhanger": "describe the cliffhanger moment in 1 sentence",
  "hashtags": ["#${series.title.toLowerCase().replace(/\s+/g, "")}","#episode${episodeNumber}","#drama","#fyp","#series"],
  "scenes": [
    {
      "order": 1,
      "narration": "short punchy caption or dialogue line",
      "visualPrompt": "full AI video prompt including character appearance verbatim, action, camera angle, lighting, color palette, mood, 9:16 vertical video, cinematic",
      "setting": "location/environment name",
      "characterNames": ["Character Name"],
      "duration": 5
    }
  ]
}`,
      },
    ],
  });

  const raw = (message.content[0] as { text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse episode response");

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    episodeNumber,
    title: parsed.title,
    synopsis: parsed.synopsis,
    cliffhanger: parsed.cliffhanger,
    hashtags: parsed.hashtags ?? [],
    scenes: (parsed.scenes ?? []).map(
      (s: {
        order: number;
        narration: string;
        visualPrompt: string;
        setting: string;
        characterNames?: string[];
        duration?: number;
      }) => ({
        id: randomUUID(),
        order: s.order,
        narration: s.narration,
        visualPrompt: s.visualPrompt,
        setting: s.setting,
        characterIds: (s.characterNames ?? [])
          .map((name: string) => {
            const char = series.characters.find((c) => c.name === name);
            return char?.id ?? "";
          })
          .filter(Boolean),
        duration: (s.duration as 5 | 10) ?? 5,
      })
    ),
  };
}
