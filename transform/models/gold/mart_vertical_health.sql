{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['vertical']
) }}

-- Vertical roll-up mirroring the frontend VerticalRollup type:
--   vertical, brand_count, total_videos, total_conversations,
--   avg_attention_score, top_topic_id

with seed as (

    select brand_id, vertical
    from {{ ref('brand_to_channel_seed') }}

),

brand_signal as (

    select brand_id, attention_score
    from {{ ref('fct_brand_signal') }}

),

video_counts as (

    select
        bm.brand_id,
        count(*)                                                        as video_count
    from {{ ref('fct_videos') }} v
    inner join {{ ref('int_brand_channel_map') }} bm
        on v.channel_id = bm.channel_id
    group by 1

),

conversation_counts as (

    select
        brand_id,
        count(*)                                                        as conversation_count
    from {{ ref('fct_conversations') }}
    where brand_id is not null
    group by 1

),

base as (

    select
        s.vertical,
        s.brand_id,
        coalesce(bs.attention_score, 0.0)                               as attention_score,
        coalesce(vc.video_count, 0)                                     as video_count,
        coalesce(cc.conversation_count, 0)                              as conversation_count
    from seed s
    left join brand_signal bs        on s.brand_id = bs.brand_id
    left join video_counts vc        on s.brand_id = vc.brand_id
    left join conversation_counts cc on s.brand_id = cc.brand_id

),

vertical_rollup as (

    select
        vertical,
        cast(count(distinct brand_id) as bigint)                        as brand_count,
        cast(sum(video_count) as bigint)                                as total_videos,
        cast(sum(conversation_count) as bigint)                         as total_conversations,
        avg(attention_score)                                            as avg_attention_score
    from base
    group by 1

),

-- Top topic per vertical = topic with the highest 28-day pageviews
-- summed across brands in that vertical.
topic_per_vertical as (

    select
        s.vertical,
        bt.topic_id,
        sum(tp.pageviews_28d)                                           as views,
        row_number() over (
            partition by s.vertical
            order by sum(tp.pageviews_28d) desc, bt.topic_id asc
        )                                                               as rk
    from seed s
    inner join {{ ref('int_brand_topics') }} bt
        on s.brand_id = bt.brand_id
    inner join (
        select
            topic_id,
            pageviews_28d,
            row_number() over (
                partition by topic_id
                order by date desc
            )                                                           as rkd
        from {{ ref('fct_topic_pageviews') }}
    ) tp
        on bt.topic_id = tp.topic_id and tp.rkd = 1
    group by 1, 2

),

top_topic as (

    select vertical, topic_id as top_topic_id
    from topic_per_vertical
    where rk = 1

)

select
    v.vertical,
    v.brand_count,
    v.total_videos,
    v.total_conversations,
    v.avg_attention_score,
    tt.top_topic_id
from vertical_rollup v
left join top_topic tt
    on v.vertical = tt.vertical
