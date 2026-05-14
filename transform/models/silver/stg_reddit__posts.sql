{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_reddit', 'posts') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        trim(post_id)                                                   as post_id,
        lower(trim(subreddit))                                          as subreddit,
        trim(title)                                                     as title,
        coalesce(trim(selftext), '')                                    as selftext,
        trim(author)                                                    as author,
        cast(created_utc as timestamp)                                  as posted_at,
        cast(score as integer)                                          as score,
        cast(num_comments as integer)                                   as num_comments,
        trim(url)                                                       as url,
        lower(trim(domain))                                             as domain,
        cast(over_18 as boolean)                                        as over_18,
        -- Normalized search text for token-based brand matching:
        -- collapses whitespace, strips punctuation, lowercases.
        regexp_replace(
            lower(coalesce(title, '') || ' ' || coalesce(selftext, '')),
            '[^a-z0-9 ]+',
            ' '
        )                                                               as search_text,
        _fivetran_synced                                                as loaded_at
    from source

)

select * from renamed
