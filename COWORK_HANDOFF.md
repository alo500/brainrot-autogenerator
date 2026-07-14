BRAINROT GENERATOR — Cowork Session Handoff Prompt
Copy everything below the line into a new Cowork session.
═══════════════════════════════════════════════════════

I have a project at C:\Users\Alo\dev\brainrot-autogenerator — please mount that directory first.

## WHAT THIS IS

Brainrot LLC is a real company with three layers: (1) a content studio producing viral short-form videos with complex satirical narratives, (2) AI marketing/consulting, and (3) products/tools. The Brainrot Generator is the first product — an AI-powered automated pipeline that generates viral short-form videos with layered narratives, not generic listicle slop.

## TECH STACK

**Python pipeline** (`pipeline/` directory):
- `generator.py` — Cloud pipeline: Claude API → Replicate FLUX Schnell (9:16 images) → edge-tts → ffmpeg assembly. WORKING. 2 completed test runs exist in `pipeline/output/`.
- `generator_local.py` — Local pipeline: Ollama → Stable Diffusion XL → edge-tts → ffmpeg. COMPLETE, untested (needs local GPU + Ollama).
- `batch.py` / `batch_local.py` — Batch processing wrappers. COMPLETE.
- `uploader.py` — YouTube Shorts upload via OAuth2. COMPLETE (needs `client_secrets.json`).
- `series_local.py` — Multi-episode series generation via Ollama. PARTIALLY COMPLETE (CLI only, no API route).

**Next.js frontend** (root directory):
- Next.js 14.2.5, React 18, Tailwind, TypeScript
- `app/page.tsx` — Main studio UI with channel presets (SCP Archives, AI Love Island, Deep Lore, History Unhinged, Custom), topic hints, live terminal log streaming via SSE, video gallery. WORKING in local mode.
- `components/` — PromptForm (cloud), ScriptBuilder, SeriesStudio, TemplateManager, QueueStats, AnalyticsDashboard, VideoGallery
- `lib/` — scriptgen.ts (Claude integration), queue.ts (Upstash Redis), supabase.ts, kling.ts, wan.ts, storage.ts (R2)

**API routes** (`app/api/`):
- LOCAL MODE (all working): `/api/local/generate` (POST, spawns generator_local.py with SSE), `/api/local/videos` (GET, scans output dir), `/api/local/serve` (GET, serves files with range support)
- CLOUD MODE (code complete, untested — needs credentials): `/api/generate`, `/api/videos`, `/api/queue`, `/api/worker`, `/api/script`, `/api/series`, `/api/templates`, `/api/jobs/[id]/retry`

**Cloud infrastructure** (code complete, not configured):
- Supabase (PostgreSQL) — schema in `supabase-schema.sql` with tables: video_jobs, video_templates, scripts, script_scenes, series, characters, episodes, episode_scenes
- Upstash Redis — job queue (LPUSH/RPOP)
- Cloudflare R2 — video storage (S3-compatible)
- Kling AI / Wan2.1 — video generation backends

**Local Wan2.1 server** (`local-server/`):
- FastAPI app with `/generate`, `/status`, `/health` endpoints
- Wan2.1 model wrapper + LoRA training scripts
- Untested (needs GPU + model downloads)

## ENV VARS

Cloud mode needs: `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `WAN_SERVER_URL`, `WORKER_SECRET`

Local mode needs: nothing (runs offline with GPU)

Python deps: `pipeline/requirements.txt` (cloud), `pipeline/requirements_local.txt` (local). ffmpeg must be installed system-wide.

## WHAT'S WORKING

1. Local video generation end-to-end (generator.py: Claude → FLUX Schnell → edge-tts → ffmpeg)
2. Next.js local mode UI (channel presets, topic input, live log streaming, video gallery)
3. YouTube upload pipeline (OAuth2 auth, privacy settings, metadata)
4. Batch generation (multi-topic with progress logging to batch_results.jsonl)
5. Script generation API (Claude integration, style selection)
6. Series bible + episode generation (scriptgen.ts)

## KNOWN GAPS (priority order)

1. **Series → Video pipeline is broken.** Can generate series bibles and episode scripts, but NO pipeline exists to turn episode scripts into actual videos. The `/api/series/[id]/episodes` route only handles script generation, not video assembly. `series_local.py` is CLI-only with no API route.

2. **Zero tests.** No test files anywhere. For a pipeline with retry logic, API integrations, and ffmpeg assembly, this is a real risk.

3. **Sequential image generation.** Each scene image is generated one at a time in generator.py. 5-scene script = 5 serial Replicate API calls. Should be parallelized.

4. **Local mode has no analytics.** AnalyticsDashboard only reads from Supabase (cloud). Local runs dump to filesystem with no metadata tracking, no duration extraction, no stats.

5. **No error recovery UI.** Retry endpoint exists at `/api/jobs/[id]/retry` but isn't exposed in the frontend.

6. **Video duration always null.** Schema has the field, nobody populates it.

7. **No thumbnails in local mode.**

8. **Python code is untyped.**

9. **No caching** — regenerating same prompt always re-hits Claude/Replicate.

## TONE & AESTHETIC

- Scripts: satirical, self-aware, internet-fluent. Narrative arc in 45-60 seconds. High cultural reference density. Cross-generational (19-year-old AND 45-year-old should feel it was made for them).
- UI: dark, minimal. Terminal that gained consciousness. Monospace fonts, dark backgrounds, subtle glow. Not gradient-heavy.
- Code: Python for pipeline/backend, async where it makes sense, clear logging, single files where reasonable, brief purposeful comments, no unnecessary abstractions.

## CODING PREFERENCES

- Ship working code first, refactor later
- Clear print statements / logging so pipeline progress is visible
- If you see `YOUR_KEY` placeholders, flag them
- The brand name "Brainrot" is intentional and final
- When in doubt: darker, more minimal, more sardonic
- This is a real company — treat it accordingly

## YOUR TASK

[REPLACE THIS LINE WITH WHAT YOU WANT CLAUDE TO DO — e.g., "Wire up the series-to-video pipeline so episode scripts can generate actual videos" or "Parallelize image generation in generator.py" or "Add a test suite for the core pipeline functions" or "Build analytics tracking for local mode"]
