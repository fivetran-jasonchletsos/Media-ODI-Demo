{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_wikipedia', 'topics') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        trim(topic_id)                                                  as topic_id,
        trim(title)                                                     as title,
        trim(extract)                                                   as extract,
        -- Normalize free-text category into the five frontend buckets.
        case
            when lower(coalesce(category, '')) like '%brand%'    then 'brand'
            when lower(coalesce(category, '')) like '%industry%' then 'industry'
            when lower(coalesce(category, '')) like '%culture%'  then 'culture'
            when lower(coalesce(category, '')) like '%event%'    then 'event'
            when lower(coalesce(category, '')) like '%person%'   then 'person'
            else 'culture'
        end                                                             as category,
        lower(trim(lang))                                               as lang,
        cast(last_modified as timestamp)                                as last_modified,
        _fivetran_synced                                                as loaded_at
    from source

)

select * from renamed
