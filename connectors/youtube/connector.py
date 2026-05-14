"""
YouTube Data API v3 — Fivetran Connector SDK. Pulls channel-level stats
and recent video metadata for a curated set of public YouTube channels.
Endpoints: /channels, /playlistItems, /videos. Tables: channels, videos.
Lands as Iceberg in the Media-ODI-Demo S3 managed lake.
"""
from __future__ import annotations

import re
import time
from typing import Iterator

import requests
from fivetran_connector_sdk import Connector, Operations as op, Logging as log


YT_BASE = "https://www.googleapis.com/youtube/v3"
HTTP_TIMEOUT = 30
RATE_SLEEP = 0.2
MAX_VIDEOS_PER_CHANNEL = 50

# ~30 well-known channels: tech reviewers, news, brands, entertainment.
_DEFAULT_CHANNELS = (
    "UCBJycsmduvYEL83R_U4JriQ,UC-lHJZR3Gqxm24_Vd_AJ5Yw,UCpVm7bg6pXKo1Pr6k5kxG9A,"
    "UCK7tptUDHh-RYDsdxO1-5QQ,UCqnbDFdCpuN8CMEg0VuEBqA,UCupvZG-5ko_eiXAupbDfxWw,"
    "UCDPM_n1atn2ijUwHd0NNRQw,UCSljk1m0KzDqlx9hFggJ8mw,UCMv-aIJQ04gPN3-N3wDeyqQ,"
    "UC0v-tlzsn0QZwJnkiaUSJVQ,UCJ5v_MCY6GNUBTO8-D3XoAg,UCXuqSBlHAE6Xw-yeJA0Tunw,"
    "UCsTcErHg8oDvUnTzoqsYeNw,UC295-Dw_tDNtZXFeAPAW6Aw,UCX6OQ3DkcsbYNE6H8uQQuVA,"
    "UCq-Fj5jknLsUf-MWSy4_brA,UCYzPXprvl5Y-Sf0g4vX-m6g,UCsBjURrPoezykLs9EqgamOA,"
    "UCJowOS1R0FnhipXVqEnYU1A,UCcefcZRL2oaA_uBNeo5UOWg,UCVTyTA7-g9nopHeHbeuvpRA,"
    "UCi7GJNg51C3jgmYTUwqoUXA,UCMtFAi84ehTSYSE9XoHefig,UCNye-wNBqNL5ZzHSJj3l8Bg,"
    "UC16niRr50-MSBwiO3YDb3RA,UCdC0An4ZPNr_YiFiYoVbwaw,UCYO_jab_esuFRV4b17AJtAw,"
    "UCsXVk37bltHxD1rDPwtNM8Q,UCBa659QWEk1AI4Tg--mrJ2A,UC2DjFE7Xf11URZqWBigcVOQ"
)


def _get(url: str, params: dict) -> dict | None:
    for attempt in (1, 2):
        try:
            resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            log.warning(f"Request error {url}: {exc}")
            if attempt == 2:
                return None
            time.sleep(2)
            continue

        if resp.status_code == 429:
            ra = int(resp.headers.get("Retry-After", "10") or "10")
            log.warning(f"429 from YouTube, sleeping {ra}s")
            time.sleep(ra)
            continue
        if resp.status_code == 403:
            log.warning(f"403 from YouTube (quota?): {resp.text[:200]}")
            return None
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} from YouTube: {resp.text[:200]}")
            return None
        try:
            return resp.json()
        except ValueError:
            return None
    return None


_ISO_DUR = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def _iso_duration_to_sec(iso: str) -> int:
    if not iso:
        return 0
    m = _ISO_DUR.fullmatch(iso)
    if not m:
        return 0
    h, mi, s = (int(g) if g else 0 for g in m.groups())
    return h * 3600 + mi * 60 + s


def schema(configuration: dict) -> list[dict]:
    return [
        {"table": "channels", "primary_key": ["channel_id"]},
        {"table": "videos", "primary_key": ["video_id"]},
    ]


def fetch_channels(api_key: str, ids: list[str]) -> Iterator[dict]:
    # /channels accepts up to 50 ids per call
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        data = _get(f"{YT_BASE}/channels", {
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(batch),
            "key": api_key,
            "maxResults": 50,
        })
        if not data:
            continue
        for item in data.get("items", []) or []:
            sn = item.get("snippet", {}) or {}
            st = item.get("statistics", {}) or {}
            cd = item.get("contentDetails", {}) or {}
            uploads = ((cd.get("relatedPlaylists") or {}).get("uploads")) or ""
            yield {
                "channel_id": item.get("id", ""),
                "title": sn.get("title", ""),
                "custom_url": sn.get("customUrl", ""),
                "description": (sn.get("description") or "")[:4000],
                "country": sn.get("country", ""),
                "published_at": sn.get("publishedAt", ""),
                "subscribers": int(st.get("subscriberCount") or 0),
                "total_views": int(st.get("viewCount") or 0),
                "total_videos": int(st.get("videoCount") or 0),
                "uploads_playlist_id": uploads,
                "default_language": sn.get("defaultLanguage", ""),
            }
        time.sleep(RATE_SLEEP)


def fetch_recent_video_ids(api_key: str, uploads_playlist: str,
                            since_iso: str) -> list[str]:
    if not uploads_playlist:
        return []
    ids: list[str] = []
    page_token: str | None = None
    while len(ids) < MAX_VIDEOS_PER_CHANNEL:
        params = {
            "part": "snippet,contentDetails",
            "playlistId": uploads_playlist,
            "maxResults": 50,
            "key": api_key,
        }
        if page_token:
            params["pageToken"] = page_token
        data = _get(f"{YT_BASE}/playlistItems", params)
        if not data:
            return ids
        stop = False
        for it in data.get("items", []) or []:
            cd = it.get("contentDetails", {}) or {}
            published = cd.get("videoPublishedAt") or (it.get("snippet") or {}).get("publishedAt", "")
            if since_iso and published and published <= since_iso:
                stop = True
                continue
            vid = cd.get("videoId") or ""
            if vid:
                ids.append(vid)
            if len(ids) >= MAX_VIDEOS_PER_CHANNEL:
                break
        page_token = data.get("nextPageToken")
        if stop or not page_token:
            break
        time.sleep(RATE_SLEEP)
    return ids


def fetch_videos(api_key: str, video_ids: list[str]) -> Iterator[dict]:
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        data = _get(f"{YT_BASE}/videos", {
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(batch),
            "key": api_key,
            "maxResults": 50,
        })
        if not data:
            continue
        for item in data.get("items", []) or []:
            sn = item.get("snippet", {}) or {}
            st = item.get("statistics", {}) or {}
            cd = item.get("contentDetails", {}) or {}
            tags = sn.get("tags") or []
            thumbs = sn.get("thumbnails", {}) or {}
            high = (thumbs.get("high") or thumbs.get("default") or {}) or {}
            yield {
                "video_id": item.get("id", ""),
                "channel_id": sn.get("channelId", ""),
                "title": sn.get("title", ""),
                "description": (sn.get("description") or "")[:4000],
                "published_at": sn.get("publishedAt", ""),
                "duration_iso": cd.get("duration", ""),
                "duration_sec": _iso_duration_to_sec(cd.get("duration", "")),
                "views": int(st.get("viewCount") or 0),
                "likes": int(st.get("likeCount") or 0),
                "comments": int(st.get("commentCount") or 0),
                "category_id": sn.get("categoryId", ""),
                "tags": ",".join(tags)[:4000],
                "thumbnail_url": high.get("url", ""),
                "default_language": sn.get("defaultLanguage", "") or sn.get("defaultAudioLanguage", ""),
            }
        time.sleep(RATE_SLEEP)


def update(configuration: dict, state: dict):
    api_key = configuration.get("api_key")
    if not api_key:
        raise RuntimeError("configuration.api_key is required for YouTube Data API v3")

    raw = configuration.get("channel_ids_seed") or _DEFAULT_CHANNELS
    channel_ids = [c.strip() for c in raw.split(",") if c.strip()]
    log.info(f"YouTube sync — {len(channel_ids)} channels")

    state = state or {}
    last_pub: dict = state.get("last_video_published_at", {}) or {}

    total_channels = 0
    total_videos = 0

    channel_records = list(fetch_channels(api_key, channel_ids))
    log.info(f"Resolved {len(channel_records)} channel records from API")

    for ch in channel_records:
        cid = ch["channel_id"]
        yield op.upsert("channels", ch)
        total_channels += 1

        since = last_pub.get(cid, "")
        log.info(f"YouTube videos for {cid} ({ch.get('title','')}) since={since or 'BEGIN'}")
        vids = fetch_recent_video_ids(api_key, ch["uploads_playlist_id"], since)
        if not vids:
            log.info(f"No new videos for {cid}")
            yield op.checkpoint(state)
            continue

        max_pub = since
        count = 0
        for vrow in fetch_videos(api_key, vids):
            if vrow["published_at"] and vrow["published_at"] > (max_pub or ""):
                max_pub = vrow["published_at"]
            yield op.upsert("videos", vrow)
            count += 1
            total_videos += 1
            if total_videos % 500 == 0:
                last_pub[cid] = max_pub
                state["last_video_published_at"] = last_pub
                yield op.checkpoint(state)

        if max_pub:
            last_pub[cid] = max_pub
        state["last_video_published_at"] = last_pub
        yield op.checkpoint(state)
        log.info(f"{cid}: {count} new videos (through {max_pub})")

    log.info(f"YouTube complete — channels={total_channels} videos={total_videos}")


connector = Connector(update=update, schema=schema)

if __name__ == "__main__":
    connector.debug()
