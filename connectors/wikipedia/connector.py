"""
Wikipedia — Fivetran Connector SDK
==================================
Pulls daily pageview counts and article summaries for a curated list of
brand/topic Wikipedia articles.

Endpoints:
  - https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/
        en.wikipedia/all-access/all-agents/<topic>/daily/<start>/<end>
  - https://en.wikipedia.org/api/rest_v1/page/summary/<topic>

Tables: topics, pageviews.

ODI angle: lands as Iceberg tables in the Media-ODI-Demo managed S3 lake;
joins against Reddit chatter and YouTube views to measure cross-platform
attention coherence.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
from typing import Iterator
from urllib.parse import quote

import requests
from fivetran_connector_sdk import Connector, Operations as op, Logging as log


PV_BASE = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/"
           "per-article/en.wikipedia/all-access/all-agents")
SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary"
HTTP_TIMEOUT = 30
RATE_SLEEP = 1.0  # be polite — 1 req/sec
DEFAULT_LOOKBACK_DAYS = 60

_DEFAULT_TOPICS = ",".join([
    "Nike", "Apple_Inc.", "Tesla,_Inc.", "Netflix", "Spotify",
    "Coca-Cola", "McDonald's", "Amazon_(company)", "Disney", "Starbucks",
    "Adidas", "Pepsi", "Sony", "Microsoft", "Google",
    "Meta_Platforms", "Samsung", "Intel", "IBM", "Walmart",
    "Target_Corporation", "Costco", "FedEx", "United_Parcel_Service",
    "Boeing", "Airbus", "Toyota", "Ford_Motor_Company",
    "General_Motors", "BMW", "Mercedes-Benz", "Volkswagen",
    "Uber", "Lyft", "Airbnb", "Booking.com", "Expedia",
    "PayPal", "Visa_Inc.", "Mastercard",
])


def _get(url: str, headers: dict) -> dict | None:
    for attempt in (1, 2):
        try:
            resp = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            log.warning(f"Request error {url}: {exc}")
            if attempt == 2:
                return None
            time.sleep(2)
            continue

        if resp.status_code == 429:
            ra = int(resp.headers.get("Retry-After", "10") or "10")
            log.warning(f"429 from Wikipedia, sleeping {ra}s")
            time.sleep(ra)
            continue
        if resp.status_code == 404:
            log.warning(f"404 from Wikipedia: {url}")
            return None
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} from Wikipedia: {resp.text[:200]}")
            return None
        try:
            return resp.json()
        except ValueError:
            return None
    return None


def schema(configuration: dict) -> list[dict]:
    return [
        {"table": "topics", "primary_key": ["topic"]},
        {"table": "pageviews", "primary_key": ["topic", "date"]},
    ]


def fetch_summary(topic: str, headers: dict) -> dict | None:
    url = f"{SUMMARY_BASE}/{quote(topic, safe='')}"
    data = _get(url, headers)
    if not data:
        return None
    content_urls = data.get("content_urls", {}) or {}
    desktop = content_urls.get("desktop", {}) or {}
    return {
        "topic": topic,
        "title": data.get("title", ""),
        "description": (data.get("description") or "")[:2000],
        "extract": (data.get("extract") or "")[:8000],
        "summary_url": desktop.get("page", ""),
        "pageid": int(data.get("pageid") or 0),
        "lang": data.get("lang", "en"),
    }


def fetch_pageviews(topic: str, start: str, end: str,
                    headers: dict) -> Iterator[dict]:
    url = f"{PV_BASE}/{quote(topic, safe='')}/daily/{start}/{end}"
    data = _get(url, headers)
    if not data:
        return
    for item in data.get("items", []) or []:
        ts = item.get("timestamp", "")  # YYYYMMDDHH
        if len(ts) < 8:
            continue
        date = f"{ts[0:4]}-{ts[4:6]}-{ts[6:8]}"
        yield {
            "topic": topic,
            "date": date,
            "views": int(item.get("views") or 0),
            "access": item.get("access", ""),
            "agent": item.get("agent", ""),
        }


def update(configuration: dict, state: dict):
    ua = configuration.get("user_agent")
    if not ua:
        raise RuntimeError(
            "configuration.user_agent is required (Wikimedia REST API policy)"
        )
    headers = {"User-Agent": ua, "Accept": "application/json"}

    raw = configuration.get("topics_seed") or _DEFAULT_TOPICS
    topics = [t.strip() for t in raw.split(",") if t.strip()]
    log.info(f"Wikipedia sync — {len(topics)} topics")

    state = state or {}
    last_pv: dict = state.get("last_pageview_date", {}) or {}

    today = datetime.now(timezone.utc)
    end_str = (today - timedelta(days=1)).strftime("%Y%m%d")
    default_start = (today - timedelta(days=DEFAULT_LOOKBACK_DAYS)).strftime("%Y%m%d")

    total_pv = 0
    for topic in topics:
        meta = fetch_summary(topic, headers)
        if meta:
            yield op.upsert("topics", meta)
        time.sleep(RATE_SLEEP)

        prev = last_pv.get(topic)
        if prev:
            try:
                start_dt = datetime.strptime(prev, "%Y-%m-%d") + timedelta(days=1)
                start_str = start_dt.strftime("%Y%m%d")
            except ValueError:
                start_str = default_start
        else:
            start_str = default_start

        if start_str > end_str:
            log.info(f"{topic}: up to date (last={prev})")
            continue

        log.info(f"Wikipedia pageviews {topic} {start_str}..{end_str}")
        max_date = prev or ""
        count = 0
        for row in fetch_pageviews(topic, start_str, end_str, headers):
            if row["date"] > max_date:
                max_date = row["date"]
            yield op.upsert("pageviews", row)
            count += 1
            total_pv += 1
            if total_pv % 500 == 0:
                last_pv[topic] = max_date
                state["last_pageview_date"] = last_pv
                yield op.checkpoint(state)

        if max_date:
            last_pv[topic] = max_date
        state["last_pageview_date"] = last_pv
        yield op.checkpoint(state)
        log.info(f"{topic}: {count} pageview rows (through {max_date})")
        time.sleep(RATE_SLEEP)

    log.info(f"Wikipedia complete — total pageview rows={total_pv}")


connector = Connector(update=update, schema=schema)

if __name__ == "__main__":
    connector.debug()
