{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['year(posted_at)', 'bucket(8, subreddit)']
) }}

-- One row per Reddit post mentioning the panel (and unattributed
-- conversations passed through with NULL brand_id). Columns mirror
-- the frontend Conversation type:
--   post_id, brand_id, brand_name_match, subreddit, title, posted_at,
--   author, score, num_comments, sentiment, topic_cluster, url
--
-- Sentiment: keyword polarity in [-1, 1] over a normalized title+selftext
-- blob. Lightweight CASE-WHEN scoring 7 positive and 7 negative cue words
-- so the demo gives believable directional sentiment without a model.
--
-- topic_cluster: 8 buckets — launch, controversy, product_review,
-- support, partnership, earnings, culture, other.

with base as (

    select
        post_id,
        brand_id,
        brand_name_match,
        subreddit,
        title,
        selftext,
        author,
        posted_at,
        score,
        num_comments,
        url,
        lower(coalesce(title, '') || ' ' || coalesce(selftext, ''))     as scoring_text
    from {{ ref('int_brand_conversations') }}

),

scored as (

    select
        post_id,
        brand_id,
        brand_name_match,
        subreddit,
        title,
        author,
        posted_at,
        score,
        num_comments,
        url,
        scoring_text,
        -- Positive cue word hits (max 7)
        (
            (case when scoring_text like '%love%'      then 1 else 0 end)
          + (case when scoring_text like '%great%'     then 1 else 0 end)
          + (case when scoring_text like '%amazing%'   then 1 else 0 end)
          + (case when scoring_text like '%best%'      then 1 else 0 end)
          + (case when scoring_text like '%awesome%'   then 1 else 0 end)
          + (case when scoring_text like '%excellent%' then 1 else 0 end)
          + (case when scoring_text like '%perfect%'   then 1 else 0 end)
          + (case when scoring_text like '%fantastic%' then 1 else 0 end)
        )                                                               as pos_hits,
        -- Negative cue word hits (max 7+)
        (
            (case when scoring_text like '%hate%'      then 1 else 0 end)
          + (case when scoring_text like '%terrible%'  then 1 else 0 end)
          + (case when scoring_text like '%awful%'     then 1 else 0 end)
          + (case when scoring_text like '%worst%'     then 1 else 0 end)
          + (case when scoring_text like '%broken%'    then 1 else 0 end)
          + (case when scoring_text like '%scam%'      then 1 else 0 end)
          + (case when scoring_text like '%disappoint%' then 1 else 0 end)
          + (case when scoring_text like '%lawsuit%'   then 1 else 0 end)
        )                                                               as neg_hits
    from base

),

with_sentiment as (

    select
        post_id,
        brand_id,
        brand_name_match,
        subreddit,
        title,
        author,
        posted_at,
        score,
        num_comments,
        url,
        scoring_text,
        pos_hits,
        neg_hits,
        case
            when pos_hits + neg_hits = 0 then 0.0
            else cast(pos_hits - neg_hits as double)
                 / cast(greatest(pos_hits + neg_hits, 1) as double)
        end                                                             as sentiment_raw
    from scored

),

clustered as (

    select
        post_id,
        brand_id,
        brand_name_match,
        subreddit,
        title,
        author,
        posted_at,
        score,
        num_comments,
        url,
        -- Clamp sentiment to [-1, 1] just in case
        greatest(-1.0, least(1.0, sentiment_raw))                       as sentiment,
        case
            when scoring_text like '%launch%' or scoring_text like '%release%' or scoring_text like '%announc%'
                then 'launch'
            when scoring_text like '%lawsuit%' or scoring_text like '%scandal%' or scoring_text like '%controvers%'
                or scoring_text like '%boycott%'
                then 'controversy'
            when scoring_text like '%review%' or scoring_text like '%unbox%' or scoring_text like '%hands on%'
                or scoring_text like '%first impression%'
                then 'product_review'
            when scoring_text like '%support%' or scoring_text like '%help%' or scoring_text like '%refund%'
                or scoring_text like '%customer service%' or scoring_text like '%warranty%'
                then 'support'
            when scoring_text like '%partner%' or scoring_text like '%collab%' or scoring_text like '%deal%'
                or scoring_text like '%acquisition%'
                then 'partnership'
            when scoring_text like '%earnings%' or scoring_text like '%revenue%' or scoring_text like '%stock%'
                or scoring_text like '%quarterly%'
                then 'earnings'
            when scoring_text like '%culture%' or scoring_text like '%meme%' or scoring_text like '%trend%'
                or scoring_text like '%viral%'
                then 'culture'
            else 'other'
        end                                                             as topic_cluster
    from with_sentiment

)

select * from clustered
