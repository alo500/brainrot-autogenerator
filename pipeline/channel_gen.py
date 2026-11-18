#!/usr/bin/env python3
"""
Story-channel generator — local, $0 (Ollama → SDXL → edge-tts → ffmpeg, via generator_local).

Asks analytics-dashboard /channels for the account's next-batch mix (emotion / format / hook
weighted toward what's been working, with 20% kept for experiments), writes a fictional
script for each pick, renders a 9:16 video with an on-screen "Fictional story · AI-generated"
label, and leaves it in output/channels/<account>/<run>/ with a meta.json for channel_post.py.

Usage (from the repo root, with the root .venv):
    .venv/Scripts/python.exe pipeline/channel_gen.py the-verdict --count 3
    .venv/Scripts/python.exe pipeline/channel_gen.py petty-revenge --script-only
"""

import argparse
import json
import random
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

from channel_common import CONFIG, RUNS_DIR, account, api, dashboard_up, save_meta

import generator_local as gen

PLAN_FALLBACK_NOTE = "dashboard unreachable — using an even mix"


def get_plan(account_id: str, acc: dict) -> dict:
    if dashboard_up():
        try:
            return api("GET", f"/plan?account={account_id}")
        except Exception as e:
            print(f"[plan] {e}")
    print(f"[plan] {PLAN_FALLBACK_NOTE}")
    even = lambda xs: {x: 1 / len(xs) for x in xs}
    return {"status": "unknown", "tips": [], "mix": {"emotion": even(acc["emotions"]), "format": even(list(acc["formats"])), "hook": even(list(CONFIG["hooks"]))}}


def pick(weights: dict) -> str:
    keys = list(weights)
    return random.choices(keys, weights=[max(weights[k], 1e-6) for k in keys])[0]


def build_prompt(acc: dict, emotion: str, fmt: str, hook: str, tips: list[str]) -> tuple[str, str]:
    system = f"""You write short, original, clearly FICTIONAL story scripts for a faceless narration channel called "{acc['name']}".
Rules:
- Pure fiction. Invent every detail. Never reference real, identifiable people, brands' private staff, or real events.
- No sexual content, no slurs, no violence beyond a slammed door, no illegal revenge, no harassment or doxxing.
- Narrated in first person by an unnamed narrator. Plain spoken English, short sentences, no emojis.
- 110-150 words of narration total (about 40-55 seconds spoken).
- Image prompts describe moody, FACELESS B-roll only: hands, rainy windows, empty rooms, a coffee cup,
  car headlights, silhouettes from behind, city lights. Never a visible face, and never screens, signs,
  letters or anything with writing on it (the image model can't draw text).

Respond ONLY with JSON:
{{"title": "under 70 chars, curiosity-driven, no clickbait lies",
  "scenes": [{{"narration": "...", "image_prompt": "..."}}],
  "caption": "1-2 sentence post caption that invites comments"}}
Use 4-6 scenes."""
    prompt = f"""Format: {fmt} — {acc['formats'][fmt]}
Emotion to land: {emotion}
Opening: {CONFIG['hooks'][hook]}
Ending: {acc['ending']}"""
    if tips:
        prompt += "\nWhat has been working on this channel:\n- " + "\n- ".join(tips)
    return system, prompt


def write_script(system: str, prompt: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            r = requests.post(
                f"{gen.OLLAMA_URL}/api/generate",
                json={"model": gen.OLLAMA_MODEL, "system": system, "prompt": prompt, "stream": False, "format": "json",
                      "options": {"temperature": 0.9, "num_predict": 1500}},
                timeout=180,
            )
            r.raise_for_status()
            m = re.search(r"\{[\s\S]*\}", r.json()["response"])
            script = json.loads(m.group()) if m else {}
            scenes = [s for s in script.get("scenes", []) if isinstance(s, dict) and s.get("narration") and s.get("image_prompt")]
            words = sum(len(s["narration"].split()) for s in scenes)
            if script.get("title") and 3 <= len(scenes) <= 7 and 90 <= words <= 220:
                script["scenes"] = scenes
                return script
            print(f"[script] attempt {attempt + 1}: rejected ({len(scenes)} scenes, {words} words)")
        except Exception as e:
            print(f"[script] attempt {attempt + 1} failed: {e}")
    raise RuntimeError("script generation failed")


def probe_seconds(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(out.stdout.strip()), 1)
    except ValueError:
        return 0.0


def burn_label(src: Path, dst: Path, text: str) -> bool:
    """Small permanent disclosure in the top-left corner. Returns False if ffmpeg couldn't draw text."""
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-vf",
         f"drawtext=text='{text}':fontcolor=white@0.85:fontsize=22:x=24:y=24:box=1:boxcolor=black@0.45:boxborderw=8",
         "-c:a", "copy", str(dst)],
        capture_output=True,
    )
    return r.returncode == 0 and dst.exists()


def make_one(account_id: str, acc: dict, plan: dict, script_only: bool) -> Path:
    emotion, fmt, hook = pick(plan["mix"]["emotion"]), pick(plan["mix"]["format"]), pick(plan["mix"]["hook"])
    print(f"\n[{account_id}] emotion={emotion} format={fmt} hook={hook}")
    script = write_script(*build_prompt(acc, emotion, fmt, hook, plan.get("tips", [])))

    slug = re.sub(r"[^a-z0-9]+", "-", script["title"].lower())[:40].strip("-")
    run_dir = RUNS_DIR / account_id / f"{datetime.now():%Y%m%d_%H%M%S}-{slug}"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "script.json").write_text(json.dumps(script, indent=2), encoding="utf-8")

    caption = f"{(script.get('caption') or script['title']).strip()}\n\n{CONFIG['disclosure']}.\n{' '.join(acc['hashtags'])}".strip()
    meta = {
        "account": account_id, "title": script["title"], "caption": caption,
        "emotion": emotion, "format": fmt, "hook": hook, "lengthS": 0,
        "video": None, "created": datetime.now().isoformat(timespec="seconds"), "posts": {},
    }
    print(f"[script] \"{script['title']}\"")
    if script_only:
        save_meta(run_dir, meta)
        return run_dir

    images = []
    for i, scene in enumerate(script["scenes"]):
        img = str(run_dir / f"scene_{i}.png")
        gen.generate_image(f"{scene['image_prompt']}, {CONFIG['image_style']}", img, i, negative_prompt=CONFIG["negative_prompt"])
        images.append(img)
    audio = str(run_dir / "voiceover.mp3")
    for attempt in range(3):  # Microsoft's TTS endpoint drops requests now and then
        try:
            gen.generate_voiceover(" ".join(s["narration"] for s in script["scenes"]), audio, voice=acc["voice"])
            if Path(audio).stat().st_size > 0:
                break
        except Exception as e:
            print(f"[tts] attempt {attempt + 1} failed: {e}")
        time.sleep(5)
    else:
        raise RuntimeError("voiceover failed 3 times")

    # assemble_video sizes scenes by "duration"; spread the real voiceover length across scenes
    total = probe_seconds(Path(audio)) or 45
    for s in script["scenes"]:
        s["duration"] = max(3, round(total * len(s["narration"]) / sum(len(x["narration"]) for x in script["scenes"])) + 1)
    raw = run_dir / "raw.mp4"
    gen.assemble_video(script, images, audio, str(raw), title_card=False)

    final = run_dir / f"{slug}.mp4"
    if burn_label(raw, final, CONFIG["disclosure"]):
        raw.unlink()
    else:
        print("[label] ffmpeg drawtext unavailable — caption + platform AI label still disclose it")
        raw.rename(final)

    meta["video"] = final.name
    meta["lengthS"] = probe_seconds(final)
    save_meta(run_dir, meta)
    print(f"[done] {final} ({meta['lengthS']}s)")
    return run_dir


def main():
    ap = argparse.ArgumentParser(description="Generate story-channel videos from the dashboard's adaptive mix")
    ap.add_argument("account", help=f"one of: {', '.join(CONFIG['accounts'])}, or 'all'")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--script-only", action="store_true", help="write scripts without rendering (fast, no GPU)")
    args = ap.parse_args()

    ids = list(CONFIG["accounts"]) if args.account == "all" else [args.account]
    for account_id in ids:
        acc = account(account_id)
        plan = get_plan(account_id, acc)
        print(f"[plan] {account_id}: status={plan.get('status')} tips={len(plan.get('tips', []))}")
        if plan.get("status") == "pause":
            print(f"[plan] {account_id} is paused by the dashboard (15+ videos, <500 median views). Change the formats in channels.json first.")
            continue
        for _ in range(args.count):
            try:
                make_one(account_id, acc, plan, args.script_only)
            except Exception as e:
                print(f"[error] {account_id}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
