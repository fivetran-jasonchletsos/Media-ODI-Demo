# Connectors — Media-ODI-Demo

Three custom Fivetran Connector SDK pipelines feeding the Lighthouse Media
Open Data Infrastructure (ODI) demo. Each lands raw records in the S3
managed lake as Iceberg tables; Athena and dbt consume them downstream.

| Directory      | Source                              | Auth          | Headline tables           | Incremental key |
|----------------|-------------------------------------|---------------|---------------------------|-----------------|
| `youtube/`     | YouTube Data API v3                 | API key       | channels, videos          | `last_video_published_at[channel_id]` |
| `reddit/`      | Reddit OAuth API                    | OAuth2 script | subreddits, posts         | `last_post_id[subreddit]` |
| `wikipedia/`   | Wikimedia Pageviews + Page Summary  | none (UA)     | topics, pageviews         | `last_pageview_date[topic]` |

Each connector follows the same shape as the FinServ-ODI-Demo connectors:

- `schema(configuration)` returning table specs
- `update(configuration, state)` yielding `op.upsert(...)` and `op.checkpoint(...)`
- `connector = Connector(update=update, schema=schema)` at module scope
- `connector.debug()` under `if __name__ == "__main__":`

## Running locally

```bash
cd connectors/youtube           # (or reddit / wikipedia)
cp configuration.example.json configuration.json
# edit configuration.json with your credentials
pip install -r requirements.txt
python connector.py             # invokes connector.debug()
```

The Fivetran SDK debug runner writes a local `warehouse.db` so you can
inspect emitted records before deploying.

## Deploying to Fivetran

The Fivetran CLI is bundled with `fivetran-connector-sdk`. From each
connector directory:

```bash
fivetran deploy \
  --api-key       "$FIVETRAN_API_KEY" \
  --destination   "$FIVETRAN_DESTINATION_NAME" \
  --connection    youtube_lighthouse \
  --configuration configuration.json
```

Repeat per directory (changing `--connection`) for `reddit` and
`wikipedia`. The destination should be the S3 Iceberg managed-lake
destination provisioned for the demo so tables land directly in the
open-format lake.

## ODI mapping

| Connector  | Iceberg schema     | Athena consumer queries / dbt models                           |
|------------|--------------------|----------------------------------------------------------------|
| youtube    | `raw_youtube`      | `dim_channels`, `fct_videos`, `fct_video_velocity`            |
| reddit     | `raw_reddit`       | `dim_subreddits`, `fct_posts`, `fct_topic_chatter`            |
| wikipedia  | `raw_wikipedia`    | `dim_topics`, `fct_pageviews`, `fct_attention_coherence`      |

## Conventions

- HTTP timeout 30s, single retry on HTTP 429 (honoring `Retry-After` where
  available)
- Snake_case table and column names; no `_iceberg` suffix (the destination
  handles the open table format)
- `configuration.json` is gitignored at every connector — commit only
  `configuration.example.json`
- Each `connector.py` stays under 250 lines and is self-contained
- Periodic `op.checkpoint(state)` every ~500 records
