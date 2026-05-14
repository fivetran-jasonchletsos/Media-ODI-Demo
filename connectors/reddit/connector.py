"""
Reddit — Fivetran Connector SDK. Pulls subreddit metadata and recent posts
via the Reddit OAuth API. Auth: OAuth2 client_credentials against
https://www.reddit.com/api/v1/access_token. Endpoints: /r/<sr>/about,
/r/<sr>/new (incremental), /r/<sr>/top?t=week (backfill).
Tables: subreddits, posts. Lands as Iceberg in Media-ODI-Demo S3 lake.
"""
from __future__ import annotations

import time
from typing import Iterator

import requests
from fivetran_connector_sdk import Connector, Operations as op, Logging as log


REDDIT_OAUTH_BASE = "https://oauth.reddit.com"
REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
HTTP_TIMEOUT = 30
RATE_SLEEP = 1.1  # 60 req/min on OAuth — keep some headroom
MAX_POSTS_PER_SR = 200

_DEFAULT_SUBREDDITS = (
    "marketing,advertising,branding,television,boxoffice,movies,Music,"
    "books,boardgames,gaming,cars,sneakers,malefashionadvice"
)


# Auth — OAuth2 client_credentials with simple cache.
_TOKEN_CACHE: dict = {"token": None, "expires_at": 0.0}


def _get_token(client_id: str, client_secret: str, user_agent: str) -> str | None:
    now = time.time()
    if _TOKEN_CACHE["token"] and now < _TOKEN_CACHE["expires_at"] - 60:
        return _TOKEN_CACHE["token"]

    try:
        resp = requests.post(
            REDDIT_TOKEN_URL,
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            headers={"User-Agent": user_agent},
            timeout=HTTP_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        log.warning(f"Reddit token request failed: {exc}")
        return None

    if resp.status_code >= 400:
        log.warning(f"Reddit token HTTP {resp.status_code}: {resp.text[:200]}")
        return None

    try:
        data = resp.json()
    except ValueError:
        log.warning("Reddit token response was not JSON")
        return None

    token = data.get("access_token")
    ttl = int(data.get("expires_in") or 3600)
    if not token:
        log.warning("Reddit token missing in response")
        return None
    _TOKEN_CACHE["token"] = token
    _TOKEN_CACHE["expires_at"] = now + ttl
    log.info(f"Acquired Reddit OAuth token (ttl={ttl}s)")
    return token


def _get(path: str, params: dict, headers: dict) -> dict | None:
    url = f"{REDDIT_OAUTH_BASE}{path}"
    for attempt in (1, 2):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            log.warning(f"Request error {url}: {exc}")
            if attempt == 2:
                return None
            time.sleep(2)
            continue

        if resp.status_code == 429:
            ra = int(resp.headers.get("Retry-After", "10") or "10")
            log.warning(f"429 from Reddit, sleeping {ra}s")
            time.sleep(ra)
            continue
        if resp.status_code == 404:
            log.warning(f"404 from Reddit: {url}")
            return None
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} from Reddit: {resp.text[:200]}")
            return None
        try:
            return resp.json()
        except ValueError:
            return None
    return None


def schema(configuration: dict) -> list[dict]:
    return [
        {"table": "subreddits", "primary_key": ["subreddit"]},
        {"table": "posts", "primary_key": ["post_id"]},
    ]


def fetch_subreddit_about(name: str, headers: dict) -> dict | None:
    data = _get(f"/r/{name}/about", {}, headers)
    if not data:
        return None
    d = (data.get("data") or {}) if isinstance(data, dict) else {}
    if not d:
        return None
    return {
        "subreddit": name,
        "display_name": d.get("display_name", name),
        "description": (d.get("description") or "")[:4000],
        "subscribers": int(d.get("subscribers") or 0),
        "public_description": (d.get("public_description") or "")[:2000],
        "created_utc": float(d.get("created_utc") or 0),
        "lang": d.get("lang", ""),
    }


def _post_row(child: dict, subreddit: str) -> dict:
    d = child.get("data", {}) or {}
    return {
        "post_id": d.get("name") or f"t3_{d.get('id','')}",
        "subreddit": subreddit,
        "author": d.get("author", ""),
        "title": (d.get("title") or "")[:2000],
        "selftext": (d.get("selftext") or "")[:8000],
        "score": int(d.get("score") or 0),
        "num_comments": int(d.get("num_comments") or 0),
        "upvote_ratio": float(d.get("upvote_ratio") or 0.0),
        "created_utc": float(d.get("created_utc") or 0),
        "url": d.get("url", ""),
        "permalink": d.get("permalink", ""),
        "is_self": bool(d.get("is_self", False)),
        "is_video": bool(d.get("is_video", False)),
        "link_flair_text": d.get("link_flair_text", "") or "",
        "over_18": bool(d.get("over_18", False)),
    }


def fetch_posts(subreddit: str, headers: dict,
                cursor: str | None) -> Iterator[dict]:
    """Pull /new posts; if no cursor (first sync), fall back to /top?t=week."""
    emitted = 0
    if cursor:
        before = cursor
        after = None
        while emitted < MAX_POSTS_PER_SR:
            params: dict = {"limit": 100}
            if before:
                params["before"] = before
            if after:
                params["after"] = after
            data = _get(f"/r/{subreddit}/new", params, headers)
            if not data:
                return
            children = ((data.get("data") or {}).get("children")) or []
            if not children:
                return
            for ch in children:
                yield _post_row(ch, subreddit)
                emitted += 1
                if emitted >= MAX_POSTS_PER_SR:
                    return
            # /new with `before` returns newest items; no pagination forward
            return
    else:
        data = _get(f"/r/{subreddit}/top",
                    {"t": "week", "limit": 50}, headers)
        if not data:
            return
        children = ((data.get("data") or {}).get("children")) or []
        for ch in children:
            yield _post_row(ch, subreddit)
            emitted += 1
            if emitted >= MAX_POSTS_PER_SR:
                return


def update(configuration: dict, state: dict):
    cid = configuration.get("client_id")
    csec = configuration.get("client_secret")
    ua = configuration.get("user_agent")
    if not (cid and csec and ua):
        raise RuntimeError(
            "configuration.client_id, client_secret, and user_agent are all required"
        )

    raw = configuration.get("subreddits_seed") or _DEFAULT_SUBREDDITS
    subreddits = [s.strip() for s in raw.split(",") if s.strip()]
    log.info(f"Reddit sync — {len(subreddits)} subreddits")

    token = _get_token(cid, csec, ua)
    if not token:
        raise RuntimeError("Failed to obtain Reddit OAuth token")
    headers = {"Authorization": f"Bearer {token}", "User-Agent": ua}

    state = state or {}
    last_post: dict = state.get("last_post_id", {}) or {}

    total_posts = 0
    for sr in subreddits:
        meta = fetch_subreddit_about(sr, headers)
        if meta:
            yield op.upsert("subreddits", meta)
        time.sleep(RATE_SLEEP)

        cursor = last_post.get(sr)
        log.info(f"Reddit /r/{sr} posts cursor={cursor or 'BEGIN'}")
        newest_seen = cursor
        count = 0
        for row in fetch_posts(sr, headers, cursor):
            # Track the newest fullname so we can cursor forward next time.
            if not newest_seen or row["created_utc"] > 0:
                newest_seen = row["post_id"] if not newest_seen else newest_seen
            # First row from /new is newest — capture it as the next cursor.
            if count == 0:
                newest_seen = row["post_id"]
            yield op.upsert("posts", row)
            count += 1
            total_posts += 1
            if total_posts % 500 == 0:
                if newest_seen:
                    last_post[sr] = newest_seen
                state["last_post_id"] = last_post
                yield op.checkpoint(state)

        if newest_seen:
            last_post[sr] = newest_seen
        state["last_post_id"] = last_post
        yield op.checkpoint(state)
        log.info(f"/r/{sr}: {count} posts emitted (next cursor={newest_seen})")
        time.sleep(RATE_SLEEP)

    log.info(f"Reddit complete — total posts={total_posts}")


connector = Connector(update=update, schema=schema)

if __name__ == "__main__":
    connector.debug()
