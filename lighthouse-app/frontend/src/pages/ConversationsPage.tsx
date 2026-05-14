import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api, formatCount, formatSentiment, sentimentColor } from '../api/queries';
import type { Conversation, Brand } from '../types';
import Sparkline from '../components/Sparkline';

// Bucket conversations into N daily buckets ending on the most recent post.
// Returns counts per bucket plus the bucket boundaries so other metrics can reuse them.
function buildDailyBuckets(conversations: Conversation[], days = 12): { boundaries: number[]; counts: number[]; sums: number[] } {
  if (conversations.length === 0) return { boundaries: [], counts: [], sums: [] };
  let maxTs = 0;
  for (const c of conversations) {
    const t = new Date(c.posted_at).getTime();
    if (!Number.isNaN(t) && t > maxTs) maxTs = t;
  }
  if (maxTs === 0) return { boundaries: [], counts: [], sums: [] };
  const dayMs = 86_400_000;
  // Boundary i = end of bucket i (exclusive). Bucket 0 is the oldest.
  const end = maxTs + 1;
  const boundaries: number[] = [];
  for (let i = 0; i < days; i++) {
    boundaries.push(end - (days - 1 - i) * dayMs);
  }
  const counts = new Array<number>(days).fill(0);
  const sums = new Array<number>(days).fill(0);
  const start = boundaries[0] - dayMs;
  for (const c of conversations) {
    const t = new Date(c.posted_at).getTime();
    if (Number.isNaN(t) || t < start || t >= end) continue;
    const idx = Math.min(days - 1, Math.floor((t - start) / dayMs));
    counts[idx] += 1;
    sums[idx] += c.sentiment;
  }
  return { boundaries, counts, sums };
}

type SentimentFilter = 'all' | 'positive' | 'neutral' | 'negative';

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '—';
  const diffMs = Date.now() - d;
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ConversationsPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [topicCluster, setTopicCluster] = useState<string>('');
  const [subreddit, setSubreddit] = useState<string>('');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getConversations(),
      api.searchBrands({ limit: 100000 }),
    ])
      .then(([c, b]) => {
        setConversations(c.conversations ?? []);
        setBrands(b.results);
      })
      .finally(() => setLoading(false));
  }, []);

  const brandsById = useMemo(() => {
    const m = new Map<string, Brand>();
    for (const b of brands) m.set(b.brand_id, b);
    return m;
  }, [brands]);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (topicCluster && c.topic_cluster !== topicCluster) return false;
      if (subreddit && c.subreddit !== subreddit) return false;
      if (sentiment === 'positive' && !(c.sentiment > 0.2)) return false;
      if (sentiment === 'negative' && !(c.sentiment < -0.2)) return false;
      if (sentiment === 'neutral' && (c.sentiment > 0.2 || c.sentiment < -0.2)) return false;
      return true;
    });
  }, [conversations, topicCluster, subreddit, sentiment]);

  const stats = useMemo(() => {
    if (conversations.length === 0) return null;
    const total = conversations.length;
    const avgSent = conversations.reduce((s, c) => s + c.sentiment, 0) / total;
    const negShare = conversations.filter((c) => c.sentiment < -0.2).length / total;
    const brandCounts = new Map<string, number>();
    const subCounts = new Map<string, number>();
    for (const c of conversations) {
      if (c.brand_id) brandCounts.set(c.brand_id, (brandCounts.get(c.brand_id) ?? 0) + 1);
      subCounts.set(c.subreddit, (subCounts.get(c.subreddit) ?? 0) + 1);
    }
    let topBrand: { id: string; n: number } | null = null;
    for (const [id, n] of brandCounts) if (!topBrand || n > topBrand.n) topBrand = { id, n };
    let topSub: { name: string; n: number } | null = null;
    for (const [name, n] of subCounts) if (!topSub || n > topSub.n) topSub = { name, n };
    // Sub concentration risk — Herfindahl-style: sum of squared shares of top 5 subs.
    const subShares = Array.from(subCounts.values())
      .map((n) => n / total)
      .sort((a, b) => b - a)
      .slice(0, 5);
    const top5Share = subShares.reduce((s, v) => s + v, 0);
    return { total, avgSent, negShare, topBrand, topSub, top5Share };
  }, [conversations]);

  const sparkSeries = useMemo(() => {
    if (conversations.length === 0) return null;
    const overall = buildDailyBuckets(conversations);
    const sentiment = overall.counts.map((n, i) => (n > 0 ? overall.sums[i] / n : 0));
    const topBrandId = stats?.topBrand?.id ?? null;
    const topSubName = stats?.topSub?.name ?? null;
    const brandSeries = topBrandId
      ? buildDailyBuckets(conversations.filter((c) => c.brand_id === topBrandId)).counts
      : [];
    const subSeries = topSubName
      ? buildDailyBuckets(conversations.filter((c) => c.subreddit === topSubName)).counts
      : [];
    return { volume: overall.counts, sentiment, brand: brandSeries, sub: subSeries };
  }, [conversations, stats]);

  // Volume + avg sentiment per topic cluster. Sorted by volume descending so
  // the most material clusters are at the top in a horizontal bar layout.
  const topicChartData = useMemo(() => {
    const counts = new Map<string, { count: number; sum: number }>();
    for (const c of conversations) {
      const k = c.topic_cluster ?? 'Uncategorized';
      const prev = counts.get(k) ?? { count: 0, sum: 0 };
      prev.count += 1;
      prev.sum += c.sentiment;
      counts.set(k, prev);
    }
    return Array.from(counts.entries())
      .map(([topic, v]) => ({ topic, count: v.count, sentiment: v.count > 0 ? v.sum / v.count : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [conversations]);

  const subredditOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of conversations) s.add(c.subreddit);
    return Array.from(s).sort();
  }, [conversations]);

  const topicOptions = useMemo(() => topicChartData.map((d) => d.topic), [topicChartData]);

  const feed = useMemo(() => {
    return [...filtered].sort((a, b) => b.score - a.score).slice(0, 40);
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="eyebrow mb-1">Social Signal</div>
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">Conversations</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
          Reddit conversation radar from{' '}
          <code className="font-mono text-xs bg-[var(--bg-2)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">gold.fct_conversations</code>{' '}
          — recent posts attributed to brands in the panel, with sentiment + topic-cluster tagging.
        </p>
      </header>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="metric-tile">
            <div className="metric-tile-label">Conversations 28d</div>
            <div className="metric-tile-value">{formatCount(stats.total)}</div>
            {sparkSeries && (
              <Sparkline
                values={sparkSeries.volume}
                width={96}
                height={20}
                stroke="var(--magenta)"
                fill="var(--magenta)"
                className="mt-1.5 block"
              />
            )}
          </div>
          <div className="metric-tile">
            <div className="metric-tile-label">Avg sentiment</div>
            <div className="metric-tile-value" style={{ color: sentimentColor(stats.avgSent) }}>{formatSentiment(stats.avgSent)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular">
              {(stats.negShare * 100).toFixed(0)}% negative · top-5 subs = {(stats.top5Share * 100).toFixed(0)}%
            </div>
            {sparkSeries && (
              <Sparkline
                values={sparkSeries.sentiment}
                width={96}
                height={20}
                stroke={sentimentColor(stats.avgSent)}
                fill={sentimentColor(stats.avgSent)}
                className="mt-1.5 block"
              />
            )}
          </div>
          <div className="metric-tile">
            <div className="metric-tile-label">Most-mentioned</div>
            <div className="metric-tile-value text-xl truncate" title={stats.topBrand ? brandsById.get(stats.topBrand.id)?.brand_name ?? stats.topBrand.id : '—'}>
              {stats.topBrand ? brandsById.get(stats.topBrand.id)?.brand_name ?? stats.topBrand.id : '—'}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular">{stats.topBrand?.n ?? 0} mentions</div>
            {sparkSeries && sparkSeries.brand.length > 0 && (
              <Sparkline
                values={sparkSeries.brand}
                width={96}
                height={20}
                stroke="var(--magenta)"
                fill="var(--magenta)"
                className="mt-1.5 block"
              />
            )}
          </div>
          <div className="metric-tile">
            <div className="metric-tile-label">Most-active sub</div>
            <div className="metric-tile-value text-xl truncate">r/{stats.topSub?.name ?? '—'}</div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular">{stats.topSub?.n ?? 0} posts</div>
            {sparkSeries && sparkSeries.sub.length > 0 && (
              <Sparkline
                values={sparkSeries.sub}
                width={96}
                height={20}
                stroke="var(--cyan)"
                fill="var(--cyan)"
                className="mt-1.5 block"
              />
            )}
          </div>
        </div>
      )}

      {/* Topic-cluster horizontal bar — sorted, sentiment-coloured. */}
      <section className="editorial-card overflow-hidden mb-6">
        <header className="editorial-card-header">
          <div className="eyebrow">Topic Clusters · 28d</div>
          <h2 className="font-display text-lg text-[var(--ink)] mt-0.5">
            Which conversations dominate — and how do audiences feel?
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            Bar length = conversation volume. Colour = average sentiment of the cluster
            (<span style={{ color: 'var(--up)' }}>positive</span> ·{' '}
            <span style={{ color: 'var(--ink-muted)' }}>neutral</span> ·{' '}
            <span style={{ color: 'var(--down)' }}>negative</span>). Click to filter the feed.
          </p>
        </header>
        <div className="p-4" style={{ height: Math.max(220, topicChartData.length * 28 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={topicChartData}
              margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="#1f1d24" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#b5afa0', fontSize: 11 }} stroke="#36322c" />
              <YAxis
                type="category"
                dataKey="topic"
                tick={{ fill: '#f7f3ec', fontSize: 11 }}
                stroke="#36322c"
                width={130}
                interval={0}
              />
              <Tooltip
                contentStyle={{ background: '#0e0d10', border: '1px solid #36322c', fontSize: 12, color: '#f7f3ec' }}
                labelStyle={{ color: '#b5afa0' }}
                cursor={{ fill: 'rgba(255,62,127,0.06)' }}
                formatter={(v: any, _n: any, p: any) => [
                  `${v} posts · sent ${p.payload.sentiment >= 0 ? '+' : ''}${Number(p.payload.sentiment).toFixed(2)}`,
                  'Cluster',
                ]}
              />
              <Bar
                dataKey="count"
                radius={[0, 2, 2, 0]}
                onClick={(d: any) => setTopicCluster(d.topic === topicCluster ? '' : d.topic)}
                style={{ cursor: 'pointer' }}
                label={{ position: 'right', fill: '#b5afa0', fontSize: 10 }}
              >
                {topicChartData.map((entry, idx) => {
                  const selected = entry.topic === topicCluster;
                  // Sentiment-driven fill: functional colour, not decorative.
                  const fill = selected
                    ? '#ff3e7f'
                    : entry.sentiment > 0.15 ? '#2dd4a7'
                    : entry.sentiment < -0.15 ? '#fb4570'
                    : '#6f6a5e';
                  return <Cell key={idx} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[10px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">Filters:</span>
        <select
          value={topicCluster}
          onChange={(e) => setTopicCluster(e.target.value)}
          className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] text-[var(--ink)] px-2 py-1 text-xs"
        >
          <option value="">All clusters</option>
          {topicOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={subreddit}
          onChange={(e) => setSubreddit(e.target.value)}
          className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] text-[var(--ink)] px-2 py-1 text-xs"
        >
          <option value="">All subreddits</option>
          {subredditOptions.map((s) => <option key={s} value={s}>r/{s}</option>)}
        </select>
        {(['all', 'positive', 'neutral', 'negative'] as SentimentFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setSentiment(s)}
            className={`signal-pill ${
              sentiment === s
                ? (s === 'positive' ? 'up' : s === 'negative' ? 'down' : s === 'neutral' ? 'neutral' : 'magenta')
                : 'neutral opacity-60 hover:opacity-100'
            }`}
            style={{ cursor: 'pointer' }}
          >
            {s}
          </button>
        ))}
        {(topicCluster || subreddit || sentiment !== 'all') && (
          <button
            onClick={() => { setTopicCluster(''); setSubreddit(''); setSentiment('all'); }}
            className="text-xs text-[var(--magenta)] hover:text-[var(--magenta-bright)] font-bold ml-auto"
          >
            Clear all →
          </button>
        )}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="editorial-card p-12 text-center text-[var(--ink-soft)]">Loading conversation feed…</div>
      ) : feed.length === 0 ? (
        <div className="editorial-card p-12 text-center text-[var(--ink-soft)]">No conversations match these filters.</div>
      ) : (
        <ul className="space-y-3">
          {feed.map((c) => {
            const brand = c.brand_id ? brandsById.get(c.brand_id) : null;
            return (
              <li key={c.post_id} className="editorial-card p-4 hover:border-[var(--magenta)] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="platform-badge reddit">r/{c.subreddit}</span>
                      {c.topic_cluster && (
                        <span className="text-[10px] font-mono text-[var(--cyan-bright)] uppercase tracking-wider">{c.topic_cluster}</span>
                      )}
                      {brand && (
                        <button
                          onClick={() => navigate(`/brands/${encodeURIComponent(brand.brand_id)}`)}
                          className="signal-pill magenta cursor-pointer"
                          title="Open brand panel"
                        >
                          {brand.brand_handle}
                        </button>
                      )}
                      {!brand && c.brand_name_match && (
                        <span className="signal-pill neutral">{c.brand_name_match}</span>
                      )}
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display text-lg text-[var(--ink)] hover:text-[var(--magenta-bright)] block"
                    >
                      {c.title}
                    </a>
                    <div className="mt-1 text-[11px] text-[var(--ink-soft)] flex items-center gap-2">
                      <span className="handle">@{c.author}</span>
                      <span aria-hidden>·</span>
                      <span>score {c.score}</span>
                      <span aria-hidden>·</span>
                      <span>{c.num_comments} comments</span>
                      <span aria-hidden>·</span>
                      <span>{timeAgo(c.posted_at)}</span>
                    </div>
                  </div>
                  <span
                    className="signal-pill shrink-0"
                    style={{
                      color: sentimentColor(c.sentiment),
                      borderColor: sentimentColor(c.sentiment),
                      background: 'transparent',
                    }}
                  >
                    {formatSentiment(c.sentiment)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
