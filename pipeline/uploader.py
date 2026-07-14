"""
uploader.py — YouTube auto-upload for the free-tier pipeline.

Reads client_secrets.json for OAuth (download from Google Cloud Console →
APIs & Services → Credentials → OAuth 2.0 Client IDs → Download JSON).

First run: opens a browser for OAuth consent. Token is cached in token.json
and refreshed automatically on subsequent runs.

Usage:
    python uploader.py output/my-run/my-run.mp4 output/my-run/script.json
    python uploader.py output/my-run/my-run.mp4 --title "Custom Title" --tags "a,b,c"
"""

import os
import sys
import json
import argparse
from pathlib import Path

# google-api-python-client + google-auth-oauthlib
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ─── Config ───────────────────────────────────────────────────────────────────

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CLIENT_SECRETS = Path(__file__).parent / "client_secrets.json"  # user provides this
TOKEN_CACHE = Path(__file__).parent / "token.json"

# YouTube Shorts: category 22 = People & Blogs, privacyStatus can be "public"/"private"/"unlisted"
DEFAULT_CATEGORY = "22"
DEFAULT_PRIVACY = "public"

# Shorts threshold: ≤60s and vertical (pipeline enforces this)
MAX_SHORTS_DURATION = 60


# ─── Auth ─────────────────────────────────────────────────────────────────────

def get_credentials() -> Credentials:
    """
    Load or refresh OAuth2 credentials.
    First run: launches browser flow and caches token.json.
    Subsequent runs: loads and auto-refreshes the cached token.
    """
    creds = None

    if TOKEN_CACHE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_CACHE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("[auth] Refreshing access token...")
            creds.refresh(Request())
        else:
            if not CLIENT_SECRETS.exists():
                raise FileNotFoundError(
                    f"client_secrets.json not found at {CLIENT_SECRETS}\n"
                    "Download it from: Google Cloud Console → APIs & Services → "
                    "Credentials → OAuth 2.0 Client IDs → Download JSON\n"
                    "Rename it to client_secrets.json and place it in the pipeline/ directory."
                )
            print("[auth] Opening browser for Google OAuth consent...")
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRETS), SCOPES)
            creds = flow.run_local_server(port=0)

        # Cache token for next run
        with open(TOKEN_CACHE, "w") as f:
            f.write(creds.to_json())
        print(f"[auth] Token cached at {TOKEN_CACHE.name}")

    return creds


# ─── Upload ───────────────────────────────────────────────────────────────────

def upload_video(
    video_path: Path,
    title: str,
    description: str,
    tags: list[str],
    category: str = DEFAULT_CATEGORY,
    privacy: str = DEFAULT_PRIVACY,
) -> str:
    """
    Upload a video to YouTube. Returns the YouTube video ID.

    For Shorts eligibility: video must be ≤60s, 9:16 aspect ratio.
    The pipeline enforces both — this function just uploads.
    The #Shorts hashtag is injected into description automatically.
    """
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    creds = get_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    # Inject #Shorts so YouTube's algorithm picks it up
    shorts_description = f"{description}\n\n#Shorts"
    if "#Shorts" not in tags:
        tags = tags + ["Shorts"]

    body = {
        "snippet": {
            "title": title[:100],           # YouTube title limit: 100 chars
            "description": shorts_description[:5000],
            "tags": tags[:500],             # YouTube tag limit
            "categoryId": category,
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False,
        },
    }

    print(f"[upload] Uploading: {video_path.name}")
    print(f"[upload] Title    : {title}")
    print(f"[upload] Privacy  : {privacy}")

    media = MediaFileUpload(
        str(video_path),
        mimetype="video/mp4",
        resumable=True,
        chunksize=1024 * 1024 * 5,   # 5MB chunks
    )

    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media,
    )

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            pct = int(status.progress() * 100)
            print(f"[upload] Progress: {pct}%", end="\r")

    video_id = response["id"]
    print(f"\n[upload] Complete! Video ID: {video_id}")
    print(f"[upload] URL: https://www.youtube.com/shorts/{video_id}")
    return video_id


# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_script_meta(script_path: Path) -> dict:
    """Load title/description/tags from a script.json produced by generator.py."""
    with open(script_path) as f:
        data = json.load(f)
    return {
        "title": data.get("title", "Untitled"),
        "description": data.get("description", ""),
        "tags": data.get("tags", []),
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload a pipeline video to YouTube Shorts.")
    parser.add_argument("video", type=Path, help="Path to the .mp4 file")
    parser.add_argument(
        "script_json",
        type=Path,
        nargs="?",
        help="Path to script.json (from generator.py). If omitted, use --title/--description/--tags.",
    )
    parser.add_argument("--title", type=str, help="Video title (overrides script.json)")
    parser.add_argument("--description", type=str, default="", help="Video description")
    parser.add_argument("--tags", type=str, default="", help="Comma-separated tags")
    parser.add_argument(
        "--privacy",
        type=str,
        default=DEFAULT_PRIVACY,
        choices=["public", "private", "unlisted"],
        help=f"Privacy status (default: {DEFAULT_PRIVACY})",
    )

    args = parser.parse_args()

    # Load dotenv if available
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).parent / ".env")
    except ImportError:
        pass

    # Resolve metadata
    if args.script_json and args.script_json.exists():
        meta = load_script_meta(args.script_json)
    else:
        meta = {"title": "Untitled", "description": "", "tags": []}

    title = args.title or meta["title"]
    description = args.description or meta["description"]
    tags = [t.strip() for t in args.tags.split(",")] if args.tags else meta["tags"]

    video_id = upload_video(
        video_path=args.video,
        title=title,
        description=description,
        tags=tags,
        privacy=args.privacy,
    )
    print(f"\nDone. https://www.youtube.com/shorts/{video_id}")
