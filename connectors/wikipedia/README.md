# Wikipedia Connector

Fivetran Connector SDK pipeline that pulls daily pageviews and article
summaries for a curated brand/topic list for the Media-ODI-Demo.

## What it syncs

| Table         | PK                 | Source endpoint |
|---------------|--------------------|-----------------|
| `topics`      | `topic`            | `en.wikipedia.org/api/rest_v1/page/summary` |
| `pageviews`   | (`topic`, `date`)  | `wikimedia.org/api/rest_v1/metrics/pageviews/per-article` |

Default seed: ~40 globally recognized brand/topic Wikipedia article slugs
(Nike, Apple_Inc., Tesla,_Inc., Netflix, Spotify, …).

## Configuration

No auth required — Wikimedia just asks for a descriptive `User-Agent`
including a contact address.

`configuration.json` (gitignored):

```json
{
  "user_agent": "lighthouse-media-odi/1.0 (research@lighthouse-demo.com)",
  "topics_seed": "Nike,Apple_Inc.,Tesla,_Inc.,Netflix,Spotify"
}
```

## Run locally

```bash
pip install -r requirements.txt
python connector.py
```

## Incremental state

`state['last_pageview_date'][topic]` holds the most recent date (YYYY-MM-DD)
emitted per topic. Initial sync backfills 60 days; subsequent syncs start
the day after `last_pageview_date`.

## Rate limits

Polite client — 1 req/sec, plus single retry honoring `Retry-After` on 429.

## ODI angle

Lands as `raw_wikipedia.topics` and `raw_wikipedia.pageviews` Iceberg
tables in the S3 managed lake; joined against Reddit chatter and YouTube
views for cross-platform attention modeling.
