import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatCount, formatPercent, sentimentColor } from '../api/queries';
import type { Brand, SignalBucket, Vertical } from '../types';

const VERTICALS: Vertical[] = [
  'CPG', 'Retail', 'Auto', 'Tech', 'Finance', 'Streaming',
  'QSR', 'Beauty', 'Fashion', 'Travel', 'Gaming', 'Entertainment',
];

const BUCKETS: SignalBucket[] = ['cold', 'warming', 'hot', 'breakout'];

type SortKey = 'attention' | 'yt_growth' | 'reddit_velocity' | 'wiki_growth';

const SORT_LABELS: Record<SortKey, string> = {
  attention:       'Attention',
  yt_growth:       'YT growth',
  reddit_velocity: 'Reddit velocity',
  wiki_growth:     'Wiki growth',
};

function bucketPill(bucket: SignalBucket): string {
  switch (bucket) {
    case 'breakout': return 'magenta';
    case 'hot':      return 'warn';
    case 'warming':  return 'cyan';
    case 'cold':     return 'neutral';
  }
}

export default function BrandsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [vertical, setVertical] = useState(params.get('vertical') ?? '');
  const [bucket, setBucket] = useState(params.get('bucket') ?? '');
  const [results, setResults] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('attention');

  useEffect(() => {
    setLoading(true);
    api
      .searchBrands({
        q: params.get('q') ?? undefined,
        vertical: params.get('vertical') ?? undefined,
        bucket: params.get('bucket') ?? undefined,
        limit: 1000,
      })
      .then((r) => setResults(r.results))
      .finally(() => setLoading(false));
  }, [params]);

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      if (sort === 'yt_growth') return (b.yt_subs_growth_28d_pct ?? -Infinity) - (a.yt_subs_growth_28d_pct ?? -Infinity);
      if (sort === 'reddit_velocity') return b.reddit_velocity_28d - a.reddit_velocity_28d;
      if (sort === 'wiki_growth') return (b.wiki_pageviews_growth_28d_pct ?? -Infinity) - (a.wiki_pageviews_growth_28d_pct ?? -Infinity);
      return b.attention_score - a.attention_score;
    });
    return copy;
  }, [results, sort]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (q.trim()) next.q = q.trim();
    if (vertical) next.vertical = vertical;
    if (bucket) next.bucket = bucket;
    setParams(next);
  };

  const clearFilters = () => {
    setQ(''); setVertical(''); setBucket('');
    setParams({});
  };

  const setBucketChip = (b: string) => {
    setBucket(b === bucket ? '' : b);
    const next: Record<string, string> = {};
    if (q.trim()) next.q = q.trim();
    if (vertical) next.vertical = vertical;
    if (b !== bucket) next.bucket = b;
    setParams(next);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between mb-6 border-b border-[var(--hairline)] pb-4">
        <div>
          <div className="eyebrow mb-1">Brand Panel</div>
          <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">Brands</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
            Search the{' '}
            <code className="font-mono text-xs bg-[var(--bg-2)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">gold.dim_brands</code>{' '}
            mart joined with{' '}
            <code className="font-mono text-xs bg-[var(--bg-2)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">gold.fct_brand_signal</code>{' '}
            for cross-platform attention metrics.
          </p>
        </div>
        <div className="text-sm text-[var(--ink-soft)] tabular shrink-0">
          {loading ? 'Searching…' : (
            <>
              <span className="font-display text-2xl text-[var(--ink)]">{sorted.length}</span>{' '}
              {sorted.length === 1 ? 'brand' : 'brands'}
            </>
          )}
        </div>
      </div>

      <form onSubmit={applyFilters} className="editorial-card p-4 grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
        <div className="md:col-span-5">
          <label className="block text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider mb-1">Brand · @handle · vertical</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. nike or @nike"
            className="w-full rounded-sm border border-[var(--hairline)] bg-[var(--bg-3)] text-[var(--ink)] px-3 py-2 text-sm focus:border-[var(--magenta)] focus:outline-none"
          />
        </div>
        <div className="md:col-span-4">
          <label className="block text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider mb-1">Vertical</label>
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value)}
            className="w-full rounded-sm border border-[var(--hairline)] bg-[var(--bg-3)] text-[var(--ink)] px-3 py-2 text-sm focus:border-[var(--magenta)] focus:outline-none"
          >
            <option value="">All verticals</option>
            {VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="md:col-span-3 flex items-end gap-2">
          <button
            type="submit"
            className="flex-1 rounded-sm text-[var(--bg)] text-sm font-bold px-4 py-2"
            style={{ background: 'var(--magenta)' }}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-sm border border-[var(--hairline)] hover:bg-[var(--bg-2)] text-[var(--ink-muted)] text-sm px-3 py-2"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider mr-1">Signal:</span>
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setBucketChip(b)}
              className={`signal-pill ${bucketPill(b)} ${bucket === b ? '' : 'opacity-60 hover:opacity-100'}`}
              style={{ cursor: 'pointer' }}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">Sort by</span>
          <div className="inline-flex gap-0.5 rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] p-0.5 text-xs">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-3 py-1.5 rounded font-medium ${sort === key ? 'bg-[var(--magenta)] text-[var(--bg)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}
              >
                {SORT_LABELS[key]} ↓
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="editorial-card p-12 text-center text-[var(--ink-soft)]">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="editorial-card p-12 text-center">
          <div className="text-[var(--ink)] font-medium">No brands match your filters.</div>
          <button onClick={clearFilters} className="mt-3 text-sm text-[var(--magenta)] hover:text-[var(--magenta-bright)] font-medium">
            Clear filters →
          </button>
        </div>
      ) : (
        <div className="editorial-card overflow-x-auto">
          <table className="min-w-full text-sm tabular">
            <thead className="bg-[var(--bg-3)] border-b border-[var(--hairline)]">
              <tr>
                <Th>Handle</Th>
                <Th>Brand</Th>
                <Th>Vertical</Th>
                <Th align="right">YT subs</Th>
                <Th align="right">Reddit 28d</Th>
                <Th align="right">Wiki 28d</Th>
                <Th align="right">Attention</Th>
                <Th>Signal</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-soft)]">
              {sorted.map((b) => {
                const ytGrowth = b.yt_subs_growth_28d_pct;
                const ytColor = ytGrowth == null ? 'text-[var(--ink-soft)]' : ytGrowth >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
                const wikiGrowth = b.wiki_pageviews_growth_28d_pct;
                const wikiColor = wikiGrowth == null ? 'text-[var(--ink-soft)]' : wikiGrowth >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
                return (
                  <tr
                    key={b.brand_id}
                    onClick={() => navigate(`/brands/${encodeURIComponent(b.brand_id)}`)}
                    className="cursor-pointer hover:bg-[var(--bg-3)] transition-colors"
                  >
                    <td className="px-4 py-2.5 handle text-[var(--magenta)]">{b.brand_handle}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-display text-[var(--ink)]">{b.brand_name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)] text-xs">{b.vertical ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold text-[var(--ink)]">{formatCount(b.yt_subscribers)}</div>
                      <div className={`text-[10px] tabular ${ytColor}`}>
                        {ytGrowth == null ? '—' : formatPercent(ytGrowth)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold text-[var(--ink)]">{formatCount(b.reddit_mentions_28d)}</div>
                      <div className="text-[10px] tabular" style={{ color: sentimentColor(b.reddit_avg_sentiment) }}>
                        {b.reddit_avg_sentiment >= 0 ? '+' : ''}{b.reddit_avg_sentiment.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold text-[var(--ink)]">{formatCount(b.wiki_pageviews_28d)}</div>
                      <div className={`text-[10px] tabular ${wikiColor}`}>
                        {wikiGrowth == null ? '—' : formatPercent(wikiGrowth)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-display text-xl text-[var(--cyan-bright)] tabular">{Math.round(b.attention_score)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`signal-pill ${bucketPill(b.signal_bucket)}`}>{b.signal_bucket}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-soft)] ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
