{{ config(materialized='view') }}

-- Enriches daily pageviews with 7-day and 28-day rolling sums, the
-- corresponding growth rates vs. the prior window, and a 28-day
-- volatility metric (stddev / mean of daily views). Powers Topic and
-- Brand growth signals in gold.

with obs as (

    select
        topic_id,
        date,
        views
    from {{ ref('stg_wiki__pageviews') }}

),

windowed as (

    select
        o.topic_id,
        o.date,
        o.views,
        sum(o.views) over (
            partition by o.topic_id
            order by o.date
            rows between 6 preceding and current row
        )                                                               as views_7d,
        sum(o.views) over (
            partition by o.topic_id
            order by o.date
            rows between 13 preceding and 7 preceding
        )                                                               as views_7d_prior,
        sum(o.views) over (
            partition by o.topic_id
            order by o.date
            rows between 27 preceding and current row
        )                                                               as views_28d,
        sum(o.views) over (
            partition by o.topic_id
            order by o.date
            rows between 55 preceding and 28 preceding
        )                                                               as views_28d_prior,
        avg(cast(o.views as double)) over (
            partition by o.topic_id
            order by o.date
            rows between 27 preceding and current row
        )                                                               as views_28d_mean,
        stddev_samp(cast(o.views as double)) over (
            partition by o.topic_id
            order by o.date
            rows between 27 preceding and current row
        )                                                               as views_28d_stddev
    from obs o

),

final as (

    select
        topic_id,
        date,
        views,
        views_7d,
        views_7d_prior,
        views_28d,
        views_28d_prior,
        case
            when views_7d_prior is not null and views_7d_prior > 0
                then cast(views_7d as double) / cast(views_7d_prior as double) - 1.0
        end                                                             as views_7d_growth_pct,
        case
            when views_28d_prior is not null and views_28d_prior > 0
                then cast(views_28d as double) / cast(views_28d_prior as double) - 1.0
        end                                                             as views_28d_growth_pct,
        case
            when views_28d_mean is not null and views_28d_mean > 0
                then coalesce(views_28d_stddev, 0) / views_28d_mean
            else 0
        end                                                             as views_28d_volatility
    from windowed

)

select * from final
