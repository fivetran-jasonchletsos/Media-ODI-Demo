import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCount, formatPercent } from '../api/queries';
import * as watchlist from '../watchlist';
import type { Brand, SignalBucket } from '../types';

function bucketPill(bucket: SignalBucket): string {
  switch (bucket) {
    case 'breakout': return 'magenta';
    case 'hot':      return 'warn';
    case 'warming':  return 'cyan';
    case 'cold':     return 'neutral';
  }
}

export default function WatchlistPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [brands, setBrands] = useState<Record<string, Brand>>({});

  useEffect(() => watchlist.subscribe(setIds), []);

  useEffect(() => {
    let cancelled = false;
    api.searchBrands({ limit: 100000 }).then((r) => {
      if (cancelled) return;
      const m: Record<string, Brand> = {};
      for (const b of r.results) m[b.brand_id] = b;
      setBrands(m);
    });
    return () => { cancelled = true; };
  }, []);

  const items = ids.map((id) => ({ id, b: brands[id] })).filter((x) => x.b);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-1">Saved</div>
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">Watchlist</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">
          {ids.length === 0
            ? "You haven't saved any brands yet."
            : `${ids.length} ${ids.length === 1 ? 'brand' : 'brands'} saved in this browser.`}
        </p>
      </header>

      {ids.length === 0 ? (
        <div className="editorial-card p-10 text-center border-dashed">
          <div className="font-display text-lg text-[var(--ink)]">Nothing here yet.</div>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Open any brand and click <strong>"Watch brand"</strong> in the hero banner.
          </p>
          <Link
            to="/brands"
            className="mt-4 inline-block rounded-sm text-[var(--bg)] text-sm font-bold px-4 py-2"
            style={{ background: 'var(--magenta)' }}
          >
            Browse brands
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ id, b }) => {
            const growth = b.wiki_pageviews_growth_28d_pct;
            const growthClass = growth == null
              ? 'text-[var(--ink-soft)]'
              : growth >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
            return (
              <Link
                key={id}
                to={`/brands/${encodeURIComponent(id)}`}
                className="block editorial-card hover:border-[var(--magenta)] transition-colors group"
              >
                <div className="px-5 pt-4 pb-3 border-b border-[var(--hairline-soft)] flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="handle text-sm text-[var(--magenta)] truncate">{b.brand_handle}</div>
                    <div className="mt-1 font-display text-[var(--ink)] truncate group-hover:underline underline-offset-2">
                      {b.brand_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); watchlist.remove(id); }}
                    className="text-xs text-[var(--ink-soft)] hover:text-[var(--down)] shrink-0"
                    aria-label="Remove from watchlist"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-5 py-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-[var(--ink-muted)]">
                    {b.vertical ?? '—'}
                  </div>
                  <span className={`signal-pill ${bucketPill(b.signal_bucket)}`}>{b.signal_bucket}</span>
                </div>
                <div className="px-5 pb-4 flex items-baseline justify-between">
                  <span className="font-display text-2xl text-[var(--cyan-bright)] tabular">
                    {Math.round(b.attention_score)}
                    <span className="ml-1 text-xs font-sans font-medium text-[var(--ink-soft)]">attention</span>
                  </span>
                  <span className={`text-xs tabular font-semibold ${growthClass}`}>
                    {growth == null ? '—' : formatPercent(growth)}{' '}
                    <span className="text-[10px] text-[var(--ink-soft)] uppercase tracking-wider">wiki</span>
                  </span>
                </div>
                <div className="px-5 pb-3 grid grid-cols-3 gap-2 text-[10px] text-[var(--ink-soft)] uppercase tracking-wider font-bold">
                  <div>YT {formatCount(b.yt_subscribers)}</div>
                  <div>RDT {formatCount(b.reddit_mentions_28d)}</div>
                  <div>WIK {formatCount(b.wiki_pageviews_28d)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
