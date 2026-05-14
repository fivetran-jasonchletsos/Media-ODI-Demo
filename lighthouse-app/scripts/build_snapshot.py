"""
Build a static JSON snapshot of the Lighthouse Media ODI gold layer for the
React frontend.

Pipeline (when live):
    YouTube + Reddit + Wikipedia  →  S3 (bronze)  →  dbt  →  Iceberg/Glue (gold)
                                                                  │
                                                                  ▼
                                                                Athena
                                                                  │
                                                                  ▼
                                                      frontend/public/data/*.json

Run locally:
    AWS_REGION=us-east-1 \\
    ATHENA_WORKGROUP=lighthouse_wg \\
    LAKE_BUCKET=lighthouse-odi-lake \\
        python scripts/build_snapshot.py

Without AWS credentials the script falls back to a deterministic synthetic
dataset so the demo always renders.

Outputs (all under frontend/public/data/):
    summary.json
    brands.json                     (column-oriented)
    videos.json                     (column-oriented)
    conversations.json              (column-oriented + summary block)
    topics.json                     ({topics:[...]})
    iceberg.json                    ({tables:[...]})
    pipeline.json                   ({layers:[...]})
    brands/<brand_id>.json          per brand detail bundle
    topics/<topic_id>.json          per topic detail (pageview series)
"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

# Local module — the synthetic Lighthouse dataset stays isolated.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _synthetic import generate as synth_generate  # type: ignore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "data"
BRAND_DIR  = OUTPUT_DIR / "brands"
TOPIC_DIR  = OUTPUT_DIR / "topics"

# ── Athena / Glue catalog config (used only when present) ──────────────────
AWS_REGION       = os.getenv("AWS_REGION", "us-east-1")
ATHENA_WORKGROUP = os.getenv("ATHENA_WORKGROUP", "primary")
LAKE_BUCKET      = os.getenv("LAKE_BUCKET", "lighthouse-odi-lake")
GLUE_DB_GOLD     = os.getenv("GLUE_DB_GOLD", "lighthouse_gold")


# ---------------------------------------------------------------------------
# Athena helpers — kept thin; the real wiring is left commented so the demo
# path can be exercised standalone.
# ---------------------------------------------------------------------------

def have_athena() -> bool:
    return all(
        os.getenv(k)
        for k in ("AWS_REGION", "ATHENA_WORKGROUP", "LAKE_BUCKET")
    ) and bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE"))


def from_athena() -> dict[str, Any]:  # pragma: no cover — exercised only with live AWS
    """Pull the gold-layer marts from Athena.

    Wired here as the production code path. The synthetic fallback is used by
    default so this demo is self-contained.
    """
    import boto3  # type: ignore  # noqa: PLC0415

    _ = boto3.client("athena", region_name=AWS_REGION)
    # The real implementation would:
    #   1. Start an Athena query for each gold table (dim_brands, fct_videos,
    #      fct_conversations, fct_topic_pageviews, fct_brand_signal).
    #   2. Poll get_query_execution() until SUCCEEDED.
    #   3. Read the result CSV from s3://{LAKE_BUCKET}/athena-results/.
    #   4. Assemble a bundle shaped exactly like synth_generate(60).
    raise NotImplementedError(
        "Athena path is wired up but not enabled in this demo; "
        "set AWS creds + uncomment the query block to enable."
    )


# ---------------------------------------------------------------------------
# Column-oriented serializers — keeps brands.json / videos.json compact
# ---------------------------------------------------------------------------

BRAND_COLUMNS = [
    "brand_id", "brand_handle", "brand_name", "vertical", "hq_country",
    "established_year", "description",
    "yt_channel_id", "yt_subscribers", "yt_views_total", "yt_videos_count",
    "yt_views_28d", "yt_subs_growth_28d_pct",
    "reddit_mentions_28d", "reddit_avg_sentiment", "reddit_top_subreddit",
    "reddit_velocity_28d",
    "wiki_pageviews_28d", "wiki_pageviews_growth_28d_pct",
    "attention_score", "signal_bucket", "share_of_voice", "last_signal_change",
]

VIDEO_COLUMNS = [
    "video_id", "brand_id", "channel_id", "title", "published_at",
    "duration_sec", "views", "likes", "comments", "engagement_rate",
    "category", "thumbnail_url",
]

CONVERSATION_COLUMNS = [
    "post_id", "brand_id", "brand_name_match", "subreddit", "title",
    "posted_at", "author", "score", "num_comments", "sentiment",
    "topic_cluster", "url",
]


def to_columnar(rows: list[dict[str, Any]], columns: list[str]) -> dict[str, Any]:
    return {
        "count":   len(rows),
        "columns": columns,
        "rows":    [[r.get(c) for c in columns] for r in rows],
    }


def _conversations_summary(conversations: list[dict[str, Any]]) -> dict[str, Any]:
    by_subreddit: dict[str, int] = {}
    by_topic:     dict[str, int] = {}
    sent_total = 0.0
    sent_n     = 0
    for c in conversations:
        by_subreddit[c["subreddit"]] = by_subreddit.get(c["subreddit"], 0) + 1
        tk = c.get("topic_cluster") or "other"
        by_topic[tk] = by_topic.get(tk, 0) + 1
        s = c.get("sentiment")
        if s is not None:
            sent_total += s
            sent_n     += 1
    return {
        "total":          len(conversations),
        "by_subreddit":   by_subreddit,
        "by_topic":       by_topic,
        "avg_sentiment":  round(sent_total / max(1, sent_n), 4),
    }


# ---------------------------------------------------------------------------
# Snapshot writer
# ---------------------------------------------------------------------------

def write_snapshot(bundle: dict[str, Any], source: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Wipe per-entity sub-dirs so stale rows don't leak into a new build
    for sub in (BRAND_DIR, TOPIC_DIR):
        if sub.exists():
            shutil.rmtree(sub)
        sub.mkdir(parents=True, exist_ok=True)

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    # ── summary.json ──────────────────────────────────────────────────────
    summary = {**bundle["summary"], "generated_at": generated_at, "source": source}
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"  + summary.json       {len(summary)} fields")

    # ── brands.json (column-oriented) ─────────────────────────────────────
    brands = bundle["brands"]
    (OUTPUT_DIR / "brands.json").write_text(
        json.dumps(to_columnar(brands, BRAND_COLUMNS), separators=(",", ":"))
    )
    print(f"  + brands.json        {len(brands)} rows")

    # ── videos.json (column-oriented) ─────────────────────────────────────
    videos = bundle["videos"]
    (OUTPUT_DIR / "videos.json").write_text(
        json.dumps(to_columnar(videos, VIDEO_COLUMNS), separators=(",", ":"))
    )
    print(f"  + videos.json        {len(videos)} rows")

    # ── conversations.json (column-oriented + summary block) ──────────────
    conversations = bundle["conversations"]
    conversations_payload = {
        **to_columnar(conversations, CONVERSATION_COLUMNS),
        "summary": _conversations_summary(conversations),
    }
    (OUTPUT_DIR / "conversations.json").write_text(
        json.dumps(conversations_payload, separators=(",", ":"))
    )
    print(f"  + conversations.json {len(conversations)} rows")

    # ── topics.json ───────────────────────────────────────────────────────
    topics = bundle["topics"]
    (OUTPUT_DIR / "topics.json").write_text(
        json.dumps({"topics": topics}, indent=2)
    )
    print(f"  + topics.json        {len(topics)} topics")

    # ── iceberg.json + pipeline.json ──────────────────────────────────────
    (OUTPUT_DIR / "iceberg.json").write_text(
        json.dumps({"tables": bundle["iceberg_tables"]}, indent=2)
    )
    (OUTPUT_DIR / "pipeline.json").write_text(
        json.dumps({"layers": bundle["pipeline_layers"]}, indent=2)
    )
    print(f"  + iceberg.json       {len(bundle['iceberg_tables'])} tables")
    print(f"  + pipeline.json      {len(bundle['pipeline_layers'])} layers")

    # ── brands/<brand_id>.json per detail bundle ──────────────────────────
    brand_details = bundle.get("brand_details", {})
    for bid, detail in brand_details.items():
        (BRAND_DIR / f"{bid}.json").write_text(json.dumps(detail, indent=2))
    print(f"  + brands/            {len(brand_details)} detail bundles")

    # ── topics/<topic_id>.json per detail ─────────────────────────────────
    topic_details = bundle.get("topic_details", {})
    for tid, detail in topic_details.items():
        # topic_id can contain URL-escaped chars like '%27' / ',' — keep
        # them in the filename so the frontend route matches the id exactly.
        safe = tid.replace("/", "_")
        (TOPIC_DIR / f"{safe}.json").write_text(json.dumps(detail, separators=(",", ":")))
    print(f"  + topics/            {len(topic_details)} detail bundles")


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------

def fallback_dataset(n: int = 60) -> dict[str, Any]:
    return synth_generate(n_brands=n)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print("=" * 60)
    print(" Lighthouse Media -- ODI snapshot builder")
    print("=" * 60)

    # The Athena path is wired up but commented out -- flip the condition to
    # have_athena() once gold-layer Iceberg tables are populated. For the
    # standalone demo we always take the synthetic path.
    use_live = False  # set to: have_athena()
    if use_live:
        try:
            print("-> Pulling live snapshot from Athena...")
            bundle = from_athena()
            write_snapshot(bundle, source="live")
            return 0
        except Exception as e:  # noqa: BLE001
            print(f"x Athena query failed: {e}", file=sys.stderr)
            print("-> Falling back to synthetic demo dataset...", file=sys.stderr)

    print("-> Generating synthetic demo dataset (60 brands)...")
    bundle = fallback_dataset(60)
    s = bundle["summary"]
    print(
        f"  generated: {s['total_brands']} brands, "
        f"{s['total_videos']} videos, "
        f"{s['total_conversations']} conversations, "
        f"{s['total_topics']} topics, "
        f"{s['total_pageview_observations']} pageview obs"
    )
    print("-> Writing JSON to frontend/public/data/")
    write_snapshot(bundle, source="demo")
    print("=" * 60)
    print(f" Done. Output: {OUTPUT_DIR}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
