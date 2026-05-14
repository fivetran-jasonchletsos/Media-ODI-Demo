# Media-ODI-Demo · Lighthouse Media

End-to-end demonstration of **Fivetran's Open Data Infrastructure (ODI)** in
a media / advertising setting. Lighthouse Media is a fictional cross-channel
audience-intelligence platform modeled after Horizon Media + Nielsen + Resy
data-product DNA. The data flows are real public APIs.

Why media/ad-tech is the canonical ODI sweet spot: agencies and measurement
firms have to consolidate **wildly different shapes** of data — content
catalogs, real-time social signal, search/interest trends, paid-platform
spend, CRM, identity — and the warehouse-centric model creaks under it.
Open Iceberg + multi-engine compute is the architecture they actually need.

```
   ┌────────────────────────────────────────────────────────────┐
   │  Three public APIs                                         │
   │  YouTube Data API · Reddit · Wikipedia Pageviews            │
   └────────────────────────────┬───────────────────────────────┘
                                │  3 Fivetran custom connectors (SDK)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  AWS S3 — Apache Iceberg tables in 3 schemas               │
   │    bronze_youtube.{channels, videos}                        │
   │    bronze_reddit.{posts, subreddits}                        │
   │    bronze_wikipedia.{topics, pageviews}                     │
   │  Registered in AWS Glue Data Catalog                        │
   └────────────────────────────┬───────────────────────────────┘
                                │  dbt (silver = view, gold = Iceberg)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Silver — staging + intermediate conformed models           │
   │  Gold   — marts + dbt semantic layer (7 metrics)            │
   │    dim_brands · fct_videos · fct_conversations              │
   │    fct_topic_pageviews · fct_brand_signal · mart_vertical   │
   └────────────────────────────┬───────────────────────────────┘
                                │  AWS Athena (engine-of-choice)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  build_snapshot.py — extracts gold layer to JSON            │
   └────────────────────────────┬───────────────────────────────┘
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  React + Vite SPA on GitHub Pages                           │
   │  Brands · Brand Detail · Trends · Conversations ·           │
   │  Research AI · ODI Architecture · Pipeline                  │
   └────────────────────────────────────────────────────────────┘
```

## Quick demo (synthetic only, ~30 seconds)

No API keys, no AWS, no Fivetran. The snapshot JSONs are pre-built and
checked in under `lighthouse-app/frontend/public/data/`.

```bash
cd lighthouse-app/frontend
npm ci
npm run dev    # http://localhost:5173
```

## Layout

| Path | What lives there |
|---|---|
| `connectors/` | Three Fivetran Connector SDK projects (YouTube, Reddit, Wikipedia) |
| `infra/` | Terraform — S3 lake, Glue catalog, IAM, Athena workgroup |
| `transform/` | dbt project `media_odi` — bronze sources, silver, gold + semantic layer |
| `lighthouse-app/frontend/` | React + Vite + Tailwind v4 SPA |
| `lighthouse-app/scripts/` | `build_snapshot.py`, `_synthetic.py` |
| `.github/workflows/` | `deploy.yml` (Pages), `dbt_run.yml` (post-Fivetran-sync) |

## Frontend pages

- `/` — ODI three-pillar hero + attention-snapshot KPI panel
- `/brands` — Brand panel, search/filter, sortable cross-platform signals
- `/brands/:brand_id` — YouTube performance, Reddit conversations, Wikipedia timeline, AI summary
- `/trends` — Wikipedia pageview series with topic picker
- `/conversations` — Reddit topic radar with cross-filter
- `/agent` — Research AI (rules + Claude opt-in)
- `/architecture` — **The ODI page** — interactive lineage, multi-engine query showcase, MDS-vs-ODI compare
- `/pipeline` — 4-layer status with failure simulator
- `/watchlist` — Saved brands
- `/about` — Reference architecture + tech stack

## Generating the snapshot

```bash
cd lighthouse-app
python scripts/build_snapshot.py
```

With AWS credentials in the environment (`AWS_REGION`, `LAKE_BUCKET`,
`ATHENA_WORKGROUP`), the same script queries the Athena gold layer directly.

## AWS deployment

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Fill in fivetran_external_id + dbt_iam_user_arn
terraform init
terraform plan
terraform apply
```

Provisions ~$5-15/mo: S3 lake (versioned, encrypted), 4 Glue catalog
databases (lighthouse_odi + bronze/silver/gold), Athena workgroup
(engine v3, SSE_S3), two IAM roles.

## Data sources

| Source | Tables | Coverage |
|---|---|---|
| YouTube Data API v3 | `channels`, `videos` | 30 seeded channels, last 50 videos each, daily incremental |
| Reddit API | `posts`, `subreddits` | 13 seeded subreddits, top + new posts, 200/sync per sub |
| Wikipedia Pageviews | `topics`, `pageviews` | ~40 seeded topic articles, last 60 days + daily incremental |

All three are **public APIs** — YouTube + Reddit free with key, Wikipedia free no key.

## ODI value props the site illustrates

| Pillar | Where in the site |
|---|---|
| **Open storage** | `/architecture` — every table registered in Glue, queryable as Iceberg |
| **Multi-engine** | `/architecture` — five engines + sample SQL each, same tables |
| **Reusable semantics** | `transform/metrics/media_metrics.yml` — 7 metrics defined once |
| **AI-ready** | `/agent` — Claude reads gold-layer parquet directly, no warehouse hop |
| **No lock-in** | `/architecture` — MDS vs ODI side-by-side; Snowflake shown as one option, not the path |

## License

Demonstration code. Synthetic data unless connected to live AWS resources.
