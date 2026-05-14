{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['bucket(16, channel_id)', 'year(published_at)']
) }}

-- One row per YouTube video, joined to brand_id via the channel map.
-- Columns mirror the frontend Video type exactly:
--   video_id, brand_id, channel_id, title, published_at, duration_sec,
--   views, likes, comments, engagement_rate, category, thumbnail_url

with videos as (

    select
        video_id,
        channel_id,
        title,
        published_at,
        duration_sec,
        views,
        likes,
        comments,
        category,
        thumbnail_url
    from {{ ref('stg_yt__videos') }}

),

brand_map as (

    select
        channel_id,
        brand_id
    from {{ ref('int_brand_channel_map') }}

),

joined as (

    select
        v.video_id,
        bm.brand_id,
        v.channel_id,
        v.title,
        v.published_at,
        coalesce(v.duration_sec, 0)                                     as duration_sec,
        coalesce(v.views, 0)                                            as views,
        coalesce(v.likes, 0)                                            as likes,
        coalesce(v.comments, 0)                                         as comments,
        case
            when coalesce(v.views, 0) > 0
                then cast(
                    (coalesce(v.likes, 0) + coalesce(v.comments, 0))
                    as double
                ) / cast(v.views as double)
            else 0.0
        end                                                             as engagement_rate,
        v.category,
        v.thumbnail_url
    from videos v
    left join brand_map bm
        on v.channel_id = bm.channel_id
    where bm.brand_id is not null

)

select * from joined
