#!/usr/bin/env python3
"""
Brainrot Generator — FULLY LOCAL, $0 pipeline.
Uses Ollama (local LLM) + Stable Diffusion (local image gen) + edge-tts + ffmpeg.
No API keys. No billing. Everything runs on your GPU.

Usage:
    python generator_local.py "The fall of Rome told through startup culture"
    python generator_local.py "Why ancient libraries were the original internet"
"""

import json
import os
import re
import subprocess
import sys
import asyncio
import tempfile
import time
from pathlib import Path
from datetime import datetime

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

try:
    import edge_tts
except ImportError:
    print("pip install edge-tts")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
SD_MODEL = os.getenv("SD_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
TTS_VOICE = os.getenv("TTS_VOICE", "en-US-AndrewMultilingualNeural")
OUTPUT_DIR = Path(__file__).parent / "output"

# Check if diffusers is available (lazy import — heavy library)
_pipe = None

def _get_sd_pipe():
    global _pipe
    if _pipe is not None:
        return _pipe
    try:
        import torch
        from diffusers import StableDiffusionXLPipeline
    except ImportError:
        print("\n[!] Install diffusers + torch for local image gen:")
        print("    pip install diffusers torch transformers accelerate")
        sys.exit(1)

    print(f"\n[img] Loading Stable Diffusion model: {SD_MODEL}")
    print("      (first run downloads ~7GB, cached after that)")
    _pipe = StableDiffusionXLPipeline.from_pretrained(
        SD_MODEL,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    )
    _pipe = _pipe.to("cuda")
    _pipe.set_progress_bar_config(disable=True)
    print("[img] Model loaded.\n")
    return _pipe


# ---------------------------------------------------------------------------
# Script generation via Ollama
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are a writer for a satirical internet video studio called Brainrot.
Your scripts have complex layered narratives — not listicles, not "5 facts about X."
Every script has: a hard stop-scroll hook (first 3 seconds), a narrative arc
(setup -> tension -> payoff), cultural references that are earned not dropped,
and a tone that works for both a 19-year-old and a 45-year-old.

You write in a voice that is: chronically online but well-read, sardonic but not
cynical, dense with references but never random. Think parking-lot-at-1am energy.

IMPORTANT: Respond ONLY with valid JSON matching this exact schema:
{
  "title": "video title",
  "hook": "first 3 seconds — hard stop-scroll moment",
  "scenes": [
    {"narration": "what the narrator says", "image_prompt": "cinematic image description, dark aesthetic, 9:16 vertical", "duration": 5}
  ],
  "tags": ["tag1", "tag2"],
  "description": "YouTube description"
}

Keep total narration under 60 seconds. 4-6 scenes. Image prompts should be dark,
cinematic, Fincher/Villeneuve palette — never stock photo energy."""


def generate_script(topic: str, retries: int = 3) -> dict:
    print(f"[script] Generating script for: {topic}")

    for attempt in range(retries):
        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": f"Write a viral short-form video script about: {topic}",
                    "system": SYSTEM_PROMPT,
                    "stream": False,
                    "options": {"temperature": 0.8, "num_predict": 2000},
                },
                timeout=120,
            )
            resp.raise_for_status()
            text = resp.json()["response"]

            # Extract JSON from response (LLMs sometimes wrap it in markdown)
            match = re.search(r"\{[\s\S]*\}", text)
            if not match:
                print(f"[script] Attempt {attempt+1}: no JSON found, retrying...")
                continue

            script = json.loads(match.group())

            # Validate required fields
            assert "title" in script
            assert "scenes" in script and len(script["scenes"]) > 0

            print(f"[script] Generated: \"{script['title']}\" ({len(script['scenes'])} scenes)")
            return script

        except Exception as e:
            print(f"[script] Attempt {attempt+1} failed: {e}")

    print("[script] All retries exhausted.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Image generation via local Stable Diffusion
# ---------------------------------------------------------------------------
def generate_image(prompt: str, output_path: str, index: int) -> str:
    print(f"[img] Scene {index+1}: generating image...")

    pipe = _get_sd_pipe()
    import torch

    image = pipe(
        prompt=prompt,
        negative_prompt="stock photo, bright, cheerful, low quality, blurry, text, watermark",
        width=768,
        height=1344,  # 9:16 vertical
        num_inference_steps=25,
        guidance_scale=7.5,
        generator=torch.Generator("cuda").manual_seed(int(time.time()) + index),
    ).images[0]

    image.save(output_path)
    print(f"[img] Scene {index+1}: saved -> {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# TTS via edge-tts (free, no key)
# ---------------------------------------------------------------------------
def generate_voiceover(text: str, output_path: str) -> str:
    print(f"[tts] Generating voiceover ({len(text)} chars)...")

    async def _run():
        comm = edge_tts.Communicate(text, TTS_VOICE)
        await comm.save(output_path)

    asyncio.run(_run())
    print(f"[tts] Saved -> {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Video assembly via ffmpeg
# ---------------------------------------------------------------------------
def assemble_video(
    script: dict,
    image_paths: list[str],
    audio_path: str,
    output_path: str,
) -> str:
    print("[video] Assembling final video...")

    with tempfile.TemporaryDirectory() as tmp:
        clips = []

        # Title card
        title_path = os.path.join(tmp, "title.mp4")
        title_text = script["title"].replace("'", "'\\''").replace(":", "\\:")
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi",
                "-i", f"color=c=black:s=768x1344:d=3",
                "-vf", (
                    f"drawtext=text='{title_text}'"
                    f":fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2"
                    f":font=monospace"
                    f",fade=in:0:15,fade=out:st=2.5:d=0.5"
                ),
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                title_path,
            ],
            capture_output=True,
        )
        clips.append(title_path)

        # Scene clips with Ken Burns
        for i, (scene, img) in enumerate(zip(script["scenes"], image_paths)):
            dur = scene.get("duration", 5)
            clip_path = os.path.join(tmp, f"scene_{i}.mp4")

            # Alternate zoom direction for variety
            if i % 2 == 0:
                zp = f"zoompan=z='min(zoom+0.001,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={dur*25}:s=768x1344:fps=25"
            else:
                zp = f"zoompan=z='if(eq(on,1),1.15,max(zoom-0.001,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={dur*25}:s=768x1344:fps=25"

            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-loop", "1", "-i", img,
                    "-vf", f"{zp},fade=in:0:12,fade=out:st={dur-0.5}:d=0.5",
                    "-t", str(dur),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    clip_path,
                ],
                capture_output=True,
            )
            clips.append(clip_path)

        # Concat list
        concat_list = os.path.join(tmp, "concat.txt")
        with open(concat_list, "w") as f:
            for c in clips:
                f.write(f"file '{c}'\n")

        # Concat video
        concat_path = os.path.join(tmp, "concat.mp4")
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", concat_list,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                concat_path,
            ],
            capture_output=True,
        )

        # Overlay audio
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", concat_path, "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                output_path,
            ],
            capture_output=True,
        )

    print(f"[video] Final video -> {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def run_pipeline(topic: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower())[:40].strip("-")
    run_dir = OUTPUT_DIR / f"{slug}-{ts}"
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  BRAINROT GENERATOR — LOCAL MODE ($0)")
    print(f"  Topic: {topic}")
    print(f"  Output: {run_dir}")
    print(f"{'='*60}\n")

    # 1. Script
    script = generate_script(topic)
    script_path = run_dir / "script.json"
    script_path.write_text(json.dumps(script, indent=2))

    # 2. Images
    image_paths = []
    for i, scene in enumerate(script["scenes"]):
        img_path = str(run_dir / f"scene_{i}.png")
        generate_image(scene["image_prompt"], img_path, i)
        image_paths.append(img_path)

    # 3. Voiceover
    full_narration = " ".join(s["narration"] for s in script["scenes"])
    audio_path = str(run_dir / "voiceover.mp3")
    generate_voiceover(full_narration, audio_path)

    # 4. Assemble
    video_path = str(run_dir / f"{slug}.mp4")
    assemble_video(script, image_paths, audio_path, video_path)

    print(f"\n{'='*60}")
    print(f"  DONE — {video_path}")
    print(f"{'='*60}\n")
    return video_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Brainrot Local Generator")
    parser.add_argument("topic", help="Video topic")
    parser.add_argument("--voice", default=None, help="TTS voice name")
    parser.add_argument("--output-dir", default=None, help="Output directory")

    args = parser.parse_args()

    if args.voice:
        TTS_VOICE = args.voice
    if args.output_dir:
        OUTPUT_DIR = Path(args.output_dir)

    run_pipeline(args.topic)
