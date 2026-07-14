#!/usr/bin/env python3
"""
Batch runner for LOCAL Brainrot Generator.
Reads topics from a file or CLI args, generates videos sequentially.

Usage:
    python batch_local.py topics.txt
    python batch_local.py "topic one" "topic two" "topic three"
    python batch_local.py topics.txt --upload --privacy private
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description="Brainrot batch generator (local)")
    parser.add_argument("topics", nargs="+", help="Topic strings or path to topics.txt")
    parser.add_argument("--upload", action="store_true", help="Upload to YouTube after generation")
    parser.add_argument("--privacy", default="private", choices=["private", "unlisted", "public"])
    args = parser.parse_args()

    # Collect topics
    topics = []
    for t in args.topics:
        p = Path(t)
        if p.is_file():
            for line in p.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    topics.append(line)
        else:
            topics.append(t)

    if not topics:
        print("No topics found.")
        sys.exit(1)

    print(f"\n  Brainrot Batch — {len(topics)} topics (LOCAL mode, $0)")
    print(f"  Upload: {'yes → ' + args.privacy if args.upload else 'no'}\n")

    # Import generator here so model loads once
    from generator_local import run_pipeline

    results_path = Path(__file__).parent / "output" / "batch_results.jsonl"
    results_path.parent.mkdir(parents=True, exist_ok=True)

    for i, topic in enumerate(topics):
        print(f"\n[{i+1}/{len(topics)}] {topic}")
        print("-" * 50)

        entry = {"topic": topic, "started": datetime.now().isoformat()}
        try:
            video_path = run_pipeline(topic)
            entry["status"] = "ok"
            entry["video"] = video_path

            if args.upload:
                try:
                    from uploader import upload_video
                    import json as _json
                    script_dir = Path(video_path).parent
                    script = _json.loads((script_dir / "script.json").read_text())
                    yt_id = upload_video(
                        video_path,
                        title=script["title"],
                        description=script.get("description", ""),
                        tags=script.get("tags", []),
                        privacy=args.privacy,
                    )
                    entry["youtube_id"] = yt_id
                    print(f"[upload] Uploaded → https://youtube.com/shorts/{yt_id}")
                except Exception as e:
                    entry["upload_error"] = str(e)
                    print(f"[upload] Failed: {e}")

        except KeyboardInterrupt:
            entry["status"] = "interrupted"
            with open(results_path, "a") as f:
                f.write(json.dumps(entry) + "\n")
            print("\nInterrupted. Progress saved.")
            sys.exit(0)
        except Exception as e:
            entry["status"] = "error"
            entry["error"] = str(e)
            print(f"[error] {e}")

        entry["finished"] = datetime.now().isoformat()
        with open(results_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

    print(f"\n  Done. Results → {results_path}")


if __name__ == "__main__":
    main()
