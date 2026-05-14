// ============================================================
// API helpers — read static JSON snapshots built by
// scripts/build_snapshot.py from Athena/Iceberg gold layer.
// ============================================================

import type {
  SummaryStats,
  BrandsResponse,
  Brand,
  BrandDetail,
  Video,
  VideosResponse,
  TopicsResponse,
  TopicDetail,
  PageviewObservation,
  ConversationsResponse,
  Conversation,
  IcebergTable,
  PipelineLayerStats,
} from '../types';

export type DataSource = 'live' | 'demo';

let lastSource: DataSource = 'demo';
let snapshotGeneratedAt: string | null = null;
const listeners = new Set<(s: DataSource) => void>();

function setSource(s: DataSource) {
  if (s === lastSource) return;
  lastSource = s;
  listeners.forEach((l) => l(s));
}

export function subscribeSource(fn: (s: DataSource) => void): () => void {
  listeners.add(fn);
  fn(lastSource);
  return () => listeners.delete(fn);
}

export function getSnapshotTime(): string | null {
  return snapshotGeneratedAt;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

let summaryCache: SummaryStats | null = null;
let brandsCache: BrandsResponse | null = null;
let topicsCache: TopicsResponse | null = null;
let conversationsCache: ConversationsResponse | null = null;
let videosCache: Video[] | null = null;
let icebergCache: IcebergTable[] | null = null;
let pipelineCache: PipelineLayerStats[] | null = null;

async function loadSummary(): Promise<SummaryStats> {
  if (summaryCache) return summaryCache;
  const data = await fetchJson<SummaryStats>('/data/summary.json');
  if (data.generated_at) snapshotGeneratedAt = data.generated_at;
  if (data.source) setSource(data.source);
  summaryCache = data;
  return data;
}

function rowsToObjects<T>(raw: any, listKey: string): T[] {
  if (Array.isArray(raw.rows) && Array.isArray(raw.columns)) {
    const cols: string[] = raw.columns;
    return raw.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      return obj as T;
    });
  }
  return (raw[listKey] ?? raw.results ?? []) as T[];
}

async function loadBrands(): Promise<BrandsResponse> {
  if (brandsCache) return brandsCache;
  const raw = await fetchJson<any>('/data/brands.json');
  const results = rowsToObjects<Brand>(raw, 'brands');
  brandsCache = { count: raw.count ?? results.length, results };
  return brandsCache;
}

async function loadVideos(): Promise<Video[]> {
  if (videosCache) return videosCache;
  const raw = await fetchJson<any>('/data/videos.json');
  videosCache = rowsToObjects<Video>(raw, 'videos');
  return videosCache;
}

async function loadTopics(): Promise<TopicsResponse> {
  if (topicsCache) return topicsCache;
  topicsCache = await fetchJson<TopicsResponse>('/data/topics.json');
  return topicsCache;
}

async function loadConversations(): Promise<ConversationsResponse> {
  if (conversationsCache) return conversationsCache;
  const raw = await fetchJson<any>('/data/conversations.json');
  const conversations = rowsToObjects<Conversation>(raw, 'conversations');
  conversationsCache = { conversations, summary: raw.summary };
  return conversationsCache;
}

async function loadIceberg(): Promise<IcebergTable[]> {
  if (icebergCache) return icebergCache;
  const data = await fetchJson<{ tables: IcebergTable[] }>('/data/iceberg.json');
  icebergCache = data.tables;
  return icebergCache;
}

async function loadPipeline(): Promise<PipelineLayerStats[]> {
  if (pipelineCache) return pipelineCache;
  const data = await fetchJson<{ layers: PipelineLayerStats[] }>('/data/pipeline.json');
  pipelineCache = data.layers;
  return pipelineCache;
}

const brandDetailCache = new Map<string, Promise<BrandDetail>>();

async function loadBrandDetail(brandId: string): Promise<BrandDetail> {
  if (brandDetailCache.has(brandId)) return brandDetailCache.get(brandId)!;
  const p = (async () => {
    const safe = brandId.replace(/\//g, '_');
    try {
      const bundle = await fetchJson<{ brand: BrandDetail }>(`/data/brands/${encodeURIComponent(safe)}.json`);
      return bundle.brand;
    } catch {
      return synthesizeBrandDetail(brandId);
    }
  })();
  brandDetailCache.set(brandId, p);
  return p;
}

async function synthesizeBrandDetail(brandId: string): Promise<BrandDetail> {
  const all = await loadBrands();
  const b = all.results.find((r) => r.brand_id === brandId);
  if (!b) throw new Error(`Brand ${brandId} not in snapshot.`);
  const allVideos = await loadVideos();
  const allConv = await loadConversations();
  return {
    ...b,
    videos: allVideos.filter((v) => v.brand_id === brandId).slice(0, 25),
    conversations: allConv.conversations.filter((c) => c.brand_id === brandId).slice(0, 25),
    topics: [],
    signal_factors: [],
    ai_summary: null,
    pageviews_timeline: [],
  };
}

const topicDetailCache = new Map<string, Promise<TopicDetail>>();

async function loadTopicDetail(topicId: string): Promise<TopicDetail> {
  if (topicDetailCache.has(topicId)) return topicDetailCache.get(topicId)!;
  const p = (async () => {
    try {
      return await fetchJson<TopicDetail>(`/data/topics/${encodeURIComponent(topicId)}.json`);
    } catch {
      const all = await loadTopics();
      const topic = all.topics.find((t) => t.topic_id === topicId);
      if (!topic) throw new Error(`Topic ${topicId} not in snapshot.`);
      return { topic, observations: [] as PageviewObservation[] };
    }
  })();
  topicDetailCache.set(topicId, p);
  return p;
}

export const api = {
  getSummary: () => loadSummary(),

  searchBrands: async (params: {
    q?: string;
    vertical?: string;
    bucket?: string;
    limit?: number;
  }) => {
    const all = await loadBrands();
    let results = all.results;
    if (params.q) {
      const q = params.q.toLowerCase();
      results = results.filter(
        (b) =>
          b.brand_name.toLowerCase().includes(q) ||
          b.brand_handle.toLowerCase().includes(q) ||
          (b.description ?? '').toLowerCase().includes(q),
      );
    }
    if (params.vertical) results = results.filter((b) => b.vertical === params.vertical);
    if (params.bucket) results = results.filter((b) => b.signal_bucket === params.bucket);
    if (params.limit) results = results.slice(0, params.limit);
    return { count: results.length, results };
  },

  getBrand: (brandId: string) => loadBrandDetail(brandId),
  getVideos: async (brandId?: string): Promise<VideosResponse> => {
    const all = await loadVideos();
    return { brand_id: brandId, videos: brandId ? all.filter((v) => v.brand_id === brandId) : all };
  },
  getTopics: () => loadTopics(),
  getTopic: (topicId: string) => loadTopicDetail(topicId),
  getConversations: () => loadConversations(),
  getIcebergTables: () => loadIceberg(),
  getPipelineStats: () => loadPipeline(),
};

// ============================================================
// Formatters
// ============================================================

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (abs >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function formatSentiment(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}

export function sentimentColor(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'var(--ink-muted)';
  if (n > 0.2) return 'var(--up)';
  if (n < -0.2) return 'var(--down)';
  return 'var(--warn)';
}
