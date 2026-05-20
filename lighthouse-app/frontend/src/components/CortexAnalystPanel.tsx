import { useState } from 'react';

// Cortex Analyst panel — Lighthouse Media edition (dark + magenta).

type Token = { text: string; color?: string };

function tokenizeSQL(sql: string): Token[] {
  const combined = new RegExp(
    [
      `(?<comment>--[^\\n]*)`,
      `(?<string>'[^']*')`,
      `(?<schema>\\b(?:gold|silver|bronze)\\.[a-z_]+)`,
      `(?<keyword>\\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|INNER JOIN|JOIN|ON|AND|OR|NOT|AS|WITH|CASE|WHEN|THEN|ELSE|END|BY|ASC|DESC|DISTINCT|COUNT|SUM|AVG|ROUND|COALESCE|CAST|FLOOR|IN|IS|NULL|TRUE|FALSE|PARTITION|OVER|BETWEEN|DATE_TRUNC|INTERVAL)\\b)`,
      `(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
    ].join('|'),
    'gi'
  );
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const m of sql.matchAll(combined)) {
    if (m.index === undefined) continue;
    if (m.index > lastIndex) tokens.push({ text: sql.slice(lastIndex, m.index) });
    const g = m.groups ?? {};
    if      (g.comment) tokens.push({ text: g.comment, color: '#6f6a5e' });
    else if (g.string)  tokens.push({ text: g.string,  color: '#5dffff' });
    else if (g.schema)  tokens.push({ text: g.schema,  color: '#ff6da0' });
    else if (g.keyword) tokens.push({ text: g.keyword, color: '#ff3e7f' });
    else if (g.number)  tokens.push({ text: g.number,  color: '#f5b14a' });
    else                tokens.push({ text: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < sql.length) tokens.push({ text: sql.slice(lastIndex) });
  return tokens;
}

function SQLBlock({ sql }: { sql: string }) {
  const tokens = tokenizeSQL(sql);
  return (
    <pre
      className="overflow-x-auto text-xs leading-relaxed"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid var(--hairline)',
        padding: '1rem 1.25rem',
        color: '#d8d2c4',
        whiteSpace: 'pre',
      }}
    >
      <code>
        {tokens.map((t, i) => t.color
          ? <span key={i} style={{ color: t.color }}>{t.text}</span>
          : <span key={i}>{t.text}</span>)}
      </code>
    </pre>
  );
}

type Q = { id: string; question: string; sql: string; narrative: string; data: { label: string; value: string }[] };

const QUESTIONS: Q[] = [
  {
    id: 'sov-movers',
    question: 'Which brands had the biggest week-over-week share-of-voice gains?',
    sql: `WITH w AS (
    SELECT  brand_id, brand_name,
            DATE_TRUNC('week', conversation_at) AS week,
            COUNT(*) AS mentions
    FROM    gold.fct_conversations
    GROUP   BY 1, 2, 3
)
SELECT
    brand_name,
    week,
    mentions,
    mentions - LAG(mentions) OVER (PARTITION BY brand_id ORDER BY week) AS wow_delta,
    100.0 * mentions / SUM(mentions) OVER (PARTITION BY week) AS sov_pct
FROM   w
WHERE  week = DATE_TRUNC('week', CURRENT_DATE - INTERVAL '7 days')
ORDER  BY wow_delta DESC
LIMIT  10;`,
    narrative: `Three creator-led brands more than doubled WoW share of voice — driven by a single viral video each. The pattern is consistent: a 24-hour spike in conversation volume that drags weekly SOV up before fading. The same fct_conversations table backs the /brands page; Cortex applied the windowing without anyone rebuilding the model.`,
    data: [
      { label: 'Top WoW gainer', value: 'Aurora Skin Co (+4.2pp SOV)' },
      { label: 'Viral-video count (week)', value: '14' },
      { label: 'Median spike duration', value: '36 hours' },
    ],
  },
  {
    id: 'trending-topics',
    question: 'Top trending topics by conversation volume.',
    sql: `SELECT
    topic_id,
    topic_label,
    COUNT(*)                    AS conversation_count,
    AVG(sentiment_score)        AS avg_sentiment
FROM   gold.fct_conversations
WHERE  conversation_at >= CURRENT_DATE - INTERVAL '14 days'
GROUP  BY 1, 2
ORDER  BY conversation_count DESC
LIMIT  10;`,
    narrative: `"Retinol alternatives" leads the past 14 days with 1.9K conversations and a +0.21 average sentiment. The cluster overlaps with the back-to-school launch window — brands that ship this fall against the trend will land in active demand.`,
    data: [
      { label: 'Top topic', value: 'Retinol alternatives' },
      { label: 'Conversations (14d)', value: '1,912' },
      { label: 'Avg sentiment', value: '+0.21' },
    ],
  },
  {
    id: 'geo-concentration',
    question: 'Geographic concentration of conversation about a brand.',
    sql: `SELECT
    state,
    metro_area,
    COUNT(*)                    AS conversations,
    AVG(sentiment_score)        AS avg_sentiment
FROM   gold.fct_conversations
WHERE  brand_id = 'brand_aurora'
  AND  conversation_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP  BY 1, 2
ORDER  BY conversations DESC
LIMIT  10;`,
    narrative: `Aurora's conversation is 62% concentrated in eight metros — LA, NYC, Chicago, SF, Austin, Seattle, Boston, Portland — overlapping with their D2C top-spending ZIPs. Geo signal and conversion signal agree; the marketing team's heatmap matches Cortex's grouping without a parallel query path.`,
    data: [
      { label: 'Top metro', value: 'Los Angeles (18.4%)' },
      { label: 'Metros at 62%', value: '8' },
      { label: 'Conversations (30d)', value: '3,847' },
    ],
  },
  {
    id: 'sentiment-shift',
    question: 'Sentiment shift on a brand over the past 90 days.',
    sql: `SELECT
    DATE_TRUNC('week', conversation_at)  AS week,
    AVG(sentiment_score)                 AS avg_sentiment,
    COUNT(*)                             AS volume
FROM   gold.fct_conversations
WHERE  brand_id = 'brand_aurora'
  AND  conversation_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP  BY 1
ORDER  BY 1 ASC;`,
    narrative: `Aurora's sentiment rose from +0.05 to +0.32 over the 90-day window, with one negative dip in week 6 (formulation change rumor). Volume held steady — the brand got more positive without losing share of voice, which is the rare combination Cortex flags as "earned momentum."`,
    data: [
      { label: 'Sentiment (start)', value: '+0.05' },
      { label: 'Sentiment (now)',   value: '+0.32' },
      { label: 'Volume change',     value: '+3%' },
    ],
  },
  {
    id: 'top-videos',
    question: 'Top 10 videos by views in the last 30 days.',
    sql: `SELECT
    v.video_id,
    v.title,
    v.creator_handle,
    v.views,
    v.like_ratio,
    v.uploaded_at
FROM   gold.fct_videos v
WHERE  v.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER  BY v.views DESC
LIMIT  10;`,
    narrative: `Eight of the top 10 are creator-led, not brand-direct. The median like-ratio is 6.4% — well above the 2.1% platform baseline. Brand teams that buy creator integrations against these videos compound their reach with the platform's organic distribution.`,
    data: [
      { label: 'Top video views',     value: '4.8M' },
      { label: 'Creator-led share',   value: '80%' },
      { label: 'Median like ratio',   value: '6.4%' },
    ],
  },
  {
    id: 'platform-mix',
    question: 'Conversation volume by source platform.',
    sql: `SELECT
    source_platform,
    COUNT(*)                                AS conversations,
    ROUND(100.0 * COUNT(*) /
          SUM(COUNT(*)) OVER (), 1)         AS share_pct
FROM   gold.fct_conversations
WHERE  conversation_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP  BY 1
ORDER  BY conversations DESC;`,
    narrative: `TikTok holds 41% of total conversation volume, Reddit 22%, X 15%, Instagram 13%, others combined 9%. The platform-share rollup is the foundation for Lighthouse's media-mix model — and the same query runs against the same Iceberg tables in Athena, DuckDB, and Cortex with no copy.`,
    data: [
      { label: 'TikTok share',  value: '41%' },
      { label: 'Reddit share',  value: '22%' },
      { label: 'X share',       value: '15%' },
    ],
  },
];

const KICKER = 'font-mono text-[10px] uppercase tracking-[0.3em]';

export default function CortexAnalystPanel() {
  const [activeId, setActiveId] = useState<string>(QUESTIONS[0].id);
  const active = QUESTIONS.find((q) => q.id === activeId) ?? QUESTIONS[0];

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className={`${KICKER}`} style={{ color: 'var(--magenta-bright)' }}>Snowflake · Cortex Analyst</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--ink)' }}>
            Ask the lake.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed italic md:text-right" style={{ color: 'var(--ink-muted)' }}>
          Natural-language questions resolved to SQL against the dbt-modeled gold layer —
          the same Iceberg tables Lighthouse's dashboards query.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ border: '1px solid var(--hairline)' }}>
        <aside className="shrink-0 lg:w-72 xl:w-80" style={{ borderRight: '1px solid var(--hairline)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className={`${KICKER}`} style={{ color: 'var(--ink-muted)' }}>Example questions</p>
          </div>
          <ul>
            {QUESTIONS.map((q) => {
              const isActive = q.id === activeId;
              return (
                <li key={q.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                  <button
                    onClick={() => setActiveId(q.id)}
                    className="w-full text-left px-4 py-4 transition-colors focus:outline-none focus:ring-2"
                    style={{
                      background: isActive ? 'var(--magenta-bg)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--magenta)' : '2px solid transparent',
                      color: isActive ? 'var(--ink)' : 'var(--ink-muted)',
                    }}
                  >
                    <span className="text-sm leading-snug">{q.question}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.015)' }}>
            <span aria-hidden="true" className="shrink-0" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--magenta)', marginTop: '6px' }} />
            <p className="text-base leading-snug" style={{ color: 'var(--ink)' }}>{active.question}</p>
          </div>

          <div className="px-5 pt-5 pb-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className={`${KICKER} mb-3`} style={{ color: 'var(--ink-muted)' }}>Generated SQL</p>
            <div className="pb-5"><SQLBlock sql={active.sql} /></div>
          </div>

          <div className="flex-1 px-5 py-5">
            <p className={`${KICKER} mb-4`} style={{ color: 'var(--ink-muted)' }}>Cortex Analyst response</p>
            <div className="p-4 mb-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--hairline)' }}>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{active.narrative}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.data.map(({ label, value }) => (
                <div key={label} className="p-3" style={{ background: 'var(--magenta-bg)', border: '1px solid rgba(255,62,127,0.25)' }}>
                  <p className={`${KICKER} mb-1`} style={{ color: 'var(--ink-muted)' }}>{label}</p>
                  <p className="text-base leading-snug" style={{ color: 'var(--ink)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.01)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Snowflake" style={{ opacity: 0.6, flexShrink: 0 }}>
              <line x1="12" y1="2"    x2="12" y2="22"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="2"  y1="12"   x2="22" y2="12"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="4.93"  y1="4.93"  x2="19.07" y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="19.07" y1="4.93"  x2="4.93"  y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className={`${KICKER}`} style={{ color: 'rgba(255,255,255,0.35)' }}>Powered by Snowflake Cortex Analyst</p>
          </div>
        </div>
      </div>
    </section>
  );
}
