import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { api, formatCount, formatPercent } from '../api/queries';
import type { Topic, TopicDetail, Brand } from '../types';
import Sparkline from '../components/Sparkline';

export default function TrendsPage() {
  const navigate = useNavigate();
  const { topicId } = useParams();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getTopics().then((r) => {
      const all = r.topics ?? [];
      setTopics(all);
      if (!activeId) {
        const sorted = [...all].sort((a, b) => (b.pageviews_growth_pct ?? -Infinity) - (a.pageviews_growth_pct ?? -Infinity));
        const initial = topicId ?? sorted[0]?.topic_id ?? null;
        setActiveId(initial);
      }
    }).catch(() => {});
    api.searchBrands({ limit: 100000 }).then((r) => setBrands(r.results)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (topicId && topicId !== activeId) setActiveId(topicId);
  }, [topicId, activeId]);

  useEffect(() => {
    if (!activeId) return;
    api.getTopic(activeId).then(setDetail).catch(() => setDetail(null));
  }, [activeId]);

  const topStats = useMemo(() => {
    if (topics.length === 0) return null;
    const totalViews28d = topics.reduce((s, t) => s + t.pageviews_28d, 0);
    const hottest = [...topics].sort((a, b) => (b.pageviews_growth_pct ?? -Infinity) - (a.pageviews_growth_pct ?? -Infinity))[0];
    const mostVolatile = [...topics].sort((a, b) => b.pageviews_volatility - a.pageviews_volatility)[0];
    return { count: topics.length, totalViews28d, hottest, mostVolatile };
  }, [topics]);

  const sortedTopics = useMemo(() => {
    const filtered = filter
      ? topics.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()) || t.topic_id.toLowerCase().includes(filter.toLowerCase()))
      : topics;
    return [...filtered].sort((a, b) => (b.pageviews_growth_pct ?? -Infinity) - (a.pageviews_growth_pct ?? -Infinity));
  }, [topics, filter]);

  const correlatedBrands = useMemo(() => {
    if (!detail) return [];
    return brands
      .filter((b) => detail.topic.related_brands.includes(b.brand_id))
      .sort((a, b) => b.attention_score - a.attention_score)
      .slice(0, 25);
  }, [detail, brands]);

  const chartData = useMemo(() => {
    if (!detail) return [];
    return detail.observations.slice(-90).map((o) => ({ date: o.date, views: o.views }));
  }, [detail]);

  // Mean of the visible series — anchors the "is this above trend?" read.
  const chartMean = useMemo(() => {
    if (chartData.length === 0) return null;
    let sum = 0;
    for (const p of chartData) sum += p.views;
    return sum / chartData.length;
  }, [chartData]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="eyebrow mb-1">Cultural Attention</div>
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">Trends</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
          Wikipedia pageview series from{' '}
          <code className="font-mono text-xs bg-[var(--bg-2)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">gold.fct_topic_pageviews</code>{' '}
          — the cultural-interest layer underneath every brand signal.
        </p>
      </header>

      {topStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <QuoteTile label="Topics tracked" value={topStats.count.toString()} />
          <QuoteTile label="Pageviews 28d" value={formatCount(topStats.totalViews28d)} />
          <QuoteTile
            label="Hottest topic"
            value={topStats.hottest.title}
            sub={topStats.hottest.pageviews_growth_pct != null ? formatPercent(topStats.hottest.pageviews_growth_pct) : ''}
            tone="up"
          />
          <QuoteTile
            label="Most volatile"
            value={topStats.mostVolatile.title}
            sub={`σ ${topStats.mostVolatile.pageviews_volatility.toFixed(2)}`}
            tone="warn"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Series picker */}
        <aside className="lg:col-span-4 editorial-card overflow-hidden">
          <header className="editorial-card-header">
            <div className="eyebrow">Topic Series</div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter topics…"
              className="mt-2 w-full rounded-sm border border-[var(--hairline)] bg-[var(--bg-3)] text-[var(--ink)] px-3 py-1.5 text-sm focus:border-[var(--magenta)] focus:outline-none"
            />
          </header>
          <ul className="max-h-[480px] overflow-y-auto divide-y divide-[var(--hairline-soft)]">
            {sortedTopics.map((t) => {
              const isActive = t.topic_id === activeId;
              const growth = t.pageviews_growth_pct;
              const growthClass = growth == null
                ? 'text-[var(--ink-soft)]'
                : growth >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
              return (
                <li key={t.topic_id}>
                  <button
                    onClick={() => { setActiveId(t.topic_id); navigate(`/trends/${encodeURIComponent(t.topic_id)}`); }}
                    className={`w-full text-left px-4 py-3 transition-colors ${isActive ? 'bg-[var(--magenta-bg)]' : 'hover:bg-[var(--bg-3)]'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`font-display truncate ${isActive ? 'text-[var(--magenta)]' : 'text-[var(--ink)]'}`}>{t.title}</div>
                        <div className="text-[11px] text-[var(--ink-soft)] mt-0.5 capitalize">{t.category}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-[var(--ink)] tabular">{formatCount(t.pageviews_28d)}</div>
                        <div className={`text-[10px] tabular ${growthClass}`}>
                          {growth == null ? '—' : formatPercent(growth)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Chart + correlations */}
        <main className="lg:col-span-8 space-y-5">
          <section className="editorial-card overflow-hidden">
            <header className="editorial-card-header">
              <div className="eyebrow">Pageview Series · 90d</div>
              <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">
                {detail ? detail.topic.title : 'Select a topic'}
              </h2>
              {detail && (
                <div className="mt-1 flex items-baseline gap-3 text-xs text-[var(--ink-muted)]">
                  <span className="font-mono">{detail.topic.topic_id} · {detail.topic.category}</span>
                  {detail.topic.pageviews_growth_pct != null && (
                    <span
                      className="tabular font-bold"
                      style={{ color: detail.topic.pageviews_growth_pct >= 0 ? 'var(--up)' : 'var(--down)' }}
                    >
                      {formatPercent(detail.topic.pageviews_growth_pct)} 28d
                    </span>
                  )}
                  <span className="tabular">σ {detail.topic.pageviews_volatility.toFixed(2)} volatility</span>
                </div>
              )}
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                Daily Wikipedia pageviews. Dashed line = 90-day mean.
              </p>
            </header>
            {chartData.length > 0 ? (
              <div className="p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#1f1d24" />
                    <XAxis dataKey="date" tick={{ fill: '#b5afa0', fontSize: 11 }} stroke="#36322c" tickFormatter={(d) => String(d).slice(5)} />
                    <YAxis tick={{ fill: '#b5afa0', fontSize: 11 }} stroke="#36322c" tickFormatter={(v) => formatCount(v)} />
                    <Tooltip
                      contentStyle={{ background: '#0e0d10', border: '1px solid #36322c', fontSize: 12, color: '#f7f3ec' }}
                      labelStyle={{ color: '#b5afa0' }}
                    />
                    {chartMean != null && (
                      <ReferenceLine y={chartMean} stroke="#6f6a5e" strokeDasharray="3 3" strokeWidth={1} />
                    )}
                    <Line type="monotone" dataKey="views" stroke="#ff3e7f" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="p-12 text-center text-sm text-[var(--ink-soft)]">No observations in snapshot.</div>
            )}
          </section>

          <section className="editorial-card overflow-hidden">
            <header className="editorial-card-header">
              <div className="eyebrow">Brand → Topic Correlations</div>
              <h2 className="font-display text-lg text-[var(--ink)] mt-0.5">
                Which brands ride this topic — and how hard?
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                Sorted by composite attention score. Wiki growth = brand's own pageview delta over 28 days.
              </p>
            </header>
            {correlatedBrands.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm tabular">
                  <thead className="bg-[var(--bg-3)] border-b border-[var(--hairline)]">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Handle</th>
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Brand</th>
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Vertical</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Attention</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Wiki growth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--hairline-soft)]">
                    {correlatedBrands.map((b) => (
                      <tr
                        key={b.brand_id}
                        onClick={() => navigate(`/brands/${encodeURIComponent(b.brand_id)}`)}
                        className="cursor-pointer hover:bg-[var(--bg-3)]"
                      >
                        <td className="px-4 py-2.5 handle text-[var(--magenta)]">{b.brand_handle}</td>
                        <td className="px-4 py-2.5 font-display text-[var(--ink)]">{b.brand_name}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">{b.vertical ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-[var(--cyan-bright)] tabular">{Math.round(b.attention_score)}</td>
                        <td className="px-4 py-2.5 text-right text-xs tabular">
                          <span className={b.wiki_pageviews_growth_28d_pct == null
                            ? 'text-[var(--ink-soft)]'
                            : b.wiki_pageviews_growth_28d_pct >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}>
                            {b.wiki_pageviews_growth_28d_pct == null ? '—' : formatPercent(b.wiki_pageviews_growth_28d_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-[var(--ink-soft)]">No related brands recorded for this topic.</p>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function QuoteTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'warn' }) {
  const subColor = tone === 'up' ? 'text-[var(--up)]' : tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--ink-muted)]';
  return (
    <div className="metric-tile">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value text-base sm:text-xl truncate" title={value}>{value}</div>
      {sub && <div className={`mt-0.5 text-[11px] font-bold tabular ${subColor}`}>{sub}</div>}
    </div>
  );
}
