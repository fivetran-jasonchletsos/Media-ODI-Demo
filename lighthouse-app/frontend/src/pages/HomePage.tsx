import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatCount, formatNumber } from '../api/queries';
import type { SummaryStats, Brand, SignalBucket } from '../types';

function bucketPill(bucket: SignalBucket): string {
  switch (bucket) {
    case 'breakout': return 'magenta';
    case 'hot':      return 'warn';
    case 'warming':  return 'cyan';
    case 'cold':     return 'neutral';
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [topBrands, setTopBrands] = useState<Brand[]>([]);

  useEffect(() => {
    api.getSummary().then(setStats).catch(() => {});
    api.searchBrands({ limit: 200000 }).then((r) => {
      const sorted = [...r.results].sort((a, b) => b.attention_score - a.attention_score).slice(0, 6);
      setTopBrands(sorted);
    }).catch(() => {});
  }, []);

  return (
    <>
      {/* Editorial hero — dark charcoal with paper-card KPI panel */}
      <section className="bg-[var(--bg)] text-[var(--ink)] relative overflow-hidden border-b border-[var(--hairline)]">
        {/* Subtle diagonal pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" aria-hidden style={{
          backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 28px, rgba(255,62,127,0.6) 28px 29px)',
        }} />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7">
              <div className="eyebrow mb-4">Lighthouse Media · Open Data Infrastructure</div>
              <h1 className="font-display text-5xl sm:text-7xl text-[var(--ink)] leading-[0.95] tracking-tight">
                Where attention<br />
                <span className="text-[var(--magenta)] italic">actually</span> lives.
              </h1>
              <p className="mt-6 text-base sm:text-lg text-[var(--ink-muted)] max-w-2xl leading-relaxed">
                Cross-channel audience intelligence built on open data. YouTube, Reddit, Wikipedia —
                three different shapes, one open lake, every engine. The signals brands care about,
                landed once and queryable by anything.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/brands')}
                  className="inline-flex items-center gap-2 rounded-sm font-bold text-sm text-[var(--bg)] px-5 py-3 shadow-lg hover:opacity-95 transition-opacity"
                  style={{ background: 'var(--magenta)' }}
                >
                  Open the brand panel <span aria-hidden>→</span>
                </button>
                <button
                  onClick={() => navigate('/architecture')}
                  className="inline-flex items-center gap-2 rounded-sm font-semibold text-sm text-[var(--ink)] bg-transparent border border-[var(--hairline)] px-5 py-3 hover:bg-[var(--bg-2)] transition-colors"
                >
                  See the ODI architecture <span aria-hidden>→</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="paper-card shadow-xl">
                <div className="px-5 py-3 border-b border-[var(--hairline-paper)] flex items-center justify-between bg-[var(--paper-deep)]">
                  <div className="eyebrow-ink">Attention Snapshot</div>
                  <div className="text-[10px] font-bold text-[var(--ink-paper-mid)] uppercase tracking-wider">Athena · Iceberg</div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-[var(--hairline-paper)] tabular">
                  <Stat label="Brands" value={stats ? formatNumber(stats.total_brands) : '—'} hint="Panel tracked across 3 sources" />
                  <Stat label="Videos" value={stats ? formatCount(stats.total_videos) : '—'} hint="YouTube content + performance" />
                  <Stat label="Conversations" value={stats ? formatCount(stats.total_conversations) : '—'} hint="Reddit posts with sentiment" />
                  <Stat label="Topic series" value={stats ? formatNumber(stats.total_topics) : '—'} hint="Wikipedia interest curves" />
                </div>
                <div className="px-5 py-3 border-t border-[var(--hairline-paper)] flex items-center justify-between text-[11px] text-[var(--ink-paper-mid)] bg-[var(--paper-deep)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)] animate-pulse" />
                    {stats ? formatCount(stats.total_pageview_observations) : '—'} pageview observations · {stats?.iceberg_table_count ?? '—'} Iceberg tables
                  </span>
                  <button onClick={() => navigate('/pipeline')} className="font-bold hover:text-[var(--ink-deep)] uppercase tracking-wider">
                    Inspect →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three pillars — dark editorial-card grid */}
      <section className="bg-[var(--bg)] border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <div className="eyebrow mb-2">The ODI Difference</div>
            <h2 className="font-display text-3xl sm:text-4xl text-[var(--ink)] tracking-tight">
              Not another warehouse migration.<br />
              An <span className="italic text-[var(--magenta)]">architectural</span> choice.
            </h2>
            <p className="mt-3 text-[var(--ink-muted)] leading-relaxed">
              The modern data stack put a warehouse in the center. ODI puts <em>open standards</em>{' '}
              in the center — and lets the warehouse, the lakehouse, and the AI agent share one
              source of truth without lock-in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Pillar
              eyebrow="01 · Open storage"
              title="Apache Iceberg on S3"
              copy="Every row lands in an open table format. YouTube watch counts, Reddit threads, Wiki pageviews — same bytes, no extraction, no copy."
              tones={['bronze', 'silver', 'gold']}
            />
            <Pillar
              eyebrow="02 · Multi-engine"
              title="Any compute. Same data."
              copy="Athena for ad-hoc, dbt for governed transforms, Spark for ML, DuckDB on a laptop — engines come and go, the lake stays."
              tones={['silver', 'gold', 'bronze']}
            />
            <Pillar
              eyebrow="03 · AI-ready"
              title="Lake-native, not warehouse-proxied"
              copy="Claude reads Iceberg parquet directly through the Glue catalog. No copy, no ETL hop, no warehouse round-trip — just one governed surface."
              tones={['gold', 'silver', 'bronze']}
            />
          </div>
        </div>
      </section>

      {/* Top attention signals */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6 border-b border-[var(--hairline)] pb-4">
          <div>
            <div className="eyebrow mb-1">Cross-Source Signal</div>
            <h2 className="font-display text-2xl sm:text-3xl text-[var(--ink)]">
              Highest attention this week
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
              Attention score derived from{' '}
              <span className="layer-chip gold ml-0.5">gold.fct_brand_signal</span>{' '}
              — a dbt model that blends YouTube growth, Reddit velocity, Wikipedia pageview spikes,
              and cross-platform share-of-voice.
            </p>
          </div>
          <button onClick={() => navigate('/brands')} className="text-sm font-bold text-[var(--magenta)] hover:text-[var(--magenta-bright)] whitespace-nowrap uppercase tracking-wider">
            Browse all →
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topBrands.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="editorial-card p-5 animate-pulse h-44" />
              ))
            : topBrands.map((b) => <BrandCard key={b.brand_id} b={b} onClick={() => navigate(`/brands/${encodeURIComponent(b.brand_id)}`)} />)}
        </div>
      </section>

      {/* Data provenance strip */}
      <section className="bg-[var(--bg-2)] border-y border-[var(--hairline)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-10">
            <div className="eyebrow mb-2">Provenance</div>
            <h2 className="font-display text-2xl sm:text-3xl text-[var(--ink)] tracking-tight">
              Three sources. One lake. Every chart traces back.
            </h2>
            <p className="mt-2 text-sm sm:text-base text-[var(--ink-muted)] leading-relaxed">
              Every number on this site originates in one of three public APIs and is governed
              end-to-end. No spreadsheets, no scraping, no warehouse vendor in the path.
            </p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-5 gap-3 sm:gap-4">
            {[
              { tag: '01', label: 'Sources', desc: 'YouTube · Reddit · Wikipedia. Three public APIs, three Fivetran custom connectors.', accent: 'bronze' as const },
              { tag: '02', label: 'Ingest', desc: 'Fivetran writes raw bronze tables to S3 as Apache Iceberg via the AWS Glue Catalog.', accent: 'bronze' as const },
              { tag: '03', label: 'Transform', desc: 'dbt builds silver (conformed) → gold (business-ready) marts on Athena.', accent: 'silver' as const },
              { tag: '04', label: 'Serve', desc: 'Athena queries gold-layer Iceberg tables. Same SQL would run on Trino or DuckDB.', accent: 'gold' as const },
              { tag: '05', label: 'Reason', desc: 'AI agent reads gold-layer parquet directly through Glue. No warehouse hop required.', accent: 'gold' as const },
            ].map((s) => (
              <li key={s.tag} className="editorial-card p-4 hover:border-[var(--magenta)] transition-colors">
                <div className="text-[10px] font-mono font-bold text-[var(--magenta)] tracking-wider">{s.tag}</div>
                <div className="mt-1 font-display text-base text-[var(--ink)]">{s.label}</div>
                <p className="mt-2 text-xs text-[var(--ink-muted)] leading-relaxed">{s.desc}</p>
                <div className="mt-3"><span className={`layer-chip ${s.accent}`}>{s.accent}</span></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing principle quote */}
      <section className="bg-[var(--bg)] border-t border-[var(--hairline)]">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <div className="eyebrow mb-3">Design Principle</div>
          <p className="font-display text-3xl sm:text-4xl text-[var(--ink)] leading-snug">
            "Attention doesn't live in one platform.<br />
            <span className="text-[var(--magenta)] italic">Neither should your data.</span>"
          </p>
          <p className="mt-5 text-sm text-[var(--ink-muted)] max-w-2xl mx-auto leading-relaxed">
            Lighthouse Media chose ODI because audience signal lives everywhere — and the AI agents
            that come next will demand governed access to the lake, not a serial-port pipe through
            the warehouse.
          </p>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[10.5px] font-bold text-[var(--ink-paper-mid)] uppercase tracking-[0.08em]">{label}</div>
      <div className="mt-1 font-display text-2xl text-[var(--ink-deep)] leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-[var(--ink-paper-mid)]">{hint}</div>
    </div>
  );
}

function Pillar({ eyebrow, title, copy, tones }: { eyebrow: string; title: string; copy: string; tones: ('bronze' | 'silver' | 'gold')[] }) {
  return (
    <div className="editorial-card p-6 hover:border-[var(--magenta)] transition-colors">
      <div className="eyebrow mb-2">{eyebrow}</div>
      <h3 className="font-display text-xl text-[var(--ink)] tracking-tight">{title}</h3>
      <p className="mt-3 text-sm text-[var(--ink-muted)] leading-relaxed">{copy}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tones.map((t) => <span key={t} className={`layer-chip ${t}`}>{t}</span>)}
      </div>
    </div>
  );
}

function BrandCard({ b, onClick }: { b: Brand; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left editorial-card hover:border-[var(--magenta)] transition-colors group">
      <div className="px-5 pt-4 pb-3 border-b border-[var(--hairline-soft)] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="handle text-[11px] text-[var(--magenta)]">{b.brand_handle}</div>
          <div className="mt-0.5 font-display text-[var(--ink)] truncate group-hover:underline underline-offset-2">
            {b.brand_name}
          </div>
          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">{b.vertical ?? '—'}</div>
        </div>
        <span className={`signal-pill ${bucketPill(b.signal_bucket)}`}>{b.signal_bucket}</span>
      </div>
      <div className="px-5 py-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-bold">YT views 28d</div>
          <div className="mt-0.5 font-bold text-[var(--ink)] tabular">{formatCount(b.yt_views_28d)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-bold">Reddit 28d</div>
          <div className="mt-0.5 font-bold text-[var(--ink)] tabular">{formatCount(b.reddit_mentions_28d)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-bold">Wiki 28d</div>
          <div className="mt-0.5 font-bold text-[var(--ink)] tabular">{formatCount(b.wiki_pageviews_28d)}</div>
        </div>
      </div>
      <div className="px-5 pb-4 flex items-baseline justify-between border-t border-[var(--hairline-soft)] pt-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-bold">Attention</span>
        <span className="font-display text-2xl text-[var(--cyan-bright)] tabular leading-none">{Math.round(b.attention_score)}</span>
      </div>
    </button>
  );
}
