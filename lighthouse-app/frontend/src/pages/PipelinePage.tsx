import { useMemo, useState } from 'react';

type FailureKey = 'connectors' | 's3_iceberg' | 'dbt' | 'athena';

interface LayerState {
  ok: boolean;
  status: string;
  detail: string;
  failureDetail?: string;
}

export default function PipelinePage() {
  const [failures, setFailures] = useState<Set<FailureKey>>(new Set());

  const toggle = (k: FailureKey) =>
    setFailures((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const layers: Record<FailureKey, LayerState> = useMemo(() => {
    const f = failures;
    return {
      connectors: f.has('connectors')
        ? { ok: false, status: 'sync failed', detail: 'Fivetran custom connectors — YouTube · Reddit · Wikipedia.', failureDetail: 'Simulated: YouTube Data API quota exhausted mid-sync. Retry scheduled for the next quota window.' }
        : { ok: true, status: 'on schedule', detail: '3 Fivetran custom connectors (lighthouse_youtube · lighthouse_reddit · lighthouse_wikipedia). Last sync 4h ago. Next sync in 2h.' },
      s3_iceberg: f.has('s3_iceberg')
        ? { ok: false, status: 'commit failed', detail: 'S3 + AWS Glue Iceberg catalog', failureDetail: 'Simulated: Glue catalog returned 503 during last Iceberg commit. Table snapshot uncommitted.' }
        : { ok: true, status: 'committed', detail: 'lighthouse-media-odi-lake bucket + AWS Glue Iceberg catalog. Tables across LIGHTHOUSE_MEDIA_ODI.bronze · silver · gold.' },
      dbt: f.has('dbt')
        ? { ok: false, status: 'run failed', detail: 'dbt build — model gold.fct_brand_signal', failureDetail: 'Simulated: model compilation failed. Test "unique_brand_id" returned 3 failures in silver.brands.' }
        : { ok: true, status: 'last run passed', detail: 'dbt build completed 3h ago. Staging + silver + gold models passed all tests.' },
      athena: f.has('athena')
        ? { ok: false, status: 'query failed', detail: 'AWS Athena query engine', failureDetail: 'Simulated: workgroup query quota exceeded. Retry after quota window resets at top of hour.' }
        : { ok: true, status: 'operational', detail: 'AWS Athena workgroup lighthouse-odi. Iceberg-aware engine v3. Avg query 1.4s.' },
    };
  }, [failures]);

  const demoMode = failures.size > 0;
  const anyDown = !Object.values(layers).every((l) => l.ok);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="eyebrow mb-1">Pipeline Health</div>
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">End-to-end status</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl leading-relaxed">
          Live posture of every layer that produces the Lighthouse Media surface: Fivetran custom
          connectors, the S3-backed Apache Iceberg lake, dbt medallion transformations, and the
          AWS Athena query engine. Toggle <em>Simulate failure</em> on any layer to walk through
          observability and incident response patterns.
        </p>
      </header>

      <div
        className={`rounded-sm border-l-4 border-y border-r p-4 flex items-start gap-3 ${
          !anyDown
            ? 'bg-[var(--bg-2)] border-y-[var(--hairline)] border-r-[var(--hairline)] border-l-[var(--up)]'
            : 'bg-[var(--bg-2)] border-y-[var(--hairline)] border-r-[var(--hairline)] border-l-[var(--down)]'
        }`}
      >
        <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${!anyDown ? 'bg-[var(--up)]' : 'bg-[var(--down)]'} animate-pulse`} />
        <div className="flex-1">
          <div className={`text-[11px] font-bold uppercase tracking-[0.12em] ${!anyDown ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>
            {!anyDown ? 'All systems operational' : 'Action required'}
          </div>
          <div className="mt-1 text-sm text-[var(--ink)]">
            {!anyDown
              ? 'Every layer of the pipeline is healthy. Data is flowing end-to-end.'
              : 'One or more layers reported a failure — see the affected card below.'}
          </div>
        </div>
      </div>

      {demoMode && (
        <div className="mt-4 rounded-sm border-l-4 border-y border-r border-l-[var(--warn)] border-y-[var(--hairline)] border-r-[var(--hairline)] bg-[var(--bg-2)] px-4 py-3 flex items-start justify-between gap-3">
          <div className="text-sm text-[var(--ink)]">
            <span className="font-bold text-[var(--warn)] uppercase tracking-wider text-[11px]">Demo mode active</span>
            <span className="text-[var(--ink)] ml-2">— {failures.size} {failures.size === 1 ? 'layer is' : 'layers are'} showing simulated failures. The real pipeline is unaffected.</span>
          </div>
          <button
            onClick={() => setFailures(new Set())}
            className="shrink-0 rounded-sm border border-[var(--warn)] bg-[var(--warn-bg)] hover:bg-[var(--warn)] hover:text-[var(--bg)] text-[var(--warn)] text-xs font-bold uppercase tracking-wider px-3 py-1.5 transition-colors"
          >
            Restore all
          </button>
        </div>
      )}

      <Section n={1} title="Fivetran custom connectors" layer={layers.connectors} sim={failures.has('connectors')} onSim={() => toggle('connectors')}>
        <KV k="Connectors" v="lighthouse_youtube · lighthouse_reddit · lighthouse_wikipedia" mono />
        <KV k="Runtime" v="Fivetran Connector SDK (Python)" />
        <KV k="Frequency" v="Every 6 hours" />
        <KV k="Destination" v="S3 bucket (Iceberg-managed)" />
      </Section>

      <Section n={2} title="S3 + Iceberg lake" layer={layers.s3_iceberg} sim={failures.has('s3_iceberg')} onSim={() => toggle('s3_iceberg')}>
        <KV k="Bucket" v="s3://lighthouse-media-odi-lake/" mono />
        <KV k="Catalog" v="AWS Glue Data Catalog (Iceberg REST)" />
        <KV k="Database" v="LIGHTHOUSE_MEDIA_ODI · bronze / silver / gold" mono />
        <KV k="Format" v="Apache Iceberg v2 · Parquet files · ZSTD compression" />
      </Section>

      <Section n={3} title="dbt medallion build" layer={layers.dbt} sim={failures.has('dbt')} onSim={() => toggle('dbt')}>
        <KV k="Project" v="lighthouse_odi" mono />
        <KV k="Adapter" v="dbt-athena (Iceberg-native)" mono />
        <KV k="Models" v="Staging · silver · gold across brand / video / conversation / topic" />
        <KV k="Trigger" v="Cron 04:00, 10:00, 16:00, 22:00 UTC — post-connector-sync" />
      </Section>

      <Section n={4} title="AWS Athena query engine" layer={layers.athena} sim={failures.has('athena')} onSim={() => toggle('athena')}>
        <KV k="Workgroup" v="lighthouse-odi" mono />
        <KV k="Engine" v="Athena engine v3 (Trino) — Iceberg-aware" />
        <KV k="Snapshot export" v="scripts/build_snapshot.py → /public/data/*.json" />
        <KV k="Auth" v="IAM role with Glue:GetTable + S3:GetObject" />
      </Section>

      <div className="mt-8 editorial-card p-4 text-sm text-[var(--ink-muted)] leading-relaxed">
        Live pipeline metadata appears once{' '}
        <code className="font-mono bg-[var(--bg-3)] px-1.5 py-0.5 rounded border border-[var(--hairline)] text-[var(--ink)] text-xs">scripts/build_pipeline_status.py</code>{' '}
        runs against the Fivetran + Athena APIs. Until then this page shows the configured topology so demo
        presenters can walk through each layer manually.
      </div>
    </div>
  );
}

function Section({
  n, title, layer, children, sim, onSim,
}: {
  n: number;
  title: string;
  layer: LayerState;
  children: React.ReactNode;
  sim: boolean;
  onSim: () => void;
}) {
  return (
    <section className="mt-5 editorial-card overflow-hidden">
      <header className="px-5 py-4 border-b border-[var(--hairline)] flex items-start justify-between gap-3 bg-[var(--bg-3)]">
        <div className="flex items-start gap-3">
          <span
            className="inline-flex items-center justify-center h-9 w-9 rounded-sm font-display text-[var(--bg)] text-base shadow-sm shrink-0"
            style={{ background: layer.ok ? 'var(--magenta)' : 'var(--down)' }}
          >
            {n}
          </span>
          <div className="min-w-0">
            <div className="font-display text-lg text-[var(--ink)] leading-tight">{title}</div>
            <div className="text-xs text-[var(--ink)] mt-1 opacity-80">{layer.detail}</div>
          </div>
        </div>
        <span className={`signal-pill shrink-0 ${layer.ok ? 'up' : 'down'}`}>{layer.status}</span>
      </header>
      <dl className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm bg-[var(--bg-2)]">
        {children}
      </dl>
      {layer.failureDetail && (
        <div className="mx-5 mb-4 rounded-sm border-l-4 border-y border-r border-l-[var(--down)] border-y-[var(--hairline)] border-r-[var(--hairline)] bg-[var(--bg-3)] text-sm p-3 flex items-start gap-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--down)" strokeWidth="2" className="h-4 w-4 mt-0.5 shrink-0">
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <span>
            <span className="font-bold uppercase tracking-wider text-[10px] text-[var(--down)]">Incident detail </span>
            <span className="text-[var(--ink)]">{layer.failureDetail}</span>
          </span>
        </div>
      )}
      <footer className="px-5 py-2.5 border-t border-[var(--hairline)] bg-[var(--bg-3)] flex justify-end">
        <button
          onClick={onSim}
          className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
            sim
              ? 'bg-[var(--warn-bg)] border-[var(--warn)] text-[var(--warn)] hover:bg-[var(--warn)] hover:text-[var(--bg)]'
              : 'bg-[var(--bg-2)] hover:bg-[var(--down-bg)] border-[var(--hairline)] hover:border-[var(--down)] text-[var(--ink)] hover:text-[var(--down)]'
          }`}
        >
          {sim ? 'Restore layer' : 'Simulate failure'}
        </button>
      </footer>
    </section>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-[var(--magenta)] font-bold">{k}</dt>
      <dd className={`text-[var(--ink)] ${mono ? 'font-mono text-xs break-all' : ''}`}>{v}</dd>
    </>
  );
}
