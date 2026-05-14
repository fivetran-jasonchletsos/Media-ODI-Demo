{{ config(materialized='view') }}

-- Resolves each YouTube channel to a brand_id from the seed panel.
-- The seed exact-matches a channel_id directly; for any seed brand
-- whose declared channel_id no longer exists in bronze, we fall back
-- to a fuzzy match on lower-cased channel_handle / channel_title
-- against the brand_handle and brand_name. Match rule + confidence
-- are emitted so downstream marts can filter low-confidence rows.

with seed as (

    select
        brand_id,
        brand_handle,
        brand_name,
        yt_channel_id,
        vertical,
        regexp_replace(lower(brand_name), '[^a-z0-9]+', '')              as brand_name_key,
        regexp_replace(lower(brand_handle), '[^a-z0-9]+', '')            as brand_handle_key
    from {{ ref('brand_to_channel_seed') }}

),

channels as (

    select
        channel_id,
        channel_handle,
        channel_title,
        regexp_replace(lower(coalesce(channel_handle, '')), '[^a-z0-9]+', '') as channel_handle_key,
        regexp_replace(lower(coalesce(channel_title, '')), '[^a-z0-9]+', '')  as channel_title_key
    from {{ ref('stg_yt__channels') }}

),

exact_id_match as (

    select
        c.channel_id,
        s.brand_id,
        s.brand_handle,
        s.brand_name,
        s.vertical,
        'exact_channel_id'                                              as match_method,
        cast(1.00 as double)                                            as match_confidence
    from channels c
    inner join seed s
        on c.channel_id = s.yt_channel_id

),

unmatched_channels as (

    select c.*
    from channels c
    left join exact_id_match e
        on c.channel_id = e.channel_id
    where e.channel_id is null

),

handle_match as (

    select
        u.channel_id,
        s.brand_id,
        s.brand_handle,
        s.brand_name,
        s.vertical,
        'fuzzy_handle'                                                  as match_method,
        cast(0.80 as double)                                            as match_confidence
    from unmatched_channels u
    inner join seed s
        on u.channel_handle_key = s.brand_handle_key
        and length(s.brand_handle_key) >= 3

),

unmatched_after_handle as (

    select u.*
    from unmatched_channels u
    left join handle_match h
        on u.channel_id = h.channel_id
    where h.channel_id is null

),

title_match as (

    select
        u.channel_id,
        s.brand_id,
        s.brand_handle,
        s.brand_name,
        s.vertical,
        'fuzzy_title'                                                   as match_method,
        cast(0.60 as double)                                            as match_confidence
    from unmatched_after_handle u
    inner join seed s
        on u.channel_title_key = s.brand_name_key
        and length(s.brand_name_key) >= 3

),

combined as (

    select * from exact_id_match
    union all
    select * from handle_match
    union all
    select * from title_match

),

ranked as (

    select
        channel_id,
        brand_id,
        brand_handle,
        brand_name,
        vertical,
        match_method,
        match_confidence,
        row_number() over (
            partition by channel_id
            order by match_confidence desc, brand_id asc
        )                                                               as match_rank
    from combined

)

select
    channel_id,
    brand_id,
    brand_handle,
    brand_name,
    vertical,
    match_method,
    match_confidence
from ranked
where match_rank = 1
