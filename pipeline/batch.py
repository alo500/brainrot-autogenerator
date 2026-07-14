"""
batch.py — Batch video generation (and optional upload) for the free-tier pipeline.

Reads topics from a file (one per line) or from CLI args, runs generator.py for each,
and optionally uploads each to YouTube when --upload is set.

Usage:
    python batch.py topics.txt
    python batch.py topics.txt --upload
    python batch.py topics.txt --upload --privacy unlisted
    python batch.py "topic one" "topic two" "topic three"
    python batch.py "topic one" "topic two" --voice en-US-GuyNeural
"""

import sys
import json
import logging
import argparse
from pathlib import Path
from datetime import datetime

# ─── Logging setup ────────────────────────────────────────────────────────────

LOG_FORMAT = "[%(asctime)s] %(levelname)s — %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%H:%M:%S")
log = logging.getLogger("batch")

# ─── Config ───────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent / "output"
BATCH_LOG = OUTPUT_DIR / "batch_results.jsonl"   # one JSON line per completed run


# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_topics_from_file(path: Path) -> list[str]:
    """Read topics from a text file — one topic per line, ignoring blank lines and # comments."""
    if not path.exists():
        raise FileNotFoundError(f"Topics file not found: {path}")
    topics = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                topics.append(line)
    return topics


def append_batch_log(entry: dict) -> None:
    """Append a result entry to the batch JSONL log."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(BATCH_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


# ─── Core ─────────────────────────────────────────────────────────────────────

def run_batch(
    topics: list[str],
    voice: str,
    upload: bool,
    privacy: str,
    output_dir: Path,
) -> None:
    """
    Process each topic sequentially:
      1. Generate video via generator.run_pipeline()
      2. Optionally upload via uploader.upload_video()
      3. Log result to batch_results.jsonl
    """
    # Import here so batch.py can be imported without side effects
    from generator import run_pipeline, DEFAULT_VOICE
    if upload:
        from uploader import upload_video, load_script_meta

    total = len(topics)
    succeeded = 0
    failed = 0
    skipped = 0

    log.info(f"Starting batch: {total} topic(s), upload={'yes' if upload else 'no'}")
    print()

    for i, topic in enumerate(topics, 1):
        topic = topic.strip()
        if not topic:
            skipped += 1
            continue

        log.info(f"[{i}/{total}] Topic: {topic!r}")
        started_at = datetime.utcnow().isoformat()
        result_entry = {
            "topic": topic,
            "started_at": started_at,
            "index": i,
            "total": total,
        }

        try:
            # Generate
            result = run_pipeline(topic=topic, voice=voice, output_dir=output_dir)
            result_entry["output_path"] = result["output_path"]
            result_entry["script_path"] = result["script_path"]
            result_entry["title"] = result["script"]["title"]
            result_entry["run_id"] = result["run_id"]
            result_entry["status"] = "generated"

            # Upload
            if upload:
                script_path = Path(result["script_path"])
                meta = load_script_meta(script_path)
                video_id = upload_video(
                    video_path=Path(result["output_path"]),
                    title=meta["title"],
                    description=meta["description"],
                    tags=meta["tags"],
                    privacy=privacy,
                )
                result_entry["youtube_id"] = video_id
                result_entry["youtube_url"] = f"https://www.youtube.com/shorts/{video_id}"
                result_entry["status"] = "uploaded"
                log.info(f"[{i}/{total}] Uploaded: https://www.youtube.com/shorts/{video_id}")

            succeeded += 1

        except KeyboardInterrupt:
            log.warning("Batch interrupted by user.")
            result_entry["status"] = "interrupted"
            append_batch_log(result_entry)
            break

        except Exception as e:
            failed += 1
            result_entry["status"] = "failed"
            result_entry["error"] = str(e)
            log.error(f"[{i}/{total}] Failed: {e}")

        finally:
            result_entry["finished_at"] = datetime.utcnow().isoformat()
            append_batch_log(result_entry)

        print()  # blank line between runs for readability

    # ── Summary ───────────────────────────────────────────────────
    print("=" * 60)
    log.info(f"Batch complete — {succeeded} succeeded, {failed} failed, {skipped} skipped")
    log.info(f"Results log: {BATCH_LOG}")
    print("=" * 60)


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Batch generate (and optionally upload) brainrot videos.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python batch.py topics.txt
  python batch.py topics.txt --upload --privacy private
  python batch.py "fall of Rome" "why Blockbuster failed" --upload
  python batch.py topics.txt --voice en-US-GuyNeural
        """,
    )
    parser.add_argument(
        "topics",
        nargs="+",
        help=(
            "Either a path to a .txt file with one topic per line, "
            "or multiple topic strings directly on the command line."
        ),
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload each completed video to YouTube Shorts.",
    )
    parser.add_argument(
        "--privacy",
        type=str,
        default="public",
        choices=["public", "private", "unlisted"],
        help="YouTube privacy setting for uploads (default: public).",
    )
    parser.add_argument(
        "--voice",
        type=str,
        default=None,
        help="edge-tts voice name. Defaults to generator.py DEFAULT_VOICE.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Where to write output files (default: ./output).",
    )

    args = parser.parse_args()

    # Load dotenv if available
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).parent / ".env")
    except ImportError:
        pass

    # Resolve voice default lazily to avoid circular import issues at argparse time
    if args.voice is None:
        from generator import DEFAULT_VOICE
        args.voice = DEFAULT_VOICE

    # Determine if the single argument is a file path or a list of topic strings
    if len(args.topics) == 1 and Path(args.topics[0]).is_file():
        topics = load_topics_from_file(Path(args.topics[0]))
        log.info(f"Loaded {len(topics)} topics from {args.topics[0]}")
    else:
        topics = args.topics

    if not topics:
        log.error("No topics found. Check your topics file or CLI arguments.")
        sys.exit(1)

    run_batch(
        topics=topics,
        voice=args.voice,
        upload=args.upload,
        privacy=args.privacy,
        output_dir=args.output_dir,
    )
