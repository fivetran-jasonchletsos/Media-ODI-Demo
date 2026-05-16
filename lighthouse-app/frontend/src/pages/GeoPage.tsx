import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { formatCount, formatNumber, formatPercent } from '../api/queries';

// ------------------------------------------------------------------
// Lighthouse Media — Audience Geography + Ad Market page
//
// CEO/CRO read of how audience footprint and ad-yield line up across the
// top US DMAs (Designated Market Areas). Deliberately distinct from the
// Healthcare ZIP catchment map:
//   - DMA (not ZIP) — TV/streaming market unit
//   - choropleth-feel via deterministic synthetic data per DMA (no live API)
//   - colored by reach OR CPM yield gap (mode switcher)
//   - intelligence panel: reach, sub penetration, CPM, content mix, prog/direct
//   - leaderboard: "Top DMAs by yield gap" + CPM vs national mean bar chart
//
// All numbers are deterministic from a string seed — page renders identically
// every load, suitable for static-snapshot ODI demos.
// ------------------------------------------------------------------

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type Mode = 'reach' | 'cpm' | 'yield_gap';

const MODE_META: Record<Mode, { label: string; short: string }> = {
  reach:     { label: 'Audience reach (HH%)',    short: 'Reach' },
  cpm:       { label: 'Avg CPM ($)',             short: 'CPM' },
  yield_gap: { label: 'CPM gap vs national (%)', short: 'Yield gap' },
};

// Magenta → cyan ramp for the dark editorial chrome.
const RAMP_REACH = ['#3b1d3a', '#6b2659', '#b71a55', '#e0286b', '#ff3e7f'];
// Amber → magenta for yield gap (red == worse).
const RAMP_GAP   = ['#0d3a3e', '#0e6b6f', '#0e9aa0', '#f5b14a', '#ff3e7f'];

// ---- Deterministic top-US DMAs (Nielsen-style ranks, real metros) ----
// lat/lng are real metro centroids; data fields are synthetic.
interface DmaSeed {
  rank: number;
  code: string;     // DMA code (Nielsen)
  name: string;
  metro: string;
  state: string;
  lat: number;
  lng: number;
  households: number; // total TV households (Nielsen est., approximate)
  region: 'Northeast' | 'South' | 'Midwest' | 'West';
}

const DMAS: DmaSeed[] = [
  { rank: 1,  code: '501', name: 'New York',      metro: 'New York',      state: 'NY', lat: 40.7128, lng: -74.0060, households: 7_452_000, region: 'Northeast' },
  { rank: 2,  code: '803', name: 'Los Angeles',   metro: 'Los Angeles',   state: 'CA', lat: 34.0522, lng: -118.2437, households: 5_785_000, region: 'West' },
  { rank: 3,  code: '602', name: 'Chicago',       metro: 'Chicago',       state: 'IL', lat: 41.8781, lng: -87.6298, households: 3_473_000, region: 'Midwest' },
  { rank: 4,  code: '504', name: 'Philadelphia',  metro: 'Philadelphia',  state: 'PA', lat: 39.9526, lng: -75.1652, households: 2_993_000, region: 'Northeast' },
  { rank: 5,  code: '623', name: 'Dallas-Ft. Worth', metro: 'Dallas',     state: 'TX', lat: 32.7767, lng: -96.7970, households: 2_948_000, region: 'South' },
  { rank: 6,  code: '506', name: 'Boston',        metro: 'Boston',        state: 'MA', lat: 42.3601, lng: -71.0589, households: 2_511_000, region: 'Northeast' },
  { rank: 7,  code: '511', name: 'Washington DC', metro: 'Washington',    state: 'DC', lat: 38.9072, lng: -77.0369, households: 2_585_000, region: 'South' },
  { rank: 8,  code: '618', name: 'Houston',       metro: 'Houston',       state: 'TX', lat: 29.7604, lng: -95.3698, households: 2_624_000, region: 'South' },
  { rank: 9,  code: '524', name: 'Atlanta',       metro: 'Atlanta',       state: 'GA', lat: 33.7490, lng: -84.3880, households: 2_561_000, region: 'South' },
  { rank: 10, code: '807', name: 'San Francisco', metro: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194, households: 2_490_000, region: 'West' },
  { rank: 11, code: '539', name: 'Tampa-St. Pete', metro: 'Tampa',        state: 'FL', lat: 27.9506, lng: -82.4572, households: 2_001_000, region: 'South' },
  { rank: 12, code: '505', name: 'Detroit',       metro: 'Detroit',       state: 'MI', lat: 42.3314, lng: -83.0458, households: 1_855_000, region: 'Midwest' },
  { rank: 13, code: '528', name: 'Miami-Ft. Lauderdale', metro: 'Miami',  state: 'FL', lat: 25.7617, lng: -80.1918, households: 1_736_000, region: 'South' },
  { rank: 14, code: '819', name: 'Seattle-Tacoma', metro: 'Seattle',      state: 'WA', lat: 47.6062, lng: -122.3321, households: 1_984_000, region: 'West' },
  { rank: 15, code: '753', name: 'Phoenix',       metro: 'Phoenix',       state: 'AZ', lat: 33.4484, lng: -112.0740, households: 2_087_000, region: 'West' },
  { rank: 16, code: '751', name: 'Denver',        metro: 'Denver',        state: 'CO', lat: 39.7392, lng: -104.9903, households: 1_751_000, region: 'West' },
];

// ---- Deterministic hash (FNV-1a-ish) — same idiom as Healthcare page. ----
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Content categories per region — sports skews south/midwest, news skews
// northeast/DC, lifestyle skews west, etc. Plausible at a glance.
const REGION_CONTENT_MIX: Record<DmaSeed['region'], { name: string; base: number }[]> = {
  Northeast: [
    { name: 'News & Politics', base: 0.32 },
    { name: 'Drama / Prestige', base: 0.22 },
    { name: 'Sports',           base: 0.18 },
    { name: 'Comedy',           base: 0.14 },
    { name: 'Lifestyle',        base: 0.08 },
    { name: 'Reality',          base: 0.06 },
  ],
  South: [
    { name: 'Sports',           base: 0.34 },
    { name: 'Reality',          base: 0.18 },
    { name: 'Faith & Family',   base: 0.14 },
    { name: 'News & Politics',  base: 0.13 },
    { name: 'Drama / Prestige', base: 0.12 },
    { name: 'Lifestyle',        base: 0.09 },
  ],
  Midwest: [
    { name: 'Sports',           base: 0.30 },
    { name: 'News & Politics',  base: 0.20 },
    { name: 'Reality',          base: 0.15 },
    { name: 'Comedy',           base: 0.14 },
    { name: 'Drama / Prestige', base: 0.13 },
    { name: 'Lifestyle',        base: 0.08 },
  ],
  West: [
    { name: 'Lifestyle',        base: 0.24 },
    { name: 'Drama / Prestige', base: 0.22 },
    { name: 'Sports',           base: 0.16 },
    { name: 'Comedy',           base: 0.16 },
    { name: 'Tech & Culture',   base: 0.13 },
    { name: 'News & Politics',  base: 0.09 },
  ],
};

interface DmaRow extends DmaSeed {
  households_reached: number;
  reach_pct: number;            // households_reached / households
  subscribers: number;
  sub_penetration_pct: number;
  avg_cpm: number;              // $
  watch_time_per_sub_hrs: number; // weekly
  prog_share: number;           // 0–1
  yoy_audience_growth_pct: number;
  cpm_gap_vs_national_pct: number;  // can be + or -
  yield_opportunity_usd: number;    // lift if gap closes
  content_mix: { name: string; share: number }[];
}

// All five seeded values are computed from the DMA code so renders are stable.
function buildDmaRow(d: DmaSeed, nationalCpm: number): DmaRow {
  const h1 = hashStr('reach:' + d.code);
  const h2 = hashStr('sub:'   + d.code);
  const h3 = hashStr('cpm:'   + d.code);
  const h4 = hashStr('time:'  + d.code);
  const h5 = hashStr('prog:'  + d.code);
  const h6 = hashStr('yoy:'   + d.code);

  // Reach 28-46% of HH, gently skewed by rank (top markets reach more).
  const rankPenalty = 1 - (d.rank - 1) * 0.012;
  const reach_pct = (0.28 + h1 * 0.18) * rankPenalty;
  const households_reached = Math.round(d.households * reach_pct);

  // Sub penetration 8-22% — usually smaller markets convert better.
  const sub_penetration_pct = 0.08 + h2 * 0.14 + (d.rank > 8 ? 0.02 : 0);
  const subscribers = Math.round(d.households * sub_penetration_pct);

  // CPM — top-3 markets premium, Detroit/Tampa/Phoenix soft.
  const softMarkets = new Set(['505', '539', '753', '618']); // Detroit, Tampa, Phoenix, Houston
  const premium = d.rank <= 3 ? 1.32 : d.rank <= 6 ? 1.12 : softMarkets.has(d.code) ? 0.78 : 1.0;
  const avg_cpm = +(18 + h3 * 14).toFixed(2) * premium;

  // Watch-time per sub — 6-14 weekly hours.
  const watch_time_per_sub_hrs = +(6.5 + h4 * 7.2).toFixed(1);

  // Programmatic share — 0.35–0.78
  const prog_share = +(0.35 + h5 * 0.43).toFixed(2);

  // YoY audience growth — Detroit punches up here deliberately for the auto-narrative.
  const detroitBoost = d.code === '505' ? 0.22 : 0;
  const yoy_audience_growth_pct = +(((-6) + h6 * 18) + detroitBoost * 100).toFixed(1);

  // CPM gap vs national mean — % difference. Detroit forced negative to make the
  // "audience growing but underpriced" story land.
  let cpm_gap_vs_national_pct = +(((avg_cpm - nationalCpm) / nationalCpm) * 100).toFixed(1);
  if (d.code === '505') cpm_gap_vs_national_pct = -18.2;

  // Yield opportunity = closing the gap × impressions × CPM. Synthetic.
  const annualImpressions = households_reached * 52 * 3.8; // rough weekly imp × 52
  const gapClose = Math.max(0, -cpm_gap_vs_national_pct) / 100;
  const yield_opportunity_usd = Math.round(annualImpressions / 1000 * avg_cpm * gapClose);

  // Content mix — perturb the base by a deterministic jitter, re-normalize.
  const base = REGION_CONTENT_MIX[d.region];
  const raw = base.map((c, i) => {
    const j = (hashStr(d.code + ':' + i) - 0.5) * 0.06;
    return { name: c.name, share: Math.max(0.02, c.base + j) };
  });
  const sum = raw.reduce((s, c) => s + c.share, 0);
  const content_mix = raw.map((c) => ({ name: c.name, share: c.share / sum }))
    .sort((a, b) => b.share - a.share);

  return {
    ...d,
    households_reached,
    reach_pct,
    subscribers,
    sub_penetration_pct,
    avg_cpm,
    watch_time_per_sub_hrs,
    prog_share,
    yoy_audience_growth_pct,
    cpm_gap_vs_national_pct,
    yield_opportunity_usd,
    content_mix,
  };
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function quantile(vals: number[], q: number): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export default function GeoPage() {
  const [mode, setMode] = useState<Mode>('reach');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // National CPM is the unweighted mean of all DMAs' base draw. Stable.
  const nationalCpm = useMemo(() => {
    // First pass uses a placeholder; second pass below uses the true mean.
    const draft = DMAS.map((d) => buildDmaRow(d, 24.5));
    return +(draft.reduce((s, r) => s + r.avg_cpm, 0) / draft.length).toFixed(2);
  }, []);

  const rows: DmaRow[] = useMemo(
    () => DMAS.map((d) => buildDmaRow(d, nationalCpm)),
    [nationalCpm],
  );

  const valueFor = (r: DmaRow): number =>
    mode === 'reach' ? r.reach_pct * 100
    : mode === 'cpm' ? r.avg_cpm
    : r.cpm_gap_vs_national_pct;

  const ramp = mode === 'yield_gap' ? RAMP_GAP : RAMP_REACH;

  const breakpoints = useMemo(() => {
    const vals = rows.map(valueFor);
    return [0.2, 0.4, 0.6, 0.8].map((q) => quantile(vals, q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode]);

  const bucketIndex = (v: number) =>
    v < breakpoints[0] ? 0 : v < breakpoints[1] ? 1 : v < breakpoints[2] ? 2 : v < breakpoints[3] ? 3 : 4;

  const colorFor = (r: DmaRow) => {
    if (mode === 'yield_gap') {
      // Negative gap = worse for seller → hotter color.
      const v = -r.cpm_gap_vs_national_pct;
      const idx = v < breakpoints[3] ? 0 : v < breakpoints[2] ? 1 : v < breakpoints[1] ? 2 : v < breakpoints[0] ? 3 : 4;
      return ramp[Math.min(4, Math.max(0, 4 - idx))];
    }
    return ramp[bucketIndex(valueFor(r))];
  };

  const maxHH = Math.max(1, ...rows.map((r) => r.households));
  const radiusFor = (r: DmaRow) => 9 + 22 * Math.sqrt(r.households / maxHH);

  const selected = selectedCode ? rows.find((r) => r.code === selectedCode) ?? null : null;

  // KPI strip — weighted (by households) where meaningful.
  const kpis = useMemo(() => {
    const totalHH = rows.reduce((s, r) => s + r.households, 0);
    const reachedHH = rows.reduce((s, r) => s + r.households_reached, 0);
    const totalSubs = rows.reduce((s, r) => s + r.subscribers, 0);
    const weightedCpm =
      rows.reduce((s, r) => s + r.avg_cpm * r.households_reached, 0) /
      Math.max(1, reachedHH);
    const weightedTime =
      rows.reduce((s, r) => s + r.watch_time_per_sub_hrs * r.subscribers, 0) /
      Math.max(1, totalSubs);
    return {
      totalHH,
      reachedHH,
      reachPct: reachedHH / Math.max(1, totalHH),
      totalSubs,
      subPenetration: totalSubs / Math.max(1, totalHH),
      weightedCpm,
      weightedTime,
    };
  }, [rows]);

  // Total addressable lift if every underpriced DMA closed half the gap.
  const totalYieldOpportunity = useMemo(
    () => Math.round(rows.reduce((s, r) => s + r.yield_opportunity_usd, 0) * 0.5),
    [rows],
  );

  // Auto-narrative outlier: highest absolute yield_opportunity_usd. Detroit is
  // seeded to win, so the headline always reads coherently.
  const outlier = useMemo(() => {
    return rows.reduce((best, r) => (r.yield_opportunity_usd > best.yield_opportunity_usd ? r : best), rows[0]);
  }, [rows]);

  // Top DMAs by absolute yield gap (most underpriced first).
  const yieldGapLeaders = useMemo(() => {
    return [...rows]
      .filter((r) => r.cpm_gap_vs_national_pct < 0)
      .sort((a, b) => a.cpm_gap_vs_national_pct - b.cpm_gap_vs_national_pct)
      .slice(0, 6);
  }, [rows]);

  // For the bar chart — CPM delta vs national mean, sorted.
  const cpmChartData = useMemo(() => {
    return [...rows]
      .sort((a, b) => a.cpm_gap_vs_national_pct - b.cpm_gap_vs_national_pct)
      .map((r) => ({
        name: r.metro,
        code: r.code,
        gap: r.cpm_gap_vs_national_pct,
        cpm: r.avg_cpm,
      }));
  }, [rows]);

  const medianReach = useMemo(() => median(rows.map((r) => r.reach_pct * 100)), [rows]);
  const medianCpm = useMemo(() => median(rows.map((r) => r.avg_cpm)), [rows]);

  // Selected DMA's reach percentile vs the panel.
  const selectedReachPercentile = useMemo(() => {
    if (!selected) return 0;
    const v = selected.reach_pct;
    const below = rows.filter((r) => r.reach_pct < v).length;
    return Math.round((below / rows.length) * 100);
  }, [selected, rows]);

  return (
    <div className="bg-[var(--bg)] min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <header className="border-b border-[var(--hairline)] pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Geography · Ad Market Intelligence</div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">
                DMA reach &amp; CPM yield
              </h1>
              <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
                Top {rows.length} Nielsen DMAs by household count. Audience footprint, sub
                penetration and ad-yield read off the gold semantic layer — click any market
                to drill into content mix and prog/direct split.
              </p>
            </div>
            <ModePills mode={mode} setMode={setMode} />
          </div>
        </header>

        {/* Auto-narrative */}
        <section className="editorial-card overflow-hidden">
          <div className="px-5 py-4 flex items-start gap-4">
            <div className="hidden sm:block w-1 self-stretch rounded-full" style={{ background: 'var(--magenta)' }} />
            <div className="flex-1 min-w-0">
              <div className="eyebrow-cyan mb-1">Cortex · auto-summary</div>
              <p className="text-[var(--ink)] leading-relaxed text-[15px]">
                <span className="font-display text-[var(--magenta)]">DMA {outlier.code} ({outlier.metro})</span>{' '}
                audience grew{' '}
                <span className="font-mono tabular text-[var(--up)]">
                  {formatPercent(outlier.yoy_audience_growth_pct, 0)}
                </span>{' '}
                YoY but CPM yield is{' '}
                <span className="font-mono tabular text-[var(--down)]">
                  {Math.abs(outlier.cpm_gap_vs_national_pct).toFixed(1)}%
                </span>{' '}
                below peer — sell-side optimization opportunity ={' '}
                <span className="font-mono tabular text-[var(--magenta-bright)]">
                  ${(outlier.yield_opportunity_usd / 1_000_000).toFixed(1)}M
                </span>
                . Across the panel, closing half the gap on underpriced markets unlocks{' '}
                <span className="font-mono tabular text-[var(--cyan-bright)]">
                  ${(totalYieldOpportunity / 1_000_000).toFixed(1)}M
                </span>{' '}
                in annualized incremental revenue.
              </p>
            </div>
            <div className="hidden md:block shrink-0 text-right pl-4 border-l border-[var(--hairline)]">
              <div className="eyebrow mb-1">Lever</div>
              <div className="font-display text-2xl text-[var(--magenta)] tabular">
                ${(totalYieldOpportunity / 1_000_000).toFixed(1)}M
              </div>
              <div className="text-[10px] text-[var(--ink-soft)] uppercase tracking-wider mt-0.5">
                Sell-side upside
              </div>
            </div>
          </div>
        </section>

        {/* KPI strip — 4 tiles, peer bands + $-levers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Households reached"
            value={formatCount(kpis.reachedHH)}
            sub={`${(kpis.reachPct * 100).toFixed(1)}% of ${formatCount(kpis.totalHH)} HH in panel`}
            peerBand={{ position: 64, label: 'Top quartile vs peer networks' }}
          />
          <KpiTile
            label="Sub penetration"
            value={`${(kpis.subPenetration * 100).toFixed(1)}%`}
            sub={`${formatCount(kpis.totalSubs)} subscribers · ${formatCount(rows.length)} DMAs`}
            peerBand={{ position: 48, label: 'Median vs streaming cohort' }}
          />
          <KpiTile
            label="Avg CPM (HH-weighted)"
            value={`$${kpis.weightedCpm.toFixed(2)}`}
            sub={`National blend · median DMA $${medianCpm.toFixed(2)}`}
            peerBand={{ position: 41, label: 'Below mid-band — pricing latent' }}
            tone="warn"
          />
          <KpiTile
            label="Watch-time / sub"
            value={`${kpis.weightedTime.toFixed(1)} hrs/wk`}
            sub="Engagement floor — drives renewal × CPM"
            peerBand={{ position: 72, label: 'Strong cohort retention signal' }}
            highlight
            lever={`Yield lever: $${(totalYieldOpportunity / 1_000_000).toFixed(1)}M closing half the gap on underpriced DMAs`}
          />
        </div>

        {/* 60/40 layout: map + intelligence panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* LEFT — Map (60%) */}
          <div className="lg:col-span-3 editorial-card overflow-hidden">
            <header className="editorial-card-header flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="eyebrow">DMA Footprint</div>
                <div className="font-display text-lg text-[var(--ink)] mt-0.5">
                  {selected ? (
                    <>DMA {selected.code} <span className="text-[var(--ink-muted)] text-sm font-sans">· {selected.metro}, {selected.state}</span></>
                  ) : (
                    <>Top {rows.length} US markets <span className="text-[var(--ink-muted)] text-sm font-sans">· {MODE_META[mode].label}</span></>
                  )}
                </div>
              </div>
              {selected && (
                <button
                  onClick={() => setSelectedCode(null)}
                  className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-3)] hover:bg-[var(--bg-2)] text-[var(--ink)] text-xs font-medium px-3 py-1.5"
                >
                  ← Back to all DMAs
                </button>
              )}
            </header>

            <div className="relative" style={{ height: 460 }}>
              <MapContainer
                center={[39.5, -96.0]}
                zoom={4}
                minZoom={3}
                maxZoom={9}
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                <FitOnEnter rows={rows} selected={selected} />

                {/* Outlier pulse — only when not drilled in. */}
                {!selected && (
                  <CircleMarker
                    key="outlier-pulse"
                    center={[outlier.lat, outlier.lng]}
                    radius={radiusFor(outlier) + 14}
                    pathOptions={{
                      color: '#ff3e7f',
                      weight: 1.4,
                      fillColor: 'transparent',
                      fillOpacity: 0,
                      className: 'dma-outlier-pulse',
                      dashArray: '4 3',
                    } as L.PathOptions}
                    interactive={false}
                  />
                )}

                {rows.map((r) => {
                  const isSel = selectedCode === r.code;
                  const isOutlier = outlier.code === r.code;
                  return (
                    <CircleMarker
                      key={r.code}
                      center={[r.lat, r.lng]}
                      radius={radiusFor(r)}
                      pathOptions={{
                        color: isOutlier ? '#ff3e7f' : isSel ? '#ffffff' : '#0e0d10',
                        weight: isOutlier ? 1.4 : isSel ? 2 : 0.6,
                        fillColor: colorFor(r),
                        fillOpacity: isSel ? 0.95 : 0.78,
                      }}
                      eventHandlers={{ click: () => setSelectedCode(r.code) }}
                    >
                      <Tooltip
                        direction="top"
                        offset={[0, -radiusFor(r) - 2]}
                        opacity={1}
                        className="dma-tooltip"
                      >
                        <div className="text-[11px] leading-tight">
                          <div className="font-mono text-[var(--ink-soft)]">DMA {r.code}</div>
                          <div className="font-display text-[var(--ink)]">{r.metro}, {r.state}</div>
                          <div className="mt-1 tabular">
                            <span className="text-[var(--ink-muted)]">Reach </span>
                            <span className="text-[var(--ink)] font-semibold">
                              {(r.reach_pct * 100).toFixed(1)}%
                            </span>{' '}
                            <span className="text-[var(--ink-muted)]">· CPM </span>
                            <span className="text-[var(--ink)] font-semibold">${r.avg_cpm.toFixed(2)}</span>
                          </div>
                          <div className="tabular text-[var(--ink-muted)]">
                            Gap{' '}
                            <span
                              className="font-semibold"
                              style={{ color: r.cpm_gap_vs_national_pct >= 0 ? 'var(--up)' : 'var(--down)' }}
                            >
                              {formatPercent(r.cpm_gap_vs_national_pct, 1)}
                            </span>{' '}
                            vs national
                          </div>
                          {isOutlier && (
                            <div className="mt-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--magenta)]">
                              ◆ Top yield opportunity
                            </div>
                          )}
                          <div className="mt-1 text-[10px] text-[var(--cyan-bright)] font-semibold">
                            Click to drill in →
                          </div>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              <style>{`
                @keyframes dma-pulse-ring {
                  0%   { stroke-opacity: 0.7; }
                  70%  { stroke-opacity: 0;   }
                  100% { stroke-opacity: 0;   }
                }
                .dma-outlier-pulse {
                  animation: dma-pulse-ring 1.8s ease-out infinite;
                }
                .leaflet-tooltip.dma-tooltip {
                  background: #16151a;
                  border: 1px solid #36322c;
                  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
                  border-radius: 6px;
                  padding: 8px 10px;
                  color: #f7f3ec;
                  white-space: normal;
                  max-width: 240px;
                }
                .leaflet-tooltip.dma-tooltip:before { display: none; }
                .leaflet-container { background: #0e0d10; }
              `}</style>
            </div>

            {/* Color ramp legend */}
            <div className="px-4 py-3 border-t border-[var(--hairline-soft)] bg-[var(--bg-3)]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
                  {MODE_META[mode].label} · quintile bands
                </div>
                <div className="text-[10px] text-[var(--ink-soft)] tabular">
                  Bubble size = total HH · color = {MODE_META[mode].short.toLowerCase()}
                </div>
              </div>
              <div className="flex items-stretch gap-0.5 text-[10px] tabular">
                {ramp.map((color, i) => {
                  const lo = i === 0 ? null : breakpoints[i - 1];
                  const hi = i === 4 ? null : breakpoints[i];
                  const fmt = (v: number) =>
                    mode === 'reach' ? `${v.toFixed(0)}%`
                    : mode === 'cpm' ? `$${v.toFixed(0)}`
                    : `${v.toFixed(0)}%`;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-stretch">
                      <div className="h-3 rounded-sm" style={{ background: color }} />
                      <div className="mt-1 text-center text-[var(--ink-muted)] tabular">
                        {lo === null ? '< ' : `${fmt(lo)} – `}
                        {hi === null ? `${fmt(breakpoints[3])}+` : fmt(hi)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT — Intelligence panel (40%) */}
          <div className="lg:col-span-2">
            {selected ? (
              <DmaDetailPanel
                row={selected}
                medianReach={medianReach}
                nationalCpm={nationalCpm}
                reachPercentile={selectedReachPercentile}
                onClose={() => setSelectedCode(null)}
              />
            ) : (
              <DefaultPanel rows={rows} onPick={setSelectedCode} />
            )}
          </div>
        </div>

        {/* Below — Top yield-gap leaderboard + CPM bar chart */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 editorial-card overflow-hidden">
            <header className="editorial-card-header">
              <div className="eyebrow">Sell-side opportunity</div>
              <h2 className="font-display text-lg text-[var(--ink)] mt-0.5">
                Top DMAs by yield gap
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                Markets with CPM below national mean — ordered by annualized lift if priced
                in line with peer DMAs.
              </p>
            </header>
            <ol className="divide-y divide-[var(--hairline-soft)]">
              {yieldGapLeaders.map((r, i) => {
                const maxOpp = yieldGapLeaders[0]?.yield_opportunity_usd ?? 1;
                const pct = r.yield_opportunity_usd / maxOpp;
                return (
                  <li key={r.code}>
                    <button
                      onClick={() => setSelectedCode(r.code)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--bg-3)] transition-colors"
                    >
                      <div className="flex items-baseline gap-3">
                        <div className="font-display text-2xl text-[var(--ink-soft)] tabular leading-none w-6 text-right shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 flex-wrap">
                            <div>
                              <span className="font-mono text-xs text-[var(--ink-soft)] mr-2">DMA</span>
                              <span className="font-display text-[var(--ink)]">{r.code}</span>
                              <span className="text-xs text-[var(--ink-muted)] ml-2">{r.metro}, {r.state}</span>
                            </div>
                            <div className="font-mono tabular text-sm font-bold text-[var(--magenta)]">
                              ${(r.yield_opportunity_usd / 1_000_000).toFixed(1)}M
                            </div>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct * 100}%`, background: 'var(--magenta)', opacity: 0.85 }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
                            <span>
                              CPM ${r.avg_cpm.toFixed(2)} ·{' '}
                              <span className="text-[var(--down)]">
                                {formatPercent(r.cpm_gap_vs_national_pct, 1)}
                              </span>{' '}
                              vs nat'l
                            </span>
                            <span style={{ color: 'var(--up)' }}>
                              YoY {formatPercent(r.yoy_audience_growth_pct, 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="lg:col-span-3 editorial-card overflow-hidden">
            <header className="editorial-card-header">
              <div className="eyebrow">Pricing dispersion</div>
              <h2 className="font-display text-lg text-[var(--ink)] mt-0.5">
                CPM gap vs national mean by DMA
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                Negative bars = sell-side opportunity. Dashed line = national mean (
                <span className="font-mono tabular">${nationalCpm.toFixed(2)}</span> CPM ).
              </p>
            </header>
            <div className="p-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cpmChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke="#1f1d24" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#b5afa0', fontSize: 11 }}
                    stroke="#36322c"
                    tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}%`}
                    domain={['dataMin - 4', 'dataMax + 4']}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#b5afa0', fontSize: 11 }}
                    stroke="#36322c"
                    width={104}
                  />
                  <RTooltip
                    contentStyle={{ background: '#0e0d10', border: '1px solid #36322c', fontSize: 12, color: '#f7f3ec' }}
                    labelStyle={{ color: '#b5afa0' }}
                    formatter={(v, _n, ctx) => {
                      const num = typeof v === 'number' ? v : Number(v);
                      const cpm = (ctx?.payload as { cpm?: number } | undefined)?.cpm;
                      return [`${num >= 0 ? '+' : ''}${num.toFixed(1)}% (CPM $${cpm?.toFixed(2) ?? '—'})`, 'Gap vs national'];
                    }}
                  />
                  <ReferenceLine x={0} stroke="#6f6a5e" strokeDasharray="3 3" strokeWidth={1} />
                  <Bar dataKey="gap" radius={[0, 2, 2, 0]}>
                    {cpmChartData.map((d) => (
                      <Cell key={d.code} fill={d.gap >= 0 ? '#00e5ff' : '#ff3e7f'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Provenance strip */}
        <ProvenanceStrip rows={rows.length} />
      </div>
    </div>
  );
}

// ─── Mode pills ────────────────────────────────────────────────────────────

function ModePills({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)]">
      {(Object.keys(MODE_META) as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${
              active
                ? 'bg-[var(--magenta)] text-[var(--bg)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-3)]'
            }`}
            aria-pressed={active}
          >
            {MODE_META[m].short}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tile with peer band + $-lever ──────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  peerBand,
  tone,
  highlight,
  lever,
}: {
  label: string;
  value: string;
  sub?: string;
  peerBand?: { position: number; label: string };
  tone?: 'warn';
  highlight?: boolean;
  lever?: string;
}) {
  return (
    <div
      className="metric-tile flex flex-col"
      style={highlight ? { borderColor: 'rgba(255,62,127,0.35)', background: 'linear-gradient(180deg, var(--bg-2), rgba(255,62,127,0.04))' } : undefined}
    >
      <div className="metric-tile-label">{label}</div>
      <div className={`metric-tile-value text-2xl ${tone === 'warn' ? 'text-[var(--warn)]' : ''}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] text-[var(--ink-muted)] tabular leading-snug">
          {sub}
        </div>
      )}
      {peerBand && (
        <div className="mt-3">
          <div className="relative h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
            {/* Peer mid-band (25–75th) */}
            <div className="absolute top-0 bottom-0 bg-[var(--hairline)]" style={{ left: '25%', right: '25%' }} />
            {/* Our marker */}
            <div
              className="absolute top-[-3px] bottom-[-3px] w-[3px] rounded-sm"
              style={{ left: `${peerBand.position}%`, background: tone === 'warn' ? 'var(--warn)' : highlight ? 'var(--magenta)' : 'var(--cyan-bright)' }}
            />
          </div>
          <div className="mt-1 text-[10px] text-[var(--ink-soft)] uppercase tracking-wider">
            {peerBand.label}
          </div>
        </div>
      )}
      {lever && (
        <div className="mt-3 pt-2 border-t border-[var(--hairline-soft)] text-[10px] text-[var(--magenta)] font-semibold leading-snug">
          {lever}
        </div>
      )}
    </div>
  );
}

// ─── DMA detail panel (when a market is selected) ──────────────────────────

function DmaDetailPanel({
  row,
  medianReach,
  nationalCpm,
  reachPercentile,
  onClose,
}: {
  row: DmaRow;
  medianReach: number;
  nationalCpm: number;
  reachPercentile: number;
  onClose: () => void;
}) {
  const gapColor = row.cpm_gap_vs_national_pct >= 0 ? 'var(--up)' : 'var(--down)';
  const directShare = 1 - row.prog_share;

  return (
    <div className="editorial-card overflow-hidden">
      <header className="editorial-card-header flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">DMA Intelligence</div>
          <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-[var(--ink-soft)] text-xs">DMA</span>
            <span className="font-display text-2xl text-[var(--ink)] tracking-tight">{row.code}</span>
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5">
            {row.metro}, {row.state} · rank #{row.rank} · {row.region}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-lg leading-none p-1"
          aria-label="Close panel"
        >
          ×
        </button>
      </header>

      <div className="p-5 space-y-5">
        {/* Mini-stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            label="Reach"
            value={`${(row.reach_pct * 100).toFixed(1)}%`}
            sub={`${formatCount(row.households_reached)} HH`}
          />
          <MiniStat
            label="Sub penetration"
            value={`${(row.sub_penetration_pct * 100).toFixed(1)}%`}
            sub={`${formatCount(row.subscribers)} subs`}
          />
          <MiniStat
            label="Avg CPM"
            value={`$${row.avg_cpm.toFixed(2)}`}
            sub={`vs nat'l $${nationalCpm.toFixed(2)}`}
            tone={row.cpm_gap_vs_national_pct < -10 ? 'alert' : row.cpm_gap_vs_national_pct < 0 ? 'caution' : 'ok'}
          />
          <MiniStat
            label="Watch / sub"
            value={`${row.watch_time_per_sub_hrs.toFixed(1)} hr`}
            sub="weekly"
          />
        </div>

        {/* Peer percentile bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
              Reach vs other DMAs
            </div>
            <div className="text-[11px] font-mono tabular text-[var(--ink)] font-bold">
              p{reachPercentile}
            </div>
          </div>
          <div className="relative h-2 rounded-full bg-[var(--bg-3)] overflow-hidden">
            <div className="absolute top-0 bottom-0 bg-[var(--hairline)]" style={{ left: '25%', right: '25%' }} />
            <div
              className="absolute top-[-3px] bottom-[-3px] w-[3px] rounded-sm bg-[var(--cyan-bright)]"
              style={{ left: `${reachPercentile}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
            <span>Lower quartile</span>
            <span>Median {medianReach.toFixed(0)}%</span>
            <span>Top quartile</span>
          </div>
        </div>

        {/* Programmatic vs direct mix */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-2">
            Sell-side mix · this DMA
          </div>
          <div className="flex h-6 rounded-sm overflow-hidden border border-[var(--hairline)]">
            <div
              className="flex items-center justify-center text-[10px] font-bold text-[var(--bg)]"
              style={{ width: `${row.prog_share * 100}%`, background: 'var(--magenta)' }}
            >
              {row.prog_share >= 0.18 && `${Math.round(row.prog_share * 100)}% prog`}
            </div>
            <div
              className="flex items-center justify-center text-[10px] font-bold text-[var(--ink)]"
              style={{ width: `${directShare * 100}%`, background: 'var(--bg-3)' }}
            >
              {directShare >= 0.18 && `${Math.round(directShare * 100)}% direct`}
            </div>
          </div>
        </div>

        {/* Top content categories */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-2">
            Top content categories · regional affinity
          </div>
          <ul className="space-y-1.5">
            {row.content_mix.slice(0, 5).map((c, i) => {
              const max = row.content_mix[0].share;
              return (
                <li key={c.name} className="text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--ink)] truncate">
                      <span className="font-mono text-[var(--ink-soft)] mr-1.5">{i + 1}.</span>
                      {c.name}
                    </span>
                    <span className="font-mono tabular text-[var(--ink-muted)] shrink-0">
                      {(c.share * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-[var(--bg-3)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(c.share / max) * 100}%`,
                        background: 'var(--cyan)',
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Yield opportunity callout */}
        {row.yield_opportunity_usd > 0 ? (
          <div
            className="rounded-sm border px-3.5 py-3"
            style={{
              borderColor: 'rgba(255,62,127,0.35)',
              background: 'var(--magenta-bg)',
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--magenta)]">
                Annualized yield opportunity
              </div>
              <div className="font-display text-2xl tabular" style={{ color: 'var(--magenta)' }}>
                ${(row.yield_opportunity_usd / 1_000_000).toFixed(1)}M
              </div>
            </div>
            <div className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
              Audience growing{' '}
              <span className="text-[var(--up)] font-semibold tabular">
                {formatPercent(row.yoy_audience_growth_pct, 0)}
              </span>{' '}
              YoY while CPM trails national by{' '}
              <span className="tabular font-semibold" style={{ color: gapColor }}>
                {formatPercent(row.cpm_gap_vs_national_pct, 1)}
              </span>
              . Closing the gap × {formatCount(row.households_reached)} reached HH × 52 wks.
            </div>
          </div>
        ) : (
          <div className="rounded-sm border border-[var(--hairline)] px-3.5 py-3 bg-[var(--bg-3)]">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--up)]">
              Priced at or above national mean
            </div>
            <div className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">
              CPM{' '}
              <span className="tabular font-semibold" style={{ color: gapColor }}>
                {formatPercent(row.cpm_gap_vs_national_pct, 1)}
              </span>{' '}
              vs national — no sell-side gap to close. Focus is renewal / share-of-wallet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'caution' | 'alert';
}) {
  const color =
    tone === 'alert' ? 'var(--down)' : tone === 'caution' ? 'var(--warn)' : 'var(--ink)';
  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-3)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
        {label}
      </div>
      <div className="mt-1 font-display text-lg tabular" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[var(--ink-soft)] tabular mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Default panel (no selection) — top markets by reach ───────────────────

function DefaultPanel({ rows, onPick }: { rows: DmaRow[]; onPick: (code: string) => void }) {
  const topReach = useMemo(
    () => [...rows].sort((a, b) => b.households_reached - a.households_reached).slice(0, 6),
    [rows],
  );
  const max = Math.max(1, ...topReach.map((r) => r.households_reached));

  return (
    <div className="editorial-card overflow-hidden h-full">
      <header className="editorial-card-header">
        <div className="eyebrow">DMA Intelligence · default</div>
        <div className="mt-0.5 font-display text-lg text-[var(--ink)]">
          Top markets by absolute reach
        </div>
        <p className="text-xs text-[var(--ink-muted)] mt-1">
          Pick any bubble on the map — or any row here — to open the DMA's profile.
        </p>
      </header>
      <ol className="divide-y divide-[var(--hairline-soft)]">
        {topReach.map((r, i) => {
          const pct = r.households_reached / max;
          return (
            <li key={r.code}>
              <button
                onClick={() => onPick(r.code)}
                className="w-full text-left px-4 py-3 hover:bg-[var(--bg-3)] transition-colors"
              >
                <div className="flex items-baseline gap-3">
                  <div className="font-display text-2xl text-[var(--ink-soft)] tabular leading-none w-6 text-right shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <div>
                        <span className="font-mono text-xs text-[var(--ink-soft)] mr-2">DMA</span>
                        <span className="font-display text-[var(--ink)]">{r.code}</span>
                        <span className="text-xs text-[var(--ink-muted)] ml-2">{r.metro}</span>
                      </div>
                      <div className="font-mono tabular text-sm font-bold text-[var(--cyan-bright)]">
                        {formatCount(r.households_reached)}
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct * 100}%`, background: 'var(--cyan)', opacity: 0.85 }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
                      <span>
                        Reach {(r.reach_pct * 100).toFixed(1)}% · sub pen {(r.sub_penetration_pct * 100).toFixed(1)}%
                      </span>
                      <span style={{ color: r.cpm_gap_vs_national_pct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        CPM {formatPercent(r.cpm_gap_vs_national_pct, 1)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Provenance strip ──────────────────────────────────────────────────────

function ProvenanceStrip({ rows }: { rows: number }) {
  return (
    <div className="editorial-card overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-4 flex-wrap text-[var(--ink-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--up)] animate-pulse" />
            <span className="uppercase tracking-wider font-bold text-[var(--up)]">Live</span>
            <span>· 12 min ago</span>
          </span>
          <span className="text-[var(--ink-soft)]">·</span>
          <span>
            Source <span className="font-mono text-[var(--ink)]">gold.fct_dma_audience_yield</span>
          </span>
          <span className="text-[var(--ink-soft)]">·</span>
          <span>
            Joins <span className="font-mono text-[var(--ink)]">dim_nielsen_dma</span> ×{' '}
            <span className="font-mono text-[var(--ink)]">fct_ad_impressions</span> ×{' '}
            <span className="font-mono text-[var(--ink)]">fct_subscriber_states</span>
          </span>
        </div>
        <div className="text-[var(--ink-soft)] tabular">
          {formatNumber(rows)} DMAs · Nielsen 2025 universe · synthetic CPM &amp; reach
        </div>
      </div>
    </div>
  );
}

// ─── Map auto-fit ──────────────────────────────────────────────────────────

function FitOnEnter({ rows, selected }: { rows: DmaRow[]; selected: DmaRow | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) {
      map.flyTo([selected.lat, selected.lng], 6, { duration: 0.8 });
    } else if (rows.length > 0) {
      const bounds = L.latLngBounds(rows.map((r) => [r.lat, r.lng] as [number, number]));
      map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 5, duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.code, rows.length]);
  return null;
}
