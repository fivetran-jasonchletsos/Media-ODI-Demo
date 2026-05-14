{{ config(materialized='view') }}

-- Token-match Reddit posts to a brand_id when the brand name (or handle
-- minus the @) appears as a whitespace-bounded token in the normalized
-- search_text. Posts that match multiple brands keep the highest-scoring
-- (longest brand name) match; unmatched posts pass through with NULL
-- brand_id so downstream marts can still surface unattributed chatter.

with posts as (

    select
        post_id,
        subreddit,
        title,
        selftext,
        author,
        posted_at,
        score,
        num_comments,
        url,
        search_text
    from {{ ref('stg_reddit__posts') }}

),

seed as (

    select
        brand_id,
        brand_name,
        brand_handle,
        vertical,
        lower(brand_name)                                               as brand_name_lc,
        lower(regexp_replace(brand_handle, '^@', ''))                   as brand_handle_lc
    from {{ ref('brand_to_channel_seed') }}

),

candidates as (

    select
        p.post_id,
        p.subreddit,
        p.title,
        p.selftext,
        p.author,
        p.posted_at,
        p.score,
        p.num_comments,
        p.url,
        s.brand_id,
        s.brand_name                                                    as brand_name_match,
        s.vertical                                                      as brand_vertical,
        length(s.brand_name_lc)                                         as match_strength
    from posts p
    inner join seed s
        on p.search_text like '%' || s.brand_name_lc || '%'
        or p.search_text like '%' || s.brand_handle_lc || '%'

),

ranked as (

    select
        post_id,
        subreddit,
        title,
        selftext,
        author,
        posted_at,
        score,
        num_comments,
        url,
        brand_id,
        brand_name_match,
        brand_vertical,
        match_strength,
        row_number() over (
            partition by post_id
            order by match_strength desc, brand_id asc
        )                                                               as match_rank
    from candidates

),

matched as (

    select
        post_id,
        subreddit,
        title,
        selftext,
        author,
        posted_at,
        score,
        num_comments,
        url,
        brand_id,
        brand_name_match,
        brand_vertical
    from ranked
    where match_rank = 1

),

unmatched as (

    select
        p.post_id,
        p.subreddit,
        p.title,
        p.selftext,
        p.author,
        p.posted_at,
        p.score,
        p.num_comments,
        p.url,
        cast(null as varchar)                                           as brand_id,
        cast(null as varchar)                                           as brand_name_match,
        cast(null as varchar)                                           as brand_vertical
    from posts p
    left join matched m
        on p.post_id = m.post_id
    where m.post_id is null

)

select * from matched
union all
select * from unmatched
