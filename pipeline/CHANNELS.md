# Story channels: setup and daily loop

Two faceless story channels, **The Verdict** (fictional "who's wrong?" dilemmas) and **Petty Revenge** (narrated revenge and karma stories). Everything runs locally for $0. Videos are generated, posted, measured, and the next batch adapts to what worked.

```
channel_gen.py ──(asks for the mix)──▶ dashboard /api/v1/channels/plan
      │ renders mp4 + meta.json (output/channels/<account>/<run>/)
channel_post.py ──▶ YouTube Shorts (public, synthetic flag; needs an audited API project) + TikTok inbox draft
      │ registers each post ──▶ dashboard /api/v1/channels/videos
channel_stats.py ──▶ pulls views/likes/comments/shares/completion/followers ──▶ /stats
      └──▶ dashboard re-scores everything ──▶ the next mix shifts toward winners
```

**Ground rules (these keep the accounts and the money alive):** fiction only, a "Fictional story · AI-generated" label burned into every video and written in every caption, the platform's AI-content toggle switched on, no faces, no posing as a real person, and official APIs only. Breaking these is the fastest way to get demonetized or banned.

> **YouTube: verified project required (checked 2026-11-18).** A new Google Cloud project is
> unverified, and `videos.insert` from an unverified project forces every upload to **private,
> silently**. Locked videos can't be appealed and must be re-uploaded. `channel_post.py` therefore
> refuses YouTube uploads unless `YOUTUBE_API_VERIFIED=1`. Until the project passes the YouTube
> API audit, upload by hand in YouTube Studio and turn on "Altered or synthetic content".

## Today (about 1 hour, mostly signups)

### 1. Create the accounts (by hand, on your phone)
For each channel, create a **TikTok**, a **YouTube channel** (a Brand Account under one Google login is fine), and optionally an **Instagram** account. Use the channel name, a moody non-face avatar (an SDXL image from a run works), and a bio like "Fictional stories. You decide who's wrong."
- Switch TikTok to a **Business** or **Creator** account (needed for the API and for analytics).
- Warm each account up for a day or two: scroll the niche, follow a few similar channels, and post your first videos by hand before automation takes over.

### 2. Start the dashboard
```
cd analytics-dashboard
npm run sports:up
npm run dev
```
Open http://localhost:3100/channels.

### 3. Connect YouTube (once per channel)
1. Google Cloud Console → new project → enable **YouTube Data API v3** and **YouTube Analytics API**.
2. OAuth consent screen: External, add yourself as a test user. Credentials → OAuth client ID → **Desktop app** → download the JSON as `pipeline/client_secrets.json`.
3. For each account, sign in with the Google account that owns that channel and pick the right channel when asked:
```
.venv\Scripts\python.exe pipeline\channel_post.py --auth-youtube the-verdict
.venv\Scripts\python.exe pipeline\channel_post.py --auth-youtube petty-revenge
```
The default quota allows about 6 uploads a day across all channels, which is plenty.

### 4. Connect TikTok (once per account)
1. Go to https://developers.tiktok.com, create an app, and add **Login Kit** (Desktop) and the **Content Posting API**. Request the scopes `user.info.basic`, `user.info.stats`, `video.upload` and `video.list`, and set the redirect URI to `http://localhost:8765/callback/`.
2. Put the keys in `pipeline/.env`:
```
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
```
3. Connect each account, logging in to that TikTok account in the browser that opens:
```
.venv\Scripts\python.exe pipeline\tiktok_api.py auth the-verdict
.venv\Scripts\python.exe pipeline\tiktok_api.py auth petty-revenge
```
In sandbox mode, add each TikTok account as a target user in the developer portal.

**TikTok posting flow:** videos arrive in the TikTok app's inbox as drafts. Open the draft, paste the caption from `caption.txt` in the run folder, turn on **AI-generated content**, and post. That takes about 20 seconds. `channel_stats.py` then links the live post back to the dashboard on its own. Fully automatic public posting needs TikTok to audit the app, so apply once the channels have a track record.

### 5. First batch
```
.venv\Scripts\python.exe pipeline\channel_gen.py all --count 2
.venv\Scripts\python.exe pipeline\channel_post.py
```
Each video takes about 6 minutes on the 5070 Ti. Use `--script-only` to preview scripts without rendering. Instagram and Facebook are manual: upload the same mp4 and log the post on /channels under "log a post by hand".

### 6. Automate it
Run these from PowerShell once. The daily task generates, posts and pulls stats at 6pm (a strong posting window); the second task pulls stats every 4 hours.
```
schtasks /Create /TN "StoryChannels-Daily" /SC DAILY /ST 18:00 /TR "powershell -ExecutionPolicy Bypass -File C:\Users\Alo\dev\brainrot-autogenerator\pipeline\run_channels.ps1"
schtasks /Create /TN "StoryChannels-Stats" /SC HOURLY /MO 4 /TR "C:\Users\Alo\dev\brainrot-autogenerator\.venv\Scripts\python.exe C:\Users\Alo\dev\brainrot-autogenerator\pipeline\channel_stats.py"
```
The dashboard must be running for the plan and stats steps. The log is at `pipeline/output/channels/run.log`.

## How it adapts
- A video counts once it is 48 hours old. It is scored against its own account and platform median on views, engagement (comments ×3, shares ×5) and attributed money.
- Each emotion, format and hook needs 3 settled videos before it can win. The next batch is then 80% weighted toward winners and 20% spread evenly as experiments, and the generator prompt gets plain-language tips ("cold-open beats statement by 140%").
- Account status on /channels:
  - **warming:** keep posting.
  - **testing:** learning.
  - **scale:** median is at least 10k views. Add Facebook Reels, a weekly YouTube compilation, or a Spanish dub.
  - **pause:** 15+ videos with a median under 500. Rewrite the formats in `channels.json`.

## Money
Log every payout on /channels (Creator Rewards, YouTube ad share, affiliate, product, memberships). Attach a video number when you know which video earned it. The planner then weighs **revenue per 1k views**, not just views. Roadmap from the plan: YouTube long-form compilations, link-in-bio with UTM links, a paid "full story" serial, then the red-flag analyzer product.

## Adding an account
Add it to `channels.json` (voice, emotions, formats, ending, hashtags) **and** to `analytics-dashboard/lib/channels/registry.ts`. Then connect its YouTube and TikTok accounts as above.
