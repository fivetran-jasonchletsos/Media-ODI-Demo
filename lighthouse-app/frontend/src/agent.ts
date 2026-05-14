// ============================================================
// Lighthouse Research AI — local rules tier + optional Claude tier.
// Reasons over the gold-layer fct_brand_signal mart (YouTube +
// Reddit + Wikipedia cross-source attention signal).
// ============================================================

import type { Brand, Vertical } from './types';

export interface AgentResponse {
  intent: string;
  summary: string;
  source: 'rules' | 'claude';
  table?: { columns: string[]; rows: (string | number)[][] };
  brandIds?: string[];
}

const KEY = 'lighthouse-odi:anthropic-api-key';

export function getApiKey() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setApiKey(k: string | null) {
  try {
    if (k?.trim()) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch {}
}

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtSent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

const VERTICALS: Vertical[] = [
  'CPG', 'Retail', 'Auto', 'Tech', 'Finance', 'Streaming',
  'QSR', 'Beauty', 'Fashion', 'Travel', 'Gaming', 'Entertainment',
];

const intents: Array<{
  name: string;
  pattern: RegExp;
  handler: (m: RegExpMatchArray, brands: Brand[]) => AgentResponse;
}> = [
  {
    name: 'breakout_brands',
    pattern: /(breakout|surge|spike|hot|breakthrough)/i,
    handler: (_, brands) => {
      const hits = brands
        .filter((b) => b.signal_bucket === 'breakout' || b.signal_bucket === 'hot')
        .sort((a, b) => b.attention_score - a.attention_score)
        .slice(0, 25);
      return {
        intent: 'breakout_brands',
        source: 'rules',
        summary: `Top ${hits.length} brands flagged as breakout or hot by the cross-source attention model. These are the audience-momentum stories worth a campaign brief this week.`,
        table: {
          columns: ['@handle', 'Brand', 'Vertical', 'Attention', 'Signal'],
          rows: hits.map((b) => [b.brand_handle, b.brand_name, b.vertical ?? '—', Math.round(b.attention_score), b.signal_bucket]),
        },
        brandIds: hits.map((b) => b.brand_id),
      };
    },
  },
  {
    name: 'negative_sentiment',
    pattern: /(negative|backlash|controversy|complaint|crisis)/i,
    handler: (_, brands) => {
      const hits = brands
        .filter((b) => b.reddit_avg_sentiment < 0)
        .sort((a, b) => a.reddit_avg_sentiment - b.reddit_avg_sentiment)
        .slice(0, 25);
      return {
        intent: 'negative_sentiment',
        source: 'rules',
        summary: `${hits.length} brands carrying net-negative Reddit sentiment in the last 28 days. Worth a deeper look at the thread-level conversations before the story spreads.`,
        table: {
          columns: ['@handle', 'Brand', 'Vertical', 'Sentiment', 'Reddit 28d'],
          rows: hits.map((b) => [b.brand_handle, b.brand_name, b.vertical ?? '—', fmtSent(b.reddit_avg_sentiment), fmtCount(b.reddit_mentions_28d)]),
        },
        brandIds: hits.map((b) => b.brand_id),
      };
    },
  },
  {
    name: 'youtube_growth',
    pattern: /(youtube|video|subs|subscriber)/i,
    handler: (_, brands) => {
      const hits = brands
        .filter((b) => b.yt_subs_growth_28d_pct !== null)
        .sort((a, b) => (b.yt_subs_growth_28d_pct ?? -Infinity) - (a.yt_subs_growth_28d_pct ?? -Infinity))
        .slice(0, 25);
      return {
        intent: 'youtube_growth',
        source: 'rules',
        summary: `Top ${hits.length} brands by YouTube subscriber growth (28d). These channels are compounding audience right now — the moments to watch for collab and sponsorship pricing leverage.`,
        table: {
          columns: ['@handle', 'Brand', 'YT subs', 'Growth 28d', 'YT views 28d'],
          rows: hits.map((b) => [b.brand_handle, b.brand_name, fmtCount(b.yt_subscribers), fmtPct(b.yt_subs_growth_28d_pct), fmtCount(b.yt_views_28d)]),
        },
        brandIds: hits.map((b) => b.brand_id),
      };
    },
  },
  {
    name: 'wiki_velocity',
    pattern: /(wiki|pageview|interest|search.+trend)/i,
    handler: (_, brands) => {
      const hits = brands
        .filter((b) => b.wiki_pageviews_growth_28d_pct !== null)
        .sort((a, b) => (b.wiki_pageviews_growth_28d_pct ?? -Infinity) - (a.wiki_pageviews_growth_28d_pct ?? -Infinity))
        .slice(0, 25);
      return {
        intent: 'wiki_velocity',
        source: 'rules',
        summary: `Top ${hits.length} brands by Wikipedia pageview growth (28d). A pageview spike is the most leading of leading indicators — cultural curiosity often precedes purchase intent.`,
        table: {
          columns: ['@handle', 'Brand', 'Vertical', 'Wiki 28d', 'Growth 28d'],
          rows: hits.map((b) => [b.brand_handle, b.brand_name, b.vertical ?? '—', fmtCount(b.wiki_pageviews_28d), fmtPct(b.wiki_pageviews_growth_28d_pct)]),
        },
        brandIds: hits.map((b) => b.brand_id),
      };
    },
  },
  {
    name: 'low_attention',
    pattern: /(low|cold|fading|declining|dormant)/i,
    handler: (_, brands) => {
      const hits = brands
        .filter((b) => b.signal_bucket === 'cold')
        .sort((a, b) => a.attention_score - b.attention_score)
        .slice(0, 25);
      return {
        intent: 'low_attention',
        source: 'rules',
        summary: `${hits.length} brands in the cold bucket — minimal cross-source momentum. Brands here are either truly dormant or being underserved by current creative; both are usable signals.`,
        table: {
          columns: ['@handle', 'Brand', 'Vertical', 'Attention', 'Signal'],
          rows: hits.map((b) => [b.brand_handle, b.brand_name, b.vertical ?? '—', Math.round(b.attention_score), b.signal_bucket]),
        },
        brandIds: hits.map((b) => b.brand_id),
      };
    },
  },
];

function detectVertical(q: string): Vertical | null {
  const lower = q.toLowerCase();
  for (const v of VERTICALS) {
    if (lower.includes(v.toLowerCase())) return v;
  }
  if (/\b(fast.?food|restaurant|burger|pizza)\b/.test(lower)) return 'QSR';
  if (/\b(software|saas|semi|ai|cloud)\b/.test(lower)) return 'Tech';
  if (/\b(car|truck|ev|automaker)\b/.test(lower)) return 'Auto';
  if (/\b(clothing|apparel|sneaker)\b/.test(lower)) return 'Fashion';
  if (/\b(makeup|cosmetic|skincare)\b/.test(lower)) return 'Beauty';
  if (/\b(stream|netflix|disney|streaming)\b/.test(lower)) return 'Streaming';
  if (/\b(game|gaming|console|esports)\b/.test(lower)) return 'Gaming';
  return null;
}

export function answer(question: string, brands: Brand[]): AgentResponse {
  const q = question.trim();
  if (!q) return { intent: 'empty', source: 'rules', summary: 'Ask me something — try one of the suggestions.' };

  for (const intent of intents) {
    const m = q.match(intent.pattern);
    if (m) return intent.handler(m, brands);
  }

  // Vertical filter fallback
  const vertical = detectVertical(q);
  if (vertical) {
    const hits = brands
      .filter((b) => b.vertical === vertical)
      .sort((a, b) => b.attention_score - a.attention_score)
      .slice(0, 25);
    return {
      intent: 'vertical_filter',
      source: 'rules',
      summary: `${hits.length} brands in ${vertical}, sorted by attention score.`,
      table: {
        columns: ['@handle', 'Brand', 'Attention', 'YT subs', 'Reddit 28d', 'Signal'],
        rows: hits.map((b) => [b.brand_handle, b.brand_name, Math.round(b.attention_score), fmtCount(b.yt_subscribers), fmtCount(b.reddit_mentions_28d), b.signal_bucket]),
      },
      brandIds: hits.map((b) => b.brand_id),
    };
  }

  // Substring fallback
  const lower = q.toLowerCase();
  const hits = brands.filter(
    (b) =>
      b.brand_name.toLowerCase().includes(lower) ||
      b.brand_handle.toLowerCase().includes(lower) ||
      (b.description ?? '').toLowerCase().includes(lower),
  );
  if (hits.length > 0) {
    const slice = hits.slice(0, 25);
    return {
      intent: 'substring_match',
      source: 'rules',
      summary: `${hits.length} brands match "${q}".`,
      table: {
        columns: ['@handle', 'Brand', 'Vertical', 'Attention', 'Signal'],
        rows: slice.map((b) => [b.brand_handle, b.brand_name, b.vertical ?? '—', Math.round(b.attention_score), b.signal_bucket]),
      },
      brandIds: slice.map((b) => b.brand_id),
    };
  }

  return {
    intent: 'no_match',
    source: 'rules',
    summary: `No local rule matched "${q}". Try one of the suggestions, or enable Claude mode for richer reasoning over the snapshot.`,
  };
}

// ---------------------------------------------------------------------------
// Claude opt-in path

function summarizeForClaude(brands: Brand[]) {
  const total = brands.length;
  const totalYtViews28d = brands.reduce((s, b) => s + (b.yt_views_28d ?? 0), 0);
  const totalReddit28d = brands.reduce((s, b) => s + b.reddit_mentions_28d, 0);
  const totalWiki28d = brands.reduce((s, b) => s + b.wiki_pageviews_28d, 0);
  const avgAttention = brands.reduce((s, b) => s + b.attention_score, 0) / Math.max(1, total);
  const avgSentiment = brands.reduce((s, b) => s + b.reddit_avg_sentiment, 0) / Math.max(1, total);

  const byVertical: Record<string, { count: number; avg_attention: number; total_yt_views_28d: number }> = {};
  for (const b of brands) {
    const k = b.vertical ?? 'Unknown';
    const row = byVertical[k] ?? { count: 0, avg_attention: 0, total_yt_views_28d: 0 };
    row.count += 1;
    row.avg_attention += b.attention_score;
    row.total_yt_views_28d += b.yt_views_28d ?? 0;
    byVertical[k] = row;
  }
  for (const k of Object.keys(byVertical)) {
    byVertical[k].avg_attention = Math.round((byVertical[k].avg_attention / byVertical[k].count) * 10) / 10;
  }

  const bucketHist: Record<string, number> = { cold: 0, warming: 0, hot: 0, breakout: 0 };
  for (const b of brands) bucketHist[b.signal_bucket] = (bucketHist[b.signal_bucket] ?? 0) + 1;

  return {
    total_brands: total,
    total_youtube_views_28d: totalYtViews28d,
    total_reddit_mentions_28d: totalReddit28d,
    total_wiki_pageviews_28d: totalWiki28d,
    avg_attention_score: Math.round(avgAttention * 10) / 10,
    avg_reddit_sentiment: Math.round(avgSentiment * 100) / 100,
    by_vertical: byVertical,
    signal_bucket_histogram: bucketHist,
  };
}

const SYSTEM = `You are a senior audience analyst at Lighthouse Media, a cross-channel attention intelligence platform.
You reason over a snapshot of the brand panel sourced from YouTube, Reddit, and Wikipedia, materialized in an
Apache Iceberg gold layer (gold.fct_brand_signal) and exported to a JSON snapshot.

Voice: editorial, sharp, contemporary. Reference specific data points from the JSON summary. Talk about audience,
attention, momentum, and culture — not financial risk. Format large numbers as 12.3M / 4.5K and percentages with
one decimal (e.g. +3.2%). Never invent brand names, handles, or numbers. If a question can't be answered from
the snapshot, say so. Keep responses concise — bullets or a short paragraph, not essays.`;

export async function askClaude(
  question: string,
  brands: Brand[],
  recentSummary?: string,
): Promise<AgentResponse> {
  const key = getApiKey();
  if (!key) {
    return { intent: 'claude_no_key', source: 'claude', summary: 'Add your Anthropic API key in Settings to enable Claude mode.' };
  }
  const summary = summarizeForClaude(brands);
  const userContent = [
    `Snapshot summary (JSON):\n\`\`\`json\n${JSON.stringify(summary)}\n\`\`\``,
    recentSummary ? `Prior context: ${recentSummary}` : '',
    `Question: ${question}`,
  ].filter(Boolean).join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude ${res.status}: ${detail.slice(0, 200)}`);
  }
  const payload = await res.json();
  const text: string = payload?.content?.find((c: any) => c.type === 'text')?.text ?? '(no response)';
  return { intent: 'claude', source: 'claude', summary: text };
}
