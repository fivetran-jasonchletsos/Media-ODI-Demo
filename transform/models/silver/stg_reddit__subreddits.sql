{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_reddit', 'subreddits') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        lower(trim(subreddit))                                          as subreddit,
        trim(title)                                                     as title,
        trim(description)                                               as description,
        cast(subscribers as bigint)                                     as subscribers,
        cast(created_utc as timestamp)                                  as created_at,
        lower(trim(lang))                                               as lang,
        cast(over_18 as boolean)                                        as over_18,
        _fivetran_synced                                                as loaded_at
    from source

)

select * from renamed
