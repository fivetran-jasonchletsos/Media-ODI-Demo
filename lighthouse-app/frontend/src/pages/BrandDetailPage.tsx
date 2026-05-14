import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine,
} from 'recharts';
import { api, formatCount, formatPercent, sentimentColor } from '../api/queries';
import type { BrandDetail, SignalBucket, Conversation, Video } from '../types';
import WatchlistButton from '../components/WatchlistButton';

function bucketPill(bucket: SignalBucket): string {
  switch (bucket) {
    case 'breakout': return 'magenta';
    case 'hot':      return 'warn';
    case 'warming':  return 'cyan';
    case 'cold':     return 'neutral';
  }
}

export default function BrandDetailPage() {
  const { brandId = '' } = useParams();
  const [brand, setBrand] = useState<BrandDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getBrand(brandId)
      .then(setBrand)
      .catch(() => setBrand(null))
      .finally(() => setLoading(false));
  }, [brandId]);

  const sortedVideos = useMemo<Video[]>(() => {
    if (!brand) return [];
    return [...brand.videos].sort((a, b) => b.views - a.views).slice(0, 25);
  }, [brand]);

  const recentConversations = useMemo<Conversation[]>(() => {
    if (!brand) return [];
    return [...brand.conversations]
      .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
      .slice(0, 25);
  }, [brand]);

  const timelineData = useMemo(() => {
    if (!brand) return [];
    return brand.pageviews_timeline
      .slice(-90)
      .map((p) => ({ date: p.date, views: p.views }));
  }, [brand]);

  const peakPoint = useMemo(() => {
    if (timelineData.length === 0) return null;
    let max = timelineData[0];
    for (const p of timelineData) if (p.views > max.views) max = p;
    return max;
  }, [timelineData]);

  const timelineMean = useMemo(() => {
    if (timelineData.length === 0) return null;
    let s = 0;
    for (const p of timelineData) s += p.views;
    return s / timelineData.length;
  }, [timelineData]);

  if (loading || !brand) {
    return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[var(--ink-soft)]">Loading brand panel…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-[var(--ink-soft)] mb-4 flex items-center gap-1.5">
        <Link to="/" className="hover:text-[var(--ink)]">Home</Link>
        <span aria-hidden>/</span>
        <Link to="/brands" className="hover:text-[var(--ink)]">Brands</Link>
        <span aria-hidden>/</span>
        <span className="handle text-[var(--ink-muted)]">{brand.brand_handle}</span>
      </nav>

      {/* Hero banner — dark editorial with magenta left border */}
      <header
        className="rounded-sm overflow-hidden shadow-sm border-l-4 border border-[var(--hairline)]"
        style={{ background: 'var(--bg-2)', borderLeftColor: 'var(--magenta)' }}
      >
        <div className="px-6 py-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 text-[var(--ink)]">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="handle text-2xl text-[var(--magenta)]">{brand.brand_handle}</span>
              <span className={`signal-pill ${bucketPill(brand.signal_bucket)}`}>{brand.signal_bucket}</span>
            </div>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl tracking-tight text-[var(--ink)]">
              {brand.brand_name}
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              {[brand.vertical, brand.hq_country, brand.established_year ? `est. ${brand.established_year}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {brand.description && (
              <p className="mt-3 max-w-3xl text-sm text-[var(--ink-muted)] leading-relaxed line-clamp-3">{brand.description}</p>
            )}
          </div>

          <div className="shrink-0 w-full lg:w-auto">
            <div className="grid grid-cols-3 gap-2 lg:gap-3">
              <BannerStat label="Attention" value={Math.round(brand.attention_score).toString()} accent="var(--cyan-bright)" />
              <BannerStat label="YT subs" value={formatCount(brand.yt_subscribers)} />
              <BannerStat label="Reddit 28d" value={formatCount(brand.reddit_mentions_28d)} />
            </div>
            <div className="mt-3 flex items-center justify-end">
              <WatchlistButton brandId={brand.brand_id} />
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section A — Cross-platform Signal */}
        <section className="editorial-card overflow-hidden lg:col-span-2">
          <header className="editorial-card-header">
            <div className="eyebrow">Section A</div>
            <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">Cross-platform signal</h2>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft)]">
            <PlatformPanel
              platform="youtube"
              headline={formatCount(brand.yt_views_28d)}
              label="views (28d)"
              delta={brand.yt_subs_growth_28d_pct}
              deltaLabel="subs 28d"
            />
            <PlatformPanel
              platform="reddit"
              headline={formatCount(brand.reddit_mentions_28d)}
              label="mentions (28d)"
              deltaSentiment={brand.reddit_avg_sentiment}
              deltaLabel="avg sentiment"
            />
            <PlatformPanel
              platform="wikipedia"
              headline={formatCount(brand.wiki_pageviews_28d)}
              label="pageviews (28d)"
              delta={brand.wiki_pageviews_growth_28d_pct}
              deltaLabel="growth 28d"
            />
          </div>
        </section>

        {/* Section B — Top Videos */}
        <section className="editorial-card overflow-hidden lg:col-span-2">
          <header className="editorial-card-header flex items-center justify-between">
            <div>
              <div className="eyebrow">Section B</div>
              <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">Top videos</h2>
            </div>
            <span className="text-xs text-[var(--ink-soft)] tabular">{brand.videos.length} on file</span>
          </header>
          {sortedVideos.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm tabular">
                <thead className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] bg-[var(--bg-3)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold w-20">Thumb</th>
                    <th className="px-4 py-2 text-left font-bold">Title</th>
                    <th className="px-4 py-2 text-left font-bold">Published</th>
                    <th className="px-4 py-2 text-right font-bold">Views</th>
                    <th className="px-4 py-2 text-right font-bold">Engagement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline-soft)]">
                  {sortedVideos.map((v) => (
                    <tr key={v.video_id} className="hover:bg-[var(--bg-3)]">
                      <td className="px-3 py-2">
                        {v.thumbnail_url ? (
                          <img src={v.thumbnail_url} alt="" className="h-10 w-16 object-cover rounded-sm border border-[var(--hairline)]" />
                        ) : (
                          <div
                            className="h-10 w-16 rounded-sm border border-[var(--hairline)] flex items-center justify-center text-[10px] font-mono font-bold text-[var(--bg)]"
                            style={{ background: 'var(--magenta)' }}
                          >
                            VID
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[var(--ink)] max-w-md truncate">{v.title}</td>
                      <td className="px-4 py-2 text-[var(--ink-muted)] text-xs font-mono">{v.published_at.slice(0, 10)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-[var(--ink)]">{formatCount(v.views)}</td>
                      <td className="px-4 py-2 text-right text-[var(--cyan-bright)]">{(v.engagement_rate * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-[var(--ink-soft)]">No videos on file in the snapshot.</p>
          )}
        </section>

        {/* Section C — Reddit Conversations */}
        <section className="editorial-card overflow-hidden">
          <header className="editorial-card-header">
            <div className="eyebrow">Section C</div>
            <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">Reddit conversations</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1">Recent posts attributed to this brand on Reddit.</p>
          </header>
          {recentConversations.length > 0 ? (
            <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
              {recentConversations.slice(0, 10).map((c) => (
                <li key={c.post_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="platform-badge reddit">r/{c.subreddit}</span>
                        {c.topic_cluster && (
                          <span className="text-[10px] font-mono text-[var(--cyan-bright)] uppercase tracking-wider">{c.topic_cluster}</span>
                        )}
                      </div>
                      <div className="text-[var(--ink)] truncate" title={c.title}>{c.title}</div>
                      <div className="text-[11px] text-[var(--ink-soft)] mt-1">
                        <span className="handle">@{c.author}</span> · score {c.score} · {c.num_comments} comments
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
                      {c.sentiment >= 0 ? '+' : ''}{c.sentiment.toFixed(2)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-[var(--ink-soft)]">No Reddit conversations linked.</p>
          )}
        </section>

        {/* Section D — Wikipedia Pageviews Timeline */}
        <section className="editorial-card overflow-hidden">
          <header className="editorial-card-header">
            <div className="eyebrow">Section D</div>
            <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">Wikipedia pageviews · 90d</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              Daily interest curve. Dashed line = 90-day mean. Magenta dot = peak.
            </p>
          </header>
          {timelineData.length > 0 ? (
            <div className="p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#1f1d24" />
                  <XAxis dataKey="date" tick={{ fill: '#b5afa0', fontSize: 11 }} stroke="#36322c" tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis tick={{ fill: '#b5afa0', fontSize: 11 }} stroke="#36322c" tickFormatter={(v) => formatCount(v)} />
                  <Tooltip
                    contentStyle={{ background: '#0e0d10', border: '1px solid #36322c', fontSize: 12, color: '#f7f3ec' }}
                    labelStyle={{ color: '#b5afa0' }}
                  />
                  {timelineMean != null && (
                    <ReferenceLine y={timelineMean} stroke="#6f6a5e" strokeDasharray="3 3" strokeWidth={1} />
                  )}
                  <Line type="monotone" dataKey="views" stroke="#00e5ff" strokeWidth={2} dot={false} />
                  {peakPoint && (
                    <ReferenceDot x={peakPoint.date} y={peakPoint.views} r={5} fill="#ff3e7f" stroke="#f7f3ec" strokeWidth={1.5} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[var(--ink-soft)]">No pageview series available.</div>
          )}
        </section>

        {/* Section E — AI Summary */}
        {(brand.ai_summary || (brand.signal_factors && brand.signal_factors.length > 0)) && (
          <section
            className="rounded-sm overflow-hidden lg:col-span-2 border border-[var(--hairline)]"
            style={{ background: 'var(--magenta-bg)' }}
          >
            <header className="px-5 pt-4 pb-2">
              <div className="eyebrow">Section E</div>
              <h2 className="font-display text-xl text-[var(--ink)] mt-0.5">AI summary</h2>
            </header>
            <div className="px-5 pb-5">
              {brand.ai_summary && (
                <blockquote
                  className="font-display text-base leading-relaxed text-[var(--ink)] border-l-2 pl-4 py-1"
                  style={{ borderColor: 'var(--magenta)' }}
                >
                  {brand.ai_summary}
                </blockquote>
              )}
              {brand.signal_factors && brand.signal_factors.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--magenta)] mb-2">Signal factors</div>
                  <ul className="space-y-1.5 text-sm text-[var(--ink)]">
                    {brand.signal_factors.map((sf, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--cyan)' }} />
                        <span>{sf}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function BannerStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-sm bg-[var(--bg-3)] border border-[var(--hairline)] px-3 py-2 min-w-[7.5rem]">
      <div className="text-[9.5px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">{label}</div>
      <div
        className="mt-0.5 font-display text-xl tabular leading-none"
        style={{ color: accent ?? 'var(--ink)' }}
      >
        {value}
      </div>
    </div>
  );
}

function PlatformPanel({
  platform,
  headline,
  label,
  delta,
  deltaSentiment,
  deltaLabel,
}: {
  platform: 'youtube' | 'reddit' | 'wikipedia';
  headline: string;
  label: string;
  delta?: number | null;
  deltaSentiment?: number;
  deltaLabel: string;
}) {
  const showSentiment = deltaSentiment !== undefined;
  const sentColor = showSentiment ? sentimentColor(deltaSentiment) : undefined;
  const upDown =
    delta == null ? null : delta >= 0 ? 'up' : 'down';
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className={`platform-badge ${platform}`}>{platform}</span>
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-bold">{label}</span>
      </div>
      <div className="font-display text-4xl text-[var(--ink)] tabular leading-none">{headline}</div>
      <div className="mt-2 text-xs flex items-center gap-2">
        <span className="text-[var(--ink-soft)] uppercase tracking-wider">{deltaLabel}</span>
        {showSentiment ? (
          <span className="tabular font-semibold" style={{ color: sentColor }}>
            {deltaSentiment! >= 0 ? '+' : ''}{deltaSentiment!.toFixed(2)}
          </span>
        ) : (
          <span className={`tabular font-semibold ${
            upDown === 'up' ? 'text-[var(--up)]' : upDown === 'down' ? 'text-[var(--down)]' : 'text-[var(--ink-soft)]'
          }`}>
            {delta == null ? '—' : formatPercent(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

