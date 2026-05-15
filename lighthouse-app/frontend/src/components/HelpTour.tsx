// HelpTour — a floating "?" button + slide-style overlay that walks first-time
// visitors through Lighthouse Media's cross-channel audience intelligence
// capabilities. Auto-opens on first visit (gated by localStorage); thereafter
// only opens on demand.
//
// Adapted from the tax-assessment demo. Theme retuned to Lighthouse's dark
// editorial palette (warm charcoal + magenta accents).

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const LS_KEY = 'helpTour:dismissed';

interface Step {
  title: string;
  pitch: string;
  cta: { label: string; to: string } | null;
  preview: () => ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Cross-channel audience cohorts at a glance',
    pitch:
      'Browse every brand, creator, and vertical we ingest from YouTube, Reddit, and Wikipedia — joined as one audience graph. Each row is a cohort ready to interrogate.',
    cta: { label: 'Open Brands', to: '/brands' },
    preview: () => (
      <div className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] p-3">
        <div className="h-7 rounded-sm bg-[var(--bg-3)] border border-[var(--hairline)] flex items-center px-3 text-xs text-[var(--ink-soft)]">
          Brand, @handle, vertical…
        </div>
        <div className="mt-2 space-y-1">
          {['Nautilus FM · Music · 4.2M reach', 'OffHours Pod · Lifestyle · 1.8M reach', 'Cobalt Labs · Tech · 920K reach'].map((r, i) => (
            <div key={i} className="h-5 rounded-sm bg-[var(--bg-3)] border border-[var(--hairline)] px-2 text-[11px] flex items-center text-[var(--ink-muted)]">
              {r}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Content trends that shift in real time',
    pitch:
      'Track which topics, formats, and creators are accelerating across every channel — the same dbt-built signals that fuel programming, ad sales, and editorial decisions.',
    cta: { label: 'Open Trends', to: '/trends' },
    preview: () => (
      <div className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] p-3 grid grid-cols-6 gap-1.5">
        {[55, 70, 40, 90, 65, 30].map((h, i) => (
          <div key={i} className="flex flex-col justify-end h-16">
            <div
              className="rounded-sm"
              style={{ height: `${h}%`, background: 'var(--magenta)' }}
            />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Drill into channel-level performance',
    pitch:
      'Every brand page joins YouTube uploads, Reddit conversations, and Wikipedia editorial signal into one timeline — with audience overlap, sentiment, and reach percentiles.',
    cta: { label: 'Browse brands', to: '/brands' },
    preview: () => (
      <div className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] p-3 space-y-2">
        <div className="text-xs font-semibold text-[var(--ink)]">Nautilus FM · 4.2M reach</div>
        <svg viewBox="0 0 120 30" className="w-full h-8">
          <polyline points="2,22 22,18 42,20 62,12 82,14 102,7 118,5" fill="none" stroke="#ff3e7f" strokeWidth="1.5" />
        </svg>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          {['YouTube', 'Reddit', 'Wikipedia'].map((l) => (
            <div key={l} className="rounded-sm bg-[var(--bg-3)] border border-[var(--hairline)] px-1.5 py-1 text-[var(--ink-muted)]">{l}</div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Conversations: where audiences actually talk',
    pitch:
      'Surface the Reddit threads, comment storms, and topical edits that move audience sentiment. Filter by brand, vertical, or topic to see the signal behind every spike.',
    cta: { label: 'Open Conversations', to: '/conversations' },
    preview: () => (
      <div className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] p-3 space-y-1.5">
        {[
          { sub: 'r/Music', t: '“Nautilus FM live set was a moment”', n: '1.2k' },
          { sub: 'r/podcasts', t: '“OffHours episode 142 changed my mind”', n: '486' },
          { sub: 'r/technology', t: '“Cobalt Labs benchmark thread”', n: '892' },
        ].map((c, i) => (
          <div key={i} className="rounded-sm bg-[var(--bg-3)] border border-[var(--hairline)] px-2 py-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-[var(--magenta)] font-mono uppercase tracking-wider">{c.sub}</div>
              <div className="text-[11px] text-[var(--ink-muted)] truncate">{c.t}</div>
            </div>
            <span className="text-[10px] text-[var(--ink-soft)] tabular-nums shrink-0">{c.n}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Pipeline observability you can show your board',
    pitch:
      'Every layer — Fivetran custom connectors, S3 + Apache Iceberg, dbt, AWS Athena — reports live status. Simulate a failure to walk through how observability works in practice.',
    cta: { label: 'Open Pipeline', to: '/pipeline' },
    preview: () => (
      <div className="rounded-sm p-3 border border-[var(--hairline)]" style={{ background: 'var(--bg-3)' }}>
        {[
          { name: 'lighthouse_youtube', status: '#22c55e' },
          { name: 'lighthouse_reddit', status: '#22c55e' },
          { name: 'lighthouse_wikipedia', status: '#f59e0b' },
        ].map((r) => (
          <div key={r.name} className="flex items-center justify-between py-1 text-xs">
            <span className="text-[var(--ink-muted)] font-mono">{r.name}</span>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: r.status }} />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Ask your audience data in plain English',
    pitch:
      'Skip the dashboards — type a question. Research AI runs against the same Iceberg gold layer with attribution back to source brands, channels, and dbt models.',
    cta: { label: 'Try Research AI', to: '/agent' },
    preview: () => (
      <div className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] p-3 space-y-2">
        <div className="rounded-sm bg-[var(--bg-3)] border border-[var(--hairline)] px-2 py-1.5 text-[11px] text-[var(--ink-muted)]">
          “Which podcast brand had the biggest Reddit reach jump this week?”
        </div>
        <div className="rounded-sm px-2 py-1.5 text-[11px]" style={{ background: 'var(--magenta-bg)', border: '1px solid rgba(255,62,127,0.35)', color: 'var(--magenta)' }}>
          OffHours Pod · +42% week-over-week · 18.6K comments
        </div>
      </div>
    ),
  },
];

export default function HelpTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  // Auto-open on first visit only.
  useEffect(() => {
    try {
      if (!localStorage.getItem(LS_KEY)) {
        const t = setTimeout(() => setOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {
      /* localStorage blocked — silently skip auto-open */
    }
  }, []);

  // Close on Escape; arrows to navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTour();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openTour() {
    setStep(0);
    setOpen(true);
  }

  function closeTour() {
    setOpen(false);
    try { localStorage.setItem(LS_KEY, '1'); } catch { /* noop */ }
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prev() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function goToCta() {
    const cta = STEPS[step].cta;
    if (!cta) return;
    closeTour();
    navigate(cta.to);
  }

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Floating help launcher — always visible */}
      <button
        onClick={openTour}
        aria-label="Open product tour"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-sm shadow-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{
          background: 'var(--magenta)',
          color: 'var(--bg)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="hidden sm:inline">Take the tour</span>
      </button>

      {/* Overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: 'rgba(14, 13, 16, 0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeTour(); }}
        >
          <div
            className="w-full max-w-2xl rounded-sm shadow-2xl overflow-hidden border"
            style={{ background: 'var(--bg-2)', borderColor: 'var(--hairline)' }}
          >
            {/* Progress dots */}
            <div className="flex items-center gap-1.5 px-6 pt-5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === step ? '2rem' : '0.375rem',
                    background: i === step ? 'var(--magenta)' : 'var(--hairline)',
                  }}
                />
              ))}
              <button
                onClick={closeTour}
                aria-label="Close tour"
                className="ml-auto text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 p-6">
              <div className="sm:col-span-3">
                <div
                  className="inline-flex items-center rounded-sm px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] mb-3"
                  style={{ background: 'var(--magenta-bg)', color: 'var(--magenta)', border: '1px solid rgba(255,62,127,0.35)' }}
                >
                  Capability {step + 1} of {STEPS.length}
                </div>
                <h2 id="tour-title" className="font-display text-2xl text-[var(--ink)] leading-tight tracking-tight">
                  {s.title}
                </h2>
                <p className="mt-3 text-sm text-[var(--ink-muted)] leading-relaxed">{s.pitch}</p>
                {s.cta && (
                  <button
                    onClick={goToCta}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-[var(--magenta)] hover:text-[var(--magenta-bright)]"
                  >
                    {s.cta.label} →
                  </button>
                )}
              </div>
              <div className="sm:col-span-2 flex items-center">
                <div className="w-full">{s.preview()}</div>
              </div>
            </div>

            {/* Footer controls */}
            <div
              className="flex items-center justify-between px-6 py-4 border-t"
              style={{ background: 'var(--bg-3)', borderColor: 'var(--hairline)' }}
            >
              <button
                onClick={prev}
                disabled={step === 0}
                className="text-sm font-bold uppercase tracking-wider text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <Link
                to="/about"
                onClick={closeTour}
                className="text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink-muted)] uppercase tracking-wider"
              >
                Read the full overview
              </Link>
              <button
                onClick={isLast ? closeTour : next}
                className="rounded-sm text-sm font-bold uppercase tracking-wider px-4 py-2"
                style={{ background: 'var(--magenta)', color: 'var(--bg)' }}
              >
                {isLast ? 'Done' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
