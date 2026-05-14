{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_wikipedia', 'pageviews') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        trim(topic_id)                                                  as topic_id,
        cast(date as date)                                              as date,
        cast(views as bigint)                                           as views,
        _fivetran_synced                                                as loaded_at
    from source
    where views is not null

)

select * from renamed
