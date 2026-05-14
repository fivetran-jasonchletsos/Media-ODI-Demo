{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['year(date)', 'bucket(8, topic_id)']
) }}

-- Per-topic pageview observations enriched with growth + volatility,
-- plus the related_brands array (so the gold row matches the frontend
-- Topic type for the most-recent observation per topic).
--
-- Frontend Topic shape:
--   topic_id, title, category, pageviews_28d, pageviews_growth_pct,
--   pageviews_volatility, related_brands
--
-- We emit one row per (topic_id, date) so the demo can render both the
-- summary card (latest row) and the time series. Volatility =
-- stddev / mean of daily views over the trailing 28 days.

with topics as (

    select
        topic_id,
        title,
        category
    from {{ ref('stg_wiki__topics') }}

),

growth as (

    select
        topic_id,
        date,
        views,
        views_28d,
        views_28d_growth_pct,
        views_28d_volatility
    from {{ ref('int_pageviews_growth') }}

),

related as (

    select
        topic_id,
        array_agg(distinct brand_id)                                    as related_brands
    from {{ ref('int_brand_topics') }}
    group by 1

),

joined as (

    select
        g.topic_id,
        t.title,
        t.category,
        g.date,
        cast(g.views as bigint)                                         as views,
        cast(coalesce(g.views_28d, 0) as bigint)                        as pageviews_28d,
        g.views_28d_growth_pct                                          as pageviews_growth_pct,
        coalesce(g.views_28d_volatility, 0.0)                           as pageviews_volatility,
        coalesce(r.related_brands, array[])                             as related_brands
    from growth g
    inner join topics t
        on g.topic_id = t.topic_id
    left join related r
        on g.topic_id = r.topic_id

)

select * from joined
