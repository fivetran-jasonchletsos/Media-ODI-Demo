{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_youtube', 'channels') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        trim(channel_id)                                                as channel_id,
        lower(trim(channel_handle))                                     as channel_handle,
        trim(channel_title)                                             as channel_title,
        trim(description)                                               as description,
        upper(trim(country))                                            as country,
        cast(subscribers as bigint)                                     as subscribers,
        cast(views_total as bigint)                                     as views_total,
        cast(videos_count as integer)                                   as videos_count,
        cast(created_at as timestamp)                                   as created_at,
        trim(thumbnail_url)                                             as thumbnail_url,
        _fivetran_synced                                                as loaded_at
    from source

)

select * from renamed
