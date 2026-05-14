{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['signal_bucket']
) }}

-- Headline cross-source brand attention model. One row per brand_id.
-- Score is 0-100, blended from four components each normalized 0-25:
--
--   1. YouTube views_28d growth (30%)   -> yt_score, max 30
--   2. Reddit mention velocity +
--      |avg sentiment| magnitude (30%)  -> reddit_score, max 30
--   3. Wikipedia 28-day pageviews
--      growth (25%)                     -> wiki_score, max 25
--   4. Share of voice within vertical
--      (15%)                            -> sov_score, max 15
--
-- Target bucket distribution (out of ~60-100 brands):
--   breakout (>= 75)   ~20
--   hot      (>= 55)   ~25
--   warming  (>= 35)   ~35
--   cold     (<  35)   ~20

with seed as (

    select brand_id, brand_name, vertical
    from {{ ref('brand_to_channel_seed') }}

),

-- YouTube views_28d / views_prior_28d growth per brand
yt_growth as (

    select
        bm.brand_id,
        sum(case
            when v.published_at >= date_add('day', -28, current_date)
                then coalesce(v.views, 0)
            else 0
        end)                                                            as yt_views_28d,
        sum(case
            when v.published_at >= date_add('day', -56, current_date)
             and v.published_at <  date_add('day', -28, current_date)
                then coalesce(v.views, 0)
            else 0
        end)                                                            as yt_views_prior_28d
    from {{ ref('stg_yt__videos') }} v
    inner join {{ ref('int_brand_channel_map') }} bm
        on v.channel_id = bm.channel_id
    group by 1

),

yt_score as (

    select
        s.brand_id,
        coalesce(g.yt_views_28d, 0)                                     as yt_views_28d,
        coalesce(g.yt_views_prior_28d, 0)                               as yt_views_prior_28d,
        cast(
            least(
                30.0,
                greatest(
                    0.0,
                    case
                        when coalesce(g.yt_views_prior_28d, 0) > 0
                            then 30.0 * least(
                                1.5,
                                greatest(
                                    -0.5,
                                    cast(g.yt_views_28d as double)
                                        / cast(g.yt_views_prior_28d as double) - 1.0
                                )
                            ) / 1.5
                        when coalesce(g.yt_views_28d, 0) > 0
                            then 15.0
                        else 0.0
                    end
                )
            )
        as double)                                                      as yt_score
    from seed s
    left join yt_growth g
        on s.brand_id = g.brand_id

),

reddit_recent as (

    select
        brand_id,
        count(*)                                                        as mentions_28d,
        avg(sentiment)                                                  as avg_sentiment
    from {{ ref('fct_conversations') }}
    where brand_id is not null
      and posted_at >= date_add('day', -28, current_date)
    group by 1

),

reddit_prior as (

    select
        brand_id,
        count(*)                                                        as mentions_prior_28d
    from {{ ref('fct_conversations') }}
    where brand_id is not null
      and posted_at >= date_add('day', -56, current_date)
      and posted_at <  date_add('day', -28, current_date)
    group by 1

),

reddit_pop_stats as (

    select
        approx_percentile(mentions_28d, 0.95)                           as p95_mentions
    from reddit_recent

),

reddit_score as (

    select
        s.brand_id,
        coalesce(rr.mentions_28d, 0)                                    as reddit_mentions_28d,
        coalesce(rr.avg_sentiment, 0.0)                                 as reddit_avg_sentiment,
        case
            when coalesce(rp.mentions_prior_28d, 0) > 0
                then cast(coalesce(rr.mentions_28d, 0) as double)
                     / cast(rp.mentions_prior_28d as double) - 1.0
            when coalesce(rr.mentions_28d, 0) > 0 then 1.0
            else 0.0
        end                                                             as reddit_velocity_28d,
        -- Up to 20 of the 30 points scale by velocity vs. p95 mentions
        -- in the population, the remaining 10 by |avg_sentiment|.
        cast(
            least(
                30.0,
                greatest(
                    0.0,
                    20.0 * case
                        when ps.p95_mentions is null or ps.p95_mentions = 0 then 0.0
                        else least(
                            1.0,
                            cast(coalesce(rr.mentions_28d, 0) as double)
                                / cast(ps.p95_mentions as double)
                        )
                    end
                    + 10.0 * abs(coalesce(rr.avg_sentiment, 0.0))
                )
            )
        as double)                                                      as reddit_score
    from seed s
    left join reddit_recent rr
        on s.brand_id = rr.brand_id
    left join reddit_prior rp
        on s.brand_id = rp.brand_id
    cross join reddit_pop_stats ps

),

wiki_latest as (

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
        avg(wl.pageviews_growth_pct)                                    as wiki_growth,
        sum(wl.pageviews_28d)                                           as wiki_pageviews_28d
    from {{ ref('int_brand_topics') }} bt
    inner join wiki_latest wl
        on bt.topic_id = wl.topic_id
       and wl.rk = 1
    group by 1

),

wiki_score as (

    select
        s.brand_id,
        coalesce(w.wiki_pageviews_28d, 0)                               as wiki_pageviews_28d,
        w.wiki_growth                                                   as wiki_growth,
        cast(
            least(
                25.0,
                greatest(
                    0.0,
                    25.0 * least(
                        1.0,
                        greatest(
                            -0.5,
                            coalesce(w.wiki_growth, 0.0)
                        )
                    ) / 1.0
                )
            )
        as double)                                                      as wiki_score
    from seed s
    left join wiki_per_brand w
        on s.brand_id = w.brand_id

),

-- Share of voice = brand's Reddit mention share within its vertical.
sov as (

    select
        s.brand_id,
        s.vertical,
        coalesce(rr.mentions_28d, 0)                                    as mentions_28d
    from seed s
    left join reddit_recent rr
        on s.brand_id = rr.brand_id

),

vertical_totals as (

    select
        vertical,
        sum(mentions_28d)                                               as vertical_mentions
    from sov
    group by 1

),

sov_score as (

    select
        s.brand_id,
        case
            when vt.vertical_mentions > 0
                then cast(s.mentions_28d as double)
                     / cast(vt.vertical_mentions as double)
            else 0.0
        end                                                             as share_of_voice_raw,
        cast(
            least(
                15.0,
                greatest(
                    0.0,
                    15.0 * case
                        when vt.vertical_mentions > 0
                            then cast(s.mentions_28d as double)
                                 / cast(vt.vertical_mentions as double)
                        else 0.0
                    end
                )
            )
        as double)                                                      as sov_score
    from sov s
    left join vertical_totals vt
        on s.vertical = vt.vertical

),

assembled as (

    select
        s.brand_id,
        s.brand_name,
        s.vertical,
        ys.yt_score,
        rs.reddit_score,
        ws.wiki_score,
        ss.sov_score,
        ss.share_of_voice_raw,
        ys.yt_views_28d,
        rs.reddit_mentions_28d,
        rs.reddit_avg_sentiment,
        rs.reddit_velocity_28d,
        ws.wiki_pageviews_28d,
        ws.wiki_growth,
        ys.yt_score + rs.reddit_score + ws.wiki_score + ss.sov_score    as attention_score_raw
    from seed s
    left join yt_score     ys on s.brand_id = ys.brand_id
    left join reddit_score rs on s.brand_id = rs.brand_id
    left join wiki_score   ws on s.brand_id = ws.brand_id
    left join sov_score    ss on s.brand_id = ss.brand_id

),

final as (

    select
        brand_id,
        brand_name,
        vertical,
        yt_score,
        reddit_score,
        wiki_score,
        sov_score,
        cast(
            least(100.0, greatest(0.0, attention_score_raw))
        as double)                                                      as attention_score,
        case
            when attention_score_raw >= 75 then 'breakout'
            when attention_score_raw >= 55 then 'hot'
            when attention_score_raw >= 35 then 'warming'
            else 'cold'
        end                                                             as signal_bucket,
        cast(100.0 * share_of_voice_raw as double)                      as share_of_voice,
        yt_views_28d,
        reddit_mentions_28d,
        reddit_avg_sentiment,
        reddit_velocity_28d,
        wiki_pageviews_28d,
        wiki_growth                                                     as wiki_pageviews_growth_28d_pct,
        cast(current_timestamp as varchar)                              as last_signal_change,
        current_timestamp                                               as built_at
    from assembled

)

select * from final
