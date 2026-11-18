#!/usr/bin/env python3
"""
TikTok official API client for the story channels: Login Kit OAuth (desktop + PKCE),
Content Posting API *inbox* uploads, and Display API stats.

Inbox upload = the video lands in the account's TikTok inbox as a draft; you open TikTok,
add the caption, switch on "AI-generated content", and post. That works without TikTok's
app audit. (Direct public posting needs the audit; unaudited apps can only post privately.)

Setup: create an app at developers.tiktok.com, add Login Kit (Desktop) + Content Posting API,
scopes user.info.basic, user.info.stats, video.upload, video.list, redirect URI
http://localhost:8765/callback/ — then put TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET in pipeline/.env.

Connect one account (log in to that TikTok account in the browser that opens):
    .venv/Scripts/python.exe pipeline/tiktok_api.py auth the-verdict
"""

import hashlib
import http.server
import json
import os
import secrets
import sys
import time
import urllib.parse
import webbrowser
from pathlib import Path

import requests

from channel_common import SECRETS_DIR, account

API = "https://open.tiktokapis.com/v2"
REDIRECT_URI = os.getenv("TIKTOK_REDIRECT_URI", "http://localhost:8765/callback/")
SCOPES = "user.info.basic,user.info.stats,video.upload,video.list"


def _client() -> tuple[str, str]:
    key, secret = os.getenv("TIKTOK_CLIENT_KEY"), os.getenv("TIKTOK_CLIENT_SECRET")
    if not key or not secret:
        raise SystemExit("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in pipeline/.env (developers.tiktok.com → your app).")
    return key, secret


def _token_path(account_id: str) -> Path:
    return SECRETS_DIR / f"tiktok_{account_id}.json"


def _save(account_id: str, tok: dict) -> dict:
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 0)) - 60
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    _token_path(account_id).write_text(json.dumps(tok, indent=2), encoding="utf-8")
    return tok


def _token_request(data: dict) -> dict:
    r = requests.post(f"{API}/oauth/token/", data=data, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    tok = r.json()
    if "access_token" not in tok:
        raise RuntimeError(f"TikTok token error: {tok}")
    return tok


def authorize(account_id: str) -> None:
    account(account_id)
    key, secret = _client()
    verifier = secrets.token_urlsafe(64)[:64]
    # TikTok desktop PKCE expects the SHA-256 digest hex-encoded (not base64url like most providers)
    challenge = hashlib.sha256(verifier.encode()).hexdigest()
    state = secrets.token_urlsafe(16)
    url = "https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
        "client_key": key, "scope": SCOPES, "response_type": "code", "redirect_uri": REDIRECT_URI,
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    })
    got: dict = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"TikTok connected. You can close this tab.")

        def log_message(self, *a):
            pass

    port = urllib.parse.urlparse(REDIRECT_URI).port or 8765
    print(f"Opening TikTok login for '{account_id}'. Sign in to THAT account in the browser.")
    webbrowser.open(url)
    with http.server.HTTPServer(("127.0.0.1", port), Handler) as srv:
        while "code" not in got and "error" not in got:
            srv.handle_request()
    if got.get("state") != state or "code" not in got:
        raise SystemExit(f"TikTok login failed: {got}")
    tok = _token_request({"client_key": key, "client_secret": secret, "code": got["code"], "grant_type": "authorization_code",
                          "redirect_uri": REDIRECT_URI, "code_verifier": verifier})
    _save(account_id, tok)
    print(f"Connected. Token saved to {_token_path(account_id)}")


def access_token(account_id: str) -> str:
    p = _token_path(account_id)
    if not p.exists():
        raise RuntimeError(f"TikTok not connected for {account_id} — run: python pipeline/tiktok_api.py auth {account_id}")
    tok = json.loads(p.read_text(encoding="utf-8"))
    if time.time() >= tok.get("expires_at", 0):
        key, secret = _client()
        tok = _save(account_id, _token_request({"client_key": key, "client_secret": secret, "grant_type": "refresh_token",
                                                "refresh_token": tok["refresh_token"]}))
    return tok["access_token"]


def _check(r: requests.Response) -> dict:
    body = r.json()
    err = body.get("error", {})
    if not r.ok or (err.get("code") not in (None, "ok")):
        raise RuntimeError(f"TikTok API {r.request.method} {r.url}: {r.status_code} {err}")
    return body.get("data", {})


def upload_draft(account_id: str, video: Path) -> str:
    """Send a video to the account's TikTok inbox. Returns the publish_id."""
    size = video.stat().st_size
    if size > 64 * 1024 * 1024:
        raise RuntimeError("video over 64MB — single-chunk upload only")
    h = {"Authorization": f"Bearer {access_token(account_id)}", "Content-Type": "application/json; charset=UTF-8"}
    data = _check(requests.post(f"{API}/post/publish/inbox/video/init/", headers=h, timeout=30, json={
        "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}}))
    put = requests.put(data["upload_url"], data=video.read_bytes(), timeout=300, headers={
        "Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size - 1}/{size}", "Content-Length": str(size)})
    if put.status_code not in (200, 201):
        raise RuntimeError(f"TikTok upload failed: {put.status_code} {put.text[:200]}")
    return data["publish_id"]


def list_videos(account_id: str, max_pages: int = 5) -> list[dict]:
    """The account's public videos with stats, newest first."""
    h = {"Authorization": f"Bearer {access_token(account_id)}", "Content-Type": "application/json"}
    fields = "id,title,create_time,share_url,duration,view_count,like_count,comment_count,share_count"
    out, cursor = [], None
    for _ in range(max_pages):
        body = {"max_count": 20, **({"cursor": cursor} if cursor else {})}
        data = _check(requests.post(f"{API}/video/list/?fields={fields}", headers=h, json=body, timeout=30))
        out += data.get("videos", [])
        if not data.get("has_more"):
            break
        cursor = data.get("cursor")
    return out


def follower_count(account_id: str) -> int:
    h = {"Authorization": f"Bearer {access_token(account_id)}"}
    data = _check(requests.get(f"{API}/user/info/?fields=open_id,follower_count", headers=h, timeout=30))
    return int(data.get("user", {}).get("follower_count", 0))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "auth":
        authorize(sys.argv[2])
    else:
        print(__doc__)
