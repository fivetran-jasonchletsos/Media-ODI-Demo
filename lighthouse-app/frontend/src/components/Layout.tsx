import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api, getSnapshotTime, subscribeSource, type DataSource } from '../api/queries';
import * as watchlist from '../watchlist';
import DefenderSync from './DefenderSync';
import HelpTour from './HelpTour';

// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A — unlocks the DefenderSync easter egg.
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

const DEMOS = [
  { key: 'tax-assessment', name: 'Allegheny County Tax', industry: 'Public sector · Property assessment', url: 'https://fivetran-jasonchletsos.github.io/tax-assessment-databricks-demo/', accent: '#dc2626' },
  { key: 'healthcare',     name: 'Epic Clarity',         industry: 'Healthcare · Clinical analytics',     url: 'https://fivetran-jasonchletsos.github.io/Healthcare-EPIC-Snowflake-Demo/', accent: '#0d9488' },
  { key: 'finserv',        name: 'Meridian Capital',     industry: 'Financial Services · Wealth & banking', url: 'https://fivetran-jasonchletsos.github.io/FinServ-ODI-Demo/', accent: '#1d4ed8' },
  { key: 'insurance',     name: 'Atlas Risk',           industry: 'Insurance · Policies, claims, reinsurance', url: 'https://fivetran-jasonchletsos.github.io/Insurance-ODI-Demo/', accent: '#0369a1' },
  { key: 'media',          name: 'Lighthouse Media',     industry: 'Media · Audience intelligence',       url: 'https://fivetran-jasonchletsos.github.io/Media-ODI-Demo/', accent: '#7c3aed' },
  { key: 'retail',         name: 'Storefront Analytics', industry: 'Retail & e-commerce',                  url: 'https://fivetran-jasonchletsos.github.io/RetailEcom-ODI-Demo/', accent: '#ea580c' },
  { key: 'techsaas',       name: 'SaaS Pulse',           industry: 'Tech · SaaS analytics',                url: 'https://fivetran-jasonchletsos.github.io/TechSaaS-ODI-Demo/', accent: '#059669' },
  { key: 'supplychain',    name: 'Manifest',             industry: 'Supply chain · Logistics',             url: 'https://fivetran-jasonchletsos.github.io/SupplyChain-ODI-Demo/', accent: '#0891b2' },
  { key: 'lifesci',        name: 'Cohort',               industry: 'Life sciences · Clinical research',    url: 'https://fivetran-jasonchletsos.github.io/LifeSci-ODI-Demo/', accent: '#be185d' },
  { key: 'mission-control', name: 'Mission Control', industry: 'Admin · Governance + observability', url: 'https://fivetran-jasonchletsos.github.io/ODI-Mission-Control/', accent: '#22d3ee' },
];
const CURRENT_DEMO = 'media';

const NAV_ITEMS: [string, string][] = [
  ['/', 'Home'],
  ['/brands', 'Brands'],
  ['/trends', 'Trends'],
  ['/geo', 'Geography'],
  ['/conversations', 'Conversations'],
  ['/agent', 'Research AI'],
  ['/architecture', 'ODI Architecture'],
  ['/pipeline', 'Pipeline'],
  ['/about', 'About'],
];

export default function Layout() {
  const [source, setSource] = useState<DataSource>('demo');
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [watchCount, setWatchCount] = useState(0);
  const [easterEggOpen, setEasterEggOpen] = useState(false);
  const konamiBufferRef = useRef<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = subscribeSource(setSource);
    api.getSummary().finally(() => setSnapshotAt(getSnapshotTime())).catch(() => {});
    const wsub = watchlist.subscribe((ids) => setWatchCount(ids.length));
    return () => { unsub(); wsub(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;
      const key = e.key.toLowerCase();
      const buf = konamiBufferRef.current;
      buf.push(key);
      if (buf.length > KONAMI.length) buf.shift();
      if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i])) {
        konamiBufferRef.current = [];
        setEasterEggOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/brands?q=${encodeURIComponent(q)}` : '/brands');
    setMobileOpen(false);
  };

  return (
    <div className="min-h-full flex flex-col bg-[var(--bg)]">
      <div className="editorial-rail" />

      {/* Dark editorial header — warm charcoal with magenta accent */}
      <header className="bg-[var(--bg)] text-[var(--ink)] sticky top-0 z-30 border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-16 sm:h-20 items-center justify-between gap-2 sm:gap-6">
            <Link to="/" className="flex items-center gap-3 shrink-0 min-w-0 group">
              <div className="h-10 w-10 rounded-sm flex items-center justify-center border border-[var(--hairline)] bg-[var(--bg-2)]">
                <LighthouseMark className="h-6 w-6" />
              </div>
              <div className="leading-tight min-w-0">
                <div className="font-display text-lg sm:text-xl tracking-tight truncate text-[var(--ink)]">
                  Lighthouse Media
                </div>
                <div className="mt-0.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--magenta)]">
                  Cross-channel intelligence
                </div>
              </div>
            </Link>

            <form onSubmit={onSubmit} className="hidden md:flex flex-1 max-w-md relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-[var(--ink-soft)] pointer-events-none">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Brand, @handle, vertical…"
                className="flex-1 rounded-sm bg-[var(--bg-2)] border border-[var(--hairline)] pl-9 pr-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:bg-[var(--bg-3)] focus:border-[var(--magenta)] focus:outline-none"
              />
            </form>

            <nav className="hidden lg:flex items-center gap-0.5 text-sm">
              {NAV_ITEMS.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `relative px-2.5 py-2 font-medium tracking-tight transition-colors text-[13px] ${
                      isActive ? 'text-[var(--magenta)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {label}
                      {isActive && (
                        <span className="absolute left-2.5 right-2.5 -bottom-[1px] h-[2px]" style={{ background: 'var(--magenta)' }} />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => navigate('/watchlist')}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-2)]"
                aria-label="Watchlist"
                title="Watchlist"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill={watchCount > 0 ? 'var(--magenta)' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                {watchCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-[var(--magenta)] text-[10px] font-extrabold text-[var(--ink)]">
                    {watchCount}
                  </span>
                )}
              </button>
              <DemoSwitcher source={source} />
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-sm text-[var(--ink-muted)] hover:bg-[var(--bg-2)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileOpen ? <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="lg:hidden pb-4 border-t border-[var(--hairline)] pt-3 space-y-3">
              <form onSubmit={onSubmit} className="md:hidden flex relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-[var(--ink-soft)]">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Brand, @handle, vertical…"
                  className="flex-1 rounded-sm bg-[var(--bg-2)] border border-[var(--hairline)] pl-9 pr-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)]"
                />
              </form>
              <nav className="grid grid-cols-2 gap-1 text-sm">
                {NAV_ITEMS.map(([to, label]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-sm text-center font-medium border ${
                        isActive
                          ? 'bg-[var(--magenta)] text-[var(--bg)] border-[var(--magenta)]'
                          : 'border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--bg-2)]'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="pt-3 border-t border-[var(--hairline)]">
                <div className="eyebrow mb-2">Switch demo</div>
                <div className="grid grid-cols-1 gap-1">
                  {DEMOS.map((d) => {
                    const isCurrent = d.key === CURRENT_DEMO;
                    const inner = (
                      <div className="flex items-start gap-2.5 w-full">
                        <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: d.accent }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--ink)] text-sm">{d.name}</span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[var(--magenta)]/40 bg-[var(--magenta-bg)] text-[var(--magenta)]">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--ink-soft)] truncate">{d.industry}</div>
                        </div>
                      </div>
                    );
                    return isCurrent ? (
                      <div key={d.key} className="px-3 py-2 rounded-sm border border-[var(--hairline)] opacity-70">
                        {inner}
                      </div>
                    ) : (
                      <a
                        key={d.key}
                        href={d.url}
                        className="px-3 py-2 rounded-sm border border-[var(--hairline)] hover:bg-[var(--bg-2)]"
                      >
                        {inner}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--hairline)] bg-[var(--bg)] text-[var(--ink-muted)] mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-sm flex items-center justify-center border border-[var(--hairline)] bg-[var(--bg-2)]">
                <LighthouseMark className="h-4 w-4" />
              </div>
              <div className="font-display text-[var(--ink)]">Lighthouse Media</div>
            </div>
            <p className="leading-relaxed text-[var(--ink-muted)]">
              Cross-channel audience intelligence built on Fivetran Open Data Infrastructure.
              Synthetic data — for ODI architecture demonstration only.
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Data Pipeline</div>
            <p className="leading-relaxed text-[var(--ink-muted)]">
              YouTube · Reddit · Wikipedia → Fivetran connectors → S3 + Apache Iceberg → dbt
              (bronze / silver / gold) → AWS Athena → static JSON snapshot
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Open Standards</div>
            <p className="leading-relaxed text-[var(--ink-muted)]">
              Apache Iceberg · AWS Glue Data Catalog · ANSI SQL · dbt semantic layer.
              Any compute engine. No lock-in.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--hairline)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 text-[11px] text-[var(--ink-soft)] flex flex-col sm:flex-row gap-1 sm:items-center sm:justify-between">
            <div>© 2026 Lighthouse Media ODI Demo · Fivetran Open Data Infrastructure</div>
            <div>Snapshot {snapshotAt ? new Date(snapshotAt).toLocaleString() : '—'}</div>
          </div>
        </div>
      </footer>

      {easterEggOpen && <DefenderSync onClose={() => setEasterEggOpen(false)} />}
      <HelpTour />
    </div>
  );
}

function DemoSwitcher({ source }: { source: DataSource }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const live = source === 'live';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={live ? 'Live Athena query on Iceberg gold layer · Switch demo' : 'Static snapshot · Switch demo'}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
          live
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/20'
            : 'bg-[var(--magenta-bg)] text-[var(--magenta)] border-[var(--magenta)]/40 hover:bg-[var(--magenta)]/15'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-300' : 'bg-[var(--magenta)]'} animate-pulse`} />
        {live ? 'Athena · live' : 'Snapshot'}
        <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[280px] rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] shadow-xl z-40 overflow-hidden"
        >
          <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)] border-b border-[var(--hairline)]">
            Switch demo
          </div>
          <div className="py-1">
            {DEMOS.map((d) => {
              const isCurrent = d.key === CURRENT_DEMO;
              const inner = (
                <div className="flex items-start gap-2.5 w-full">
                  <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: d.accent }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--ink)] text-sm">{d.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[var(--magenta)]/40 bg-[var(--magenta-bg)] text-[var(--magenta)]">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--ink-soft)] truncate">{d.industry}</div>
                  </div>
                </div>
              );
              return isCurrent ? (
                <div key={d.key} className="px-3 py-2 opacity-70">
                  {inner}
                </div>
              ) : (
                <a
                  key={d.key}
                  href={d.url}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 hover:bg-[var(--bg-3)] transition-colors"
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// Lighthouse silhouette — tall tower with triangular cap and two magenta beams
function LighthouseMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#f7f3ec" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {/* Tower body */}
      <path d="M10 20 L10 9 L14 9 L14 20 Z" fill="#f7f3ec" stroke="none" />
      {/* Lamp room */}
      <rect x="9.5" y="7" width="5" height="2.5" fill="#f7f3ec" stroke="none" />
      {/* Roof / cap */}
      <path d="M9 7 L12 3 L15 7 Z" fill="#f7f3ec" stroke="none" />
      {/* Magenta beams */}
      <path d="M14 8 L22 4" stroke="#ff3e7f" strokeWidth="1.6" />
      <path d="M14 8 L22 12" stroke="#ff3e7f" strokeWidth="1.6" opacity="0.6" />
      {/* Base */}
      <path d="M8 20 L16 20" stroke="#f7f3ec" strokeWidth="1.6" />
    </svg>
  );
}
