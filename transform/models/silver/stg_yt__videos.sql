{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_youtube', 'videos') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        trim(video_id)                                                  as video_id,
        trim(channel_id)                                                as channel_id,
        trim(title)                                                     as title,
        trim(description)                                               as description,
        cast(published_at as timestamp)                                 as published_at,
        cast(duration_sec as integer)                                   as duration_sec,
        cast(views as bigint)                                           as views,
        cast(likes as bigint)                                           as likes,
        cast(comments as bigint)                                        as comments,
        cast(category_id as integer)                                    as category_id,
        case
            when category_id = 1   then 'Film & Animation'
            when category_id = 2   then 'Autos & Vehicles'
            when category_id = 10  then 'Music'
            when category_id = 15  then 'Pets & Animals'
            when category_id = 17  then 'Sports'
            when category_id = 19  then 'Travel & Events'
            when category_id = 20  then 'Gaming'
            when category_id = 22  then 'People & Blogs'
            when category_id = 23  then 'Comedy'
            when category_id = 24  then 'Entertainment'
            when category_id = 25  then 'News & Politics'
            when category_id = 26  then 'Howto & Style'
            when category_id = 27  then 'Education'
            when category_id = 28  then 'Science & Technology'
            else null
        end                                                             as category,
        trim(thumbnail_url)                                             as thumbnail_url,
        trim(tags)                                                      as tags,
        _fivetran_synced                                                as loaded_at
    from source

)

select * from renamed
