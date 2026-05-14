export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="eyebrow mb-1">ODI Reference Architecture</div>
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">About Lighthouse Media</h1>
        <p className="mt-3 text-[var(--ink-muted)] leading-relaxed">
          Lighthouse Media is a reference build that demonstrates how a cross-channel audience
          intelligence platform can be powered entirely by Fivetran's Open Data Infrastructure —
          Fivetran custom connectors landing public-domain media data (YouTube, Reddit, Wikipedia)
          directly into a customer-owned Apache Iceberg lake on S3, with dbt building the
          attention-signal layer and AWS Athena serving the query workload.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-display text-2xl text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4">What this demo shows</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="editorial-card p-5">
              <div className="layer-chip gold inline-flex mb-3">{p.tag}</div>
              <h3 className="font-display text-lg text-[var(--ink)]">{p.title}</h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4">Tech stack</h2>
        <div className="editorial-card p-5">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {STACK.map((s) => (
              <li key={s.name} className="flex items-start gap-3">
                <div className="layer-chip silver shrink-0 mt-0.5">{s.layer}</div>
                <div className="min-w-0">
                  <div className="font-display text-[var(--ink)]">{s.name}</div>
                  <div className="text-xs text-[var(--ink-muted)]">{s.note}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4">Data sources</h2>
        <div className="space-y-3">
          {DATA_SOURCES.map((s) => (
            <article key={s.title} className="editorial-card p-5">
              <div className="flex items-start gap-3">
                <span className="layer-chip bronze shrink-0">Source</span>
                <div className="min-w-0">
                  <h3 className="font-display text-lg text-[var(--ink)]">{s.title}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{s.description}</p>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Provides:</span> {s.provides}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4">ODI vs MDS</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="editorial-card p-5">
            <div className="eyebrow mb-2" style={{ color: 'var(--ink-soft)' }}>Traditional MDS</div>
            <h3 className="font-display text-lg text-[var(--ink)]">Warehouse-centric</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--ink-muted)]">
              <li>• Single proprietary warehouse owns storage <em>and</em> compute</li>
              <li>• Data exits via expensive egress / replication</li>
              <li>• Compute engine choice locked to vendor roadmap</li>
              <li>• Customer pays for storage twice (lake + warehouse)</li>
              <li>• Schema evolution is vendor-managed</li>
            </ul>
          </div>
          <div className="editorial-card p-5" style={{ borderColor: 'var(--magenta)' }}>
            <div className="eyebrow mb-2">Open Data Infrastructure</div>
            <h3 className="font-display text-lg text-[var(--ink)]">Open lake-centric</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--ink)]">
              <li>• Customer owns the storage layer (S3 + Iceberg)</li>
              <li>• Any compute engine — Athena, Trino, Snowflake, Spark, DuckDB</li>
              <li>• Catalog is open (Glue / Nessie / Polaris)</li>
              <li>• Pay once for storage; swap compute as workloads evolve</li>
              <li>• Schema evolution is in the Iceberg spec, vendor-neutral</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-sm bg-[var(--bg-2)] border border-[var(--hairline)] p-5 text-sm text-[var(--ink)]">
        <div className="eyebrow mb-2" style={{ color: 'var(--warn)' }}>Disclaimer</div>
        <p className="text-[var(--ink-muted)] leading-relaxed">
          <strong className="text-[var(--ink)]">All data shown is synthetic or sampled from public sources</strong>{' '}
          (YouTube, Reddit, Wikipedia) and aggregated for demonstration purposes. Lighthouse Media is
          a fictional audience-intelligence platform. No portion of this site constitutes media-buying
          advice or a brand recommendation.
        </p>
      </section>
    </div>
  );
}

const PILLARS = [
  {
    tag: 'Pillar 1',
    title: 'Customer-owned storage',
    body: "All ingested data lands in the customer's S3 bucket as Apache Iceberg tables. Fivetran writes; the customer reads with any engine.",
  },
  {
    tag: 'Pillar 2',
    title: 'Open table format',
    body: 'Iceberg v2 provides ACID transactions, schema evolution, time-travel queries, and partition evolution — no vendor lock-in on table layout.',
  },
  {
    tag: 'Pillar 3',
    title: 'Any compute engine',
    body: 'Athena queries the same files dbt writes. Add Snowflake, Trino, or DuckDB without re-ingesting a single row. Compute is a pluggable layer.',
  },
];

const STACK = [
  { layer: 'Ingest',     name: 'Fivetran custom connectors', note: 'YouTube · Reddit · Wikipedia · built with the Connector SDK.' },
  { layer: 'Storage',    name: 'Amazon S3',                  note: 'lighthouse-media-odi-lake bucket holds bronze · silver · gold prefixes.' },
  { layer: 'Format',     name: 'Apache Iceberg v2',          note: 'Parquet files, ZSTD-compressed, Glue catalog.' },
  { layer: 'Catalog',    name: 'AWS Glue Data Catalog',      note: 'Iceberg REST + table-level access control.' },
  { layer: 'Transform',  name: 'dbt-athena',                 note: 'Iceberg-native materializations · cross-source signal models.' },
  { layer: 'Query',      name: 'AWS Athena',                 note: 'Engine v3 (Trino) — serverless, Iceberg-aware.' },
  { layer: 'Frontend',   name: 'React 19 + Vite + Tailwind v4', note: 'Static SPA on GitHub Pages, reads JSON snapshot.' },
  { layer: 'Charts',     name: 'Recharts',                   note: 'Composable charts for pageview trends + conversation volume.' },
];

const DATA_SOURCES = [
  {
    title: 'YouTube',
    description: 'YouTube Data API — channel metadata, video catalog, view counts, engagement signals. Lighthouse tracks the panel-brand channels plus discovery candidates.',
    provides: 'Channels · videos · views / likes / comments · engagement rate',
  },
  {
    title: 'Reddit',
    description: 'Reddit posts and comments mentioning panel brands. We attribute by brand-name match and run sentiment + topic-cluster classification in the silver layer.',
    provides: 'Conversation stream · sentiment scoring · topic clusters · subreddit affinity',
  },
  {
    title: 'Wikipedia',
    description: "Wikimedia's public pageviews API. We track topic-level interest curves over time — the cultural-attention layer underneath the brand-level signal.",
    provides: 'Daily pageview series · 90-day interest curves · cross-brand correlations',
  },
];
