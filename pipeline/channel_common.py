"""
Shared bits for the story-channel scripts (channel_gen / channel_post / channel_stats / tiktok_auth):
config, run folders, and the analytics-dashboard API.
"""

import json
import os
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

HERE = Path(__file__).parent
CONFIG = json.loads((HERE / "channels.json").read_text(encoding="utf-8"))
RUNS_DIR = HERE / "output" / "channels"
SECRETS_DIR = HERE / "secrets"
DASHBOARD = os.getenv("DASHBOARD_URL", "http://localhost:3100").rstrip("/")


def account(account_id: str) -> dict:
    acc = CONFIG["accounts"].get(account_id)
    if not acc:
        raise SystemExit(f"unknown account '{account_id}'. Known: {', '.join(CONFIG['accounts'])}")
    return acc


def load_meta(run_dir: Path) -> dict:
    return json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))


def save_meta(run_dir: Path, meta: dict) -> None:
    (run_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


def runs(account_id: str | None = None) -> list[Path]:
    """Every rendered run folder, oldest first."""
    root = RUNS_DIR / account_id if account_id else RUNS_DIR
    return sorted((p.parent for p in root.rglob("meta.json")), key=lambda p: p.name)


def api(method: str, path: str, **kw) -> dict:
    """Call the dashboard. Raises with the dashboard's error message on failure."""
    r = requests.request(method, f"{DASHBOARD}/api/v1/channels{path}", timeout=30, **kw)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if not r.ok:
        raise RuntimeError(f"dashboard {method} {path}: {r.status_code} {body.get('error', r.text[:200])}")
    return body.get("data", {})


def dashboard_up() -> bool:
    try:
        requests.get(f"{DASHBOARD}/api/v1/channels?days=1", timeout=5)
        return True
    except requests.RequestException:
        return False
