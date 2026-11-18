#!/usr/bin/env python3
"""
Pull views / likes / comments / shares / completion and follower counts for every registered
story-channel post and push them to analytics-dashboard (/api/v1/channels/stats). The dashboard
re-scores everything and the next channel_gen.py run picks up the new mix.

Also links TikTok inbox drafts to the live post once you've published them in the app
(oldest draft ↔ earliest new TikTok video posted after it).

Run it a few times a day (see CHANNELS.md for the scheduled task):
    .venv/Scripts/python.exe pipeline/channel_stats.py
"""

from datetime import date, datetime, timezone

from channel_common import CONFIG, SECRETS_DIR, api, dashboard_up


def youtube_stats(account_id: str, rows: list[dict]) -> tuple[list[dict], int | None]:
    if not (SECRETS_DIR / f"youtube_{account_id}.json").exists():
        return [], None
    from googleapiclient.discovery import build
    from channel_post import youtube_creds

    creds = youtube_creds(account_id)
    yt = build("youtube", "v3", credentials=creds)
    ids = [r["externalId"] for r in rows if r["externalId"]]
    completion: dict[str, float] = {}
    if ids:
        try:
            ya = build("youtubeAnalytics", "v2", credentials=creds)
            rep = ya.reports().query(ids="channel==MINE", startDate="2020-01-01", endDate=date.today().isoformat(),
                                     metrics="averageViewPercentage", dimensions="video",
                                     filters="video==" + ",".join(ids[:200]), maxResults=200).execute()
            completion = {row[0]: row[1] / 100 for row in rep.get("rows", [])}
        except Exception as e:
            print(f"[youtube] analytics unavailable for {account_id}: {e}")
    out = []
    for i in range(0, len(ids), 50):
        for item in yt.videos().list(part="statistics", id=",".join(ids[i:i + 50])).execute().get("items", []):
            s = item["statistics"]
            out.append({"platform": "youtube", "externalId": item["id"], "views": int(s.get("viewCount", 0)),
                        "likes": int(s.get("likeCount", 0)), "comments": int(s.get("commentCount", 0)), "shares": 0,
                        "completion": completion.get(item["id"])})
    ch = yt.channels().list(part="statistics", mine=True).execute().get("items", [])
    subs = int(ch[0]["statistics"].get("subscriberCount", 0)) if ch else None
    return out, subs


def tiktok_stats(account_id: str, rows: list[dict]) -> tuple[list[dict], int | None]:
    if not (SECRETS_DIR / f"tiktok_{account_id}.json").exists():
        return [], None
    from tiktok_api import follower_count, list_videos

    live = list_videos(account_id)
    known = {r["externalId"] for r in rows if r["status"] == "posted"}
    unmatched = sorted((v for v in live if v["id"] not in known), key=lambda v: v["create_time"])
    for draft in sorted((r for r in rows if r["status"] == "draft"), key=lambda r: r["postedAt"]):
        drafted = datetime.fromisoformat(draft["postedAt"].replace("Z", "+00:00")).timestamp()
        match = next((v for v in unmatched if v["create_time"] >= drafted - 300), None)
        if not match:
            continue
        unmatched.remove(match)
        api("POST", "/videos", json={
            "id": draft["id"], "account": account_id, "platform": "tiktok", "title": draft["title"],
            "emotion": draft["emotion"], "externalId": match["id"], "url": match.get("share_url"), "status": "posted",
            "postedAt": datetime.fromtimestamp(match["create_time"], timezone.utc).isoformat(),
        })
        known.add(match["id"])
        print(f"[tiktok] draft #{draft['id']} is live as {match['id']}")
    if unmatched:
        print(f"[tiktok] {len(unmatched)} {account_id} videos weren't made by the pipeline — log them on /channels to track them")
    stats = [{"platform": "tiktok", "externalId": v["id"], "views": v.get("view_count", 0), "likes": v.get("like_count", 0),
              "comments": v.get("comment_count", 0), "shares": v.get("share_count", 0), "completion": None}
             for v in live if v["id"] in known]
    return stats, follower_count(account_id)


def main():
    if not dashboard_up():
        raise SystemExit("dashboard unreachable — start analytics-dashboard (npm run dev) first")
    videos = api("GET", "?days=90")["videos"]
    for account_id in CONFIG["accounts"]:
        mine = [v for v in videos if v["account"] == account_id]
        stats, followers = [], []
        for platform, fn in (("youtube", youtube_stats), ("tiktok", tiktok_stats)):
            try:
                s, f = fn(account_id, [v for v in mine if v["platform"] == platform])
            except Exception as e:
                print(f"[{account_id}/{platform}] {e}")
                continue
            stats += s
            if f is not None:
                followers.append({"account": account_id, "platform": platform, "followers": f})
        if stats or followers:
            r = api("POST", "/stats", json={"stats": stats, "followers": followers})
            print(f"[{account_id}] {r['stats']} stat snapshots, {r['followers']} follower counts")
        else:
            print(f"[{account_id}] nothing connected yet")


if __name__ == "__main__":
    main()
