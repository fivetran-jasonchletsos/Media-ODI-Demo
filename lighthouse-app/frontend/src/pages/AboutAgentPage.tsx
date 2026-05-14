import { useNavigate } from 'react-router-dom';

const INTENTS = [
  {
    name: 'breakout_brands',
    label: 'Breakout brands',
    pattern: '/(breakout|surge|spike|hot|breakthrough)/i',
    example: 'Breakout brands this week',
    body: 'Filters brands flagged as breakout or hot by the cross-source attention model and ranks by attention score.',
  },
  {
    name: 'youtube_growth',
    label: 'YouTube growth',
    pattern: '/(youtube|video|subs|subscriber)/i',
    example: 'Top YouTube growth',
    body: 'Sorts the panel by 28-day YouTube subscriber growth. Channels compounding audience fastest float to the top.',
  },
  {
    name: 'negative_sentiment',
    label: 'Negative sentiment',
    pattern: '/(negative|backlash|controversy|complaint|crisis)/i',
    example: 'Brands with negative Reddit sentiment',
    body: 'Filters to brands carrying net-negative Reddit sentiment in the last 28 days. Leading indicator for brand-safety conversations.',
  },
  {
    name: 'wiki_velocity',
    label: 'Wikipedia velocity',
    pattern: '/(wiki|pageview|interest|search.+trend)/i',
    example: 'Tech brands with biggest pageview spike',
    body: 'Ranks by Wikipedia pageview growth — the most leading of leading indicators of cultural curiosity.',
  },
  {
    name: 'low_attention',
    label: 'Low / declining attention',
    pattern: '/(low|cold|fading|declining|dormant)/i',
    example: 'Cold or declining brands',
    body: 'Surfaces brands in the cold signal bucket: minimal cross-source momentum. Useful for identifying underserved categories.',
  },
  {
    name: 'vertical_filter',
    label: 'Vertical filter',
    pattern: 'Matches a vertical name (QSR, Tech, Beauty, etc.)',
    example: 'QSR vertical leaders',
    body: 'Detects a vertical (CPG, Retail, Auto, Tech, Finance, Streaming, QSR, Beauty, Fashion, Travel, Gaming, Entertainment) and returns the leaders by attention score.',
  },
];

export default function AboutAgentPage() {
  const navigate = useNavigate();
  return (
    <div>
      <section className="bg-[var(--bg)] text-[var(--ink)] border-b-2 border-[var(--magenta)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14">
          <div className="inline-flex items-center gap-2 rounded-sm bg-[var(--magenta-bg)] px-3 py-1 text-xs font-bold uppercase tracking-wider mb-5 text-[var(--magenta)] border border-[var(--magenta)]/40">
            Audience AI
          </div>
          <h1 className="font-display text-5xl sm:text-6xl tracking-tight max-w-3xl">
            Skip the BI tool. Ask the panel.
          </h1>
          <p className="mt-5 text-lg text-[var(--ink-muted)] max-w-2xl leading-relaxed">
            A natural-language layer on top of the same gold-layer tables the rest of the demo uses.
            Type a question — get back a ranked table, a short summary, and clickable rows that open
            the brand panel.
          </p>
          <button
            onClick={() => navigate('/agent')}
            className="mt-8 inline-flex items-center gap-2 rounded-sm px-6 py-3 text-base font-bold shadow-lg"
            style={{ background: 'var(--magenta)', color: 'var(--bg)' }}
          >
            Open the agent <span aria-hidden>→</span>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="font-display text-2xl text-[var(--ink)] mb-3">How it works</h2>
        <div className="space-y-4 text-[var(--ink)] leading-relaxed">
          <p>
            The agent runs entirely client-side over the published JSON snapshot of the gold-layer
            Iceberg tables. A small intent classifier recognizes six patterns over the question, then
            executes the matching aggregation in your browser.
          </p>
          <p>
            No backend, no API key required for the rules tier. Flip the <em>Ask Claude</em> toggle and
            paste a key for richer reasoning over the same snapshot summary — Claude sees only the
            aggregated JSON, never raw rows.
          </p>
        </div>

        <h2 className="font-display text-2xl text-[var(--ink)] mt-12 mb-4">The six media intents</h2>
        <div className="space-y-3">
          {INTENTS.map((it) => (
            <article key={it.name} className="editorial-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg text-[var(--ink)]">{it.label}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{it.body}</p>
                </div>
                <span className="layer-chip gold shrink-0">{it.name}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)] mb-1">Pattern</div>
                  <code className="font-mono text-[11px] bg-[var(--bg-3)] px-2 py-1 rounded border border-[var(--hairline)] inline-block text-[var(--ink-muted)]">{it.pattern}</code>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)] mb-1">Try</div>
                  <button
                    onClick={() => navigate(`/agent?q=${encodeURIComponent(it.example)}`)}
                    className="text-[var(--magenta)] hover:text-[var(--magenta-bright)] font-bold"
                  >
                    "{it.example}" →
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <h2 className="font-display text-2xl text-[var(--ink)] mt-12 mb-3">Claude mode</h2>
        <p className="text-[var(--ink)] leading-relaxed">
          When enabled, questions are sent to Claude with a structured summary of the snapshot
          (totals by vertical, attention-score aggregates, signal-bucket histogram). The system
          prompt casts Claude as a senior Lighthouse audience analyst — sharp, editorial, no
          invented numbers. The API key lives only in your browser's localStorage under{' '}
          <code className="font-mono text-xs bg-[var(--bg-3)] px-1.5 py-0.5 rounded border border-[var(--hairline)] text-[var(--ink-muted)]">lighthouse-odi:anthropic-api-key</code>.
        </p>
      </section>
    </div>
  );
}
