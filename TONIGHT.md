# TONIGHT.md — Account Setup Checklist

**Goal:** By the end of tonight, generate a video with `pipeline/generator.py` AND post it to YouTube Shorts.

**Date:** July 2, 2026
**Total time if you do everything:** ~2.5–3 hours
**Total time for Minimum Viable Tonight:** ~60–75 minutes

**Heads up before you start:** `pipeline/.env` does not exist yet — only `pipeline/.env.example`.
Even though two test runs completed in the past, the key may have been set as a shell env var.
Step 0 fixes this permanently.

---

## ⚡ Minimum Viable Tonight

If you only do four things, do these, in this order:

| # | Task | Time |
|---|------|------|
| 0 | Create `pipeline/.env` from `.env.example` | 5 min |
| 1 | Anthropic API key (verify or create) | 10 min |
| 2 | Replicate API token (verify or create) | 10 min |
| 3 | Google Cloud OAuth + YouTube channel + first upload | 40–50 min |

Everything else (TikTok, Instagram, Supabase, Upstash, R2) can wait. The cloud
pipeline (`generator.py`) needs exactly two env vars. The uploader needs one JSON file.
That's the whole critical path.

---

## Step 0 — Create the .env file (5 min) — DO THIS FIRST

**Dependency for:** everything.

```bash
cd pipeline
cp .env.example .env
```

The file needs exactly this (fill in real values in steps 1–2):

```env
ANTHROPIC_API_KEY=sk-ant-...
REPLICATE_API_TOKEN=r8_...
# TTS_VOICE=en-US-AndrewMultilingualNeural   # optional
```

Also create `.env.local` at the **repo root** for the Next.js side (`lib/scriptgen.ts`
reads `process.env.ANTHROPIC_API_KEY`):

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

Confirm both files are gitignored before you paste any keys.

---

## Step 1 — Anthropic API (10 min)

- **What:** API key for Claude (script generation, `claude-sonnet-4-6`)
- **URL:** https://console.anthropic.com/ → Settings → API Keys → Create Key
- **You may already have this.** Two completed runs exist in `pipeline/output/`, so a key
  worked at some point. Verify:
  ```bash
  cd pipeline && python -c "import os; from dotenv import load_dotenv; load_dotenv('.env'); import anthropic; anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY']).messages.create(model='claude-sonnet-4-6', max_tokens=10, messages=[{'role':'user','content':'hi'}]); print('KEY OK')"
  ```
- **Where it goes:** `ANTHROPIC_API_KEY` in `pipeline/.env` AND root `.env.local`
- **Cost:** Pay-as-you-go, minimum $5 credit purchase. Each script is ~2.5K output tokens
  → roughly **$0.04–0.05 per video**. $5 covers ~100+ videos.
- **Time:** 10 min (2 min if the key already works)

---

## Step 2 — Replicate (10 min)

- **What:** API token for FLUX Schnell image generation
- **URL:** https://replicate.com/account/api-tokens (sign in with GitHub)
- **Verify existing token:**
  ```bash
  curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" https://api.replicate.com/v1/account
  ```
- **Where it goes:** `REPLICATE_API_TOKEN` in `pipeline/.env`
- **Cost:** FLUX Schnell is **$3 per 1,000 images** ($0.003/image). 5 scenes/video →
  **~$0.015 per video**. Requires a card on file; new accounts sometimes get trial credit.
- **Time:** 10 min
- **Total per-video cost so far: ~$0.06.** TTS (edge-tts) and ffmpeg are free.

### ✅ Checkpoint 1 (~25 min in): generate a test video

```bash
cd pipeline
python generator.py "why every group chat has exactly one person who only sends thumbs up"
```

If an .mp4 lands in `pipeline/output/`, the generation half of tonight is done.
Let it run in the background while you do Step 3.

---

## Step 3 — Google Cloud Console: OAuth for uploader.py (25–35 min)

- **What:** OAuth 2.0 Desktop credentials so `uploader.py` can upload to YouTube
- **Dependency:** none, but do Step 4 (channel) before the first actual upload
- **URL:** https://console.cloud.google.com/

Exact clicks:

1. Create a project: https://console.cloud.google.com/projectcreate — name it `brainrot-uploader`
2. Enable the API: https://console.cloud.google.com/apis/library/youtube.googleapis.com → **Enable**
3. OAuth consent screen: https://console.cloud.google.com/apis/credentials/consent
   - User type: **External** → Create
   - App name: `brainrot-uploader`, support email: alonzom1515@gmail.com
   - Scopes: you can skip adding scopes here; `uploader.py` requests
     `https://www.googleapis.com/auth/youtube.upload` at runtime
   - **Test users: add alonzom1515@gmail.com.** Without this, OAuth will refuse you.
   - Leave the app in **Testing** mode. Do NOT publish tonight.
4. Credentials: https://console.cloud.google.com/apis/credentials → Create Credentials →
   **OAuth client ID** → Application type: **Desktop app** → Create → **Download JSON**
5. Rename the downloaded file to `client_secrets.json` and put it in `pipeline/`
   (that's where `uploader.py` looks: `CLIENT_SECRETS = Path(__file__).parent / "client_secrets.json"`)
6. Add `client_secrets.json` and `token.json` to `.gitignore` if not already there.

- **Cost:** Free. YouTube Data API quota is 10,000 units/day; each upload
  (`videos.insert`) costs 1,600 units → **max ~6 uploads/day** on default quota.
  Fine for now; request a quota increase when you scale.
- **Time:** 25–35 min

**Two gotchas to know tonight, not discover next week:**
- Apps in **Testing** mode get refresh tokens that **expire after 7 days**. You'll re-run
  the OAuth browser flow weekly until you publish/verify the app. Annoying, acceptable for now.
- Uploads from **unverified API projects** may be locked **private** until Google audits the
  project. If your first upload shows "private (locked)", that's why — not a bug in uploader.py.
  Start with `--privacy unlisted` to test, and apply for the API audit this week.

---

## Step 4 — YouTube Channel (15 min)

- **What:** The actual channel the videos post to
- **URL:** https://www.youtube.com/ → profile icon → "Create a channel" — or better,
  https://www.youtube.com/account → **"Add or manage your channel(s)"** → Create a channel
  (this makes a **Brand Account** channel, separate from your personal identity — do this)
- **Setup tonight:** channel name (pick your lead concept — e.g. "History Unhinged"),
  handle, 1-line description. Skip art/branding, it doesn't matter yet.
- **Verify the channel** at https://www.youtube.com/verify (phone number) — unverified
  channels can't upload videos >15 min (irrelevant for Shorts) but verification also
  lifts other limits; takes 2 minutes, just do it.
- **Important:** when the OAuth browser window opens on your first `uploader.py` run,
  Google will ask **which channel/brand account** to grant. Pick the new channel, not
  your personal one. The cached `token.json` is bound to that choice.
- **Cost:** Free
- **Time:** 15 min

### ✅ Checkpoint 2 (~75 min in): first upload

```bash
cd pipeline
RUN=$(ls -td output/*/ | head -1)
python uploader.py "$RUN"/*.mp4 "$RUN"/script.json --privacy unlisted
```

Browser opens → sign in → pick the brand channel → allow. `token.json` gets cached.
If you get a Shorts URL back, **tonight's core mission is complete.** Flip to
`--privacy public` when you've watched it and it's good.

---

## Step 5 — TikTok (10 min)

- **What:** Personal/creator account for manual posting
- **URL:** https://www.tiktok.com/signup (or the app — the app is less flaky for signup)
- **Do:** username matching your YouTube channel, switch to Creator account
  (Profile → Menu → Settings → Account → Switch to Business/Creator — pick **Creator**)
- **Get:** nothing — no API tonight. Manual posting from the app. If you later use the
  unofficial `tiktok-uploader` library, it needs your **session cookie**, not credentials —
  that's a Phase 2 decision (see PLAN.md).
- **Know:** brand-new TikTok accounts get throttled reach for the first few posts. Post
  1–2 manually tonight/tomorrow just to age the account.
- **Cost:** Free · **Time:** 10 min · **Dependencies:** none

---

## Step 6 — Instagram (10 min)

- **What:** Account for manual Reels posting
- **URL:** https://www.instagram.com/accounts/emailsignup/ (or the app)
- **Do:** same handle as TikTok/YouTube if available. Then switch to a **Creator account**:
  Profile → Settings → Account type and tools → Switch to professional account → Creator.
  This matters later — the Meta Graph API content-publishing endpoints (Phase 2/3 option)
  only work with Creator/Business accounts linked to a Facebook Page.
- **Get:** nothing tonight. Manual posting.
- **Cost:** Free · **Time:** 10 min · **Dependencies:** none

---

## Step 7 — Supabase (15 min) — OPTIONAL TONIGHT

- **What:** Postgres for cloud mode (`lib/supabase.ts`, schema in `supabase-schema.sql`)
- **URL:** https://supabase.com/dashboard → New project
- **Do:**
  1. Create project (region close to you, save the DB password somewhere)
  2. SQL Editor → paste the contents of `supabase-schema.sql` from repo root → Run
  3. Project Settings → API → copy **Project URL** and **service_role key**
- **Where:** root `.env.local`:
  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  ```
- **Cost:** Free tier — 500MB database, 2 projects. Plenty for months.
- **Time:** 15 min · **Dependencies:** none. Nothing tonight breaks without it —
  local mode writes to the filesystem.

---

## Step 8 — Upstash Redis (10 min) — OPTIONAL TONIGHT

- **What:** Job queue for cloud mode (`lib/queue.ts`, LPUSH/RPOP)
- **URL:** https://console.upstash.com/ → Create Database (Redis, regional, region near
  your Supabase project)
- **Get:** from the database page, the **REST API** section →
  ```env
  UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
  UPSTASH_REDIS_REST_TOKEN=AX...
  ```
  → root `.env.local`
- **Cost:** Free tier — 500K commands/month. A job queue at your scale uses a rounding
  error of that.
- **Time:** 10 min · **Dependencies:** only useful once Supabase (Step 7) exists,
  since `/api/worker` writes job status to both.

---

## Step 9 — Cloudflare R2 (15 min) — OPTIONAL TONIGHT

- **What:** S3-compatible video storage (`lib/storage.ts`)
- **URL:** https://dash.cloudflare.com/ → sign up → R2 Object Storage
  (requires adding a card even for free tier — Cloudflare policy)
- **Do:**
  1. R2 → Create bucket → name: `brainrot-videos`
  2. R2 → Manage R2 API Tokens → Create API Token → Object Read & Write, scoped to the bucket
  3. Bucket → Settings → Public access → enable r2.dev subdomain (fine for now;
     custom domain later)
- **Where:** root `.env.local`:
  ```env
  R2_ACCOUNT_ID=...          # from the R2 overview page
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET_NAME=brainrot-videos
  R2_PUBLIC_URL=https://pub-xxxx.r2.dev
  ```
- **Cost:** Free tier — 10GB storage, 1M writes/mo, 10M reads/mo, **zero egress fees**
  (this is why R2 over S3 for video). ~30MB/video → ~330 videos free.
- **Time:** 15 min · **Dependencies:** none

---

## NOT tonight (explicitly deferred)

- **Kling AI / Wan2.1 keys** — alternative video backends. FLUX Schnell works. Skip.
- **`WORKER_SECRET`** — just generate one when you wire up cloud mode: `openssl rand -hex 32`
- **Google app verification / quota increase** — start the process this week, not tonight.
- **Buffer/Later** — scheduling tools, Phase 2 decision.

---

## End-of-night definition of done

- [ ] `pipeline/.env` exists with working `ANTHROPIC_API_KEY` + `REPLICATE_API_TOKEN`
- [ ] Root `.env.local` exists with at least `ANTHROPIC_API_KEY`
- [ ] `python generator.py "test topic"` produces an .mp4
- [ ] `client_secrets.json` sits in `pipeline/`, `token.json` cached after OAuth
- [ ] One video live (unlisted or public) on the new YouTube channel
- [ ] TikTok + Instagram Creator accounts exist (even if empty)
- [ ] All secrets confirmed gitignored
