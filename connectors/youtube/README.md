# YouTube Connector

Fivetran Connector SDK pipeline that pulls channel-level stats and recent
video metadata from the YouTube Data API v3 for the Media-ODI-Demo.

## What it syncs

| Table       | PK            | Source endpoint |
|-------------|---------------|-----------------|
| `channels`  | `channel_id`  | `/youtube/v3/channels` |
| `videos`    | `video_id`    | `/youtube/v3/playlistItems` + `/youtube/v3/videos` |

Default seed: ~30 well-known channel IDs spanning brands, news, tech and
entertainment.

## Configuration

Requires a free YouTube Data API v3 key — enable at
<https://console.cloud.google.com/apis/library/youtube.googleapis.com>.

`configuration.json` (gitignored):

```json
{
  "api_key": "REPLACE_WITH_YOUTUBE_DATA_API_V3_KEY",
  "channel_ids_seed": "UCBJycsmduvYEL83R_U4JriQ,UCJ5v_MCY6GNUBTO8-D3XoAg"
}
```

## Run locally

```bash
pip install -r requirements.txt
python connector.py
```

## Incremental state

`state['last_video_published_at'][channel_id]` holds the latest video
`publishedAt` timestamp emitted per channel. New syncs skip the playlist
once they cross that boundary. Initial sync pulls up to 50 most-recent
videos per channel.

## Quota

Roughly 5 quota units per channel per sync (channels.list + playlistItems
+ videos.list batch). 30 channels × daily ≈ 150 units, well inside the
free 10,000 unit/day cap.

## ODI angle

Lands as `raw_youtube.channels` and `raw_youtube.videos` Iceberg tables in
the S3 managed lake. dbt joins against Reddit chatter and Wikipedia
pageviews for cross-channel attention analysis.
