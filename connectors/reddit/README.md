# Reddit Connector

Fivetran Connector SDK pipeline that pulls subreddit metadata and recent
posts via the Reddit OAuth API for the Media-ODI-Demo.

## What it syncs

| Table         | PK           | Source endpoint |
|---------------|--------------|-----------------|
| `subreddits`  | `subreddit`  | `/r/<sr>/about` |
| `posts`       | `post_id`    | `/r/<sr>/new` (incremental) / `/r/<sr>/top?t=week` (backfill) |

Default seed: marketing, advertising, branding, television, boxoffice,
movies, Music, books, boardgames, gaming, cars, sneakers, malefashionadvice.

## Configuration

Create a Reddit "script" app at <https://www.reddit.com/prefs/apps>; the
connector uses OAuth2 `client_credentials`.

`configuration.json` (gitignored):

```json
{
  "client_id": "REPLACE_WITH_REDDIT_CLIENT_ID",
  "client_secret": "REPLACE_WITH_REDDIT_CLIENT_SECRET",
  "user_agent": "lighthouse-media-odi/1.0 by lighthouse-demo",
  "subreddits_seed": "marketing,advertising,branding,television,boxoffice,movies,Music,books,boardgames,gaming,cars,sneakers,malefashionadvice"
}
```

## Run locally

```bash
pip install -r requirements.txt
python connector.py
```

## Incremental state

`state['last_post_id'][subreddit]` stores the most recent Reddit fullname
(`t3_xxxxxx`) emitted. Subsequent syncs use that as the `before` cursor on
`/new`. First sync uses `/top?t=week` for backfill.

## Rate limits

OAuth API allows 60 req/min — connector sleeps 1.1s between requests and
caps each subreddit at 200 new posts per sync.

## ODI angle

Lands as `raw_reddit.posts` and `raw_reddit.subreddits` Iceberg tables in
the S3 managed lake; joins to YouTube video metadata and Wikipedia
pageviews for cross-platform narrative-attention modeling.
