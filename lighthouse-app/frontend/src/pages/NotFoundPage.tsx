import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center">
      <div className="font-display text-[8rem] leading-none text-[var(--ink)] tabular">
        404
      </div>
      <div className="mt-1 h-[2px] mx-auto w-24" style={{ background: 'var(--magenta)' }} />
      <h1 className="mt-6 font-display text-3xl text-[var(--ink)]">
        Off-channel.
      </h1>
      <p className="mt-3 text-sm text-[var(--ink-muted)]">
        Try the homepage. The view you requested isn't part of the Lighthouse Media surface — it may
        have been moved or never published.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          to="/"
          className="rounded-sm text-[var(--bg)] text-sm font-bold px-5 py-2.5"
          style={{ background: 'var(--magenta)' }}
        >
          Return home
        </Link>
        <Link
          to="/brands"
          className="rounded-sm border border-[var(--hairline)] bg-[var(--bg-2)] text-[var(--ink)] hover:bg-[var(--bg-3)] text-sm font-medium px-4 py-2.5"
        >
          Browse brands
        </Link>
      </div>
    </div>
  );
}
