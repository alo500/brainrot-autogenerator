# PLAN.md — Brainrot LLC: Generator Build Plan

**Date:** July 2, 2026
**State of the union:** The core cloud pipeline works end-to-end — `pipeline/generator.py`
(Claude → FLUX Schnell → edge-tts → ffmpeg) has produced complete videos, and
`pipeline/uploader.py` is a finished YouTube Shorts uploader waiting on credentials.
The Next.js studio UI is real and streams generation logs live. What's missing is the
connective tissue: nothing auto-posts, series scripts can't become videos, there are no
tests, and nobody knows how any video performed.

**The plan in one sentence:** ship real videos in 3 days, remove yourself from the loop
by day 10, add measurement and scale by day 21, and package it as a product by day 30.

**Cost reality check:** ~$0.06/video ($0.045 Claude + $0.015 Replicate). 5 videos/day
for 30 days ≈ **$9/month** in API costs. The constraint is never money; it's YouTube's
default upload quota (6/day) and platform trust on new accounts.

---

## Phase 1: Ship It (Days 1–3, Jul 2–4) — Get real videos live

### 1.1 — `.env` setup + config hygiene · **P0 · 1h · blocks everything**
- Create `pipeline/.env` from `.env.example` (it doesn't exist yet — see TONIGHT.md).
- Create root `.env.local` for Next.js (`lib/scriptgen.ts` reads `process.env.ANTHROPIC_API_KEY`).
- Add a `python pipeline/check_env.py` preflight (20 lines): asserts both keys present,
  pings both APIs, checks `ffmpeg -version`. Fail loud at startup, not scene 3 of a run.

### 1.2 — Fix `/api/local/generate` engine selection · **P0 · 30min**
**This is a landmine already in the codebase.** `app/api/local/generate/route.ts` is
hardcoded to `generator_local.py` — the untested Ollama/SDXL path. Anyone clicking Generate
in the UI right now hits a pipeline that requires a local GPU and Ollama running.

- Accept an `engine` field in the POST body; default to the **working** cloud script:
  ```ts
  const script = path.join(pipelineDir, engine === "local" ? "generator_local.py" : "generator.py");
  ```
- Add an engine toggle to the Settings view in `app/page.tsx`.
- Also fix: `venvPython` is built as `venv/bin/python` (POSIX). If dev ever moves off
  WSL onto native Windows, this breaks — make it:
  ```ts
  const venvPython = process.platform === "win32"
    ? path.join(pipelineDir, "venv", "Scripts", "python.exe")
    : path.join(pipelineDir, "venv", "bin", "python");
  ```

### 1.3 — Parallelize image generation · **P1 · 2h · parallel with 1.4/1.5**
`generate_all_images()` in `pipeline/generator.py` is a serial for-loop over
`generate_image()`, and each `replicate.run()` call blocks. 5 scenes × ~20s = the slowest
part of the pipeline. `replicate.run` is synchronous, so wrap it in threads rather than
rewriting the retry logic:

```python
async def generate_all_images_async(scenes: list[dict], output_dir: Path) -> list[Path]:
    """Generate all scene images concurrently. Order is preserved by gather."""
    tasks = [
        asyncio.to_thread(generate_image, scene["image_prompt"], i, output_dir)
        for i, scene in enumerate(scenes)
    ]
    return list(await asyncio.gather(*tasks))

def generate_all_images(scenes: list[dict], output_dir: Path) -> list[Path]:
    return asyncio.run(generate_all_images_async(scenes, output_dir))
```

Nothing else changes — `run_pipeline()` keeps the same call, retries stay inside
`generate_image()`. Expected: image phase drops from ~100s to ~25s; whole run ~2min → ~45s.

Bonus: kick off `generate_voiceover` concurrently with images — they're independent.
Saves another 10–15s.

### 1.4 — Upload API route + "Post to YouTube" button · **P1 · 3h**
- New route: `app/api/local/upload/route.ts`. POST `{ runId, privacy }` → spawns
  `pipeline/uploader.py` with the run's `.mp4` and `script.json` (both already sit
  in each run dir), streams stdout via SSE exactly like `/api/local/generate` does —
  copy that file's `ReadableStream` pattern, it's already correct.
- Caveat: `uploader.py`'s first-ever run opens a browser for OAuth
  (`flow.run_local_server`). Do the first auth **once from the CLI** so `token.json`
  exists; the API route then always hits the cached-token path. Add a check in the route:
  if `pipeline/token.json` is missing, return a 428 with "run `python uploader.py` once
  from a terminal first."
- UI: in the Library/gallery view of `app/page.tsx`, add a **Post to YouTube** button per
  video card + privacy select (`unlisted` default). Show upload progress in the existing
  terminal log component. On success, store the returned video ID (see 1.5).

### 1.5 — Local metadata + duration · **P1 · 2h · parallel with 1.4**
Local mode has zero metadata today; `/api/local/videos` just scans directories.

At the end of `run_pipeline()`, write `metadata.json` into the run dir:
```python
def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
        capture_output=True, text=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])

metadata = {
    "run_id": run_id, "topic": topic, "title": script["title"],
    "voice": voice, "duration_sec": probe_duration(final_path),
    "size_bytes": final_path.stat().st_size,
    "created_at": datetime.now(timezone.utc).isoformat(),
    "youtube_id": None, "posted": {},
}
(run_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
```

- `/api/local/videos` reads `metadata.json` when present (fall back to dir scan for the
  existing legacy runs).
- The upload route from 1.4 writes `youtube_id` back into this file — that's your
  posted/not-posted source of truth until Supabase.
- UI: show duration + posted badge on video cards.

### 1.6 — Generate and post first 5 real videos · **P0 · 2h (mostly wall-clock)**
- Pick 5 from `pipeline/topics.txt` under one channel identity (recommend History
  Unhinged — the Rome test run proves the format works).
- `python batch.py topics_launch.txt --upload --privacy public`
- Watch every one before/after posting. This is QA, not vanity — you're checking TTS
  pronunciation, title-card text overflow (long titles will overflow the 64px drawtext
  in `assemble_video()` — titles >40 chars need a wrap or smaller font; check it),
  and scene/narration sync.
- Cross-post all 5 manually to TikTok + Reels. Same file works everywhere (9:16, <60s).

**Phase 1 exit criteria:** 5 videos live on 3 platforms; generation takes <60s;
one-click upload from the UI; every new run has metadata.json.

---

## Phase 2: Automate (Days 4–10, Jul 5–11) — Run without touching it

### 2.1 — Scheduled batch generation · **P1 · 3h**
Don't build a scheduler; use the OS. New file `pipeline/daily.py`:
takes N topics from a `topics_queue.txt`, runs the pipeline for each, uploads,
moves consumed topics to `topics_done.txt`, appends to `batch_results.jsonl`
(batch.py already writes this — reuse its logging).

- Windows: Task Scheduler daily at generation time
- WSL/Linux: `cron: 0 9 * * * cd ~/brainrot/pipeline && venv/bin/python daily.py --count 3 --upload`
- Respect the YouTube quota: 1,600 units/upload against a 10,000/day quota = max 6.
  Cap `--count` at 4 and request a quota increase now (takes days/weeks).
- Alert on failure: Discord webhook — `requests.post(WEBHOOK_URL, json={"content": f"run failed: {e}"})`.
  5 lines, do it. The entire difference between "automated" and "silently broken for four days."

### 2.2 — Auto-post integration (generate → YouTube, no hands) · **P1 · 2h · depends 2.1**
Mostly falls out of 2.1 + batch.py's existing `--upload` flag. The real work:
- Handle the Testing-mode OAuth token expiring every 7 days: catch `RefreshError` in
  `get_credentials()`, fire the Discord alert, and **publish the OAuth app** in Google
  Console this week to make tokens long-lived. Submit for verification with the
  youtube.upload scope; it's a form, not a project.
- Idempotency: skip any run whose `metadata.json` already has a `youtube_id`.

### 2.3 — TikTok posting strategy · **P2 · 4h to evaluate + implement chosen option**
No official public upload API for this use case. Honest options (see §Tech Stack):

- **Option A (recommended when volume demands): `pip install tiktok-uploader`** — cookie-based
  Selenium wrapper. Export session cookies with a browser extension, uploads headlessly.
  Works ~most of the time; breaks when TikTok changes their DOM; account-ban risk is
  real but low at 1–3 posts/day on a Creator account.
- **Option B: manual, 90 seconds/day.** Genuinely fine at current volume.

Decision rule: stay manual until you're posting >3/day or skipping days; then Option A
behind a `--tiktok` flag in `daily.py`, wrapped in try/except so a TikTok failure never
kills the YouTube path.

### 2.4 — Instagram Reels posting strategy · **P2 · 4h**
- **Recommended: Meta Graph API content publishing** — the only official path.
  Requires: Creator/Business IG account (done in TONIGHT.md) → linked Facebook Page →
  Meta developer app → `instagram_content_publish` permission. Flow:
  `POST /{ig-user-id}/media` with `media_type=REELS` + a **public video URL**
  (this is your first real reason to ship R2 — Reels API pulls from a URL, it doesn't
  accept file uploads) → poll status → `POST /{ig-user-id}/media_publish`.
  Setup is a half-day of Meta console pain, then it's stable and TOS-clean.
- **Fallback: `instagrapi`** (unofficial, private API) — faster to ship, same ban-risk
  profile as tiktok-uploader. Avoid running unofficial automation on both IG and
  TikTok from day one; pick your risk budget.
- Manual until Phase 3 is acceptable.

### 2.5 — Caching layer · **P2 · 2h · parallel with anything**
In `run_pipeline()`, before generating:
```python
import hashlib
cache_key = hashlib.sha256(f"{topic}|{voice}".encode()).hexdigest()[:16]
cache_index = OUTPUT_DIR / "cache_index.json"   # {cache_key: run_id}
```
On hit, return the existing run dict (`--force` to override). Saves money, but the real
win is idempotent retries in batch/scheduled runs.

### 2.6 — Series → Video pipeline · **P1 · 2 days · THE big missing piece**
Currently: `lib/scriptgen.ts` + `/api/series/[id]/episodes` produce episode *scripts*;
`series_local.py` is CLI-only; no path from episode script → .mp4.

**Step 1:** Refactor `pipeline/generator.py` — extract `run_pipeline_from_script(script: dict, voice, output_dir)` containing steps 2–4 (images → TTS → assembly). `run_pipeline()` becomes `generate_script()` + that call. ~30 lines moved, zero behavior change. **Do this first; everything else hangs off it.**

**Step 2:** Add `--script-json path/to/episode.json` flag to generator.py so any pre-written script
(episode or single) can be rendered without re-hitting Claude.

**Step 3:** New route `app/api/series/[id]/render/route.ts`: loads episode scripts,
spawns `generator.py --script-json ep_01.json --output-dir output/series/<slug>/ep_01`,
SSE-streams per episode sequentially.

**Step 4:** Episode scripts must match generator.py's scene schema (`narration`, `image_prompt`,
`duration`) — `_validate_script()` is the contract test between the TS and Python sides.
Character-appearance persistence already lives in the series bible prompts; verify the
image prompts actually carry appearance strings across episodes on a 3-episode test run.

**Step 5:** UI: "Render All Episodes" button in the Series view.

### 2.7 — Retry UI · **P2 · 1h**
`/api/jobs/[id]/retry` exists with no frontend. Cloud-mode job cards: show `failed`
status in red + Retry button → POST to the route → refresh via SWR mutate. For local
mode, "retry" is just re-running generate with the same topic (cache from 2.5 makes
that safe) — one button, same handler.

### 2.8 — First tests · **P1 · 3h · parallel with anything**
Zero tests today. Don't aim for coverage; aim for the seams:

- `pip install pytest` → `pipeline/tests/test_script_validation.py`
  (`_validate_script` accepts/rejects fixtures), `test_slug.py` (the regex slug logic),
  `test_metadata.py` (probe_duration on a tiny fixture mp4 committed to the repo).
- `test_uploader_meta.py`: `load_script_meta()` against a real `script.json` from `pipeline/output/`.
- The one integration test that matters: `--script-json` fixture → full render with
  Replicate mocked (monkeypatch `generate_image` to copy a fixture PNG) → assert an .mp4
  exists and probe_duration > 10. This catches ffmpeg regressions, the most fragile layer.

**Phase 2 exit criteria:** videos appear on YouTube daily with zero manual steps;
series can be rendered end-to-end; failures alert you instead of silently dying.

---

## Phase 3: Scale & Optimize (Days 11–21, Jul 12–22)

### 3.1 — Parallel batch generation · **P2 · 3h**
`batch.py` runs topics sequentially. With 1.3 done, per-video time is API-bound, so run
2–3 topics concurrently: `asyncio.Semaphore(3)` + `asyncio.to_thread(run_pipeline, ...)`.
Cap at 3 — Replicate rate limits and CPU are the ceilings. Keep uploads
sequential (quota) behind the generation semaphore.

### 3.2 — A/B hook testing · **P2 · 1 day**
An `/api/script/hooks` route already exists — start there.
- Prompt change in `generate_script()`: request `"hooks": ["variant A", "variant B"]`.
- Render is cheap to fork: the hook is scene 1's narration. Generate variant B by
  re-running TTS + reassembly only (~15s, $0) — images are shared.
- Post A and B as separate Shorts, tag them in metadata.json (`"experiment": "hook", "variant": "a"`),
  and let 3.3's analytics decide. Even 48h of view data on a small channel gives a
  directional read on hook style.

### 3.3 — Analytics: pull + dashboard · **P1 · 2 days**
- `pipeline/analytics.py`: YouTube Data API v3 `videos().list(part="statistics,contentDetails", id=...)`
  for every `youtube_id` in metadata files. 1 unit/call — negligible quota. Nightly via
  the same scheduler as 2.1; append snapshots to Supabase (daily snapshots, not overwrites,
  so you can plot curves).
- For watch time/retention: **YouTube Analytics API** (`youtubeanalytics.googleapis.com`) —
  same OAuth project, add scope `yt-analytics.readonly` to SCOPES and re-auth once.
- Fix the existing gap: `AnalyticsDashboard` only reads Supabase. Once local runs sync
  metadata.json → Supabase (3.4), it works for everything. Views/likes/comments per
  video, sortable, with the A/B variant tag from 3.2 as a filter.

### 3.4 — Supabase sync for local mode · **P1 · 1 day · before 3.3 dashboard work**
Small sync script or post-run hook: upsert each run's metadata.json into Supabase.
Now cloud and local runs live in one table, `AnalyticsDashboard` has one source of
truth, and the "video duration always null" bug dies here (1.5 populates it locally;
the sync carries it up).

### 3.5 — R2 hosting · **P2 · 1 day**
`lib/storage.ts` is written. Post-assembly, upload the .mp4 + thumbnail to
`brainrot-videos/{run_id}/`; store the public URL in metadata + Supabase. Gallery plays
from R2 URLs instead of `/api/local/serve`. Prereq for Reels API (2.4) and for hosting
the app anywhere other than this machine. Keep local files as archive.

### 3.6 — Thumbnails · **P2 · 2h**
Local mode has none. In `run_pipeline()` after assembly:
```python
subprocess.run(["ffmpeg", "-y", "-i", str(final_path), "-ss", "2.5",
                "-vframes", "1", "-vf", "scale=1080:1920", str(run_dir / "thumb.jpg")])
```
(`-ss 2.5` = just past the 2s title card, so the thumb is the first real scene.)
Wire into `/api/local/videos` + gallery.

### 3.7 — Content calendar / optimal-time scheduling · **P2 · 1 day**
Generation time ≠ post time. Add `publishAt` support to uploader.py — YouTube supports
scheduled publish natively: set `"status": {"privacyStatus": "private", "publishAt": "<ISO8601>"}`.
Then `daily.py` generates in one morning batch but staggers publish times (e.g., 12pm/5pm/8pm).
Store per-channel posting slots in a simple `schedule.json`; let 3.3's data tune them later.

### 3.8 — Type the Python · **P2 · 3h · fill-in task**
Signatures are already half-typed (see generator.py). Finish it: `mypy --strict` on
`generator.py`, `uploader.py`, `batch.py`, `daily.py`, `analytics.py`. Add a
`TypedDict` for the script schema — it documents the TS↔Python contract from 2.6.

**Phase 3 exit criteria:** you know which videos perform and why; hooks are tested,
not guessed; posts go out at chosen times; everything is visible in one dashboard.

---

## Phase 4: Product (Days 22–30, Jul 23–Aug 1) — Brainrot LLC launch

### 4.1 — Studio UI polish · **P2 · 2 days**
The terminal-that-gained-consciousness aesthetic is the brand — lean in. Priorities:
empty states, error states (surface Python stderr readably), generation progress with
per-stage indicators (script → images ×N → tts → assembly — the SSE log lines already
carry `[script]`/`[image]`/`[tts]`/`[ffmpeg]` prefixes, parse them), keyboard shortcuts,
and a real Queue view backed by the Redis queue.

### 4.2 — Series Studio end-to-end · **P1 · 2 days · depends 2.6**
One flow: create series → generate bible → generate all episode scripts → review/edit
scripts (add inline editing; a human pass on episode scripts is the cheapest quality
lever you have) → Render All → batch upload with per-episode scheduling from 3.7
(episode/day drops). This is the demo that sells the whole product.

### 4.3 — Productization decision · **P1 · thinking + a doc, 1 day**
Options in order of realism:
1. **Internal engine for owned channels** (now): revenue = ad share + sponsorships.
   Zero extra eng. This is the default and it's fine.
2. **Consulting wedge** (days 22–30): "we built an automated content studio; we'll build
   yours" — needs 4.4, not more code. Highest $/hour of the three layers.
3. **SaaS** (later, only with evidence): multi-tenant auth, API-key custody or metered
   billing, content moderation liability, platform-ToS exposure on behalf of customers.
   Real product, real support burden. Don't start until strangers ask to pay.

Decision by day 30, written down, with the metric that would change it.

### 4.4 — Public writeup / consulting demo · **P2 · 1 day**
"We built an autonomous video studio: Claude + FLUX + ffmpeg, $0.06/video" — the
architecture diagram, honest numbers from 3.3 (including flops), a channel link, and
what didn't work. Ship it where your consulting leads live (LinkedIn/X/blog). The
codebase is the portfolio; this is the brochure.

---

## Tech Stack Recommendations

### TikTok auto-posting

| Option | Verdict |
|---|---|
| `tiktok-uploader` (PyPI, cookie/Selenium) | **Use when volume demands it.** Breaks on DOM changes (expect maintenance ~monthly); ban risk low-but-nonzero at ≤3 posts/day. Never on an account you can't afford to lose. |
| Hand-rolled Selenium/Playwright | Strictly worse — you maintain what the library already maintains. No. |
| Official Content Posting API | Exists but requires app audit aimed at established platforms; apply anyway and use it if approved. |
| Manual | **Correct answer under 3 posts/day.** 90 sec/post from the phone. |

### Instagram Reels

| Option | Verdict |
|---|---|
| Meta Graph API (`instagram_content_publish`) | **The right long-term answer.** Official, stable, TOS-clean. Needs Creator/Business acct + FB Page + dev app + a public video URL (→ R2). Budget a half-day of Meta console friction once. |
| `instagrapi` | Works, unofficial, ban risk. Acceptable stopgap if Graph API approval stalls. |
| Buffer / Later | Buffer free tier ≈ 3 channels / ~10 posts; paid ~$5–6/channel/mo. Fine for scheduling, but you're building this in 3.7 — only worth it if Meta app review becomes a blocker. |

### Background music
- **Sources:** Pixabay Music (pixabay.com/music — free, no attribution, safest license),
  YouTube Audio Library (studio.youtube.com → Audio Library — free, check terms per track).
  Download 10–15 tracks into `pipeline/assets/music/`, tag by mood in a small JSON.
- **Integration:** one extra input on the final ffmpeg pass in `assemble_video()`:
  ```python
  final_cmd = [
      "ffmpeg", "-y",
      "-i", str(silent_video), "-i", str(audio_path),
      "-stream_loop", "-1", "-i", str(music_path),
      "-filter_complex",
      "[2:a]volume=0.12,afade=t=in:d=1[m];[1:a][m]amix=inputs=2:duration=first[a]",
      "-map", "0:v:0", "-map", "[a]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
      str(output_path),
  ]
  ```
  Voice at 1.0, music at ~0.12, music loops and truncates to VO length.
  Let Claude pick the mood tag in the script JSON (`"music_mood": "tense"`).

### Subtitles / captions (the highest-ROI missing feature)
- **Recommendation: ffmpeg subtitles filter with ASS styling — not moviepy.** moviepy
  adds a heavy dependency, renders frame-by-frame in Python (slow), and fights the
  existing subprocess architecture.
- Word-level timing: `pip install faster-whisper`, transcribe `voiceover.mp3` with
  `word_timestamps=True` (small model, ~5s on CPU for a 60s clip), emit an `.ass` file
  with 2–3-word chunks (the TikTok caption style), styled (outline, bold, centered
  lower-third), then burn in: `-vf "ass=captions.ass"` on the final pass.
- This is genuinely a top-3 retention lever for short-form — schedule it as a Phase 2.5
  task even though it wasn't in the original gap list. Silence-under-VO with no captions
  is the #1 "this is AI content" tell.

### Video analytics
- **YouTube Data API v3** — free, 1 unit per stats read; use for views/likes/comments (3.3).
- **YouTube Analytics API** — same OAuth app, extra scope; watch time + retention curves.
- **TikTok Research API** — application-gated, aimed at academics; don't wait on it.
  Manual weekly export from TikTok Creator Center into a CSV is the pragmatic answer.
- **Instagram Insights via Graph API** — comes with the same app you build for 2.4.

### Content sourcing for topics
- **Reddit:** `pip install praw`, free OAuth app at reddit.com/prefs/apps (script type).
  Pull daily top from r/AskHistorians, r/todayilearned, r/ExplainLikeImFive,
  r/UnresolvedMysteries → feed titles to Claude with "pitch 5 video angles in our voice"
  → append winners to `topics_queue.txt`. One 100-line script, huge topic leverage.
- **Wikipedia:** free REST API — `api.wikimedia.org/core/v1/wikipedia/en/page/...` and the
  pageviews API for trending articles. No auth needed.
- **Google Trends:** no official API; `pytrends` is the de-facto library (unofficial,
  occasionally breaks). Fine for a weekly signal, don't build a daily dependency on it.

### Hosting the Next.js app
- **Now: keep it local.** The app spawns Python via `child_process` and reads
  `pipeline/output/` from disk — it structurally cannot run on Vercel serverless as-is.
- **Later:** split brain — UI + cloud API routes on **Vercel** (free Hobby tier covers it),
  generation on a worker you own: either this machine running a queue poller against
  Upstash, or a **Railway** service (~$5/mo) once generation is fully cloud (Replicate + R2,
  no local disk). The queue/worker code in `lib/queue.ts` + `/api/worker` was clearly
  designed for exactly this split — don't fight the architecture, finish it.

---

## Quick Wins (each <2h, immediate impact)

1. **Fix `/api/local/generate` to spawn `generator.py`** (task 1.2, ~30 min). The UI's
   Generate button currently targets the untested Ollama path. Biggest bug-per-minute
   fix in the repo.

2. **Parallelize images with `asyncio.gather`** (task 1.3, ~2h). Generation drops from
   ~2min to <1min; makes batch and series rendering 3–4× cheaper in wall-clock.

3. **`metadata.json` + ffprobe duration** (task 1.5, ~2h). Kills the null-duration gap,
   gives the gallery real data, and becomes the substrate for posted-status, A/B tags,
   and analytics joins later.

4. **Background music via one amix filter** (~1.5h incl. downloading 10 Pixabay tracks).
   Single biggest perceived-quality jump per line of code — silence-under-VO is the #1
   "this is AI content" tell.

5. **Discord webhook alerts on pipeline failure** (~30 min). Five lines of `requests.post`
   in batch.py/daily.py's except blocks. The entire difference between "automated" and
   "silently broken for four days."

---

## Schedule at a glance

| Phase | Dates | Theme | Exit criterion |
|---|---|---|---|
| 1 | Jul 2–4 | Ship It | 5 videos live, 1-click upload, <60s generation |
| 2 | Jul 5–11 | Automate | Daily uploads with zero manual steps; series renders E2E |
| 3 | Jul 12–22 | Scale & Measure | Analytics dashboard live; A/B hooks; scheduled posts |
| 4 | Jul 23–Aug 1 | Product | Series Studio demo-ready; productization decision written |

**Dependency spine:** 1.1 → 1.2 → everything. 2.6 (script/render refactor) → 3.2, 4.2.
3.4 (Supabase sync) → 3.3 (dashboard). 3.5 (R2) → 2.4 Graph API path. Most P2s float —
they're the parallel-work pool for any blocked day.
