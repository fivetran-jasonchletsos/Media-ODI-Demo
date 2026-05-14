// ============================================================
// Shared types — mirror the gold-layer dbt models on Athena/Iceberg.
//
//   gold.dim_brands               (the panel — brands Lighthouse measures)
//   gold.fct_videos               (YouTube content + performance)
//   gold.fct_conversations        (Reddit posts/comments + sentiment)
//   gold.fct_topic_pageviews      (Wikipedia interest trends)
//   gold.fct_brand_signal         (cross-source attention score)
// ============================================================

export interface SummaryStats {
  total_brands: number;
  total_videos: number;
  total_conversations: number;
  total_topics: number;
  total_pageview_observations: number;
  bronze_rows: number;
  silver_rows: number;
  gold_rows: number;
  iceberg_table_count: number;
  s3_bytes: number;
  last_sync_at: string | null;
  generated_at?: string;
  source?: 'live' | 'demo';
}

export type Vertical =
  | 'CPG'
  | 'Retail'
  | 'Auto'
  | 'Tech'
  | 'Finance'
  | 'Streaming'
  | 'QSR'
  | 'Beauty'
  | 'Fashion'
  | 'Travel'
  | 'Gaming'
  | 'Entertainment';

export type SignalBucket = 'cold' | 'warming' | 'hot' | 'breakout';

export interface Brand {
  brand_id: string;
  brand_handle: string;          // canonical mono handle — e.g. @nike
  brand_name: string;
  vertical: Vertical | null;
  hq_country: string | null;
  established_year: number | null;
  description: string | null;

  // YouTube
  yt_channel_id: string | null;
  yt_subscribers: number | null;
  yt_views_total: number | null;
  yt_videos_count: number | null;
  yt_views_28d: number | null;
  yt_subs_growth_28d_pct: number | null;

  // Reddit
  reddit_mentions_28d: number;
  reddit_avg_sentiment: number;     // -1 to +1
  reddit_top_subreddit: string | null;
  reddit_velocity_28d: number;      // mentions growth rate

  // Wikipedia
  wiki_pageviews_28d: number;
  wiki_pageviews_growth_28d_pct: number | null;

  // Cross-source signal (gold)
  attention_score: number;          // 0-100
  signal_bucket: SignalBucket;
  share_of_voice: number;           // 0-100 within vertical
  last_signal_change: string | null;
}

export interface BrandsResponse {
  count: number;
  results: Brand[];
}

export interface Video {
  video_id: string;
  brand_id: string;
  channel_id: string;
  title: string;
  published_at: string;
  duration_sec: number;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number;          // (likes + comments) / views
  category: string | null;
  thumbnail_url: string | null;
}

export interface VideosResponse {
  brand_id?: string;
  videos: Video[];
}

export interface Conversation {
  post_id: string;
  brand_id: string | null;
  brand_name_match: string | null;
  subreddit: string;
  title: string;
  posted_at: string;
  author: string;
  score: number;
  num_comments: number;
  sentiment: number;                // -1 to +1
  topic_cluster: string | null;     // gold-layer derived
  url: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
  summary?: {
    total: number;
    by_subreddit: Record<string, number>;
    by_topic: Record<string, number>;
    avg_sentiment: number;
  };
}

export interface Topic {
  topic_id: string;                 // wiki article slug
  title: string;
  category: 'brand' | 'industry' | 'culture' | 'event' | 'person';
  pageviews_28d: number;
  pageviews_growth_pct: number | null;
  pageviews_volatility: number;
  related_brands: string[];         // brand_ids that this topic touches
}

export interface TopicsResponse {
  topics: Topic[];
}

export interface PageviewObservation {
  topic_id: string;
  date: string;
  views: number;
}

export interface TopicDetail {
  topic: Topic;
  observations: PageviewObservation[];
}

export interface BrandDetail extends Brand {
  videos: Video[];
  conversations: Conversation[];
  topics: Topic[];                       // related topic pageviews
  signal_factors: string[];              // AI-summarized drivers
  ai_summary: string | null;             // gold-layer pre-computed
  pageviews_timeline: PageviewObservation[]; // last 90 days for the brand topic
}

export interface VerticalRollup {
  vertical: Vertical;
  brand_count: number;
  total_videos: number;
  total_conversations: number;
  avg_attention_score: number;
  top_topic_id: string | null;
}

// ============================================================
// ODI architecture metadata
// ============================================================

export interface IcebergTable {
  database: 'bronze' | 'silver' | 'gold';
  table: string;
  rows: number;
  bytes: number;
  partitions: string[];
  source_system: 'youtube' | 'reddit' | 'wikipedia' | 'derived';
  last_updated_at: string;
  schema_columns: number;
}

export interface QueryEngine {
  name: 'Athena' | 'DuckDB' | 'Trino' | 'Spark' | 'Snowflake';
  status: 'active' | 'available' | 'demo';
  description: string;
  sample_query: string;
}

export interface PipelineLayerStats {
  layer: 'connector' | 'bronze' | 'silver' | 'gold';
  rows_in: number;
  rows_out: number;
  tables: number;
  last_run: string;
  status: 'ok' | 'running' | 'failed';
}
