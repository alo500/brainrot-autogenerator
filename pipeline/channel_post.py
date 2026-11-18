#!/usr/bin/env python3
"""
Post rendered story-channel videos and register each post with analytics-dashboard /channels.

  youtube  → uploaded as a public Short with YouTube's synthetic-content flag set, ONLY once the
             Google Cloud project has passed the YouTube API audit (set YOUTUBE_API_VERIFIED=1).
             Uploads from an unverified project are silently forced to private and can't be
             appealed, so each one is a wasted video. Until then, upload by hand in YouTube Studio.
  tiktok   → sent to the account's TikTok inbox as a draft (finish in the app: paste the caption,
             turn on "AI-generated content", post). channel_stats.py links the live post back.
  instagram / facebook → manual for now: log the post on /channels after uploading the same mp4.

A per-account daily cap keeps new accounts from looking like spam (default 2 per platform per day).

Usage (from the repo root):
    .venv/Scripts/python.exe pipeline/channel_post.py --auth-youtube the-verdict
    .venv/Scripts/python.exe pipeline/channel_post.py                  # post everything pending
    .venv/Scripts/python.exe pipeline/channel_post.py --account petty-revenge --platforms youtube
"""

import argparse
import os
from datetime import date, datetime
from pathlib import Path

from channel_common import CONFIG, SECRETS_DIR, account, api, dashboard_up, load_meta, runs, save_meta

YT_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]
AUTO_PLATFORMS = ["youtube", "tiktok"]


def youtube_creds(account_id: str):
    from uploader import get_credentials

    return get_credentials(SECRETS_DIR / f"youtube_{account_id}.json", YT_SCOPES)


def posted_today(account_id: str, platform: str) -> int:
    today = date.today().isoformat()
    return sum(1 for r in runs(account_id) if load_meta(r)["posts"].get(platform, {}).get("at", "").startswith(today))


def register(meta: dict, platform: str, post: dict) -> None:
    """Tell the dashboard about a post. Safe to call again; it upserts on platform + externalId."""
    data = api("POST", "/videos", json={
        "account": meta["account"], "platform": platform, "title": meta["title"], "emotion": meta["emotion"],
        "format": meta["format"], "hook": meta["hook"], "lengthS": meta["lengthS"], "externalId": post["id"],
        "url": post.get("url"), "postedAt": post["at"], "renderId": meta.get("render_id"), "status": post["status"],
    })
    post["dashboard_id"] = data["id"]


def post_youtube(run_dir: Path, meta: dict) -> dict:
    # videos.insert from an unverified API project (created after 2020-07-28) is forced to
    # private regardless of the privacy we request, the call still "succeeds", and YouTube
    # won't unlock those videos on appeal; they must be re-uploaded. Refuse rather than burn them.
    if os.environ.get("YOUTUBE_API_VERIFIED") != "1":
        raise RuntimeError(
            "YouTube API project not verified: uploads would be locked to private permanently. "
            "Upload this video by hand in YouTube Studio, or set YOUTUBE_API_VERIFIED=1 once the "
            "project passes the YouTube API audit."
        )
    from uploader import upload_video

    tags = [h.lstrip("#") for h in account(meta["account"])["hashtags"]]
    vid = upload_video(run_dir / meta["video"], title=meta["title"], description=meta["caption"], tags=tags,
                       privacy="public", creds=youtube_creds(meta["account"]), synthetic=True)
    return {"id": vid, "url": f"https://www.youtube.com/shorts/{vid}", "status": "posted"}


def post_tiktok(run_dir: Path, meta: dict) -> dict:
    from tiktok_api import upload_draft

    publish_id = upload_draft(meta["account"], run_dir / meta["video"])
    (run_dir / "caption.txt").write_text(meta["caption"], encoding="utf-8")
    print(f"[tiktok] draft in the TikTok inbox. Caption saved to {run_dir / 'caption.txt'} — remember the AI-generated toggle.")
    return {"id": publish_id, "url": None, "status": "draft"}


POSTERS = {"youtube": post_youtube, "tiktok": post_tiktok}


def main():
    ap = argparse.ArgumentParser(description="Post story-channel videos and register them with the dashboard")
    ap.add_argument("--account", default="all")
    ap.add_argument("--platforms", default=",".join(AUTO_PLATFORMS))
    ap.add_argument("--per-day", type=int, default=2, help="max posts per account per platform per day")
    ap.add_argument("--auth-youtube", metavar="ACCOUNT", help="connect a YouTube channel for an account and exit")
    args = ap.parse_args()

    if args.auth_youtube:
        account(args.auth_youtube)
        print(f"Sign in with the Google account that owns the '{args.auth_youtube}' YouTube channel.")
        youtube_creds(args.auth_youtube)
        print("Connected.")
        return

    platforms = [p for p in args.platforms.split(",") if p in POSTERS]
    if args.account != "all":
        account(args.account)
    ids = list(CONFIG["accounts"]) if args.account == "all" else [args.account]
    online = dashboard_up()
    if not online:
        print("[dashboard] unreachable — posts will be registered next run")

    for account_id in ids:
        for run_dir in runs(account_id):
            meta = load_meta(run_dir)
            if not meta.get("video"):
                continue
            for platform in platforms:
                post = meta["posts"].get(platform)
                if post is None:
                    if posted_today(account_id, platform) >= args.per_day:
                        continue
                    try:
                        print(f"\n[{account_id}/{platform}] {meta['title']}")
                        post = POSTERS[platform](run_dir, meta)
                        post["at"] = datetime.now().astimezone().isoformat(timespec="seconds")
                        meta["posts"][platform] = post
                        save_meta(run_dir, meta)
                    except Exception as e:
                        print(f"[{account_id}/{platform}] failed: {e}")
                        continue
                if online and "dashboard_id" not in post:
                    try:
                        register(meta, platform, post)
                        save_meta(run_dir, meta)
                        print(f"[dashboard] registered as video #{post['dashboard_id']}")
                    except Exception as e:
                        print(f"[dashboard] {e}")


if __name__ == "__main__":
    main()
