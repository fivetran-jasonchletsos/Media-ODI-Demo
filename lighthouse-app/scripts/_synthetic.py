"""
Synthetic Lighthouse Media Open Data Initiative (ODI) dataset generator.

Mirrors what build_snapshot.py would receive from a live Athena/Iceberg
gold-layer query so the React frontend renders identically whether the
data came from:

    YouTube Data API + Reddit (Pushshift/PRAW) + Wikipedia REST
        →  S3 (bronze)  →  dbt  →  Iceberg gold tables

…or this deterministic generator.

The generator is pure stdlib — no faker, no boto3 — and is seeded so the
same demo always shows Nike with the same attention score, the same
subreddit mix, the same Wikipedia spike.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import math
import random
from typing import Any

# ---------------------------------------------------------------------------
# Brand universe — 60 well-known consumer/tech/entertainment brands across
# 12 verticals. (name, vertical, hq_country, established_year, top_subreddit,
# topic_slug, blurb_industry_word)
# ---------------------------------------------------------------------------

BRANDS_SEED: list[tuple[str, str, str, int, str, str, str]] = [
    # ── CPG / Beverage ──────────────────────────────────────────────────────
    ("Coca-Cola",      "CPG",          "US",      1892, "r/Coca_Cola",        "The_Coca-Cola_Company",        "beverage"),
    ("Pepsi",          "CPG",          "US",      1898, "r/pepsi",            "Pepsi",                         "beverage"),
    ("Red Bull",       "CPG",          "Austria", 1987, "r/redbull",          "Red_Bull",                      "energy drink"),
    ("Monster",        "CPG",          "US",      2002, "r/MonsterEnergy",    "Monster_Beverage",              "energy drink"),
    ("Gatorade",       "CPG",          "US",      1965, "r/Gatorade",         "Gatorade",                      "sports drink"),

    # ── Retail ──────────────────────────────────────────────────────────────
    ("Walmart",        "Retail",       "US",      1962, "r/walmart",          "Walmart",                       "discount retail"),
    ("Target",         "Retail",       "US",      1902, "r/Target",           "Target_Corporation",            "general merchandise"),
    ("Costco",         "Retail",       "US",      1983, "r/Costco",           "Costco",                        "warehouse club"),
    ("Best Buy",       "Retail",       "US",      1966, "r/BestBuy",          "Best_Buy",                      "electronics retail"),
    ("IKEA",           "Retail",       "Sweden",  1943, "r/IKEA",             "IKEA",                          "home furnishings"),

    # ── Auto ────────────────────────────────────────────────────────────────
    ("Tesla",          "Auto",         "US",      2003, "r/teslamotors",      "Tesla,_Inc.",                   "electric vehicle"),
    ("BMW",            "Auto",         "Germany", 1916, "r/BMW",              "BMW",                           "luxury auto"),
    ("Mercedes-Benz",  "Auto",         "Germany", 1926, "r/mercedes_benz",    "Mercedes-Benz",                 "luxury auto"),
    ("Ford",           "Auto",         "US",      1903, "r/Ford",             "Ford_Motor_Company",            "automotive"),
    ("Toyota",         "Auto",         "Japan",   1937, "r/Toyota",           "Toyota",                        "automotive"),
    ("Porsche",        "Auto",         "Germany", 1931, "r/Porsche",          "Porsche",                       "sports car"),
    ("Lucid Motors",   "Auto",         "US",      2007, "r/LucidMotors",      "Lucid_Motors",                  "electric vehicle"),

    # ── Tech ────────────────────────────────────────────────────────────────
    ("Apple",          "Tech",         "US",      1976, "r/apple",            "Apple_Inc.",                    "consumer electronics"),
    ("Microsoft",      "Tech",         "US",      1975, "r/microsoft",        "Microsoft",                     "software"),
    ("Google",         "Tech",         "US",      1998, "r/google",           "Google",                        "internet"),
    ("Meta",           "Tech",         "US",      2004, "r/Meta",             "Meta_Platforms",                "social media"),
    ("NVIDIA",         "Tech",         "US",      1993, "r/nvidia",           "Nvidia",                        "semiconductor"),
    ("Samsung",        "Tech",         "Korea",   1969, "r/samsung",          "Samsung_Electronics",           "consumer electronics"),
    ("Sony",           "Tech",         "Japan",   1946, "r/sony",             "Sony",                          "consumer electronics"),

    # ── Finance ─────────────────────────────────────────────────────────────
    ("JPMorgan",       "Finance",      "US",      2000, "r/JPMorganChase",    "JPMorgan_Chase",                "banking"),
    ("Goldman Sachs",  "Finance",      "US",      1869, "r/GoldmanSachs",     "Goldman_Sachs",                 "investment bank"),
    ("AmEx",           "Finance",      "US",      1850, "r/amex",             "American_Express",              "consumer finance"),
    ("Square",         "Finance",      "US",      2009, "r/Square",           "Block,_Inc.",                   "fintech"),
    ("Robinhood",      "Finance",      "US",      2013, "r/RobinHood",        "Robinhood_Markets",             "fintech"),
    ("Stripe",         "Finance",      "US",      2010, "r/stripe",           "Stripe,_Inc.",                  "payments"),

    # ── Streaming ───────────────────────────────────────────────────────────
    ("Netflix",        "Streaming",    "US",      1997, "r/netflix",          "Netflix",                       "streaming"),
    ("Disney+",        "Streaming",    "US",      2019, "r/DisneyPlus",       "Disney+",                       "streaming"),
    ("HBO Max",        "Streaming",    "US",      2020, "r/HBOMax",           "Max_(streaming_service)",       "streaming"),
    ("Hulu",           "Streaming",    "US",      2007, "r/Hulu",             "Hulu",                          "streaming"),
    ("Paramount+",     "Streaming",    "US",      2021, "r/ParamountPlus",    "Paramount+",                    "streaming"),
    ("Spotify",        "Streaming",    "Sweden",  2006, "r/spotify",          "Spotify",                       "music streaming"),

    # ── QSR ─────────────────────────────────────────────────────────────────
    ("McDonald's",     "QSR",          "US",      1940, "r/McDonalds",        "McDonald%27s",                  "fast food"),
    ("Starbucks",      "QSR",          "US",      1971, "r/starbucks",        "Starbucks",                     "coffee"),
    ("Chipotle",       "QSR",          "US",      1993, "r/Chipotle",         "Chipotle_Mexican_Grill",        "fast casual"),
    ("Chick-fil-A",    "QSR",          "US",      1946, "r/ChickFilA",        "Chick-fil-A",                   "fast food"),
    ("Domino's",       "QSR",          "US",      1960, "r/Dominos",          "Domino%27s",                    "pizza"),

    # ── Beauty ──────────────────────────────────────────────────────────────
    ("Sephora",        "Beauty",       "France",  1969, "r/Sephora",          "Sephora",                       "beauty retail"),
    ("Glossier",       "Beauty",       "US",      2014, "r/glossier",         "Glossier",                      "beauty"),
    ("Fenty Beauty",   "Beauty",       "US",      2017, "r/fentybeauty",      "Fenty_Beauty",                  "beauty"),
    ("Drunk Elephant", "Beauty",       "US",      2012, "r/SkincareAddiction","Drunk_Elephant",                "skincare"),
    ("Rare Beauty",    "Beauty",       "US",      2020, "r/MakeupAddiction",  "Rare_Beauty",                   "cosmetics"),

    # ── Fashion ─────────────────────────────────────────────────────────────
    ("Nike",           "Fashion",      "US",      1964, "r/Sneakers",         "Nike,_Inc.",                    "athletic apparel"),
    ("Adidas",         "Fashion",      "Germany", 1949, "r/adidas",           "Adidas",                        "athletic apparel"),
    ("Lululemon",      "Fashion",      "US",      1998, "r/lululemon",        "Lululemon_Athletica",           "athletic apparel"),
    ("Patagonia",      "Fashion",      "US",      1973, "r/Patagonia",        "Patagonia,_Inc.",               "outdoor apparel"),
    ("Supreme",        "Fashion",      "US",      1994, "r/streetwear",       "Supreme_(brand)",               "streetwear"),
    ("Gucci",          "Fashion",      "Italy",   1921, "r/Gucci",            "Gucci",                         "luxury fashion"),

    # ── Travel ──────────────────────────────────────────────────────────────
    ("Airbnb",         "Travel",       "US",      2008, "r/AirBnB",           "Airbnb",                        "travel"),
    ("Marriott",       "Travel",       "US",      1927, "r/marriott",         "Marriott_International",        "hospitality"),
    ("Delta",          "Travel",       "US",      1924, "r/delta",            "Delta_Air_Lines",               "airline"),
    ("Uber",           "Travel",       "US",      2009, "r/uber",             "Uber",                          "ride-hail"),
    ("DoorDash",       "Travel",       "US",      2013, "r/doordash",         "DoorDash",                      "delivery"),

    # ── Gaming ──────────────────────────────────────────────────────────────
    ("PlayStation",    "Gaming",       "Japan",   1994, "r/PS5",              "PlayStation",                   "gaming"),
    ("Xbox",           "Gaming",       "US",      2001, "r/xbox",             "Xbox",                          "gaming"),
    ("Nintendo",       "Gaming",       "Japan",   1889, "r/NintendoSwitch",   "Nintendo",                      "gaming"),
    ("Twitch",         "Gaming",       "US",      2011, "r/Twitch",           "Twitch_(service)",              "streaming platform"),
    ("Discord",        "Gaming",       "US",      2015, "r/discordapp",       "Discord",                       "chat platform"),

    # ── Entertainment ───────────────────────────────────────────────────────
    ("Disney",         "Entertainment","US",      1923, "r/disney",           "The_Walt_Disney_Company",       "entertainment"),
    ("Marvel",         "Entertainment","US",      1939, "r/Marvel",           "Marvel_Entertainment",          "entertainment"),
    ("A24",            "Entertainment","US",      2012, "r/A24",              "A24",                           "indie film"),
]

VERTICALS = ["CPG", "Retail", "Auto", "Tech", "Finance", "Streaming",
             "QSR", "Beauty", "Fashion", "Travel", "Gaming", "Entertainment"]

# Topic clusters for Reddit conversations
TOPIC_CLUSTERS = [
    "launch", "controversy", "product-review", "support",
    "partnership", "earnings", "culture", "other",
]

# Vertical-specific cluster bias (rough probabilities — normalized at use site)
VERTICAL_CLUSTER_BIAS: dict[str, dict[str, float]] = {
    "Auto":          {"launch": 0.25, "product-review": 0.25, "controversy": 0.10, "support": 0.15, "partnership": 0.05, "earnings": 0.05, "culture": 0.10, "other": 0.05},
    "Tech":          {"launch": 0.20, "product-review": 0.20, "controversy": 0.10, "support": 0.15, "partnership": 0.10, "earnings": 0.10, "culture": 0.10, "other": 0.05},
    "Streaming":     {"launch": 0.15, "product-review": 0.10, "controversy": 0.20, "support": 0.05, "partnership": 0.05, "earnings": 0.05, "culture": 0.35, "other": 0.05},
    "Gaming":        {"launch": 0.20, "product-review": 0.15, "controversy": 0.15, "support": 0.10, "partnership": 0.05, "earnings": 0.05, "culture": 0.25, "other": 0.05},
    "Entertainment": {"launch": 0.20, "product-review": 0.10, "controversy": 0.15, "support": 0.02, "partnership": 0.10, "earnings": 0.03, "culture": 0.35, "other": 0.05},
    "QSR":           {"launch": 0.20, "product-review": 0.20, "controversy": 0.15, "support": 0.10, "partnership": 0.05, "earnings": 0.05, "culture": 0.20, "other": 0.05},
    "Beauty":        {"launch": 0.25, "product-review": 0.30, "controversy": 0.10, "support": 0.05, "partnership": 0.10, "earnings": 0.02, "culture": 0.15, "other": 0.03},
    "Fashion":       {"launch": 0.25, "product-review": 0.20, "controversy": 0.10, "support": 0.05, "partnership": 0.15, "earnings": 0.03, "culture": 0.20, "other": 0.02},
    "CPG":           {"launch": 0.20, "product-review": 0.15, "controversy": 0.15, "support": 0.10, "partnership": 0.10, "earnings": 0.05, "culture": 0.20, "other": 0.05},
    "Retail":        {"launch": 0.10, "product-review": 0.15, "controversy": 0.15, "support": 0.20, "partnership": 0.05, "earnings": 0.10, "culture": 0.20, "other": 0.05},
    "Travel":        {"launch": 0.10, "product-review": 0.20, "controversy": 0.20, "support": 0.20, "partnership": 0.05, "earnings": 0.05, "culture": 0.15, "other": 0.05},
    "Finance":       {"launch": 0.10, "product-review": 0.10, "controversy": 0.20, "support": 0.20, "partnership": 0.05, "earnings": 0.20, "culture": 0.10, "other": 0.05},
}

CLUSTER_SENTIMENT_BIAS: dict[str, tuple[float, float]] = {
    "launch":         (0.20, 0.20),
    "controversy":   (-0.40, 0.20),
    "product-review": (0.10, 0.30),
    "support":       (-0.15, 0.20),
    "partnership":    (0.25, 0.15),
    "earnings":       (0.05, 0.25),
    "culture":        (0.15, 0.30),
    "other":          (0.00, 0.20),
}

# Culture / industry / event topics (not brand-attached, 20 of them)
CULTURE_TOPICS_SEED: list[tuple[str, str, str]] = [
    ("Super_Bowl_LIX",                "Super Bowl LIX",                 "event"),
    ("Cannes_Lions_2025",             "Cannes Lions 2025",              "event"),
    ("CES_2025",                      "CES 2025",                       "event"),
    ("Met_Gala_2025",                 "Met Gala 2025",                  "event"),
    ("Coachella_2025",                "Coachella 2025",                 "event"),
    ("Generative_AI_advertising",     "Generative AI advertising",      "industry"),
    ("Apple_Vision_Pro",              "Apple Vision Pro",               "industry"),
    ("Retail_media_network",          "Retail media network",           "industry"),
    ("Connected_TV_advertising",      "Connected TV advertising",       "industry"),
    ("Influencer_marketing",          "Influencer marketing",           "industry"),
    ("TikTok_ban",                    "TikTok ban",                     "culture"),
    ("Streaming_wars",                "Streaming wars",                 "culture"),
    ("Sustainable_fashion",           "Sustainable fashion",            "culture"),
    ("GLP-1_drugs",                   "GLP-1 drugs",                    "culture"),
    ("Crypto_winter",                 "Crypto winter",                  "culture"),
    ("Taylor_Swift_Eras_Tour",        "Taylor Swift Eras Tour",         "person"),
    ("Elon_Musk",                     "Elon Musk",                      "person"),
    ("MrBeast",                       "MrBeast",                        "person"),
    ("Generation_Z",                  "Generation Z",                   "culture"),
    ("Esports_World_Cup",             "Esports World Cup",              "event"),
]

# Video title templates
VIDEO_TITLE_TEMPLATES = [
    "How {brand} is reimagining {topic}",
    "Behind the scenes at {brand}",
    "New {brand} {product} reveal",
    "{year} {brand} {product} review",
    "Why we chose {brand}",
    "{brand} unveils {product}",
    "I tried {brand}'s new {product} for 30 days",
    "The real story behind {brand}",
    "{brand} CEO on the future of {topic}",
    "{brand} just changed the game with {product}",
    "{product} from {brand}: first impressions",
    "Inside {brand}'s {year} strategy",
    "What nobody tells you about {brand}",
    "{brand} vs the competition",
]

VIDEO_PRODUCT_WORDS = [
    "lineup", "campaign", "collection", "platform", "experience",
    "edition", "flagship", "release", "drop", "model", "series",
]

VIDEO_TOPIC_WORDS = [
    "the category", "consumer attention", "the customer journey",
    "loyalty", "the next decade", "design", "sustainability",
    "creators", "the brand", "the industry",
]

# Reddit title templates per cluster
REDDIT_TITLE_TEMPLATES: dict[str, list[str]] = {
    "launch": [
        "{brand} just announced the new {product} — thoughts?",
        "Anyone seen the new {brand} {product} drop?",
        "{brand}'s new {product} launch is wild",
        "First look at {brand}'s {product}",
    ],
    "controversy": [
        "Is anyone else fed up with {brand} lately?",
        "{brand} did WHAT?",
        "{brand} pricing change is a slap in the face",
        "Boycotting {brand} after this week",
    ],
    "product-review": [
        "Honest review of the {brand} {product}",
        "30 days with {brand}'s {product}",
        "Why I'm switching to {brand}",
        "Tried {brand} — here's my take",
    ],
    "support": [
        "{brand} customer service is impossible to reach",
        "Anyone else having issues with {brand}?",
        "Need help with my {brand} order",
        "Trying to cancel {brand} — nightmare",
    ],
    "partnership": [
        "{brand} x [collab] is actually cool",
        "{brand} partnership announcement",
        "{brand} just teamed up with a creator",
        "Hot take on the {brand} collab",
    ],
    "earnings": [
        "{brand} earnings call summary",
        "{brand} beat / missed — let's discuss",
        "What the {brand} numbers actually mean",
        "{brand} guidance for next quarter",
    ],
    "culture": [
        "The {brand} discourse is unhinged today",
        "{brand} TikTok meme has me dying",
        "Why {brand} is so polarizing",
        "{brand} is having a moment",
    ],
    "other": [
        "Random {brand} thought",
        "Quick {brand} question",
        "Open thread: {brand}",
        "Anyone else thinking about {brand}?",
    ],
}

REDDIT_AUTHORS = [
    "u/MarketingPro42", "u/AdSpendDaily", "u/CreatorLens", "u/MediaPlannerX",
    "u/BrandLurker", "u/SocialSarah", "u/AgencyLifer", "u/MidwestDad88",
    "u/PixelPirate", "u/SignalSeeker", "u/CulturalCritic", "u/QuietBuyer",
    "u/TacoCritic", "u/StreamingNerd", "u/SneakerHead2049", "u/ThriftyTina",
    "u/MidnightMod", "u/DataDrivenDan", "u/CoffeeAndKPIs", "u/UnpaidMod",
]

UNATTRIBUTED_TITLES = [
    "Just saw a billboard for some brand I'd never heard of",
    "What's that new energy drink everyone's posting about?",
    "Help identifying a logo I keep seeing",
    "Random branded merch I got at a conference",
    "Anyone know who sponsored that podcast episode?",
    "Pretty sure that ad was AI-generated",
    "Saw the funniest unbranded campaign on the subway",
    "Why is every brand chasing the same trend",
    "Watched a 20-min YouTube ad against my will",
    "The retail-media takeover continues",
]

UNATTRIBUTED_SUBREDDITS = [
    "r/marketing", "r/advertising", "r/ProductManagement", "r/socialmedia",
    "r/AskReddit", "r/mildlyinteresting", "r/CrappyDesign", "r/OutOfTheLoop",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(name: str) -> str:
    out = name.lower().replace("'", "").replace("+", "plus").replace(" ", "")
    out = "".join(ch for ch in out if ch.isalnum())
    return out


def _yt_channel_id(name: str) -> str:
    h = hashlib.sha1(name.encode()).hexdigest()
    # YouTube channel IDs start with UC and are ~22 chars after
    return "UC" + h[:22]


def _log_normal(rng: random.Random, lo: float, hi: float) -> float:
    log_lo = math.log(max(lo, 1))
    log_hi = math.log(max(hi, lo + 1))
    return math.exp(rng.uniform(log_lo, log_hi))


def _weighted_choice(rng: random.Random, items_with_weight: list[tuple[Any, float]]):
    total = sum(w for _, w in items_with_weight)
    r = rng.random() * total
    cum = 0.0
    for item, w in items_with_weight:
        cum += w
        if r <= cum:
            return item
    return items_with_weight[-1][0]


def _bucket(score: float) -> str:
    if score < 25:   return "cold"
    if score < 50:   return "warming"
    if score < 75:   return "hot"
    return "breakout"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# Wikipedia pageview series generator: 90-day random walks
# ---------------------------------------------------------------------------

def _gen_pageview_series(
    rng: random.Random,
    today: dt.date,
    topic_id: str,
    pattern: str,   # 'brand' | 'event' | 'industry' | 'person'
    baseline: int,
    days: int = 90,
) -> list[dict[str, Any]]:
    obs: list[dict[str, Any]] = []
    dates = [today - dt.timedelta(days=days - 1 - i) for i in range(days)]

    if pattern == "event":
        # pre-event ramp, peak roughly 60% through, fall-off
        peak_idx = int(days * rng.uniform(0.5, 0.75))
        peak_mult = rng.uniform(4.0, 9.0)
        for i, d in enumerate(dates):
            dist = abs(i - peak_idx)
            decay = math.exp(-dist / (days * 0.12))
            mult = 1.0 + (peak_mult - 1.0) * decay
            jitter = rng.gauss(1.0, 0.10)
            v = max(0, int(baseline * mult * jitter))
            obs.append({"topic_id": topic_id, "date": d.isoformat(), "views": v})
        return obs

    # brand / industry / person — steady baseline with occasional spikes
    v = float(baseline)
    spike_days = set(rng.sample(range(days), k=rng.randint(1, 3)))
    for i, d in enumerate(dates):
        drift = rng.gauss(0, baseline * 0.08)
        v = max(baseline * 0.4, v + drift)
        # mild reversion to baseline
        v = v + (baseline - v) * 0.15
        if i in spike_days:
            v *= rng.uniform(2.0, 4.5)
        views = max(0, int(v + rng.gauss(0, baseline * 0.05)))
        obs.append({"topic_id": topic_id, "date": d.isoformat(), "views": views})
    return obs


# ---------------------------------------------------------------------------
# Attention score
# ---------------------------------------------------------------------------

def _attention_score(
    rng: random.Random,
    yt_views_growth_pct: float,
    reddit_velocity: float,
    reddit_sentiment: float,
    wiki_growth_pct: float,
) -> float:
    # YT growth: -5..+35 → 0..100
    yt_pts = _clamp((yt_views_growth_pct + 5.0) / 40.0 * 100.0, 0, 100)
    # Reddit velocity: -0.5..+1.5 → 0..100
    rv_pts = _clamp((reddit_velocity + 0.5) / 2.0 * 100.0, 0, 100)
    # Sentiment: -0.4..+0.6 → 0..100
    sent_pts = _clamp((reddit_sentiment + 0.4) / 1.0 * 100.0, 0, 100)
    # Wiki growth: -20..+80 → 0..100
    wiki_pts = _clamp((wiki_growth_pct + 20.0) / 100.0 * 100.0, 0, 100)

    score = (
        0.30 * yt_pts
        + 0.25 * rv_pts
        + 0.15 * sent_pts
        + 0.30 * wiki_pts
    )
    score += rng.uniform(-3.0, 3.0)
    return _clamp(score, 0.0, 100.0)


# ---------------------------------------------------------------------------
# Iceberg / pipeline metadata
# ---------------------------------------------------------------------------

def _iceberg_tables(rng: random.Random,
                    n_brands: int,
                    n_videos: int,
                    n_conversations: int,
                    n_topics: int,
                    n_pageviews: int,
                    today: dt.date) -> list[dict[str, Any]]:
    iso = today.isoformat()
    return [
        # ── Bronze (raw landings) ─────────────────────────────────────────
        {
            "database": "bronze", "table": "youtube_videos_raw",
            "rows": n_videos + rng.randint(2_000, 5_000),
            "bytes": rng.randint(420_000_000, 580_000_000),
            "partitions": ["ingest_date", "channel_id"], "source_system": "youtube",
            "last_updated_at": iso, "schema_columns": 31,
        },
        {
            "database": "bronze", "table": "youtube_channels_raw",
            "rows": n_brands + rng.randint(80, 200),
            "bytes": rng.randint(8_000_000, 14_000_000),
            "partitions": ["ingest_date"], "source_system": "youtube",
            "last_updated_at": iso, "schema_columns": 22,
        },
        {
            "database": "bronze", "table": "reddit_posts_raw",
            "rows": n_conversations + rng.randint(120_000, 220_000),
            "bytes": rng.randint(1_100_000_000, 1_600_000_000),
            "partitions": ["received_date", "subreddit"], "source_system": "reddit",
            "last_updated_at": iso, "schema_columns": 26,
        },
        {
            "database": "bronze", "table": "wikipedia_pageviews_raw",
            "rows": n_pageviews + rng.randint(40_000, 80_000),
            "bytes": rng.randint(180_000_000, 260_000_000),
            "partitions": ["date"], "source_system": "wikipedia",
            "last_updated_at": iso, "schema_columns": 7,
        },
        # ── Silver (cleaned, conformed) ───────────────────────────────────
        {
            "database": "silver", "table": "stg_videos",
            "rows": n_videos, "bytes": rng.randint(85_000_000, 125_000_000),
            "partitions": ["published_year"], "source_system": "youtube",
            "last_updated_at": iso, "schema_columns": 14,
        },
        {
            "database": "silver", "table": "stg_conversations",
            "rows": n_conversations, "bytes": rng.randint(310_000_000, 420_000_000),
            "partitions": ["posted_date", "subreddit"], "source_system": "reddit",
            "last_updated_at": iso, "schema_columns": 18,
        },
        {
            "database": "silver", "table": "stg_pageviews",
            "rows": n_pageviews, "bytes": rng.randint(45_000_000, 65_000_000),
            "partitions": ["date"], "source_system": "wikipedia",
            "last_updated_at": iso, "schema_columns": 5,
        },
        # ── Gold (analytics-ready) ────────────────────────────────────────
        {
            "database": "gold", "table": "dim_brands",
            "rows": n_brands, "bytes": rng.randint(800_000, 1_400_000),
            "partitions": [], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 27,
        },
        {
            "database": "gold", "table": "fct_videos",
            "rows": n_videos, "bytes": rng.randint(22_000_000, 32_000_000),
            "partitions": ["published_year", "brand_id"], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 12,
        },
        {
            "database": "gold", "table": "fct_conversations",
            "rows": n_conversations, "bytes": rng.randint(140_000_000, 195_000_000),
            "partitions": ["posted_date", "topic_cluster"], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 14,
        },
        {
            "database": "gold", "table": "fct_topic_pageviews",
            "rows": n_pageviews, "bytes": rng.randint(18_000_000, 28_000_000),
            "partitions": ["topic_id"], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 6,
        },
        {
            "database": "gold", "table": "fct_brand_signal",
            "rows": n_brands, "bytes": rng.randint(900_000, 1_500_000),
            "partitions": [], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 14,
        },
    ]


def _pipeline_layers(rng: random.Random,
                     n_brands: int,
                     n_videos: int,
                     n_conversations: int,
                     n_pageviews: int,
                     today: dt.date) -> list[dict[str, Any]]:
    iso = today.isoformat()
    bronze_total = n_brands * 3 + n_videos + n_conversations + n_pageviews + rng.randint(180_000, 280_000)
    silver_total = n_videos + n_conversations + n_pageviews
    gold_total   = silver_total + n_brands * 2  # + dim_brands + brand_signal
    return [
        {"layer": "connector", "rows_in": 0,                "rows_out": bronze_total,
         "tables": 4, "last_run": iso, "status": "ok"},
        {"layer": "bronze",    "rows_in": bronze_total,     "rows_out": bronze_total,
         "tables": 4, "last_run": iso, "status": "ok"},
        {"layer": "silver",    "rows_in": bronze_total,     "rows_out": silver_total,
         "tables": 3, "last_run": iso, "status": "ok"},
        {"layer": "gold",      "rows_in": silver_total,     "rows_out": gold_total,
         "tables": 5, "last_run": iso, "status": "ok"},
    ]


# ---------------------------------------------------------------------------
# Signal-factor / AI-summary text generation
# ---------------------------------------------------------------------------

def _signal_factors(
    rng: random.Random,
    brand: dict[str, Any],
    top_video_title: str | None,
    top_cluster: str | None,
) -> list[str]:
    factors: list[str] = []
    yt_g = brand.get("yt_subs_growth_28d_pct") or 0.0
    if yt_g >= 10:
        factors.append(f"YT views +{yt_g:.0f}% MoM driven by recent product reveal")
    elif yt_g >= 3:
        factors.append(f"YT subscriber growth steady at +{yt_g:.1f}% over the past 28d")
    elif yt_g < 0:
        factors.append(f"YT subscriber growth turned negative ({yt_g:.1f}%) — content cadence slipping")

    sent = brand.get("reddit_avg_sentiment", 0.0)
    sub = brand.get("reddit_top_subreddit") or "Reddit"
    if sent <= -0.10:
        factors.append(f"Reddit sentiment dipped to {sent:+.2f} in {sub} after pricing or service complaints")
    elif sent >= 0.30:
        factors.append(f"Reddit sentiment elevated at {sent:+.2f} — fan-driven engagement in {sub}")
    else:
        factors.append(f"Reddit conversation balanced (sentiment {sent:+.2f}) across {sub}")

    rv = brand.get("reddit_velocity_28d", 0.0)
    if rv >= 0.30:
        factors.append(f"Reddit mention velocity up {rv*100:.0f}% — emerging conversation cluster")
    elif rv <= -0.20:
        factors.append(f"Reddit mention velocity down {rv*100:.0f}% — attention cooling")

    wiki_g = brand.get("wiki_pageviews_growth_28d_pct") or 0.0
    if wiki_g >= 25:
        factors.append(f"Wikipedia pageviews surged +{wiki_g:.0f}% — news cycle is active")
    elif wiki_g <= -15:
        factors.append(f"Wikipedia interest faded {wiki_g:.0f}% from the prior window")

    if top_video_title:
        factors.append(f"Top YouTube asset: \"{top_video_title[:60]}\"")
    if top_cluster:
        factors.append(f"Dominant Reddit topic cluster: {top_cluster}")

    # Truncate to 4-6
    rng.shuffle(factors)
    n = rng.randint(4, 6)
    return factors[:n]


def _ai_summary(brand: dict[str, Any], top_sub: str, vertical: str) -> str:
    name = brand["brand_name"]
    bucket = brand["signal_bucket"]
    yt_g = brand.get("yt_subs_growth_28d_pct") or 0.0
    wiki_g = brand.get("wiki_pageviews_growth_28d_pct") or 0.0
    sent = brand.get("reddit_avg_sentiment", 0.0)
    score = brand.get("attention_score", 0)

    if bucket == "breakout":
        return (
            f"{name}'s cross-channel attention has accelerated sharply in the past 28 days, with a {yt_g:+.0f}% "
            f"YouTube subscriber lift and matching uplift in {top_sub} sentiment (avg {sent:+.2f}). Wikipedia "
            f"pageview volatility (+{wiki_g:.0f}% w/w) suggests the news cycle remains active and the breakout "
            f"signal is durable into the next 14 days."
        )
    if bucket == "hot":
        return (
            f"{name} is running hot in the {vertical} panel with an attention score of {score:.0f}. YouTube and "
            f"Reddit are reinforcing each other — views +{yt_g:.0f}% and {top_sub} sentiment of {sent:+.2f} — "
            f"while Wikipedia interest tracks slightly behind. Worth flagging for paid social pacing teams."
        )
    if bucket == "warming":
        return (
            f"{name}'s signal is warming. YouTube growth ({yt_g:+.0f}%) and Reddit conversation are constructive "
            f"but Wikipedia attention remains in line with the trailing baseline. We expect {name} to move "
            f"toward 'hot' on the next news catalyst."
        )
    return (
        f"{name} is in a cold-signal regime: attention score {score:.0f}, YouTube growth {yt_g:+.0f}%, and "
        f"{top_sub} sentiment ({sent:+.2f}) all sit in the lower quartile of the {vertical} panel. Expect "
        f"limited audience pull until a launch or partnership catalyst lands."
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate(n_brands: int = 60, seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)
    today = dt.date.today()

    # ── Trim/extend the seed list ─────────────────────────────────────────
    universe = BRANDS_SEED[:n_brands] if n_brands <= len(BRANDS_SEED) else BRANDS_SEED

    # =====================================================================
    # 1. Brands (without final attention_score; needs downstream signals)
    # =====================================================================
    brands: list[dict[str, Any]] = []
    brand_topic_slug: dict[str, str] = {}  # brand_id -> wiki slug
    brand_subreddit:  dict[str, str] = {}
    brand_vertical:   dict[str, str] = {}

    for idx, (name, vertical, hq, established, top_sub, slug, industry_word) in enumerate(universe, start=1):
        brand_id = f"brand_{idx:03d}"
        handle = "@" + _slugify(name)
        yt_chan = _yt_channel_id(name)
        # YT subscriber distribution: log-normal between 10k and 50M
        yt_subs = int(_log_normal(rng, 10_000, 50_000_000))
        # YT lifetime views: 100x to 1500x subscribers (log-normal)
        yt_views_total = int(yt_subs * _log_normal(rng, 100, 1500))
        # Bound to 1B-50B for very large channels
        yt_views_total = min(yt_views_total, 50_000_000_000)
        yt_videos = int(rng.randint(120, 4500))
        yt_views_28d = int(yt_views_total * rng.uniform(0.012, 0.060))
        yt_subs_growth = round(rng.uniform(-5.0, 35.0), 2)

        reddit_mentions = int(_log_normal(rng, 10, 2000))
        reddit_sent = round(rng.uniform(-0.4, 0.6), 3)
        # Bias upward — most known brands have slightly positive Reddit sentiment
        reddit_sent = round(_clamp(reddit_sent + 0.10, -0.4, 0.6), 3)
        reddit_velocity = round(rng.uniform(-0.30, 0.80), 3)

        wiki_pv = int(_log_normal(rng, 1_000, 2_000_000))
        wiki_growth = round(rng.uniform(-20.0, 80.0), 2)

        brand = {
            "brand_id":                       brand_id,
            "brand_handle":                   handle,
            "brand_name":                     name,
            "vertical":                       vertical,
            "hq_country":                     hq,
            "established_year":               established,
            "description":                    f"{name} is a {industry_word} brand established in {established}, headquartered in {hq}.",

            "yt_channel_id":                  yt_chan,
            "yt_subscribers":                 yt_subs,
            "yt_views_total":                 yt_views_total,
            "yt_videos_count":                yt_videos,
            "yt_views_28d":                   yt_views_28d,
            "yt_subs_growth_28d_pct":         yt_subs_growth,

            "reddit_mentions_28d":            reddit_mentions,
            "reddit_avg_sentiment":           reddit_sent,
            "reddit_top_subreddit":           top_sub,
            "reddit_velocity_28d":            reddit_velocity,

            "wiki_pageviews_28d":             wiki_pv,
            "wiki_pageviews_growth_28d_pct":  wiki_growth,

            # filled below
            "attention_score":                0.0,
            "signal_bucket":                  "cold",
            "share_of_voice":                 0.0,
            "last_signal_change":             None,
        }
        brands.append(brand)
        brand_topic_slug[brand_id] = slug
        brand_subreddit[brand_id]  = top_sub
        brand_vertical[brand_id]   = vertical

    # =====================================================================
    # 2. Videos: ~25 per brand, last 90 days
    # =====================================================================
    videos: list[dict[str, Any]] = []
    videos_by_brand: dict[str, list[dict[str, Any]]] = {}
    video_seq = 0

    for b in brands:
        bid = b["brand_id"]
        n_videos = rng.randint(20, 30)
        per_brand: list[dict[str, Any]] = []
        for _ in range(n_videos):
            video_seq += 1
            video_id = f"yt_{video_seq:06d}"
            days_ago = rng.randint(1, 90)
            published = dt.datetime.combine(today, dt.time()) - dt.timedelta(
                days=days_ago, hours=rng.randint(0, 23)
            )
            duration = rng.choice([
                rng.randint(45, 90),       # shorts-ish
                rng.randint(180, 600),     # regular
                rng.randint(600, 1800),    # long-form
            ])
            # Views: brand-size driven baseline with viral kicker
            baseline = max(500, int(b["yt_views_28d"] / max(1, n_videos)))
            views = max(100, int(baseline * rng.uniform(0.2, 2.5)))
            # 1 in 25 viral
            if rng.random() < 0.04:
                views = int(views * rng.uniform(5.0, 20.0))
            # Engagement rate: 2-8%, occasional 15-20%
            er = rng.uniform(0.02, 0.08)
            if rng.random() < 0.05:
                er = rng.uniform(0.15, 0.22)
            likes_plus_comments = int(views * er)
            comments = int(likes_plus_comments * rng.uniform(0.05, 0.15))
            likes = max(0, likes_plus_comments - comments)
            engagement_rate = round(((likes + comments) / max(1, views)), 4)

            tpl = rng.choice(VIDEO_TITLE_TEMPLATES)
            title = tpl.format(
                brand=b["brand_name"],
                product=rng.choice(VIDEO_PRODUCT_WORDS),
                topic=rng.choice(VIDEO_TOPIC_WORDS),
                year=published.year,
            )
            category = rng.choice([
                "Howto & Style", "Entertainment", "People & Blogs",
                "Science & Technology", "Sports", "News & Politics",
                "Gaming", "Autos & Vehicles", "Film & Animation",
            ])
            video = {
                "video_id":        video_id,
                "brand_id":        bid,
                "channel_id":      b["yt_channel_id"],
                "title":           title,
                "published_at":    published.isoformat(timespec="seconds"),
                "duration_sec":    duration,
                "views":           views,
                "likes":           likes,
                "comments":        comments,
                "engagement_rate": engagement_rate,
                "category":        category,
                "thumbnail_url":   f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            }
            videos.append(video)
            per_brand.append(video)
        per_brand.sort(key=lambda v: v["views"], reverse=True)
        videos_by_brand[bid] = per_brand

    # =====================================================================
    # 3. Conversations (Reddit) — ~30 per brand + ~500 unattributed
    # =====================================================================
    conversations: list[dict[str, Any]] = []
    convs_by_brand: dict[str, list[dict[str, Any]]] = {}
    conv_seq = 0

    for b in brands:
        bid = b["brand_id"]
        vertical = b["vertical"] or "Retail"
        bias = VERTICAL_CLUSTER_BIAS.get(vertical, VERTICAL_CLUSTER_BIAS["Retail"])
        cluster_choices = [(k, v) for k, v in bias.items()]

        n_conv = rng.randint(25, 35)
        per_brand: list[dict[str, Any]] = []
        for _ in range(n_conv):
            conv_seq += 1
            post_id = f"t3_{conv_seq:07d}"
            cluster = _weighted_choice(rng, cluster_choices)
            mu, sigma = CLUSTER_SENTIMENT_BIAS[cluster]
            sentiment = round(_clamp(rng.gauss(mu, sigma), -1.0, 1.0), 3)

            tpl = rng.choice(REDDIT_TITLE_TEMPLATES[cluster])
            title = tpl.format(
                brand=b["brand_name"],
                product=rng.choice(VIDEO_PRODUCT_WORDS),
            )
            days_ago = rng.randint(1, 90)
            posted = dt.datetime.combine(today, dt.time()) - dt.timedelta(
                days=days_ago, hours=rng.randint(0, 23)
            )
            # Score: log-normal 5..15000
            score = int(_log_normal(rng, 5, 15_000))
            num_comments = int(score * rng.uniform(0.05, 0.30))
            author = rng.choice(REDDIT_AUTHORS)
            sub = b["reddit_top_subreddit"] or "r/marketing"
            sub_path = sub.replace("r/", "")
            conv = {
                "post_id":          post_id,
                "brand_id":         bid,
                "brand_name_match": b["brand_name"],
                "subreddit":        sub,
                "title":            title,
                "posted_at":        posted.isoformat(timespec="seconds"),
                "author":           author,
                "score":            score,
                "num_comments":     num_comments,
                "sentiment":        sentiment,
                "topic_cluster":    cluster,
                "url":              f"https://reddit.com/{sub}/comments/{post_id}/",
            }
            conversations.append(conv)
            per_brand.append(conv)
        per_brand.sort(key=lambda c: c["score"], reverse=True)
        convs_by_brand[bid] = per_brand

    # Unattributed conversations (~500)
    for _ in range(500):
        conv_seq += 1
        post_id = f"t3_{conv_seq:07d}"
        cluster = rng.choice(TOPIC_CLUSTERS)
        title = rng.choice(UNATTRIBUTED_TITLES)
        days_ago = rng.randint(1, 90)
        posted = dt.datetime.combine(today, dt.time()) - dt.timedelta(
            days=days_ago, hours=rng.randint(0, 23)
        )
        score = int(_log_normal(rng, 2, 1500))
        num_comments = int(score * rng.uniform(0.05, 0.25))
        author = rng.choice(REDDIT_AUTHORS)
        sub = rng.choice(UNATTRIBUTED_SUBREDDITS)
        mu, sigma = CLUSTER_SENTIMENT_BIAS[cluster]
        sentiment = round(_clamp(rng.gauss(mu, sigma), -1.0, 1.0), 3)
        conversations.append({
            "post_id":          post_id,
            "brand_id":         None,
            "brand_name_match": None,
            "subreddit":        sub,
            "title":            title,
            "posted_at":        posted.isoformat(timespec="seconds"),
            "author":           author,
            "score":            score,
            "num_comments":     num_comments,
            "sentiment":        sentiment,
            "topic_cluster":    cluster,
            "url":              f"https://reddit.com/{sub}/comments/{post_id}/",
        })

    # =====================================================================
    # 4. Topics + 90-day pageview observations
    # =====================================================================
    topics: list[dict[str, Any]] = []
    pageviews: dict[str, list[dict[str, Any]]] = {}

    # 4a. Brand-aligned topics
    for b in brands:
        slug = brand_topic_slug[b["brand_id"]]
        # baseline scales with wiki_pageviews_28d / 28
        baseline = max(50, int(b["wiki_pageviews_28d"] / 28))
        obs = _gen_pageview_series(rng, today, slug, "brand", baseline)
        pageviews[slug] = obs

        total_views = sum(o["views"] for o in obs)
        mean = total_views / len(obs) if obs else 0
        var = sum((o["views"] - mean) ** 2 for o in obs) / len(obs) if obs else 0
        stddev = math.sqrt(var)
        volatility = round((stddev / mean) if mean > 0 else 0.0, 4)

        # 28d vs prior 28d growth
        recent = sum(o["views"] for o in obs[-28:])
        prior  = sum(o["views"] for o in obs[-56:-28]) if len(obs) >= 56 else None
        growth = None
        if prior and prior > 0:
            growth = round((recent - prior) / prior * 100.0, 2)

        topics.append({
            "topic_id":             slug,
            "title":                b["brand_name"],
            "category":             "brand",
            "pageviews_28d":        recent,
            "pageviews_growth_pct": growth,
            "pageviews_volatility": volatility,
            "related_brands":       [b["brand_id"]],
        })

    # 4b. Culture/industry/event topics
    for (slug, title, category) in CULTURE_TOPICS_SEED:
        pattern = "event" if category == "event" else category
        baseline = rng.randint(800, 25_000)
        obs = _gen_pageview_series(rng, today, slug, pattern, baseline)
        pageviews[slug] = obs

        total_views = sum(o["views"] for o in obs)
        mean = total_views / len(obs) if obs else 0
        var = sum((o["views"] - mean) ** 2 for o in obs) / len(obs) if obs else 0
        stddev = math.sqrt(var)
        volatility = round((stddev / mean) if mean > 0 else 0.0, 4)

        recent = sum(o["views"] for o in obs[-28:])
        prior  = sum(o["views"] for o in obs[-56:-28]) if len(obs) >= 56 else None
        growth = None
        if prior and prior > 0:
            growth = round((recent - prior) / prior * 100.0, 2)

        # Loosely relate topics to a few brand ids (random handful)
        rb = rng.sample([b["brand_id"] for b in brands], k=rng.randint(1, 4))

        topics.append({
            "topic_id":             slug,
            "title":                title,
            "category":             category,
            "pageviews_28d":        recent,
            "pageviews_growth_pct": growth,
            "pageviews_volatility": volatility,
            "related_brands":       rb,
        })

    # =====================================================================
    # 5. Backfill attention_score / signal_bucket / share_of_voice
    # =====================================================================
    for b in brands:
        score = _attention_score(
            rng,
            yt_views_growth_pct=b["yt_subs_growth_28d_pct"] or 0.0,
            reddit_velocity=b["reddit_velocity_28d"] or 0.0,
            reddit_sentiment=b["reddit_avg_sentiment"],
            wiki_growth_pct=b["wiki_pageviews_growth_28d_pct"] or 0.0,
        )
        b["attention_score"] = round(score, 2)
        b["signal_bucket"]   = _bucket(score)
        # last signal change: 1-30 days ago
        b["last_signal_change"] = (today - dt.timedelta(days=rng.randint(1, 30))).isoformat()

    # Apply target distribution 20/25/35/20 (cold/warming/hot/breakout)
    brands.sort(key=lambda x: -x["attention_score"])
    n = len(brands)
    breakout_cut = int(n * 0.20)
    hot_cut      = int(n * 0.55)
    warming_cut  = int(n * 0.80)
    for i, b in enumerate(brands):
        if   i < breakout_cut: b["signal_bucket"] = "breakout"
        elif i < hot_cut:      b["signal_bucket"] = "hot"
        elif i < warming_cut:  b["signal_bucket"] = "warming"
        else:                  b["signal_bucket"] = "cold"

    # Share of voice within vertical — proportional to attention_score within group
    by_vertical: dict[str, list[dict[str, Any]]] = {}
    for b in brands:
        by_vertical.setdefault(b["vertical"], []).append(b)
    for v_list in by_vertical.values():
        total = sum(b["attention_score"] for b in v_list) or 1.0
        for b in v_list:
            b["share_of_voice"] = round(b["attention_score"] / total * 100.0, 2)

    # =====================================================================
    # 6. BrandDetail bundles for first 30 brands by attention_score
    # =====================================================================
    brands.sort(key=lambda x: -x["attention_score"])  # keep sort
    topics_by_brand_id: dict[str, list[dict[str, Any]]] = {}
    for t in topics:
        for bid in t["related_brands"]:
            topics_by_brand_id.setdefault(bid, []).append(t)

    brand_details: dict[str, dict[str, Any]] = {}
    for b in brands[:30]:
        bid = b["brand_id"]
        bvideos = videos_by_brand.get(bid, [])
        bconvs  = convs_by_brand.get(bid, [])
        top_video_title = bvideos[0]["title"] if bvideos else None
        # Top cluster across this brand's convs
        cluster_counts: dict[str, int] = {}
        for c in bconvs:
            cluster_counts[c["topic_cluster"]] = cluster_counts.get(c["topic_cluster"], 0) + 1
        top_cluster = max(cluster_counts, key=cluster_counts.get) if cluster_counts else None

        factors = _signal_factors(rng, b, top_video_title, top_cluster)
        summary_text = _ai_summary(b, b["reddit_top_subreddit"] or "r/marketing", b["vertical"] or "Retail")

        brand_topic_slug_for = brand_topic_slug[bid]
        pageviews_timeline = pageviews.get(brand_topic_slug_for, [])

        # Related topics: the brand's own topic + up to 3 from related_brands
        related_topics = topics_by_brand_id.get(bid, [])[:4]
        if not related_topics:
            # Fallback: at least include the brand topic itself
            own = [t for t in topics if t["topic_id"] == brand_topic_slug_for]
            related_topics = own[:1]

        detail = dict(b)  # BrandDetail extends Brand
        detail["videos"]              = bvideos[:15]
        detail["conversations"]       = bconvs[:15]
        detail["topics"]              = related_topics
        detail["signal_factors"]      = factors
        detail["ai_summary"]          = summary_text
        detail["pageviews_timeline"]  = pageviews_timeline

        brand_details[bid] = {"brand": detail}

    # =====================================================================
    # 7. TopicDetail bundles for top 15 topics by pageviews_28d
    # =====================================================================
    topics_sorted = sorted(topics, key=lambda t: -(t["pageviews_28d"] or 0))
    topic_details: dict[str, dict[str, Any]] = {}
    for t in topics_sorted[:15]:
        obs = pageviews.get(t["topic_id"], [])
        topic_details[t["topic_id"]] = {"topic": t, "observations": obs}

    # =====================================================================
    # 8. Iceberg / pipeline / summary
    # =====================================================================
    n_videos       = len(videos)
    n_conversations = len(conversations)
    n_topics       = len(topics)
    n_pageviews    = sum(len(v) for v in pageviews.values())

    iceberg = _iceberg_tables(rng, n_brands=len(brands),
                              n_videos=n_videos,
                              n_conversations=n_conversations,
                              n_topics=n_topics,
                              n_pageviews=n_pageviews,
                              today=today)
    pipeline = _pipeline_layers(rng, n_brands=len(brands),
                                n_videos=n_videos,
                                n_conversations=n_conversations,
                                n_pageviews=n_pageviews,
                                today=today)

    bronze_rows = sum(t["rows"] for t in iceberg if t["database"] == "bronze")
    silver_rows = sum(t["rows"] for t in iceberg if t["database"] == "silver")
    gold_rows   = sum(t["rows"] for t in iceberg if t["database"] == "gold")
    s3_bytes    = sum(t["bytes"] for t in iceberg)

    summary: dict[str, Any] = {
        "total_brands":                len(brands),
        "total_videos":                n_videos,
        "total_conversations":         n_conversations,
        "total_topics":                n_topics,
        "total_pageview_observations": n_pageviews,
        "bronze_rows":                 bronze_rows,
        "silver_rows":                 silver_rows,
        "gold_rows":                   gold_rows,
        "iceberg_table_count":         len(iceberg),
        "s3_bytes":                    s3_bytes,
        "last_sync_at":                today.isoformat(),
    }

    return {
        "summary":           summary,
        "brands":            brands,
        "videos":            videos,
        "conversations":     conversations,
        "topics":            topics,
        "pageviews":         pageviews,
        "iceberg_tables":    iceberg,
        "pipeline_layers":   pipeline,
        "brand_details":     brand_details,
        "topic_details":     topic_details,
    }
