"""
generator.py — Free-tier brainrot video pipeline.

Flow: topic → Claude script → FLUX Schnell images → edge-tts voiceover → ffmpeg assembly → .mp4

Usage:
    python generator.py "the fall of the Roman Empire explained by a guy on his lunch break"
    python generator.py "your topic" --voice en-US-GuyNeural --output-dir ./output
"""

import os
import re
import sys
import json
import time
import asyncio
import argparse
import tempfile
import textwrap
from pathlib import Path
from typing import Optional

import anthropic
import replicate
import edge_tts

# ─── Config ───────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")   # required: set in .env
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")  # required: set in .env

CLAUDE_MODEL = "claude-sonnet-4-6"
FLUX_MODEL = "black-forest-labs/flux-schnell"
DEFAULT_VOICE = "en-US-AndrewMultilingualNeural"   # change to taste
OUTPUT_DIR = Path(__file__).parent / "output"

MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds between retries


# ─── Script Generation ────────────────────────────────────────────────────────

SYSTEM_PROMPT = textwrap.dedent("""
    You are the writer behind the most downloaded short-form videos of the last five years.
    Your voice is the antidote to generic AI slop.

    CORE IDENTITY:
    You write for people who grew up chronically online but have genuinely read books.
    Your scripts carry the weight of something real — history, psychology, systems failure, human stupidity
    at civilizational scale — but delivered with the cadence of someone explaining it in a parking lot
    at 1am while it's raining. Satirical but never smug. Self-aware without being ironic to the point
    of meaninglessness. You know the internet's grammar — the callback, the fake-out, the tonal whiplash —
    but you use it to land something true, not just something shareable.

    WHAT YOU ARE NOT:
    - Not a listicle. Never "5 reasons why..."
    - Not an explainer bot. You don't summarize Wikipedia.
    - Not performatively edgy. Dark means earned weight, not shock for clicks.
    - Not AI-voiced corporate content. If it sounds like a LinkedIn post, kill it.

    NARRATIVE STRUCTURE:
    Every video is a short film with a character arc, even if the "character" is an empire or an idea.
    Hook with something that makes the viewer feel like they walked in on the middle of something important.
    Build layers — the surface story conceals the actual story. The actual story is always about power,
    delusion, or the specific way humans choose comfortable lies over inconvenient truths.
    End with a line that lands in the chest, not the brain.

    CROSS-GENERATIONAL APPEAL:
    A 45-year-old who watches documentaries and a 19-year-old who only watches YouTube Shorts
    should both feel like this was made for them. The references can be ancient or last week — what
    matters is they're precisely chosen, not shotgunned.

    IMAGE PROMPT AESTHETIC:
    Dark. Cinematic. Real locations, not renders. Film grain preferred. The color palette of a 70s
    thriller or a prestige TV drama. Think: Fincher, Villeneuve, early Nolan. No stock photo energy,
    no Getty Images vibe. Every prompt should feel like a still from a film that doesn't exist yet
    but absolutely should.

    OUTPUT FORMAT — return ONLY valid JSON, no preamble, no markdown fences:
    {
      "title": "the actual title — punchy, specific, not generic",
      "hook": "first 3 seconds — a line that makes someone freeze mid-scroll. Specific, unexpected, or uncomfortably true.",
      "script": "full narration text as one continuous block — this is what gets spoken by the voiceover",
      "scenes": [
        {
          "narration": "the narration segment for this scene — 1-3 sentences, natural spoken rhythm",
          "image_prompt": "FLUX Schnell prompt: specify exact subject, action, camera angle (close-up/wide/dutch angle/etc), lighting (golden hour/harsh fluorescent/candlelight/etc), color palette (desaturated teal/amber shadows/monochrome with red accent/etc), film texture (35mm grain/anamorphic lens flare/etc), mood, 9:16 vertical frame — NO stock photo energy, cinematic film still aesthetic, Fincher/Villeneuve palette",
          "duration": 6
        }
      ],
      "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "description": "YouTube/Shorts description — 2-3 sentences that add context the video doesn't give. Make people want to go deeper."
    }

    Scene count: 4-6 scenes. Total video: 30-60 seconds. Duration per scene: 5-10 seconds.
    The scenes array narration should, when read in sequence, equal the full script text.
""").strip()


def generate_script(topic: str) -> dict:
    """Call Claude to produce a structured video script for the given topic."""
    if not ANTHROPIC_API_KEY:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set. Check your .env file.")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    print(f"[script] Generating script for: '{topic}'")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=2500,
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": f'Write a short-form video script about: "{topic}"',
                    }
                ],
            )
            raw = response.content[0].text
            # Pull JSON out even if Claude wraps it in markdown fences
            match = re.search(r"\{[\s\S]*\}", raw)
            if not match:
                raise ValueError("No JSON object found in Claude response")
            script = json.loads(match.group(0))
            _validate_script(script)
            print(f"[script] Done — {len(script['scenes'])} scenes, title: {script['title']!r}")
            return script

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            print(f"[script] Parse error on attempt {attempt}: {e}")
            if attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_DELAY)

        except anthropic.APIError as e:
            print(f"[script] API error on attempt {attempt}: {e}")
            if attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_DELAY * attempt)


def _validate_script(script: dict) -> None:
    """Light validation — raise if the shape is clearly wrong."""
    required_top = {"title", "hook", "script", "scenes", "tags", "description"}
    missing = required_top - set(script.keys())
    if missing:
        raise KeyError(f"Script missing fields: {missing}")
    if not isinstance(script["scenes"], list) or len(script["scenes"]) < 2:
        raise ValueError("Script must have at least 2 scenes")
    for i, scene in enumerate(script["scenes"]):
        for field in ("narration", "image_prompt", "duration"):
            if field not in scene:
                raise KeyError(f"Scene {i} missing field: {field!r}")


# ─── Image Generation ─────────────────────────────────────────────────────────

def generate_image(prompt: str, scene_index: int, output_dir: Path) -> Path:
    """Call FLUX Schnell via Replicate for one scene. Returns path to saved PNG."""
    if not REPLICATE_API_TOKEN:
        raise EnvironmentError("REPLICATE_API_TOKEN is not set. Check your .env file.")

    # Force 9:16 vertical framing in the prompt
    full_prompt = f"{prompt}, 9:16 vertical aspect ratio, portrait orientation"

    print(f"[image] Scene {scene_index + 1}: generating image...")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            output = replicate.run(
                FLUX_MODEL,
                input={
                    "prompt": full_prompt,
                    "aspect_ratio": "9:16",
                    "output_format": "png",
                    "output_quality": 90,
                    "num_inference_steps": 4,   # schnell is fast, 4 steps is standard
                    "go_fast": True,
                },
            )
            # output is a list of FileOutput objects or URLs
            image_data = output[0] if isinstance(output, list) else output

            img_path = output_dir / f"scene_{scene_index:02d}.png"

            # Handle both URL strings and file-like objects from Replicate
            if hasattr(image_data, "read"):
                with open(img_path, "wb") as f:
                    f.write(image_data.read())
            else:
                import urllib.request
                urllib.request.urlretrieve(str(image_data), img_path)

            print(f"[image] Scene {scene_index + 1}: saved to {img_path.name}")
            return img_path

        except Exception as e:
            print(f"[image] Scene {scene_index + 1} error on attempt {attempt}: {e}")
            if attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_DELAY * attempt)


def generate_all_images(scenes: list[dict], output_dir: Path) -> list[Path]:
    """Generate images for all scenes sequentially. Returns ordered list of paths."""
    image_paths = []
    for i, scene in enumerate(scenes):
        path = generate_image(scene["image_prompt"], i, output_dir)
        image_paths.append(path)
    return image_paths


# ─── Voiceover ────────────────────────────────────────────────────────────────

async def _generate_tts_async(text: str, voice: str, output_path: Path) -> None:
    """edge-tts is async-native; this is the inner coroutine."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))


def generate_voiceover(script_text: str, voice: str, output_dir: Path) -> Path:
    """Generate MP3 voiceover for the full script. Returns path to audio file."""
    audio_path = output_dir / "voiceover.mp3"
    print(f"[tts] Generating voiceover with voice: {voice}")

    # Clean up the script text a little — edge-tts doesn't handle some chars well
    clean_text = script_text.replace('"', '"').replace('"', '"').replace("…", "...").strip()

    asyncio.run(_generate_tts_async(clean_text, voice, audio_path))
    print(f"[tts] Voiceover saved: {audio_path.name}")
    return audio_path


# ─── FFmpeg Assembly ──────────────────────────────────────────────────────────

def assemble_video(
    scenes: list[dict],
    image_paths: list[Path],
    audio_path: Path,
    title: str,
    output_path: Path,
    work_dir: Path,
) -> Path:
    """
    Assemble final video using ffmpeg.

    Pipeline:
      1. Each image → video clip with Ken Burns zoom + duration
      2. Fade/crossfade transitions between clips
      3. Title card at the start (2 seconds, black background + white text)
      4. Concatenate all clips
      5. Overlay voiceover audio, trim to audio length
    """
    import subprocess

    print("[ffmpeg] Assembling video...")

    clips = []

    # ── Title card ─────────────────────────────────────────────────
    # Write title to a file so ffmpeg's drawtext:textfile= avoids quoting issues.
    title_clip = work_dir / "title_card.mp4"
    title_txt = work_dir / "title.txt"
    title_txt.write_text(title, encoding="utf-8")

    title_cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", "color=c=black:size=1080x1920:rate=30:duration=2",
        "-vf", (
            f"drawtext=textfile={title_txt}"
            ":fontcolor=white"
            ":fontsize=64"
            ":font=Arial"
            ":x=(w-text_w)/2"
            ":y=(h-text_h)/2"
            ":line_spacing=10"
        ),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-t", "2",
        str(title_clip),
    ]
    _run_ffmpeg(title_cmd, "title card")
    clips.append(title_clip)

    # ── Scene clips with Ken Burns ─────────────────────────────────
    for i, (scene, img_path) in enumerate(zip(scenes, image_paths)):
        duration = int(scene.get("duration", 6))
        clip_path = work_dir / f"clip_{i:02d}.mp4"

        # Ken Burns: alternate between zoom-in and zoom-out with slight pan.
        # zoompan filter uses 'on' (output frame number) for progress.
        frames = duration * 30
        if i % 2 == 0:
            # zoom in: 1.0 → 1.08, pan right
            z = "min(zoom+0.0008,1.08)"
            x = f"iw/2-(iw/zoom/2)+((iw-(iw/zoom))/2)*(on/{frames})"
            y = "ih/2-(ih/zoom/2)"
        else:
            # zoom out: 1.08 → 1.0, pan left
            z = f"max(1.08-0.0008*on,1.0)"
            x = f"iw/2-(iw/zoom/2)+((iw-(iw/zoom))/2)*(1-on/{frames})"
            y = "ih/2-(ih/zoom/2)"

        # Scale to 1080x1920 first (9:16), then apply Ken Burns
        vf = (
            f"scale=1080:1920:force_original_aspect_ratio=increase,"
            f"crop=1080:1920,"
            f"zoompan=z='{z}':x='{x}':y='{y}'"
            f":d={frames}:s=1080x1920:fps=30,"
            f"fade=t=in:st=0:d=0.3,"
            f"fade=t=out:st={duration - 0.3}:d=0.3"
        )

        clip_cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", str(img_path),
            "-vf", vf,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-t", str(duration),
            "-r", "30",
            str(clip_path),
        ]
        _run_ffmpeg(clip_cmd, f"scene {i + 1} clip")
        clips.append(clip_path)

    # ── Concatenate all clips ──────────────────────────────────────
    concat_list = work_dir / "concat.txt"
    with open(concat_list, "w") as f:
        for clip in clips:
            f.write(f"file '{clip.resolve()}'\n")

    silent_video = work_dir / "silent.mp4"
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_list),
        "-c", "copy",
        str(silent_video),
    ]
    _run_ffmpeg(concat_cmd, "concat")

    # ── Overlay audio, trim to audio length ───────────────────────
    final_cmd = [
        "ffmpeg", "-y",
        "-i", str(silent_video),
        "-i", str(audio_path),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",           # trim to shorter of video/audio
        str(output_path),
    ]
    _run_ffmpeg(final_cmd, "audio overlay")

    print(f"[ffmpeg] Final video: {output_path}")
    return output_path


def _run_ffmpeg(cmd: list[str], step: str) -> None:
    """Run an ffmpeg command, surfacing stderr only on failure."""
    import subprocess
    result = subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed at step '{step}':\n{result.stderr[-2000:]}")


# ─── Main Pipeline ────────────────────────────────────────────────────────────

def run_pipeline(topic: str, voice: str = DEFAULT_VOICE, output_dir: Optional[Path] = None) -> dict:
    """
    Full pipeline: topic → script → images → voiceover → video.
    Returns dict with output_path and script data.
    """
    output_dir = output_dir or OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize topic for use in filenames
    slug = re.sub(r"[^\w\s-]", "", topic.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")[:60]
    timestamp = int(time.time())
    run_id = f"{slug}-{timestamp}"

    run_dir = output_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  BRAINROT GENERATOR — FREE TIER")
    print(f"  Topic : {topic}")
    print(f"  Run   : {run_id}")
    print(f"{'='*60}\n")

    # 1. Script
    script = generate_script(topic)

    # Save script JSON alongside output
    script_path = run_dir / "script.json"
    with open(script_path, "w") as f:
        json.dump(script, f, indent=2)
    print(f"[pipeline] Script saved: {script_path.name}")

    # 2. Images
    print(f"\n[pipeline] Generating {len(script['scenes'])} scene images...")
    image_paths = generate_all_images(script["scenes"], run_dir)

    # 3. Voiceover
    print(f"\n[pipeline] Generating voiceover...")
    audio_path = generate_voiceover(script["script"], voice, run_dir)

    # 4. Assemble
    print(f"\n[pipeline] Assembling video...")
    final_path = run_dir / f"{run_id}.mp4"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        assemble_video(
            scenes=script["scenes"],
            image_paths=image_paths,
            audio_path=audio_path,
            title=script["title"],
            output_path=final_path,
            work_dir=tmp_path,
        )

    print(f"\n{'='*60}")
    print(f"  DONE")
    print(f"  Video : {final_path}")
    print(f"  Title : {script['title']}")
    print(f"  Tags  : {', '.join(script.get('tags', []))}")
    print(f"{'='*60}\n")

    return {
        "output_path": str(final_path),
        "script_path": str(script_path),
        "run_id": run_id,
        "script": script,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a brainrot short-form video from a topic.")
    parser.add_argument("topic", type=str, help="The topic to generate a video about")
    parser.add_argument(
        "--voice",
        type=str,
        default=DEFAULT_VOICE,
        help=f"edge-tts voice name (default: {DEFAULT_VOICE}). Run `edge-tts --list-voices` to see options.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Directory to save output files (default: ./output)",
    )
    args = parser.parse_args()

    # Load .env if python-dotenv is available (not a hard dep)
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).parent / ".env")
    except ImportError:
        pass

    result = run_pipeline(
        topic=args.topic,
        voice=args.voice,
        output_dir=args.output_dir,
    )
    print(f"Output: {result['output_path']}")
