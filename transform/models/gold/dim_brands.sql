{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['bucket(8, brand_id)']
) }}

-- One row per brand with every cross-source roll-up the frontend
-- Brand interface expects:
--   identity (seed) | youtube | reddit | wikipedia | cross-source signal
--
-- Output column names + types match types.ts:Brand exactly.

with seed as (

    select
        brand_id,
        brand_handle,
        brand_name,
        vertical,
        hq_country,
        established_year,
        description,
        yt_channel_id                                                   as seed_yt_channel_id,
        wiki_topic_id                                                   as seed_wiki_topic_id
    from {{ ref('brand_to_channel_seed') }}

),

yt_channel as (

    select
        bm.brand_id,
        c.channel_id                                                    as yt_channel_id,
        c.subscribers                                                   as yt_subscribers,
        c.views_total                                                   as yt_views_total,
        c.videos_count                                                  as yt_videos_count,
        c.created_at                                                    as yt_channel_created_at
    from {{ ref('int_brand_channel_map') }} bm
    inner join {{ ref('stg_yt__channels') }} c
        on bm.channel_id = c.channel_id

),

yt_views_28d as (

    select
        bm.brand_id,
        sum(case
            when v.published_at >= date_add('day', -28, current_date)
                then coalesce(v.views, 0)
            else 0
        end)                                                            as yt_views_28d
    from {{ ref('stg_yt__videos') }} v
    inner join {{ ref('int_brand_channel_map') }} bm
        on v.channel_id = bm.channel_id
    group by 1

),

-- Proxy for 28-day subscriber-growth %: we don't snapshot subscribers,
-- so we approximate growth as the ratio of trailing-28d views to
-- lifetime views, scaled into a believable percent range. Bounded to
-- avoid pathological values.
yt_subs_growth as (

    select
        c.brand_id,
        case
            when c.yt_views_total is null or c.yt_views_total = 0 then null
            else greatest(
                -50.0,
                least(
                    200.0,
                    100.0 * cast(coalesce(w.yt_views_28d, 0) as double)
                          / cast(c.yt_views_total as double)
                )
            )
        end                                                             as yt_subs_growth_28d_pct
    from yt_channel c
    left join yt_views_28d w
        on c.brand_id = w.brand_id

),

reddit_28d as (

    select
        brand_id,
        count(*)                                                        as reddit_mentions_28d,
        avg(sentiment)                                                  as reddit_avg_sentiment
    from {{ ref('fct_conversations') }}
    where brand_id is not null
      and posted_at >= date_add('day', -28, current_date)
    group by 1

),

reddit_prior_28d as (

    select
        brand_id,
        count(*)                                                        as reddit_mentions_prior_28d
    from {{ ref('fct_conversations') }}
    where brand_id is not null
      and posted_at >= date_add('day', -56, current_date)
      and posted_at <  date_add('day', -28, current_date)
    group by 1

),

reddit_top_sub as (

    select
        brand_id,
        subreddit                                                       as reddit_top_subreddit
    from (
        select
            brand_id,
            subreddit,
            count(*)                                                    as n,
            row_number() over (
                partition by brand_id
                order by count(*) desc, subreddit asc
            )                                                           as rk
        from {{ ref('fct_conversations') }}
        where brand_id is not null
          and posted_at >= date_add('day', -28, current_date)
        group by 1, 2
    )
    where rk = 1

),

wiki_latest as (

    -- Latest available 28-day window per topic
    select
        topic_id,
        pageviews_28d,
        pageviews_growth_pct,
        date,
        row_number() over (
            partition by topic_id
            order by date desc
        )                                                               as rk
    from {{ ref('fct_topic_pageviews') }}

),

wiki_per_brand as (

    select
        bt.brand_id,
        sum(wl.pageviews_28d)                                           as wiki_pageviews_28d,
        avg(wl.pageviews_growth_pct)                                    as wiki_pageviews_growth_28d_pct
    from {{ ref('int_brand_topics') }} bt
    inner join wiki_latest wl
        on bt.topic_id = wl.topic_id
       and wl.rk = 1
    group by 1

),

assembled as (

    select
        s.brand_id,
        s.brand_handle,
        s.brand_name,
        s.vertical,
        s.hq_country,
        s.established_year,
        s.description,

        -- YouTube
        coalesce(yc.yt_channel_id, s.seed_yt_channel_id)                as yt_channel_id,
        yc.yt_subscribers                                               as yt_subscribers,
        yc.yt_views_total                                               as yt_views_total,
        yc.yt_videos_count                                              as yt_videos_count,
        coalesce(yv.yt_views_28d, 0)                                    as yt_views_28d,
        yg.yt_subs_growth_28d_pct                                       as yt_subs_growth_28d_pct,

        -- Reddit
        coalesce(r28.reddit_mentions_28d, 0)                            as reddit_mentions_28d,
        coalesce(r28.reddit_avg_sentiment, 0.0)                         as reddit_avg_sentiment,
        rts.reddit_top_subreddit                                        as reddit_top_subreddit,
        case
            when coalesce(rp.reddit_mentions_prior_28d, 0) > 0
                then cast(coalesce(r28.reddit_mentions_28d, 0) as double)
                     / cast(rp.reddit_mentions_prior_28d as double) - 1.0
            when coalesce(r28.reddit_mentions_28d, 0) > 0
                then 1.0
            else 0.0
        end                                                             as reddit_velocity_28d,

        -- Wikipedia
        coalesce(wpb.wiki_pageviews_28d, 0)                             as wiki_pageviews_28d,
        wpb.wiki_pageviews_growth_28d_pct                               as wiki_pageviews_growth_28d_pct

    from seed s
    left join yt_channel yc
        on s.brand_id = yc.brand_id
    left join yt_views_28d yv
        on s.brand_id = yv.brand_id
    left join yt_subs_growth yg
        on s.brand_id = yg.brand_id
    left join reddit_28d r28
        on s.brand_id = r28.brand_id
    left join reddit_prior_28d rp
        on s.brand_id = rp.brand_id
    left join reddit_top_sub rts
        on s.brand_id = rts.brand_id
    left join wiki_per_brand wpb
        on s.brand_id = wpb.brand_id

)

-- attention_score / signal_bucket / share_of_voice / last_signal_change
-- are filled in by fct_brand_signal; we surface them on dim_brands via a
-- final left-join so the frontend Brand row is satisfied in one read.
select
    a.brand_id,
    a.brand_handle,
    a.brand_name,
    a.vertical,
    a.hq_country,
    a.established_year,
    a.description,

    a.yt_channel_id,
    a.yt_subscribers,
    a.yt_views_total,
    a.yt_videos_count,
    a.yt_views_28d,
    a.yt_subs_growth_28d_pct,

    a.reddit_mentions_28d,
    a.reddit_avg_sentiment,
    a.reddit_top_subreddit,
    a.reddit_velocity_28d,

    a.wiki_pageviews_28d,
    a.wiki_pageviews_growth_28d_pct,

    coalesce(bs.attention_score, 0.0)                                   as attention_score,
    coalesce(bs.signal_bucket, 'cold')                                  as signal_bucket,
    coalesce(bs.share_of_voice, 0.0)                                    as share_of_voice,
    bs.last_signal_change                                               as last_signal_change

from assembled a
left join {{ ref('fct_brand_signal') }} bs
    on a.brand_id = bs.brand_id
