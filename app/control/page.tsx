import Link from "next/link";
import { ControlPanel } from "@/src/components/control-panel";
import { getControlPageData } from "@/src/server/data";

export default function ControlPage() {
  const data = getControlPageData();
  const latestManifest = data.manifests[0] ?? null;
  const runningRuns = data.runHistory.filter((entry) => entry.status === "running");

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Capture</div>
            <div className="type-cursor mt-2 text-sm text-muted">
              Bring in tweets, refresh analysis, and check the health of the pipeline.
            </div>
          </div>
          <div className="window-dots">
            <span className="window-dot bg-orange" />
            <span className="window-dot bg-accent" />
            <span className="window-dot bg-cyan" />
          </div>
        </div>
        <div className="panel-body">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="section-title mt-1">Capture and runs</h1>
              <p className="page-intro mt-4 max-w-3xl">
                Run captures, refresh local indexes, manage X access, and inspect recent jobs from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tt-link">
                <span>Back to home</span>
              </Link>
              <Link href="/priority-accounts" className="tt-link">
                <span>Priority accounts</span>
              </Link>
              <Link href="/queue" className="tt-link">
                <span>Open review</span>
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">Saved captures</div>
              <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-accent">
                {data.manifests.length}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">Saved manifests available under `data/raw/`.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">Active jobs</div>
              <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-cyan">
                {runningRuns.length}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {runningRuns.length > 0
                  ? "Background capture or analysis work is still in progress."
                  : `${data.runHistory.length} logged scheduler, manual, or follow-up runs.`}
              </p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">Latest capture</div>
              <div className="mt-3 break-all font-[family:var(--font-mono)] text-xs uppercase tracking-[0.12em] text-slate-100">
                {latestManifest?.runId ?? "none"}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">Most recent captured manifest available to the UI.</p>
            </article>
          </div>
        </div>
      </section>

      <ControlPanel schedulerConfig={data.schedulerConfig} runHistory={data.runHistory} xAuthWarning={data.xAuthWarning} />
    </main>
  );
}
