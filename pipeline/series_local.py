#!/usr/bin/env python3
"""
Brainrot Series Generator — LOCAL, $0.

Generates multi-episode serialized content with recurring characters,
story arcs, and cliffhangers. Think: AI Love Island, AI Survivor, etc.

Character state persists across episodes via series_state.json.

Usage:
    python series_local.py init "AI Love Island" --genre drama --episodes 10
    python series_local.py next "AI Love Island"
    python series_local.py next "AI Love Island" --count 3
    python series_local.py status "AI Love Island"
"""

import json
import os
import re
import sys
import argparse
from pathlib import Path
from datetime import datetime

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
SERIES_DIR = Path(__file__).parent / "series"

# ---------------------------------------------------------------------------
# Series state management
# ---------------------------------------------------------------------------

def get_series_dir(title: str) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-")
    return SERIES_DIR / slug


def load_series(title: str) -> dict:
    d = get_series_dir(title)
    state_path = d / "series_state.json"
    if not state_path.exists():
        print(f"[!] Series '{title}' not found. Run 'init' first.")
        sys.exit(1)
    return json.loads(state_path.read_text())


def save_series(state: dict):
    d = get_series_dir(state["title"])
    d.mkdir(parents=True, exist_ok=True)
    (d / "series_state.json").write_text(json.dumps(state, indent=2))


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------

def ollama_generate(system: str, prompt: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "system": system,
                    "stream": False,
                    "options": {"temperature": 0.85, "num_predict": 3000},
                },
                timeout=180,
            )
            resp.raise_for_status()
            return resp.json()["response"]
        except Exception as e:
            print(f"[llm] Attempt {attempt+1} failed: {e}")
    print("[llm] All retries exhausted.")
    sys.exit(1)


def extract_json(text: str) -> dict:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("No JSON found in response")
    return json.loads(match.group())


# ---------------------------------------------------------------------------
# Init — create series bible
# ---------------------------------------------------------------------------

BIBLE_SYSTEM = """You are a showrunner creating a serialized reality/drama series for short-form video (60s episodes).
You create characters with distinct voices, visual looks, and personalities.
Every character has clear motivations, flaws, and a visual description specific enough for AI image generation.

Respond ONLY with valid JSON:
{
  "premise": "one-paragraph series premise",
  "setting": "visual description of the setting for image prompts",
  "characters": [
    {
      "name": "character name",
      "role": "protagonist/antagonist/wildcard/narrator",
      "personality": "3-4 word personality summary",
      "visual": "detailed visual description for AI image gen (clothing, features, colors)",
      "voice_style": "how they speak (e.g., deadpan sarcastic, breathless excited)",
      "motivation": "what they want",
      "flaw": "their critical weakness"
    }
  ],
  "arc_outline": ["episode 1 summary", "episode 2 summary", "..."],
  "tone": "series tone description",
  "recurring_elements": ["catchphrase or visual motif", "running joke", "signature transition"]
}

Create 4-6 characters. Arc outline should have one entry per episode."""


def init_series(title: str, genre: str, num_episodes: int):
    d = get_series_dir(title)
    if (d / "series_state.json").exists():
        print(f"[!] Series '{title}' already exists at {d}")
        print("    Delete the directory to reinitialize.")
        sys.exit(1)

    print(f"[init] Creating series: {title} ({genre}, {num_episodes} episodes)")

    prompt = f"""Create a serialized {genre} series called "{title}" with {num_episodes} episodes.
Genre: {genre}
Format: 60-second vertical video episodes
Target: Gen Z / Millennial audience on TikTok/Reels/Shorts
Make it dramatic, bingeable, and meme-able. Every episode ends on a cliffhanger."""

    raw = ollama_generate(BIBLE_SYSTEM, prompt)
    bible = extract_json(raw)

    state = {
        "title": title,
        "genre": genre,
        "total_episodes": num_episodes,
        "current_episode": 0,
        "bible": bible,
        "episodes": [],
        "character_states": {
            c["name"]: {"alive": True, "status": "active", "notes": []}
            for c in bible["characters"]
        },
        "created": datetime.now().isoformat(),
    }

    save_series(state)
    print(f"[init] Series bible created at {d}")
    print(f"[init] Characters: {', '.join(c['name'] for c in bible['characters'])}")
    print(f"[init] Run: python series_local.py next \"{title}\"")


# ---------------------------------------------------------------------------
# Next episode — generate + render
# ---------------------------------------------------------------------------

EPISODE_SYSTEM = """You are writing the next episode of a serialized short-form video series.
You must maintain character consistency, advance the story, and end on a cliffhanger.
Each episode is 60 seconds of vertical video with narration and visuals.

Respond ONLY with valid JSON:
{
  "episode_title": "title",
  "recap": "10-word recap of last episode (or 'Series premiere' if first)",
  "scenes": [
    {
      "narration": "narrator voiceover text",
      "image_prompt": "cinematic image description including character visuals, 9:16 vertical, dark dramatic lighting",
      "duration": 5,
      "characters_present": ["name1", "name2"]
    }
  ],
  "cliffhanger": "the hook that makes viewers watch next episode",
  "character_updates": {
    "CharName": "brief status update or emotional state change"
  },
  "tags": ["tag1", "tag2"],
  "description": "episode description"
}

4-6 scenes. Total narration under 60 seconds. Include character visual descriptions from the bible in image prompts."""


def generate_episode(title: str) -> dict:
    state = load_series(title)

    if state["current_episode"] >= state["total_episodes"]:
        print(f"[!] Series complete ({state['total_episodes']} episodes).")
        return state

    ep_num = state["current_episode"] + 1
    bible = state["bible"]

    # Build context for the LLM
    prev_eps = state["episodes"][-3:]  # last 3 episodes for context
    prev_summary = ""
    if prev_eps:
        prev_summary = "PREVIOUS EPISODES:\n"
        for ep in prev_eps:
            prev_summary += f"  Ep {ep['number']}: {ep['title']} — {ep.get('cliffhanger', 'N/A')}\n"

    char_context = "CHARACTERS:\n"
    for c in bible["characters"]:
        cs = state["character_states"].get(c["name"], {})
        char_context += f"  {c['name']} ({c['role']}): {c['personality']}. Visual: {c['visual']}. Status: {cs.get('status', 'active')}\n"

    prompt = f"""Series: "{state['title']}" ({state['genre']})
Premise: {bible['premise']}
Setting: {bible['setting']}
Tone: {bible['tone']}

{char_context}
{prev_summary}
Arc outline for this episode: {bible['arc_outline'][min(ep_num-1, len(bible['arc_outline'])-1)] if bible.get('arc_outline') else 'Continue the story'}

Write Episode {ep_num} of {state['total_episodes']}.
{"This is the SERIES FINALE — resolve all storylines dramatically." if ep_num == state["total_episodes"] else "End on a cliffhanger."}"""

    print(f"\n[ep {ep_num}/{state['total_episodes']}] Generating episode...")
    raw = ollama_generate(EPISODE_SYSTEM, prompt)
    episode = extract_json(raw)
    episode["number"] = ep_num

    # Update character states
    if "character_updates" in episode:
        for name, update in episode["character_updates"].items():
            if name in state["character_states"]:
                state["character_states"][name]["notes"].append(
                    f"Ep{ep_num}: {update}"
                )

    state["episodes"].append({
        "number": ep_num,
        "title": episode.get("episode_title", f"Episode {ep_num}"),
        "cliffhanger": episode.get("cliffhanger", ""),
        "generated": datetime.now().isoformat(),
    })
    state["current_episode"] = ep_num
    save_series(state)

    print(f"[ep {ep_num}] \"{episode.get('episode_title', 'Untitled')}\"")
    print(f"[ep {ep_num}] Scenes: {len(episode.get('scenes', []))}")
    print(f"[ep {ep_num}] Cliffhanger: {episode.get('cliffhanger', 'N/A')}")

    return episode


def generate_and_render(title: str):
    """Generate episode script + render video using the local pipeline."""
    episode = generate_episode(title)
    if not isinstance(episode, dict) or "scenes" not in episode:
        return

    state = load_series(title)
    ep_num = state["current_episode"]
    series_slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-")
    ep_dir = get_series_dir(title) / f"ep{ep_num:02d}"
    ep_dir.mkdir(parents=True, exist_ok=True)

    # Save episode script
    (ep_dir / "script.json").write_text(json.dumps(episode, indent=2))

    # Use the local generator's image/audio/video functions
    from generator_local import generate_image, generate_voiceover, assemble_video

    # Generate images
    image_paths = []
    for i, scene in enumerate(episode.get("scenes", [])):
        img_path = str(ep_dir / f"scene_{i}.png")
        generate_image(scene["image_prompt"], img_path, i)
        image_paths.append(img_path)

    # Generate voiceover
    full_narration = " ".join(s["narration"] for s in episode["scenes"])
    audio_path = str(ep_dir / "voiceover.mp3")
    generate_voiceover(full_narration, audio_path)

    # Assemble video
    video_path = str(ep_dir / f"{series_slug}_ep{ep_num:02d}.mp4")
    assemble_video(episode, image_paths, audio_path, video_path)

    print(f"\n[done] Episode {ep_num} → {video_path}")
    return video_path


# ---------------------------------------------------------------------------
# Status — show series state
# ---------------------------------------------------------------------------

def show_status(title: str):
    state = load_series(title)
    bible = state["bible"]

    print(f"\n{'='*60}")
    print(f"  {state['title']} ({state['genre']})")
    print(f"  Episodes: {state['current_episode']}/{state['total_episodes']}")
    print(f"{'='*60}")
    print(f"\nPremise: {bible['premise']}\n")

    print("Characters:")
    for c in bible["characters"]:
        cs = state["character_states"].get(c["name"], {})
        status = cs.get("status", "active")
        notes = cs.get("notes", [])
        last_note = notes[-1] if notes else "No updates"
        print(f"  {c['name']} [{c['role']}] — {status} | {last_note}")

    print("\nEpisodes:")
    for ep in state["episodes"]:
        print(f"  Ep {ep['number']}: {ep['title']}")
        if ep.get("cliffhanger"):
            print(f"         ↳ {ep['cliffhanger']}")

    remaining = state["total_episodes"] - state["current_episode"]
    if remaining > 0:
        print(f"\n  {remaining} episodes remaining.")
        print(f"  Run: python series_local.py next \"{title}\"")
    else:
        print("\n  Series complete!")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Brainrot Series Generator (local)")
    sub = parser.add_subparsers(dest="command")

    # init
    init_p = sub.add_parser("init", help="Create a new series")
    init_p.add_argument("title", help="Series title")
    init_p.add_argument("--genre", default="drama",
                        choices=["drama", "comedy", "horror", "reality", "thriller", "romance", "satire"])
    init_p.add_argument("--episodes", type=int, default=10, help="Number of episodes")

    # next
    next_p = sub.add_parser("next", help="Generate next episode(s)")
    next_p.add_argument("title", help="Series title")
    next_p.add_argument("--count", type=int, default=1, help="Number of episodes to generate")
    next_p.add_argument("--script-only", action="store_true", help="Generate script without rendering video")

    # status
    status_p = sub.add_parser("status", help="Show series status")
    status_p.add_argument("title", help="Series title")

    # list
    sub.add_parser("list", help="List all series")

    args = parser.parse_args()

    if args.command == "init":
        init_series(args.title, args.genre, args.episodes)

    elif args.command == "next":
        for i in range(args.count):
            if args.script_only:
                generate_episode(args.title)
            else:
                generate_and_render(args.title)

    elif args.command == "status":
        show_status(args.title)

    elif args.command == "list":
        if not SERIES_DIR.exists():
            print("No series created yet.")
            return
        for d in sorted(SERIES_DIR.iterdir()):
            if (d / "series_state.json").exists():
                s = json.loads((d / "series_state.json").read_text())
                print(f"  {s['title']} — {s['current_episode']}/{s['total_episodes']} episodes ({s['genre']})")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
