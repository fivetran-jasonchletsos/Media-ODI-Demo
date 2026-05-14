{{ config(materialized='view') }}

-- Links wiki topics to brand_ids by:
--   1. exact match on seed.wiki_topic_id
--   2. fallback fuzzy match on the article-title slug vs. the brand_name
--      slug (both lower-cased, non-alnum stripped).
--
-- A topic can relate to many brands (e.g. industry topics) so this
-- model is a multi-row bridge keyed on (topic_id, brand_id).

with topics as (

    select
        topic_id,
        title,
        category,
        regexp_replace(lower(topic_id), '[^a-z0-9]+', '')                as topic_key,
        regexp_replace(lower(title),    '[^a-z0-9]+', '')                as title_key
    from {{ ref('stg_wiki__topics') }}

),

seed as (

    select
        brand_id,
        brand_name,
        wiki_topic_id,
        regexp_replace(lower(wiki_topic_id), '[^a-z0-9]+', '')           as seed_topic_key,
        regexp_replace(lower(brand_name),    '[^a-z0-9]+', '')           as brand_key
    from {{ ref('brand_to_channel_seed') }}

),

exact_match as (

    select
        t.topic_id,
        s.brand_id,
        'exact_topic_slug'                                              as match_method,
        cast(1.00 as double)                                            as match_confidence
    from topics t
    inner join seed s
        on t.topic_key = s.seed_topic_key

),

fuzzy_title_match as (

    select
        t.topic_id,
        s.brand_id,
        'fuzzy_title'                                                   as match_method,
        cast(0.65 as double)                                            as match_confidence
    from topics t
    inner join seed s
        on t.title_key = s.brand_key
        and length(s.brand_key) >= 3

),

combined as (

    select * from exact_match
    union all
    select * from fuzzy_title_match

),

deduped as (

    select
        topic_id,
        brand_id,
        match_method,
        match_confidence,
        row_number() over (
            partition by topic_id, brand_id
            order by match_confidence desc
        )                                                               as rk
    from combined

)

select
    topic_id,
    brand_id,
    match_method,
    match_confidence
from deduped
where rk = 1
