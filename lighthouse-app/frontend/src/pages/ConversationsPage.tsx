import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api, formatCount, formatSentiment, sentimentColor } from '../api/queries';
import type { Conversation, Brand } from '../types';

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
    return { total, avgSent, topBrand, topSub };
  }, [conversations]);

  const topicChartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of conversations) {
      const k = c.topic_cluster ?? 'Uncategorized';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
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
          </div>
          <div className="metric-tile">
            <div className="metric-tile-label">Avg sentiment</div>
            <div className="metric-tile-value" style={{ color: sentimentColor(stats.avgSent) }}>{formatSentiment(stats.avgSent)}</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-label">Most-mentioned</div>
            <div className="metric-tile-value text-xl truncate" title={stats.topBrand ? brandsById.get(stats.topBrand.id)?.brand_name ?? stats.topBrand.id : '—'}>
              {stats.topBrand ? brandsById.get(stats.topBrand.id)?.brand_name ?? stats.topBrand.id : '—'}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular">{stats.topBrand?.n ?? 0} mentions</div>
          </div>
          <div className="metric-tile">
            <div className="metric-tile-label">Most-active sub</div>
            <div className="metric-tile-value text-xl truncate">r/{stats.topSub?.name ?? '—'}</div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular">{stats.topSub?.n ?? 0} posts</div>
          </div>
        </div>
      )}

      {/* Topic-cluster bar chart */}
      <section className="editorial-card overflow-hidden mb-6">
        <header className="editorial-card-header">
          <div className="eyebrow">Topic Clusters</div>
          <h2 className="font-display text-lg text-[var(--ink)] mt-0.5">Conversation volume by cluster</h2>
          <p className="text-xs text-[var(--ink-muted)] mt-1">Click a bar to filter the feed below.</p>
        </header>
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topicChartData} margin={{ top: 6, right: 16, left: 8, bottom: 30 }}>
              <CartesianGrid stroke="#1f1d24" />
              <XAxis dataKey="topic" tick={{ fill: '#b5afa0', fontSize: 10 }} stroke="#36322c" angle={-25} textAnchor="end" interval={0} height={50} />
              <YAxis tick={{ fill: '#b5afa0', fontSize: 11 }} stroke="#36322c" />
              <Tooltip
                contentStyle={{ background: '#0e0d10', border: '1px solid #36322c', fontSize: 12, color: '#f7f3ec' }}
                labelStyle={{ color: '#b5afa0' }}
                cursor={{ fill: 'rgba(255,62,127,0.08)' }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} onClick={(d: any) => setTopicCluster(d.topic === topicCluster ? '' : d.topic)} style={{ cursor: 'pointer' }}>
                {topicChartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.topic === topicCluster ? '#ff3e7f' : '#00e5ff'} />
                ))}
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
                ? (s === 'positive' ? 'up' : s === 'negative' ? 'down' : s === 'neutral' ? 'warn' : 'magenta')
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
